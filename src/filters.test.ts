import test from 'node:test';
import assert from 'node:assert/strict';
import {
  checkSpamPatterns,
  checkAccountEligibility,
  evaluatePost,
  normalizeText,
  DEFAULT_CONFIG,
} from './filters.js';

test('Spam Filter - URL Shorteners & Obfuscation Evasion', () => {
  const result1 = checkSpamPatterns('Check out this link: bit.ly/3xyz123', 'Some body content');
  assert.equal(result1.passed, false);
  assert.equal(result1.action, 'remove');
  assert.match(result1.reason || '', /URL shortener/i);

  // Test dot obfuscations (bit[.]ly, tinyurl(dot)com, linktr dot ee)
  const resultObfuscated1 = checkSpamPatterns('Check my bio bit[.]ly/3xyz123', 'Click here!');
  assert.equal(resultObfuscated1.passed, false);

  const resultObfuscated2 = checkSpamPatterns('Check my bio tinyurl(dot)com/abc123', 'Click here!');
  assert.equal(resultObfuscated2.passed, false);

  const resultLinktree = checkSpamPatterns('Check my bio linktr.ee/myprofile', 'Click here!');
  assert.equal(resultLinktree.passed, false);

  const resultBeacons = checkSpamPatterns('My social hub beacons.ai/myprofile', 'Click here!');
  assert.equal(resultBeacons.passed, false);

  const result2 = checkSpamPatterns('Normal post title', 'Visit https://example.com/article');
  assert.equal(result2.passed, true);
});

test('Spam Filter - Spam Keywords & Soft Hyphens', () => {
  const result1 = checkSpamPatterns('Get FREE CRYPTO right now!', 'Telegram: @crypto_scam');
  assert.equal(result1.passed, false);
  assert.equal(result1.action, 'spam');

  // Test zero-width space and soft-hyphen evasion
  const resultEvade = checkSpamPatterns('Get F\u200BREE CRY\u00ADPTO right now!', 'Telegram:\u200B@crypto_scam');
  assert.equal(resultEvade.passed, false);
  assert.equal(resultEvade.action, 'spam');

  const result2 = checkSpamPatterns('Looking for advice on buying a laptop', 'Any suggestions?');
  assert.equal(result2.passed, true);
});

test('Text Normalization Utility', () => {
  const input = 'bit[.]ly/3xyz\u200B123';
  const clean = normalizeText(input);
  assert.equal(clean, 'bit.ly/3xyz123');
});

test('Account Eligibility - Karma, Negative Karma & Age Checks', () => {
  const nowUtc = Math.floor(Date.now() / 1000);
  const tenDaysAgoUtc = nowUtc - 10 * 86400;
  const oneDayAgoUtc = nowUtc - 1 * 86400;

  // Passed case
  const passRes = checkAccountEligibility(100, tenDaysAgoUtc, DEFAULT_CONFIG);
  assert.equal(passRes.passed, true);

  // Negative Karma
  const negKarmaRes = checkAccountEligibility(-15, tenDaysAgoUtc, DEFAULT_CONFIG);
  assert.equal(negKarmaRes.passed, false);

  // Low Karma
  const lowKarmaRes = checkAccountEligibility(2, tenDaysAgoUtc, DEFAULT_CONFIG);
  assert.equal(lowKarmaRes.passed, false);
  assert.match(lowKarmaRes.reason || '', /Account karma/i);

  // Low Account Age
  const youngAccountRes = checkAccountEligibility(50, oneDayAgoUtc, DEFAULT_CONFIG);
  assert.equal(youngAccountRes.passed, false);
  assert.match(youngAccountRes.reason || '', /Account age/i);

  // Millisecond timestamp handling
  const passMsRes = checkAccountEligibility(100, tenDaysAgoUtc * 1000, DEFAULT_CONFIG);
  assert.equal(passMsRes.passed, true);
});

test('Overall Post Evaluation', () => {
  const nowUtc = Math.floor(Date.now() / 1000);
  const tenDaysAgoUtc = nowUtc - 10 * 86400;

  const validPost = evaluatePost('Great community project', 'Hello everyone', 50, tenDaysAgoUtc);
  assert.equal(validPost.passed, true);

  const spamPost = evaluatePost('Free crypto giveaway', 'dm for info', 50, tenDaysAgoUtc);
  assert.equal(spamPost.passed, false);
  assert.equal(spamPost.action, 'spam');
});
