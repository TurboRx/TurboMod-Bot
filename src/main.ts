import { Devvit } from '@devvit/public-api';
import { evaluatePost, DEFAULT_CONFIG } from './filters.js';
import { checkAndIncrementRateLimit, addModLogEntry } from './redis.js';

// Configure Devvit capabilities
Devvit.configure({
  redditAPI: true,
  redis: true,
});

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

    // 1. Rate Limit Check: 2 posts / 3h ('turbomod:rate:{userId}')
    if (context.redis) {
      const rateLimitResult = await checkAndIncrementRateLimit(
        context.redis,
        userId,
        DEFAULT_CONFIG.rateLimitMaxPosts,
        DEFAULT_CONFIG.rateLimitWindowSeconds
      );

      if (!rateLimitResult.allowed) {
        console.warn(
          `[TurboMod] Rate limit exceeded for user ${username} (${rateLimitResult.currentCount}/${rateLimitResult.maxAllowed})`
        );

        // Remove post due to rate limit violation
        if (context.reddit) {
          await context.reddit.remove(post.id, false);
        }

        // Add Mod Log entry
        await addModLogEntry(context.redis, {
          action: 'RATE_LIMIT_EXCEEDED',
          targetId: post.id,
          author: username,
          reason: `Exceeded post limit (${rateLimitResult.currentCount}/${rateLimitResult.maxAllowed} posts in 3 hours)`,
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
      DEFAULT_CONFIG
    );

    if (!filterResult.passed) {
      console.warn(`[TurboMod] Post ${post.id} failed filter: ${filterResult.reason}`);

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
          reason: filterResult.reason || 'Failed content/author moderation filters',
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

      // 2. Fetch and remove all comments on the post
      const comments = await post.comments.all();
      let commentsRemoved = 0;

      for (const comment of comments) {
        await comment.remove();
        commentsRemoved++;
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

export default Devvit;
