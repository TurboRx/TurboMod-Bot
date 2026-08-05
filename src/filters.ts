import { FilterResult, ModerationRuleConfig } from './types.js';

export const URL_SHORTENER_PATTERN =
  /(?:https?:\/\/)?(?:www\.)?(?:bit\.ly|tinyurl\.com|t\.co|goo\.gl|is\.gd|buff\.ly|ow\.ly|rebrand\.ly|rb\.gy|cutt\.ly|shorturl\.at|tiny\.cc|linktr\.ee|beacons\.ai|qr\.co|opensea\.io)\/[a-zA-Z0-9_-]+/i;

export const SPAM_KEYWORDS_PATTERN =
  /\b(?:free\s+crypto|telegram:\s*@?|whatsapp:\s*\+?|\+?1[-.\s]?\d{3}[-.\s]?\d{3}[-.\s]?\d{4}|dm\s+for\s+(?:info|pics|deals|nudes)|buy\s+followers|cheap\s+(?:followers|pv|vcc)|whatsapp\s+me|cashapp\s+flip|crypto\s+doubler|instant\s+profit)\b/i;

export const DEFAULT_CONFIG: ModerationRuleConfig = {
  minKarma: 10,
  minAccountAgeDays: 3,
  rateLimitMaxPosts: 2,
  rateLimitWindowSeconds: 10800,
  enableStickyRemovalComment: true,
  lockContentOnRemoval: true,
  exemptApprovedUsers: true,
  checkComments: true,
  checkEdits: true,
  testMode: false,
  actionOnSpam: 'remove',
  exemptUsernames: [],
  exemptFlairs: ['verified', 'proof', 'approved'],
};

export function normalizeText(text?: string): string {
  if (!text) return '';
  // Remove zero-width spaces, joiners, soft hyphens, and non-printable control characters
  const unstripped = text.replace(/[\u200B-\u200D\uFEFF\u00AD]/g, '').trim();
  // De-obfuscate spaces inside domain names (e.g. "b i t . l y" -> "bit.ly")
  return unstripped.replace(/(?:([a-z0-9])\s+([a-z0-9]))/gi, '$1$2');
}

export function checkSpamPatterns(title?: string, body?: string): FilterResult {
  const cleanTitle = normalizeText(title);
  const cleanBody = normalizeText(body);
  const content = `${cleanTitle} ${cleanBody}`.trim();
  if (!content) {
    return { passed: true };
  }

  if (URL_SHORTENER_PATTERN.test(content) || URL_SHORTENER_PATTERN.test(`${title || ''} ${body || ''}`)) {
    return {
      passed: false,
      reason: 'Content contains suspicious URL shortener or redirect links',
      action: 'remove',
    };
  }

  if (SPAM_KEYWORDS_PATTERN.test(content) || SPAM_KEYWORDS_PATTERN.test(`${title || ''} ${body || ''}`)) {
    return {
      passed: false,
      reason: 'Content contains flagged spam keywords or contact patterns',
      action: 'spam',
    };
  }

  return { passed: true };
}

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
