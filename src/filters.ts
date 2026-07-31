import { FilterResult, ModerationRuleConfig } from './types.js';

/**
 * Regex pattern matching known URL shorteners commonly used in spam.
 * Note: Omitted 'g' flag to avoid lastIndex state issues during test().
 */
export const URL_SHORTENER_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|buff\.ly|ow\.ly|rebrand\.ly|rb\.gy|cutt\.ly|shorturl\.at|tiny\.cc)\/[a-zA-Z0-9_-]+/i;

/**
 * Regex pattern matching common spam & scam keywords.
 */
export const SPAM_KEYWORDS_PATTERN =
  /\b(?:free\s+crypto|telegram:\s*@|whatsapp:\s*\+|\+1\d{10}|dm\s+for\s+(?:info|pics|deals)|buy\s+followers|cheap\s+(?:followers|pv|vcc)|whatsapp\s+me|cashapp\s+flip)\b/i;

/**
 * Default moderation threshold configurations.
 */
export const DEFAULT_CONFIG: ModerationRuleConfig = {
  minKarma: 10,
  minAccountAgeDays: 3,
  rateLimitMaxPosts: 2,
  rateLimitWindowSeconds: 10800, // 3 hours in seconds
  enableStickyRemovalComment: true,
};

/**
 * Checks content (title + body) for disallowed URL shorteners or spam patterns.
 * Handles null/undefined content inputs gracefully.
 */
export function checkSpamPatterns(title?: string, body?: string): FilterResult {
  const content = `${title || ''} ${body || ''}`.trim();
  if (!content) {
    return { passed: true };
  }

  if (URL_SHORTENER_PATTERN.test(content)) {
    return {
      passed: false,
      reason: 'Post contains suspicious URL shortener links',
      action: 'remove',
    };
  }

  if (SPAM_KEYWORDS_PATTERN.test(content)) {
    return {
      passed: false,
      reason: 'Post contains flagged spam keywords or contact patterns',
      action: 'spam',
    };
  }

  return { passed: true };
}

/**
 * Verifies author karma and account age against minimum requirements.
 * Includes NaN and zero-value date validation safeguards.
 */
export function checkAccountEligibility(
  karma: number,
  createdUtc: number,
  config: ModerationRuleConfig = DEFAULT_CONFIG
): FilterResult {
  const safeKarma = isNaN(karma) ? 0 : karma;
  const safeConfigMinKarma = isNaN(config.minKarma) ? DEFAULT_CONFIG.minKarma : config.minKarma;
  const safeConfigMinAge = isNaN(config.minAccountAgeDays) ? DEFAULT_CONFIG.minAccountAgeDays : config.minAccountAgeDays;

  if (safeKarma < safeConfigMinKarma) {
    return {
      passed: false,
      reason: `Account karma (${safeKarma}) is below required threshold of ${safeConfigMinKarma}`,
      action: 'remove',
    };
  }

  if (!isNaN(createdUtc) && createdUtc > 0) {
    const nowInSeconds = Math.floor(Date.now() / 1000);
    const accountAgeDays = Math.max(0, (nowInSeconds - createdUtc) / 86400);

    if (accountAgeDays < safeConfigMinAge) {
      return {
        passed: false,
        reason: `Account age (${accountAgeDays.toFixed(1)} days) is below minimum requirement of ${safeConfigMinAge} days`,
        action: 'remove',
      };
    }
  }

  return { passed: true };
}

/**
 * Runs combined moderation filters on post content and author metadata.
 */
export function evaluatePost(
  title: string | undefined,
  body: string | undefined,
  authorKarma: number,
  authorCreatedUtc: number,
  config: ModerationRuleConfig = DEFAULT_CONFIG
): FilterResult {
  const spamCheck = checkSpamPatterns(title, body);
  if (!spamCheck.passed) {
    return spamCheck;
  }

  const ageKarmaCheck = checkAccountEligibility(authorKarma, authorCreatedUtc, config);
  if (!ageKarmaCheck.passed) {
    return ageKarmaCheck;
  }

  return { passed: true };
}
