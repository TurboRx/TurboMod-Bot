import { Devvit } from '@devvit/public-api';
import { evaluatePost, DEFAULT_CONFIG } from './filters.js';
import { checkAndIncrementRateLimit, addModLogEntry, getModLogs, isModeratorCached } from './redis.js';
import { ModerationRuleConfig } from './types.js';

Devvit.configure({
  redditAPI: true,
  redis: true,
});

Devvit.addSettings([
  {
    type: 'number',
    name: 'minKarma',
    label: 'Minimum Required Karma',
    defaultValue: DEFAULT_CONFIG.minKarma,
  },
  {
    type: 'number',
    name: 'minAccountAgeDays',
    label: 'Minimum Account Age (Days)',
    defaultValue: DEFAULT_CONFIG.minAccountAgeDays,
  },
  {
    type: 'number',
    name: 'rateLimitMaxPosts',
    label: 'Rate Limit: Max Posts',
    defaultValue: DEFAULT_CONFIG.rateLimitMaxPosts,
  },
  {
    type: 'number',
    name: 'rateLimitWindowHours',
    label: 'Rate Limit Window (Hours)',
    defaultValue: 3,
  },
  {
    type: 'boolean',
    name: 'enableStickyRemovalComment',
    label: 'Post Sticky Explanation Comment on Post Removal',
    defaultValue: true,
  },
]);

