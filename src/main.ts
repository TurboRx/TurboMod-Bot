import { Devvit } from '@devvit/public-api';
import { evaluatePost, DEFAULT_CONFIG } from './filters.js';
import { checkAndIncrementRateLimit, addModLogEntry, getModLogs } from './redis.js';
import { ModerationRuleConfig } from './types.js';

// Configure Devvit capabilities
Devvit.configure({
  redditAPI: true,
  redis: true,
});

/**
 * Subreddit Settings Panel
 * Allows moderators to configure thresholds dynamically via Reddit App Settings.
 */
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

/**
 * Helper to fetch effective moderation configuration from Devvit settings.
 */
async function getEffectiveConfig(context: any): Promise<ModerationRuleConfig> {
  try {
    const settings = await context.settings.getAll();
    const windowHours = Number(settings.rateLimitWindowHours) || 3;

    return {
      minKarma: Number(settings.minKarma) ?? DEFAULT_CONFIG.minKarma,
      minAccountAgeDays: Number(settings.minAccountAgeDays) ?? DEFAULT_CONFIG.minAccountAgeDays,
      rateLimitMaxPosts: Number(settings.rateLimitMaxPosts) ?? DEFAULT_CONFIG.rateLimitMaxPosts,
      rateLimitWindowSeconds: windowHours * 3600,
      enableStickyRemovalComment: Boolean(settings.enableStickyRemovalComment ?? true),
    };
  } catch (error) {
    console.error('[TurboMod] Failed to load settings, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

/**
 * Posts a stickied moderator removal notice on removed posts.
 */
async function postStickyRemovalNotice(
  context: any,
  postId: string,
  reason: string
): Promise<void> {
  if (!context.reddit) return;
  try {
    const comment = await context.reddit.addComment({
      id: postId,
      text: `🤖 **TurboMod Automated Moderation Notice**\n\nYour post has been automatically removed.\n\n**Reason:** ${reason}\n\n*If you believe this action was taken in error, please contact the subreddit moderation team.*`,
    });
    await comment.distinguish(true);
  } catch (err) {
    console.error(`[TurboMod] Failed to post sticky removal comment on ${postId}:`, err);
  }
}

/**
 * Trigger: PostSubmit
 * Automatically moderates newly submitted posts based on regex filters, account age/karma, and rate limits.
 */
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

    // Moderator Exemption: Skip filters & rate limit if post author is a subreddit moderator
    if (context.subredditName && username !== 'unknown_user') {
      try {
        const mods = await context.reddit.getModerators({ subredditName: context.subredditName }).all();
        const isMod = mods.some((m) => m.username.toLowerCase() === username.toLowerCase());
        if (isMod) {
          console.log(`[TurboMod] User ${username} is a moderator. Bypassing rate limit and filters.`);
          return;
        }
      } catch (err) {
        console.error(`[TurboMod] Error checking moderator status for ${username}:`, err);
      }
    }

    // Fetch dynamic subreddit configuration settings
    const config = await getEffectiveConfig(context);

    // 1. Rate Limit Check: X posts per Y hours ('turbomod:rate:{userId}')
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

        // Post sticky removal notice if enabled
        if (config.enableStickyRemovalComment) {
          await postStickyRemovalNotice(context, post.id, reason);
        }

        // Remove post due to rate limit violation
        if (context.reddit) {
          await context.reddit.remove(post.id, false);
        }

        // Add Mod Log entry
        await addModLogEntry(context.redis, {
          action: 'RATE_LIMIT_EXCEEDED',
          targetId: post.id,
          author: username,
          reason,
        });

        return;
      }
    }

    // 2. Filter checks (Regex shorteners & Karma/Age checks)
    const authorKarma = (author.linkKarma || 0) + (author.commentKarma || 0);
    const authorCreatedUtc = author.createdAt
      ? Math.floor(new Date(author.createdAt).getTime() / 1000)
      : Math.floor(Date.now() / 1000);

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

      // Post sticky removal notice if enabled
      if (config.enableStickyRemovalComment) {
        await postStickyRemovalNotice(context, post.id, reason);
      }

      // Remove post as spam/mod action
      if (context.reddit) {
        const isSpam = filterResult.action === 'spam';
        await context.reddit.remove(post.id, isSpam);
      }

      // Log moderation action to Redis
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

/**
 * Mod Menu Action: 'TurboMod: Nuke & Lock Thread'
 * Allows moderators to instantly lock a post and remove all comments in the thread.
 */
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

      // 1. Fetch Post & Lock Thread
      const post = await context.reddit.getPostById(postId);
      await post.lock();

      // 2. Fetch all comments on the post
      const comments = await post.comments.all();
      let commentsRemoved = 0;

      // Batch removal (chunks of 15) to prevent execution timeout on large threads
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

      // 3. Log to Redis Mod Log
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

/**
 * Mod Menu Action: 'TurboMod: View Recent Mod Logs'
 * Displays a summary toast of recent TurboMod automated and manual actions for moderators.
 */
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
