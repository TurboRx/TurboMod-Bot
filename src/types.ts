export type AIProvider = 'none' | 'openai' | 'gemini' | 'claude' | 'deepseek' | 'grok' | 'custom';
export type AISensitivity = 'low' | 'medium' | 'high';

export interface FilterResult {
  passed: boolean;
  reason?: string;
  action?: 'remove' | 'spam' | 'lock' | 'flag' | 'filter';
  isAiResult?: boolean;
}

export interface ModerationRuleConfig {
  minKarma: number;
  minAccountAgeDays: number;
  rateLimitMaxPosts: number;
  rateLimitWindowSeconds: number;
  enableStickyRemovalComment?: boolean;
  lockContentOnRemoval?: boolean;
  exemptApprovedUsers?: boolean;
  checkComments?: boolean;
  checkEdits?: boolean;
  testMode?: boolean;
  actionOnSpam?: 'remove' | 'report' | 'spam' | 'filter';
  exemptUsernames?: string[];
  exemptFlairs?: string[];
  aiProvider?: AIProvider;
  aiApiKey?: string;
  aiCustomEndpoint?: string;
  aiModelName?: string;
  aiSensitivity?: AISensitivity;
}

export interface ModLogEntry {
  id: string;
  action:
    | 'POST_REMOVED'
    | 'COMMENT_REMOVED'
    | 'POST_FILTERED'
    | 'COMMENT_FILTERED'
    | 'THREAD_NUKED'
    | 'RATE_LIMIT_EXCEEDED'
    | 'SPAM_FILTERED'
    | 'AI_SPAM_FILTERED'
    | 'TEST_MODE_LOGGED'
    | 'POST_REPORTED'
    | 'COMMENT_REPORTED';
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

export interface AIEvaluationResult {
  isSpam: boolean;
  confidence: number;
  reason: string;
  provider: string;
}
