# 🚀 TurboMod — High-Performance Subreddit Moderation

**TurboMod** is an all-in-one, real-time automated moderation app built for Reddit communities. It protects your subreddit from spam links, low-effort bot accounts, flood posting, and disruptive comment threads—all configurable in seconds directly from your subreddit's App Settings.

---

## ✨ Key Features

- 🛡️ **Real-Time Spam & Link Filtering**: Automatically detects and removes posts containing suspicious URL shorteners (`bit.ly`, `tinyurl`, `t.co`, etc.), zero-width space evasion tricks, and common spam/scam keywords.
- 👤 **Account Age & Karma Verification**: Enforces minimum account age (in days) and combined link/comment karma to keep out brand-new burner accounts and spam bots.
- ⚡ **Atomic Rate Limiting**: Prevents post flooding by enforcing customizable post limits per user within a rolling time window (powered by Redis).
- 💬 **Automatic Sticky Removal Notices**: Leaves clear, stickied explanation comments on removed posts so users know why their post was filtered.
- 🔨 **Moderator Thread Nuke & Lock**: A one-click moderator menu action to lock a chaotic submission and purge comment threads instantly.
- 📊 **Subreddit Audit Logs**: Tracks all automated and manual moderation actions in a lightweight, accessible Redis log.

---

## ⚙️ How to Configure

Once installed, moderators can customize all thresholds directly in **Subreddit Settings ➔ App Settings ➔ TurboMod**:

| Setting | Default | Description |
| :--- | :---: | :--- |
| **Minimum Required Karma** | `10` | Minimum combined karma required to post. |
| **Minimum Account Age** | `3` days | Minimum account age in days required to post. |
| **Rate Limit: Max Posts** | `2` | Maximum number of posts a user can submit per window. |
| **Rate Limit Window** | `3` hours | Duration (in hours) for the rate limit sliding window. |
| **Sticky Removal Comment** | `Enabled` | Post a stickied explanation comment on removed posts. |

---

## 🛠️ Moderator Actions & Commands

TurboMod adds convenient moderation tools directly into your subreddit's context menus:

### 1. 🔨 `TurboMod: Nuke & Lock Thread`
- **Location**: Click `...` on any Post ➔ **TurboMod: Nuke & Lock Thread**
- **Action**: Locks the submission and automatically purges comment threads in parallel.

### 2. 📜 `TurboMod: View Recent Mod Logs`
- **Location**: Click `...` on Subreddit Menu ➔ **TurboMod: View Recent Mod Logs**
- **Action**: Displays a quick toast summary of the most recent automated removals and rate-limit triggers.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Do moderators get filtered or rate-limited by TurboMod?**  
*No! Subreddit moderators are automatically detected and bypass all age/karma checks and rate limits.*

**Q: Can I disable sticky removal comments?**  
*Yes! Toggle "Post Sticky Explanation Comment" off in your subreddit's TurboMod App Settings at any time.*

---

## 📬 Support & Source Code

- **Reddit App Directory**: [developers.reddit.com/apps/turbomod-bot](https://developers.reddit.com/apps/turbomod-bot)
- **Source Code & Issue Tracker**: [GitHub Repository](https://github.com/TurboRx/TurboMod-Bot)
