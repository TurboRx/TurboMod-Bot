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
  const key = `${RATE_LIMIT_PREFIX}${userId}`;
  const currentCount = await redis.incrBy(key, 1);

  if (currentCount === 1) {
    await redis.expire(key, windowSeconds);
  }

  return {
    allowed: currentCount <= maxPosts,
    currentCount,
    maxAllowed: maxPosts,
    ttlRemainingSeconds: windowSeconds,
  };
}

export async function isModeratorCached(
  redis: RedisClient,
  reddit: any,
  subredditName: string,
  username: string
): Promise<boolean> {
  const cacheKey = `${MOD_CACHE_PREFIX}${subredditName.toLowerCase()}`;

  try {
    const cachedModsJson = await redis.get(cacheKey);
    let modUsernames: string[] = [];

    if (cachedModsJson) {
      modUsernames = JSON.parse(cachedModsJson);
    } else if (reddit) {
      const mods = await reddit.getModerators({ subredditName }).all();
      modUsernames = mods.map((m: any) => (m.username || '').toLowerCase());
      await redis.set(cacheKey, JSON.stringify(modUsernames), {
        expiration: new Date(Date.now() + 3600 * 1000),
      });
    }

    return modUsernames.includes(username.toLowerCase());
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

  await redis.lPush(MOD_LOG_KEY, [JSON.stringify(fullEntry)]);

  try {
    await redis.lTrim(MOD_LOG_KEY, 0, MAX_LOG_ENTRIES - 1);
  } catch (err) {
    console.error('[TurboMod] Error trimming Redis log list:', err);
  }

  return fullEntry;
}

export async function getModLogs(
  redis: RedisClient,
  limit: number = 50
): Promise<ModLogEntry[]> {
  try {
    const rawEntries = await redis.lRange(MOD_LOG_KEY, 0, limit - 1);
    return rawEntries
      .map((raw) => {
        try {
          return JSON.parse(raw) as ModLogEntry;
        } catch {
          return null;
        }
      })
      .filter((entry): entry is ModLogEntry => entry !== null);
  } catch (error) {
    console.error('Error fetching mod logs from Redis:', error);
    return [];
  }
}
