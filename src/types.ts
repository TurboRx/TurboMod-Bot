export interface FilterResult {
  passed: boolean;
  reason?: string;
  action?: 'remove' | 'spam' | 'lock' | 'flag';
}

export interface ModerationRuleConfig {
  minKarma: number;
  minAccountAgeDays: number;
  rateLimitMaxPosts: number;
  rateLimitWindowSeconds: number;
  enableStickyRemovalComment?: boolean;
  testMode?: boolean;
  actionOnSpam?: 'remove' | 'report' | 'spam';
  exemptUsernames?: string[];
  exemptFlairs?: string[];
}

export interface ModLogEntry {
  id: string;
  action: 'POST_REMOVED' | 'THREAD_NUKED' | 'RATE_LIMIT_EXCEEDED' | 'SPAM_FILTERED' | 'TEST_MODE_LOGGED' | 'POST_REPORTED';
  targetId: string;
  author: string;
  moderator?: string;
  timestamp: number;
  reason: string;
}

export interface RateLimitCheckResult {
  allowed: boolean;
  currentCount: number;
  maxAllowed: number;
  ttlRemainingSeconds: number;
}

export interface NukeThreadResult {
  success: boolean;
  commentsRemoved: number;
  threadLocked: boolean;
  error?: string;
}
