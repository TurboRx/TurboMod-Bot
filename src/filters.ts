import { FilterResult, ModerationRuleConfig } from './types.js';

/**
 * Regex pattern matching known URL shorteners commonly used in spam.
 */
export const URL_SHORTENER_REGEX =
  /(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|buff\.ly|ow\.ly|rebrand\.ly|rb\.gy|cutt\.ly|shorturl\.at|tiny\.cc)\/[a-zA-Z0-9_-]+/gi;

/**
 * Regex pattern matching common spam & scam keywords.
 */
export const SPAM_KEYWORDS_REGEX =
  /\b(?:free\s+crypto|telegram:\s*@|whatsapp:\s*\+|\+1\d{10}|dm\s+for\s+(?:info|pics|deals)|buy\s+followers|cheap\s+(?:followers|pv|vcc)|whatsapp\s+me|cashapp\s+flip)\b/gi;

/**
 * Default moderation threshold configurations.
 */
export const DEFAULT_CONFIG: ModerationRuleConfig = {
  minKarma: 10,
  minAccountAgeDays: 3,
  rateLimitMaxPosts: 2,
  rateLimitWindowSeconds: 10800, // 3 hours in seconds
};

/**
 * Checks content (title + body) for disallowed URL shorteners or spam patterns.
 */
export function checkSpamPatterns(title: string, body?: string): FilterResult {
  const content = `${title} ${body || ''}`;

  // Reset regex index state
  URL_SHORTENER_REGEX.lastIndex = 0;
  SPAM_KEYWORDS_REGEX.lastIndex = 0;

  if (URL_SHORTENER_REGEX.test(content)) {
    return {
      passed: false,
      reason: 'Post contains suspicious URL shortener links',
      action: 'remove',
    };
  }

  if (SPAM_KEYWORDS_REGEX.test(content)) {
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
 */
export function checkAccountEligibility(
  karma: number,
  createdUtc: number,
  config: ModerationRuleConfig = DEFAULT_CONFIG
): FilterResult {
  const nowInSeconds = Math.floor(Date.now() / 1000);
  const accountAgeDays = (nowInSeconds - createdUtc) / 86400;

  if (karma < config.minKarma) {
    return {
      passed: false,
      reason: `Account karma (${karma}) is below the required threshold of ${config.minKarma}`,
      action: 'remove',
    };
  }

  if (accountAgeDays < config.minAccountAgeDays) {
    return {
      passed: false,
      reason: `Account age (${accountAgeDays.toFixed(1)} days) is below minimum requirement of ${config.minAccountAgeDays} days`,
      action: 'remove',
    };
  }

  return { passed: true };
}

/**
 * Runs combined moderation filters on post content and author metadata.
 */
export function evaluatePost(
  title: string,
  body: string | undefined,
  authorKarma: number,
  authorCreatedUtc: number,
  config: ModerationRuleConfig = DEFAULT_CONFIG
): FilterResult {
  // Check spam regex shorteners first
  const spamCheck = checkSpamPatterns(title, body);
  if (!spamCheck.passed) {
    return spamCheck;
  }

  // Check account age & karma
  const ageKarmaCheck = checkAccountEligibility(authorKarma, authorCreatedUtc, config);
  if (!ageKarmaCheck.passed) {
    return ageKarmaCheck;
  }

  return { passed: true };
}
