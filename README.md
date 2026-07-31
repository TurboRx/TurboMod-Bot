# TurboMod

**TurboMod** is a high-performance, automated moderation app for Reddit built on `@devvit/public-api`.

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
