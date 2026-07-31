import { RedisClient } from '@devvit/public-api';
import { ModLogEntry, RateLimitCheckResult } from './types.js';

const MOD_LOG_KEY = 'turbomod:modlog';
const RATE_LIMIT_PREFIX = 'turbomod:rate:';
const DEFAULT_WINDOW_SECONDS = 10800; // 3 hours
const DEFAULT_MAX_POSTS = 2; // 2 posts per 3 hours

/**
 * Performs rate-limiting check and updates post count in Redis.
 * Key format: 'turbomod:rate:{userId}'
 * Allows up to maxPosts (default: 2) within windowSeconds (default: 3h / 10800s).
 */
export async function checkAndIncrementRateLimit(
  redis: RedisClient,
  userId: string,
  maxPosts: number = DEFAULT_MAX_POSTS,
  windowSeconds: number = DEFAULT_WINDOW_SECONDS
): Promise<RateLimitCheckResult> {
  const key = `${RATE_LIMIT_PREFIX}${userId}`;

  // Increment current count
  const currentCount = await redis.incrBy(key, 1);

  // If this is the first post in the window, set key expiration
  if (currentCount === 1) {
    await redis.expire(key, windowSeconds);
  }

  const allowed = currentCount <= maxPosts;

  return {
    allowed,
    currentCount,
    maxAllowed: maxPosts,
    ttlRemainingSeconds: windowSeconds,
  };
}

/**
 * Logs a moderation action into Redis list 'turbomod:modlog'.
 */
export async function addModLogEntry(
  redis: RedisClient,
  entry: Omit<ModLogEntry, 'id' | 'timestamp'>
): Promise<ModLogEntry> {
  const fullEntry: ModLogEntry = {
    ...entry,
    id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    timestamp: Date.now(),
  };

  const serialized = JSON.stringify(fullEntry);
  await redis.lPush(MOD_LOG_KEY, [serialized]);

  return fullEntry;
}

/**
 * Retrieves latest moderation log entries from Redis.
 */
export async function getModLogs(
  redis: RedisClient,
  limit: number = 50
): Promise<ModLogEntry[]> {
  try {
    const rawEntries = await redis.lRange(MOD_LOG_KEY, 0, limit - 1);
    return rawEntries.map((raw) => JSON.parse(raw) as ModLogEntry);
  } catch (error) {
    console.error('Error fetching mod logs from Redis:', error);
    return [];
  }
}
