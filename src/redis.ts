import { RedisClient } from '@devvit/public-api';
import { ModLogEntry, RateLimitCheckResult } from './types.js';

const MOD_LOG_KEY = 'turbomod:modlog';
const RATE_LIMIT_PREFIX = 'turbomod:rate:';
const MOD_CACHE_PREFIX = 'turbomod:modcache:';
const DEFAULT_WINDOW_SECONDS = 10800;
const DEFAULT_MAX_POSTS = 2;
const MAX_LOG_ENTRIES = 100;

export async function checkAndIncrementRateLimit(
  redis: RedisClient,
  userId: string,
  maxPosts: number = DEFAULT_MAX_POSTS,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS
): Promise<RateLimitCheckResult> {
  const cleanUserId = (userId || '').trim().toLowerCase().replace(/^u\//i, '');
  const safeMaxPosts = isNaN(maxPosts) || maxPosts <= 0 ? DEFAULT_MAX_POSTS : maxPosts;
  const safeWindowSeconds = isNaN(windowSeconds) || windowSeconds <= 0 ? DEFAULT_WINDOW_SECONDS : windowSeconds;

  if (!cleanUserId || cleanUserId === 'unknown' || cleanUserId === 'unknown_user') {
    return {
      allowed: true,
      currentCount: 0,
      maxAllowed: safeMaxPosts,
      ttlRemainingSeconds: safeWindowSeconds,
    };
  }

  const key = `${RATE_LIMIT_PREFIX}${cleanUserId}`;
  const currentCount = await redis.incrBy(key, 1);

  if (currentCount === 1) {
    await redis.expire(key, safeWindowSeconds);
  }

  return {
    allowed: currentCount <= safeMaxPosts,
    currentCount,
    maxAllowed: safeMaxPosts,
    ttlRemainingSeconds: safeWindowSeconds,
  };
}

export async function isModeratorCached(
  redis: RedisClient,
  reddit: any,
  subredditName: string,
  username: string
): Promise<boolean> {
  if (!subredditName || !username || username === 'unknown_user') {
    return false;
  }

  const cleanSubreddit = subredditName.trim().toLowerCase();
  const cleanUsername = username.trim().toLowerCase().replace(/^u\//i, '');
  const cacheKey = `${MOD_CACHE_PREFIX}${cleanSubreddit}`;

  try {
    const cachedModsJson = await redis.get(cacheKey);
    let modUsernames: string[] = [];

    if (cachedModsJson) {
      try {
        const parsed = JSON.parse(cachedModsJson);
        if (Array.isArray(parsed)) {
          modUsernames = parsed;
        }
      } catch (_e) {
        // Fallback on JSON parse error
      }
    }

    if (modUsernames.length === 0 && reddit) {
      const mods = await reddit.getModerators({ subredditName: cleanSubreddit }).all();
      modUsernames = mods
        .map((m: any) => (m.username || '').trim().toLowerCase().replace(/^u\//i, ''))
        .filter((u: string) => u.length > 0);

      await redis.set(cacheKey, JSON.stringify(modUsernames), {
        expiration: new Date(Date.now() + 3600 * 1000),
      });
    }

    return modUsernames.includes(cleanUsername);
  } catch (err) {
    console.error('[TurboMod] Error in isModeratorCached:', err);
    return false;
  }
}

export async function addModLogEntry(
  redis: RedisClient,
  entry: Omit<ModLogEntry, 'id' | 'timestamp'>
): Promise<ModLogEntry> {
  const fullEntry: ModLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };

  await redis.zAdd(MOD_LOG_KEY, {
    member: JSON.stringify(fullEntry),
    score: fullEntry.timestamp,
  });

  try {
    const total = await redis.zCard(MOD_LOG_KEY);
    if (total > MAX_LOG_ENTRIES) {
      await redis.zRemRangeByRank(MOD_LOG_KEY, 0, total - MAX_LOG_ENTRIES - 1);
    }
  } catch (err) {
    console.error('[TurboMod] Error trimming Redis log set:', err);
  }

  return fullEntry;
}

export async function getModLogs(
  redis: RedisClient,
  limit: number = 50
): Promise<ModLogEntry[]> {
  try {
    const safeLimit = isNaN(limit) || limit <= 0 ? 50 : limit;
    const rawEntries = await redis.zRange(MOD_LOG_KEY, 0, safeLimit - 1, {
      by: 'rank',
      reverse: true,
    });
    return rawEntries
      .map((item: any) => {
        try {
          const str = typeof item === 'string' ? item : item.member;
          return JSON.parse(str) as ModLogEntry;
        } catch {
          return null;
        }
      })
      .filter((entry: ModLogEntry | null): entry is ModLogEntry => entry !== null);
  } catch (error) {
    console.error('Error fetching mod logs from Redis:', error);
    return [];
  }
}
