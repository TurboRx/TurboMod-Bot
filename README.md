# TurboMod

[![Reddit App Directory](https://img.shields.io/badge/Reddit_App_Directory-TurboMod-FF4500?style=for-the-badge&logo=reddit&logoColor=white)](https://developers.reddit.com/apps/turbomod-bot)
[![Category](https://img.shields.io/badge/Category-%23moderator-blue?style=for-the-badge)](#moderator)

**TurboMod** is a high-performance, automated moderation app for Reddit built on `@devvit/public-api`. Officially approved and available on the [Reddit App Directory](https://developers.reddit.com/apps/turbomod-bot).

## Key Features

- **Automated Real-Time Moderation**: Moderates submissions matching URL shortener patterns or spam keywords.
- **Account Age & Karma Checks**: Enforces minimum account age and link/comment karma requirements.
- **Atomic Redis Rate Limiting**: Restricts users to 2 posts per 3 hours (`turbomod:rate:{userId}`) using Redis sliding-window TTLs.
- **Thread Nuke & Lock**: Moderator menu action to lock a post and purge comments in parallel.
- **Sticky Removal Notices**: Posts automated stickied explanation comments on removed submissions.
- **Subreddit Settings Panel**: Allows moderators to dynamically customize thresholds via Reddit App Settings.
- **Redis Mod Logs**: Logs all automated and manual actions with a menu action to view recent logs.

## Tech Stack

- **Platform**: Reddit Devvit SDK (`@devvit/public-api ^0.13.10`)
- **Language**: TypeScript (`^7.0.2`)
- **Storage**: Redis Persistence (`context.redis`)

## Structure

```
├── devvit.yaml
├── package.json
├── tsconfig.json
├── .github/
│   └── dependabot.yml
└── src/
    ├── types.ts
    ├── filters.ts
    ├── redis.ts
    └── main.ts
```