async function getEffectiveConfig(context: any): Promise<ModerationRuleConfig> {
  try {
    const settings = await context.settings.getAll();
    const parsedWindowHours = Number(settings.rateLimitWindowHours);
    const windowHours = !isNaN(parsedWindowHours) && parsedWindowHours > 0 ? parsedWindowHours : 3;

    const minKarma = Number(settings.minKarma);
    const minAccountAgeDays = Number(settings.minAccountAgeDays);
    const rateLimitMaxPosts = Number(settings.rateLimitMaxPosts);

    return {
      minKarma: !isNaN(minKarma) ? minKarma : DEFAULT_CONFIG.minKarma,
      minAccountAgeDays: !isNaN(minAccountAgeDays) ? minAccountAgeDays : DEFAULT_CONFIG.minAccountAgeDays,
      rateLimitMaxPosts: !isNaN(rateLimitMaxPosts) && rateLimitMaxPosts > 0 ? rateLimitMaxPosts : DEFAULT_CONFIG.rateLimitMaxPosts,
      rateLimitWindowSeconds: windowHours * 3600,
      enableStickyRemovalComment: Boolean(settings.enableStickyRemovalComment ?? true),
    };
  } catch (error) {
    console.error('[TurboMod] Failed to load settings, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

async function postStickyRemovalNotice(
  context: any,
  postId: string,
  reason: string
): Promise<void> {
  if (!context.reddit) return;
  const targetId = postId.startsWith('t3_') ? postId : `t3_${postId}`;
  try {
    console.log(`[TurboMod] Adding sticky removal comment on post ${targetId}`);
    const comment = await context.reddit.addComment({
      id: targetId,
      text: `🤖 **TurboMod Automated Moderation Notice**\n\nYour post has been automatically removed.\n\n**Reason:** ${reason}\n\n*If you believe this action was taken in error, please contact the subreddit moderation team.*`,
    });
    if (comment) {
      await comment.distinguish(true);
      console.log(`[TurboMod] Sticky removal comment ${comment.id} posted successfully.`);
    }
  } catch (err) {
    console.error(`[TurboMod] Failed to post sticky removal comment on ${targetId}:`, err);
  }
}

Devvit.addTrigger({
  event: 'PostSubmit',
  onEvent: async (event, context) => {
    const post = event.post;
    const author = event.author;

    if (!post || !author || !author.id) {
      console.log('[TurboMod] Missing post or author metadata in PostSubmit event.');
      return;
    }

    const username = author.name || 'unknown_user';
    const userId = author.id;
    const postTitle = post.title || '';
    const postBody = post.selftext || '';

    console.log(`[TurboMod] Processing PostSubmit for post ${post.id} by ${username}`);

    if (context.subredditName && username !== 'unknown_user') {
      try {
        const isMod = context.redis
          ? await isModeratorCached(context.redis, context.reddit, context.subredditName, username)
          : false;

        if (isMod) {
          console.log(`[TurboMod] User ${username} is a moderator. Bypassing rate limit and filters.`);
          return;
        }
      } catch (err) {
        console.error(`[TurboMod] Error checking moderator status for ${username}:`, err);
      }
    }

    const config = await getEffectiveConfig(context);

    if (context.redis) {
      const rateLimitResult = await checkAndIncrementRateLimit(
        context.redis,
        userId,
        config.rateLimitMaxPosts,
        config.rateLimitWindowSeconds
      );

      if (!rateLimitResult.allowed) {
        const reason = `Exceeded post rate limit (${rateLimitResult.currentCount}/${rateLimitResult.maxAllowed} posts in ${config.rateLimitWindowSeconds / 3600} hours)`;
        console.warn(`[TurboMod] Rate limit exceeded for user ${username}: ${reason}`);

        if (config.enableStickyRemovalComment) {
          await postStickyRemovalNotice(context, post.id, reason);
        }

        if (context.reddit) {
          try {
            const targetPostId = post.id.startsWith('t3_') ? post.id : `t3_${post.id}`;
            await context.reddit.remove(targetPostId, false);
          } catch (err) {
            console.error(`[TurboMod] Error removing rate-limited post ${post.id}:`, err);
          }
        }

        await addModLogEntry(context.redis, {
          action: 'RATE_LIMIT_EXCEEDED',
          targetId: post.id,
          author: username,
          reason,
        });

        return;
      }
    }

    let authorKarma = 0;
    let authorCreatedUtc = Math.floor(Date.now() / 1000);

    const authorObj = author as any;
    if (typeof authorObj.karma === 'number') {
      authorKarma = authorObj.karma;
    } else if (typeof authorObj.linkKarma === 'number' || typeof authorObj.commentKarma === 'number') {
      authorKarma = (authorObj.linkKarma || 0) + (authorObj.commentKarma || 0);
    }

    if (authorObj.createdAt) {
      const createdMs = new Date(authorObj.createdAt).getTime();
      if (!isNaN(createdMs)) {
        authorCreatedUtc = Math.floor(createdMs / 1000);
      }
    }

    // Fetch full user profile if karma/createdAt is missing from event object
    if (context.reddit && username && username !== 'unknown_user' && authorKarma === 0) {
      try {
        const fetchedUser = await context.reddit.getUserByUsername(username);
        if (fetchedUser) {
          authorKarma = (fetchedUser.linkKarma || 0) + (fetchedUser.commentKarma || 0);
          if (fetchedUser.createdAt) {
            authorCreatedUtc = Math.floor(new Date(fetchedUser.createdAt).getTime() / 1000);
          }
        }
      } catch (err) {
        console.error(`[TurboMod] Could not fetch user profile for ${username}:`, err);
      }
    }

    const filterResult = evaluatePost(
      postTitle,
      postBody,
      authorKarma,
      authorCreatedUtc,
      config
    );

    if (!filterResult.passed) {
      const reason = filterResult.reason || 'Failed content/author moderation filters';
      console.warn(`[TurboMod] Post ${post.id} failed filter: ${reason}`);

      if (config.enableStickyRemovalComment) {
        await postStickyRemovalNotice(context, post.id, reason);
      }

      if (context.reddit) {
        try {
          const targetPostId = post.id.startsWith('t3_') ? post.id : `t3_${post.id}`;
          const isSpam = filterResult.action === 'spam';
          await context.reddit.remove(targetPostId, isSpam);
        } catch (err) {
          console.error(`[TurboMod] Error removing filtered post ${post.id}:`, err);
        }
      }

      if (context.redis) {
        await addModLogEntry(context.redis, {
          action: filterResult.action === 'spam' ? 'SPAM_FILTERED' : 'POST_REMOVED',
          targetId: post.id,
          author: username,
          reason,
        });
      }
    }
  },
});

Devvit.addMenuItem({
  label: 'TurboMod: Nuke & Lock Thread',
  location: 'post',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    const postId = event.targetId;
    const moderatorName = context.username || 'Moderator';

    if (!postId) {
      context.ui.showToast('Error: Target post ID not found.');
      return;
    }

    try {
      context.ui.showToast('TurboMod: Nuking and locking thread...');

      const targetPostId = postId.startsWith('t3_') ? postId : `t3_${postId}`;
      const post = await context.reddit.getPostById(targetPostId);
      if (!post) {
        context.ui.showToast('Error: Post not found or deleted.');
        return;
      }

      await post.lock();

      const comments = await post.comments.all();
      let commentsRemoved = 0;

      const CHUNK_SIZE = 15;
      for (let i = 0; i < comments.length; i += CHUNK_SIZE) {
        const chunk = comments.slice(i, i + CHUNK_SIZE);
        await Promise.all(
          chunk.map(async (comment) => {
            try {
              await comment.remove();
              commentsRemoved++;
            } catch (err) {
              console.error(`[TurboMod] Failed to remove comment ${comment.id}:`, err);
            }
          })
        );
      }

      if (context.redis) {
        await addModLogEntry(context.redis, {
          action: 'THREAD_NUKED',
          targetId: postId,
          author: post.authorName || 'unknown',
          moderator: moderatorName,
          reason: `Moderator ${moderatorName} nuked ${commentsRemoved} comment(s) and locked thread.`,
        });
      }

      context.ui.showToast(`Success: Locked thread and removed ${commentsRemoved} comment(s).`);
    } catch (error) {
      console.error(`[TurboMod] Error during thread nuke on ${postId}:`, error);
      context.ui.showToast('Failed to nuke and lock thread. Check logs.');
    }
  },
});

Devvit.addMenuItem({
  label: 'TurboMod: View Recent Mod Logs',
  location: 'subreddit',
  forUserType: 'moderator',
  onPress: async (_event, context) => {
    if (!context.redis) {
      context.ui.showToast('Redis connection uninitialized.');
      return;
    }

    try {
      const logs = await getModLogs(context.redis, 10);
      if (logs.length === 0) {
        context.ui.showToast('TurboMod: No recent moderation events logged.');
        return;
      }

      const topLog = logs[0];
      const timeAgo = Math.floor((Date.now() - topLog.timestamp) / 1000 / 60);

      context.ui.showToast(
        `TurboMod Logs (${logs.length} total) | Latest (${timeAgo}m ago): [${topLog.action}] u/${topLog.author} - ${topLog.reason.substring(0, 45)}...`
      );
    } catch (error) {
      console.error('[TurboMod] Error reading mod logs:', error);
      context.ui.showToast('Failed to load TurboMod logs.');
    }
  },
});

export default Devvit;
