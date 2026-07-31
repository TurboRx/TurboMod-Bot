import test from 'node:test';
import assert from 'node:assert/strict';
import { checkAndIncrementRateLimit, addModLogEntry, getModLogs } from './redis.js';

class MockRedisClient {
  private data = new Map<string, any>();

  async incrBy(key: string, value: number): Promise<number> {
    const current = (this.data.get(key) || 0) + value;
    this.data.set(key, current);
    return current;
  }

  async expire(_key: string, _seconds: number): Promise<this> {
    return this;
  }

  async zAdd(key: string, ...members: { member: string; score: number }[]): Promise<this> {
    const set = this.data.get(key) || [];
    set.push(...members);
    set.sort((a: any, b: any) => a.score - b.score);
    this.data.set(key, set);
    return this;
  }

  async zCard(key: string): Promise<number> {
    const set = this.data.get(key) || [];
    return set.length;
  }

  async zRemRangeByRank(key: string, start: number, stop: number): Promise<this> {
    const set = this.data.get(key) || [];
    set.splice(start, stop - start + 1);
    this.data.set(key, set);
    return this;
  }

  async zRange(key: string, _start: number, _stop: number, options?: any): Promise<any[]> {
    const set = [...(this.data.get(key) || [])];
    if (options?.reverse) {
      set.reverse();
    }
    return set;
  }
}

test('Redis - Rate Limiting', async () => {
  const mockRedis = new MockRedisClient() as any;

  // Post 1 (Allowed)
  const res1 = await checkAndIncrementRateLimit(mockRedis, 'user123', 2, 3600);
  assert.equal(res1.allowed, true);
  assert.equal(res1.currentCount, 1);

  // Post 2 (Allowed)
  const res2 = await checkAndIncrementRateLimit(mockRedis, 'user123', 2, 3600);
  assert.equal(res2.allowed, true);
  assert.equal(res2.currentCount, 2);

  // Post 3 (Blocked)
  const res3 = await checkAndIncrementRateLimit(mockRedis, 'user123', 2, 3600);
  assert.equal(res3.allowed, false);
  assert.equal(res3.currentCount, 3);
});

test('Redis - Mod Logging and Trim', async () => {
  const mockRedis = new MockRedisClient() as any;

  await addModLogEntry(mockRedis, {
    action: 'POST_REMOVED',
    targetId: 't3_abc123',
    author: 'spammer1',
    reason: 'Shortener URL detected',
  });

  const logs = await getModLogs(mockRedis, 10);
  assert.equal(logs.length, 1);
  assert.equal(logs[0].author, 'spammer1');
  assert.equal(logs[0].action, 'POST_REMOVED');
});
