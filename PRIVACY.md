# Privacy Policy for TurboMod-Bot

**Effective Date:** August 5, 2026

This Privacy Policy explains how **TurboMod-Bot** ("App", "Service", "Bot") collects, processes, and protects information when installed in subreddits on Reddit.

## 1. Information Processed
To perform automated moderation, TurboMod-Bot processes the following Reddit submission metadata:
- **Submission Content:** Post titles, post text bodies, and submission URLs.
- **Account Metadata:** Reddit usernames, account age, karma scores, and subreddit moderation status.
- **Subreddit Information:** Subreddit names, rule configurations, and moderation log entries.

## 2. Data Usage & Storage
- **Transient Processing:** Data is processed in real-time to evaluate incoming posts against active moderation rules.
- **Redis Caching:** Transient moderation data (such as user submission counts for rate limiting and cached moderator lists) is temporarily stored in Devvit's Redis cache with short expiration timeouts (TTL).
- **No External Data Selling:** TurboMod-Bot does not sell, monetize, or track user data across subreddits.

## 3. Third-Party AI Services
If the subreddit moderation team enables AI-assisted filtering by supplying an API key (e.g., OpenAI, Google Gemini, Anthropic Claude, Grok, DeepSeek, or custom proxy):
- Submission content (titles and post bodies) is sent via HTTPS to the designated AI provider endpoint solely for moderation scoring and evaluation.
- No personal user identifiers beyond submission content are included in AI evaluation requests.
- Data processing by AI providers is governed by their respective official privacy policies:
  - **OpenAI:** [https://openai.com/privacy/](https://openai.com/privacy/)
  - **Google Gemini:** [https://policies.google.com/privacy](https://policies.google.com/privacy)
  - **Anthropic Claude:** [https://www.anthropic.com/privacy](https://www.anthropic.com/privacy)
  - **xAI / Grok:** [https://x.ai/legal/privacy-policy](https://x.ai/legal/privacy-policy)
  - **DeepSeek:** [https://www.deepseek.com/privacy](https://www.deepseek.com/privacy)

## 4. Data Security
All communications between TurboMod-Bot, Reddit, Redis, and third-party APIs occur exclusively over encrypted HTTPS connections.

## 5. User Control & Rights
Subreddit moderators can disable TurboMod-Bot or purge configuration and cache settings at any time by removing the bot from their subreddit settings.

## 6. Updates to Privacy Policy
We may update this Privacy Policy periodically. Any updates will be reflected in this document.

## 7. Contact
For questions regarding this Privacy Policy or source code, visit:
Repository: [https://github.com/TurboRx/TurboMod-Bot](https://github.com/TurboRx/TurboMod-Bot)
