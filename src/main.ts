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
    name: 'checkComments',
    label: 'Evaluate Comments for Spam & Link Shorteners',
    defaultValue: true,
  },
  {
    type: 'boolean',
    name: 'checkEdits',
    label: 'Evaluate Post & Comment Edits (Anti-Stealth Spam Edit)',
    defaultValue: true,
  },
  {
    type: 'boolean',
    name: 'exemptApprovedUsers',
    label: 'Exempt Approved Submitter Users from Automated Moderation',
    defaultValue: true,
  },
  {
    type: 'boolean',
    name: 'lockContentOnRemoval',
    label: 'Lock Content when Removed (Prevents further engagement)',
    defaultValue: true,
  },
  {
    type: 'boolean',
    name: 'enableStickyRemovalComment',
    label: 'Post Sticky Explanation Comment on Post Removal',
    defaultValue: true,
  },
  {
    type: 'boolean',
    name: 'testMode',
    label: 'Test Mode (Dry Run - Log actions without removing/filtering content)',
    defaultValue: false,
  },
  {
    type: 'select',
    name: 'actionOnSpam',
    label: 'Action on Spam / Filter Match',
    options: [
      { label: 'Remove Content (Default)', value: 'remove' },
      { label: 'Filter to Subreddit Mod Queue', value: 'filter' },
      { label: 'Report Content to Subreddit Mods', value: 'report' },
      { label: 'Mark as Spam', value: 'spam' },
    ],
    defaultValue: ['remove'],
  },
  {
    type: 'string',
    name: 'exemptUsernames',
    label: 'Exempt Usernames (comma-separated list)',
    defaultValue: '',
  },
  {
    type: 'string',
    name: 'exemptFlairs',
    label: 'Exempt User Flairs (comma-separated keywords, e.g. verified, proof)',
    defaultValue: 'verified, proof, approved',
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

    const rawExemptUsers = typeof settings.exemptUsernames === 'string' ? settings.exemptUsernames : '';
    const exemptUsernames = rawExemptUsers
      .split(',')
      .map((s: string) => s.trim().toLowerCase().replace(/^u\//i, ''))
      .filter((s: string) => s.length > 0);

    const rawExemptFlairs = typeof settings.exemptFlairs === 'string' ? settings.exemptFlairs : 'verified, proof, approved';
    const exemptFlairs = rawExemptFlairs
      .split(',')
      .map((s: string) => s.trim().toLowerCase())
      .filter((s: string) => s.length > 0);

    const rawAction = Array.isArray(settings.actionOnSpam) ? settings.actionOnSpam[0] : settings.actionOnSpam;
    const actionOnSpam = (['remove', 'filter', 'report', 'spam'].includes(rawAction) ? rawAction : 'remove') as
      | 'remove'
      | 'filter'
      | 'report'
      | 'spam';

    return {
      minKarma: !isNaN(minKarma) ? minKarma : DEFAULT_CONFIG.minKarma,
      minAccountAgeDays: !isNaN(minAccountAgeDays) ? minAccountAgeDays : DEFAULT_CONFIG.minAccountAgeDays,
      rateLimitMaxPosts: !isNaN(rateLimitMaxPosts) && rateLimitMaxPosts > 0 ? rateLimitMaxPosts : DEFAULT_CONFIG.rateLimitMaxPosts,
      rateLimitWindowSeconds: windowHours * 3600,
      enableStickyRemovalComment: Boolean(settings.enableStickyRemovalComment ?? true),
      lockContentOnRemoval: Boolean(settings.lockContentOnRemoval ?? true),
      exemptApprovedUsers: Boolean(settings.exemptApprovedUsers ?? true),
      checkComments: Boolean(settings.checkComments ?? true),
      checkEdits: Boolean(settings.checkEdits ?? true),
      testMode: Boolean(settings.testMode ?? false),
      actionOnSpam,
      exemptUsernames,
      exemptFlairs,
    };
  } catch (error) {
    console.error('[TurboMod] Failed to load settings, using defaults:', error);
    return DEFAULT_CONFIG;
  }
}

async function isApprovedUser(context: any, subredditName: string, username: string): Promise<boolean> {
  if (!context.reddit || !subredditName || !username) return false;
  const cleanUsername = username.trim().toLowerCase().replace(/^u\//i, '');
  try {
    const approvedUsers = await context.reddit.getApprovedUsers({ subredditName, username: cleanUsername }).all();
    return approvedUsers.some((u: any) => (u.username || '').trim().toLowerCase().replace(/^u\//i, '') === cleanUsername);
  } catch (err) {
    return false;
  }
}

async function postStickyRemovalNotice(context: any, itemId: string, reason: string): Promise<void> {
  if (!context.reddit || !itemId || !itemId.startsWith('t3_')) return;
  try {
    console.log(`[TurboMod] Adding sticky removal comment on post ${itemId}`);
    const comment = await context.reddit.addComment({
      id: itemId,
      text: `🤖 **TurboMod Automated Moderation Notice**\n\nYour submission has been automatically filtered.\n\n**Reason:** ${reason}\n\n*If you believe this action was taken in error, please contact the subreddit moderation team.*`,
    });
    if (comment) {
      await comment.distinguish(true);
      console.log(`[TurboMod] Sticky removal comment ${comment.id} posted successfully.`);
    }
  } catch (err) {
    console.error(`[TurboMod] Failed to post sticky removal comment on ${itemId}:`, err);
  }
}

async function lockItem(context: any, itemId: string): Promise<void> {
  if (!context.reddit || !itemId) return;
  try {
    if (itemId.startsWith('t3_')) {
      const post = await context.reddit.getPostById(itemId);
      if (post && !post.locked) await post.lock();
    } else if (itemId.startsWith('t1_')) {
      const comment = await context.reddit.getCommentById(itemId);
      if (comment && !comment.locked) await comment.lock();
    }
  } catch (err) {
    console.error(`[TurboMod] Failed to lock content item ${itemId}:`, err);
  }
}

interface ProcessContentOptions {
  itemId: string;
  itemType: 'post' | 'comment';
  isEdit?: boolean;
  title?: string;
  body?: string;
  author: {
    id?: string;
    name?: string;
    karma?: number;
    linkKarma?: number;
    commentKarma?: number;
    createdAt?: string | Date;
  };
  flairText?: string;
}

async function processContent(options: ProcessContentOptions, context: any): Promise<void> {
  const { itemId, itemType, isEdit, title, body, author, flairText } = options;
  const rawUsername = author.name || 'unknown_user';
  const username = rawUsername.trim().replace(/^u\//i, '');
  const userId = (author.id || username).trim();

  if (
    username === 'unknown_user' ||
    username.toLowerCase() === 'automoderator' ||
    username.toLowerCase().endsWith('-modteam')
  ) {
    return;
  }

  console.log(`[TurboMod] Processing ${itemType}${isEdit ? ' update' : ''} ${itemId} by u/${username}`);

  // Moderator exemption check
  if (context.subredditName) {
    try {
      const isMod = context.redis
        ? await isModeratorCached(context.redis, context.reddit, context.subredditName, username)
        : false;
      if (isMod) {
        console.log(`[TurboMod] User u/${username} is a moderator. Bypassing automated moderation.`);
        return;
      }
    } catch (err) {
      console.error(`[TurboMod] Error checking moderator status for u/${username}:`, err);
    }
  }

  const config = await getEffectiveConfig(context);

  // Approved User / Contributor exemption check
  if (config.exemptApprovedUsers && context.subredditName) {
    const approved = await isApprovedUser(context, context.subredditName, username);
    if (approved) {
      console.log(`[TurboMod] User u/${username} is an approved submitter. Bypassing automated moderation.`);
      return;
    }
  }

  // Custom exempt username check
  if (config.exemptUsernames && config.exemptUsernames.includes(username.toLowerCase())) {
    console.log(`[TurboMod] User u/${username} is in custom exempt list. Bypassing.`);
    return;
  }

  // User flair exemption check
  const cleanFlair = (flairText || '').toLowerCase();
  if (cleanFlair && config.exemptFlairs && config.exemptFlairs.length > 0) {
    if (config.exemptFlairs.some((f) => cleanFlair.includes(f))) {
      console.log(`[TurboMod] User u/${username} has exempt flair "${cleanFlair}". Bypassing.`);
      return;
    }
  }

  // Rate Limiting (Post Submit only)
  if (itemType === 'post' && !isEdit && context.redis) {
    const rateLimitResult = await checkAndIncrementRateLimit(
      context.redis,
      userId,
      config.rateLimitMaxPosts,
      config.rateLimitWindowSeconds
    );

    if (!rateLimitResult.allowed) {
      const hoursStr = (config.rateLimitWindowSeconds / 3600).toFixed(1);
      const reason = `Exceeded post rate limit (${rateLimitResult.currentCount}/${rateLimitResult.maxAllowed} posts in ${hoursStr} hours)`;
      console.warn(`[TurboMod] Rate limit exceeded for user u/${username}: ${reason}`);

      if (config.testMode) {
        console.log(`[TurboMod] [TEST MODE] Rate limit triggered for u/${username}, skipping removal.`);
        await addModLogEntry(context.redis, {
          action: 'TEST_MODE_LOGGED',
          targetId: itemId,
          author: username,
          reason: `[TEST MODE] ${reason}`,
        });
        return;
      }

      if (config.enableStickyRemovalComment) {
        await postStickyRemovalNotice(context, itemId, reason);
      }

      if (context.reddit) {
        try {
          await context.reddit.remove(itemId, false);
          if (config.lockContentOnRemoval) {
            await lockItem(context, itemId);
          }
        } catch (err) {
          console.error(`[TurboMod] Error removing rate-limited post ${itemId}:`, err);
        }
      }

      await addModLogEntry(context.redis, {
        action: 'RATE_LIMIT_EXCEEDED',
        targetId: itemId,
        author: username,
        reason,
      });

      return;
    }
  }

  // Author Karma & Age Evaluation
  let authorKarma = 0;
  let authorCreatedUtc = Math.floor(Date.now() / 1000);

  if (typeof author.karma === 'number') {
    authorKarma = author.karma;
  } else if (typeof author.linkKarma === 'number' || typeof author.commentKarma === 'number') {
    authorKarma = (author.linkKarma || 0) + (author.commentKarma || 0);
  }

  if (author.createdAt) {
    const createdMs = new Date(author.createdAt).getTime();
    if (!isNaN(createdMs)) {
      authorCreatedUtc = Math.floor(createdMs / 1000);
    }
  }

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
      console.error(`[TurboMod] Could not fetch user profile for u/${username}:`, err);
    }
  }

  const filterResult = evaluatePost(title, body, authorKarma, authorCreatedUtc, config);

  if (!filterResult.passed) {
    const reason = filterResult.reason || 'Failed content/author moderation filters';
    console.warn(`[TurboMod] ${itemType} ${itemId} failed filter: ${reason}`);

    if (config.testMode) {
      console.log(`[TurboMod] [TEST MODE] ${itemType} ${itemId} failed filter: ${reason}. Skipping removal.`);
      if (context.redis) {
        await addModLogEntry(context.redis, {
          action: 'TEST_MODE_LOGGED',
          targetId: itemId,
          author: username,
          reason: `[TEST MODE] ${reason}`,
        });
      }
      return;
    }

    const effectiveAction = config.actionOnSpam || filterResult.action || 'remove';

    if (effectiveAction === 'report') {
      if (context.reddit) {
        try {
          if (itemId.startsWith('t3_')) {
            const post = await context.reddit.getPostById(itemId);
            if (post) await context.reddit.report(post, { reason: `TurboMod: ${reason}` });
          } else if (itemId.startsWith('t1_')) {
            const comment = await context.reddit.getCommentById(itemId);
            if (comment) await context.reddit.report(comment, { reason: `TurboMod: ${reason}` });
          }
        } catch (err) {
          console.error(`[TurboMod] Error reporting ${itemId}:`, err);
        }
      }

      if (context.redis) {
        await addModLogEntry(context.redis, {
          action: itemType === 'post' ? 'POST_REPORTED' : 'COMMENT_REPORTED',
          targetId: itemId,
          author: username,
          reason,
        });
      }
      return;
    }

    if (effectiveAction === 'filter') {
      if (context.reddit) {
        try {
          await context.reddit.remove(itemId, false);
          if (config.lockContentOnRemoval) {
            await lockItem(context, itemId);
          }
        } catch (err) {
          console.error(`[TurboMod] Error filtering ${itemId} to modqueue:`, err);
        }
      }

      if (context.redis) {
        await addModLogEntry(context.redis, {
          action: itemType === 'post' ? 'POST_FILTERED' : 'COMMENT_FILTERED',
          targetId: itemId,
          author: username,
          reason: `[Filtered to ModQueue] ${reason}`,
        });
      }
      return;
    }

    if (config.enableStickyRemovalComment && itemType === 'post') {
      await postStickyRemovalNotice(context, itemId, reason);
    }

    if (context.reddit) {
      try {
        const isSpam = effectiveAction === 'spam';
        await context.reddit.remove(itemId, isSpam);
        if (config.lockContentOnRemoval) {
          await lockItem(context, itemId);
        }
      } catch (err) {
        console.error(`[TurboMod] Error removing ${itemId}:`, err);
      }
    }

    if (context.redis) {
      const actionType =
        effectiveAction === 'spam'
          ? 'SPAM_FILTERED'
          : itemType === 'post'
          ? 'POST_REMOVED'
          : 'COMMENT_REMOVED';

      await addModLogEntry(context.redis, {
        action: actionType,
        targetId: itemId,
        author: username,
        reason,
      });
    }
  }
}

// 1. PostSubmit Trigger
Devvit.addTrigger({
  event: 'PostSubmit',
  onEvent: async (event, context) => {
    const post = event.post;
    const author = event.author;
    if (!post || !author) return;

    const targetPostId = post.id.startsWith('t3_') ? post.id : `t3_${post.id}`;
    const flairText = (post as any).authorFlair?.text || (post as any).authorFlairText || '';

    await processContent(
      {
        itemId: targetPostId,
        itemType: 'post',
        title: post.title || '',
        body: post.selftext || '',
        author,
        flairText,
      },
      context
    );
  },
});

// 2. PostUpdate Trigger (Anti-Stealth Spam Edit)
Devvit.addTrigger({
  event: 'PostUpdate',
  onEvent: async (event, context) => {
    const config = await getEffectiveConfig(context);
    if (!config.checkEdits) return;

    const post = event.post;
    const author = event.author;
    if (!post || !author) return;

    const targetPostId = post.id.startsWith('t3_') ? post.id : `t3_${post.id}`;
    const flairText = (post as any).authorFlair?.text || (post as any).authorFlairText || '';

    await processContent(
      {
        itemId: targetPostId,
        itemType: 'post',
        isEdit: true,
        title: post.title || '',
        body: post.selftext || '',
        author,
        flairText,
      },
      context
    );
  },
});

// 3. CommentSubmit Trigger
Devvit.addTrigger({
  event: 'CommentSubmit',
  onEvent: async (event, context) => {
    const config = await getEffectiveConfig(context);
    if (!config.checkComments) return;

    const comment = event.comment;
    const author = event.author;
    if (!comment || !author) return;

    const targetCommentId = comment.id.startsWith('t1_') ? comment.id : `t1_${comment.id}`;
    const flairText = (comment as any).authorFlair?.text || (comment as any).authorFlairText || '';

    await processContent(
      {
        itemId: targetCommentId,
        itemType: 'comment',
        body: comment.body || '',
        author,
        flairText,
      },
      context
    );
  },
});

// 4. CommentUpdate Trigger (Anti-Stealth Spam Edit)
Devvit.addTrigger({
  event: 'CommentUpdate',
  onEvent: async (event, context) => {
    const config = await getEffectiveConfig(context);
    if (!config.checkComments || !config.checkEdits) return;

    const comment = event.comment;
    const author = event.author;
    if (!comment || !author) return;

    const targetCommentId = comment.id.startsWith('t1_') ? comment.id : `t1_${comment.id}`;
    const flairText = (comment as any).authorFlair?.text || (comment as any).authorFlairText || '';

    await processContent(
      {
        itemId: targetCommentId,
        itemType: 'comment',
        isEdit: true,
        body: comment.body || '',
        author,
        flairText,
      },
      context
    );
  },
});

Devvit.addMenuItem({
  label: 'TurboMod: Nuke & Lock Thread',
  location: 'post',
  forUserType: 'moderator',
  onPress: async (event, context) => {
    const postId = event.targetId;
    const moderatorName = (context.username || 'Moderator').replace(/^u\//i, '');

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

      let commentsRemoved = 0;
      try {
        const comments = await post.comments.all();
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
      } catch (commentErr) {
        console.error('[TurboMod] Error fetching or purging comments:', commentErr);
      }

      if (context.redis) {
        await addModLogEntry(context.redis, {
          action: 'THREAD_NUKED',
          targetId: postId,
          author: (post.authorName || 'unknown').replace(/^u\//i, ''),
          moderator: moderatorName,
          reason: `Moderator u/${moderatorName} nuked ${commentsRemoved} comment(s) and locked thread.`,
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
      const timeAgo = Math.max(0, Math.floor((Date.now() - topLog.timestamp) / 1000 / 60));

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
