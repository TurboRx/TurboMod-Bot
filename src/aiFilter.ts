import { AIEvaluationResult, AIProvider, AISensitivity, ModerationRuleConfig } from './types.js';

const SYSTEM_PROMPT = `You are an automated Reddit moderation AI assistant.
Your task is to classify whether the submitted post/comment is SPAM, SCAM, PHISHING, BOT-GENERATED ADS, REPETITIVE PROMOTION, or MALICIOUS CONTENT.

Respond ONLY with a valid raw JSON object matching this exact format:
{
  "isSpam": boolean,
  "confidence": number (between 0.0 and 1.0),
  "reason": "concise explanation of why this content is or is not spam"
}`;

const SENSITIVITY_THRESHOLDS: Record<AISensitivity, number> = {
  low: 0.9,
  medium: 0.75,
  high: 0.6,
};

const DEFAULT_MODELS: Record<AIProvider, string> = {
  none: '',
  openai: 'gpt-4o-mini',
  gemini: 'gemini-1.5-flash',
  claude: 'claude-3-5-haiku-20241022',
  deepseek: 'deepseek-chat',
  grok: 'grok-beta',
  custom: 'custom-model',
};

const DEFAULT_ENDPOINTS: Partial<Record<AIProvider, string>> = {
  openai: 'https://api.openai.com/v1',
  deepseek: 'https://api.deepseek.com/v1',
  grok: 'https://api.x.ai/v1',
};

export function parseJsonResponse(rawText: string): { isSpam: boolean; confidence: number; reason: string } | null {
  if (!rawText) return null;
  try {
    // Clean markdown code blocks
    let cleaned = rawText.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();

    // Extract first JSON object pattern if there is surrounding text
    const match = cleaned.match(/\{[\s\S]*?\}/);
    if (match) {
      cleaned = match[0];
    }

    const parsed = JSON.parse(cleaned);
    if (typeof parsed.isSpam === 'boolean' || typeof parsed.isSpam === 'string') {
      const isSpam = typeof parsed.isSpam === 'boolean' ? parsed.isSpam : String(parsed.isSpam).toLowerCase() === 'true';
      return {
        isSpam,
        confidence: typeof parsed.confidence === 'number' ? Math.min(1, Math.max(0, parsed.confidence)) : 0.8,
        reason: typeof parsed.reason === 'string' ? parsed.reason.trim() : 'Flagged by AI semantic filter',
      };
    }
  } catch (err) {
    console.error('[TurboMod AI] Failed to parse AI JSON response:', err);
  }
  return null;
}

export function buildOpenAiEndpointUrl(endpoint: string): string {
  let clean = (endpoint || 'https://api.openai.com/v1').trim();
  clean = clean.replace(/\/+$/, ''); // Remove trailing slashes
  if (clean.toLowerCase().endsWith('/chat/completions')) {
    return clean;
  }
  return `${clean}/chat/completions`;
}

export function sanitizeGeminiModelName(model: string): string {
  const clean = (model || 'gemini-1.5-flash').trim();
  return clean.replace(/^models\//i, '');
}

async function callOpenAICompatible(
  endpoint: string,
  apiKey: string,
  model: string,
  content: string
): Promise<string | null> {
  const url = buildOpenAiEndpointUrl(endpoint);
  
  // Try with json_object response format
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Submission Content:\n${content}` },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (response.ok) {
      const data: any = await response.json();
      return data?.choices?.[0]?.message?.content || null;
    }

    if (response.status !== 400) {
      const errorText = await response.text();
      console.error(`[TurboMod AI] OpenAI-compatible endpoint returned HTTP ${response.status}: ${errorText}`);
      return null;
    }
  } catch (_err) {
    // Fallback below
  }

  // Fallback call without response_format (for older models or custom proxies)
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.1,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: `Submission Content:\n${content}` },
        ],
      }),
    });

    if (response.ok) {
      const data: any = await response.json();
      return data?.choices?.[0]?.message?.content || null;
    }
  } catch (err) {
    console.error(`[TurboMod AI] Fallback call to ${url} failed:`, err);
  }

  return null;
}

async function callGemini(apiKey: string, model: string, content: string): Promise<string | null> {
  const cleanModel = sanitizeGeminiModelName(model);
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${cleanModel}:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      contents: [
        {
          parts: [
            { text: `${SYSTEM_PROMPT}\n\nSubmission Content:\n${content}` },
          ],
        },
      ],
      generationConfig: {
        responseMimeType: 'application/json',
        temperature: 0.1,
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[TurboMod AI] Gemini API returned status ${response.status}: ${errorText}`);
    return null;
  }

  const data: any = await response.json();
  return data?.candidates?.[0]?.content?.parts?.[0]?.text || null;
}

async function callClaude(apiKey: string, model: string, content: string): Promise<string | null> {
  const url = 'https://api.anthropic.com/v1/messages';
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: model.trim(),
      max_tokens: 512,
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `Submission Content:\n${content}` }],
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    console.error(`[TurboMod AI] Claude API returned status ${response.status}: ${errorText}`);
    return null;
  }

  const data: any = await response.json();
  return data?.content?.[0]?.text || null;
}

export async function evaluateContentWithAI(
  title: string | undefined,
  body: string | undefined,
  config: ModerationRuleConfig
): Promise<AIEvaluationResult | null> {
  const provider = config.aiProvider || 'none';
  if (provider === 'none' || !config.aiApiKey) {
    return null;
  }

  const content = `Title: ${title || '(No Title)'}\nBody: ${body || '(No Body)'}`.trim();
  if (!content || content.length < 5) {
    return null;
  }

  const apiKey = config.aiApiKey.trim();
  const model = (config.aiModelName || DEFAULT_MODELS[provider] || 'gpt-4o-mini').trim();
  const sensitivity = config.aiSensitivity || 'medium';
  const threshold = SENSITIVITY_THRESHOLDS[sensitivity];

  try {
    let rawOutput: string | null = null;

    if (provider === 'gemini') {
      rawOutput = await callGemini(apiKey, model, content);
    } else if (provider === 'claude') {
      rawOutput = await callClaude(apiKey, model, content);
    } else {
      const endpoint =
        provider === 'custom'
          ? (config.aiCustomEndpoint || 'https://api.openai.com/v1').trim()
          : DEFAULT_ENDPOINTS[provider] || 'https://api.openai.com/v1';

      rawOutput = await callOpenAICompatible(endpoint, apiKey, model, content);
    }

    if (!rawOutput) {
      return null;
    }

    const parsed = parseJsonResponse(rawOutput);
    if (!parsed) {
      return null;
    }

    const isSpamMatch = parsed.isSpam && parsed.confidence >= threshold;

    return {
      isSpam: isSpamMatch,
      confidence: parsed.confidence,
      reason: parsed.reason,
      provider: `${provider.toUpperCase()} (${model})`,
    };
  } catch (err) {
    console.error(`[TurboMod AI] Error calling AI provider (${provider}):`, err);
    return null;
  }
}
