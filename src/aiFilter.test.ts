import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseJsonResponse,
  buildOpenAiEndpointUrl,
  sanitizeGeminiModelName,
} from './aiFilter.js';

test('AI Filter - JSON Response Parsing', () => {
  const jsonRaw = `{"isSpam": true, "confidence": 0.95, "reason": "Scam crypto link"}`;
  const res1 = parseJsonResponse(jsonRaw);
  assert.notEqual(res1, null);
  assert.equal(res1?.isSpam, true);
  assert.equal(res1?.confidence, 0.95);
  assert.equal(res1?.reason, 'Scam crypto link');

  // Test markdown code block wrapping
  const jsonMarkdown = `\`\`\`json\n{"isSpam": false, "confidence": 0.1, "reason": "Legitimate question"}\n\`\`\``;
  const res2 = parseJsonResponse(jsonMarkdown);
  assert.notEqual(res2, null);
  assert.equal(res2?.isSpam, false);
});

test('AI Filter - Endpoint URL Normalization', () => {
  const url1 = buildOpenAiEndpointUrl('https://api.openai.com/v1');
  assert.equal(url1, 'https://api.openai.com/v1/chat/completions');

  const url2 = buildOpenAiEndpointUrl('https://openrouter.ai/api/v1/');
  assert.equal(url2, 'https://openrouter.ai/api/v1/chat/completions');

  const url3 = buildOpenAiEndpointUrl('https://api.deepseek.com/v1/chat/completions');
  assert.equal(url3, 'https://api.deepseek.com/v1/chat/completions');
});

test('AI Filter - Gemini Model Name Sanitization', () => {
  const model1 = sanitizeGeminiModelName('gemini-1.5-flash');
  assert.equal(model1, 'gemini-1.5-flash');

  const model2 = sanitizeGeminiModelName('models/gemini-2.0-flash');
  assert.equal(model2, 'gemini-2.0-flash');
});
