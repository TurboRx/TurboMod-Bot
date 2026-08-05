# 🚀 TurboMod — High-Performance Subreddit Moderation

[![Open Source License](https://img.shields.io/badge/License-MIT-green.svg?style=for-the-badge)](LICENSE)
[![Reddit App Directory](https://img.shields.io/badge/Reddit_App_Directory-TurboMod-FF4500?style=for-the-badge&logo=reddit&logoColor=white)](https://developers.reddit.com/apps/turbomod-bot)
[![Category](https://img.shields.io/badge/Category-%23moderator-blue?style=for-the-badge)](#moderator)

**TurboMod** is an open-source, real-time automated moderation app built for Reddit communities. It protects your subreddit from spam links, low-effort bot accounts, flood posting, stealth comment edits, and disruptive comment threads—all configurable in seconds directly from your subreddit's App Settings.

---

## ✨ Key Features

- 🛡️ **Real-Time Posts & Comments Moderation**: Monitors both submission posts AND comments in real-time for suspicious link shorteners (`bit.ly`, `tinyurl`, `linktr.ee`, `beacons.ai`, `qr.co`), zero-width space/soft-hyphen evasion tricks, and common spam/scam patterns.
- 🕵️ **Anti-Stealth Edit Protection**: Evaluates content edits (`PostUpdate` & `CommentUpdate`) to prevent spammers from posting clean text and later editing in malicious links.
- 🔒 **Automatic Content Locking**: Automatically locks removed posts and comments to prevent continued spam engagement.
- 🌟 **Approved Submitter & Moderator Exemptions**: Automatically grants exemptions to subreddit moderators and approved submitters (contributors), along with custom flairs and username lists.
- 🧪 **Test Mode (Dry Run)**: Safely test moderation rules on live submissions without removing content—actions are logged to mod logs for verification.
- 🎯 **Flexible Action Modes**: Choose how flagged content is handled: **Remove Content**, **Filter to Subreddit Mod Queue**, **Report to Subreddit Mods**, or **Mark as Spam**.
- 👤 **Account Age & Karma Verification**: Enforces minimum account age (in days) and combined link/comment karma to keep out burner accounts and spam bots.
- ⚡ **Atomic Rate Limiting**: Prevents post flooding by enforcing customizable post limits per user within a rolling time window (powered by Redis).
- 💬 **Automatic Sticky Removal Notices**: Leaves clear, stickied explanation comments on removed posts so users understand moderation decisions.
- 🔨 **Moderator Thread Nuke & Lock**: A one-click moderator menu action to lock a chaotic submission and purge comment threads in parallel.
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
| **Evaluate Comments** | `Enabled` | Check comments for spam keywords and link shorteners. |
| **Evaluate Content Edits** | `Enabled` | Check post and comment edits (Anti-Stealth Spam Edit). |
| **Exempt Approved Users** | `Enabled` | Automatically exempt approved submitters from checks. |
| **Lock Content on Removal** | `Enabled` | Lock removed posts and comments to prevent engagement. |
| **Sticky Removal Comment** | `Enabled` | Post a stickied explanation comment on removed posts. |
| **Test Mode (Dry Run)** | `Disabled` | Log moderation triggers without removing posts. |
| **Action on Spam** | `Remove` | Select action (`Remove`, `Filter to Mod Queue`, `Report to Mods`, `Mark as Spam`). |
| **Exempt Usernames** | `(Empty)` | Comma-separated list of usernames to bypass checks. |
| **Exempt User Flairs** | `verified, proof, approved` | User flair keywords that grant exemption. |

---

## 🛠️ Moderator Actions & Commands

TurboMod adds convenient moderation tools directly into your subreddit's context menus:

### 1. 🔨 `TurboMod: Nuke & Lock Thread`
- **Location**: Click `...` on any Post ➔ **TurboMod: Nuke & Lock Thread**
- **Action**: Locks the submission and automatically purges comment threads in parallel.

### 2. 📜 `TurboMod: View Recent Mod Logs`
- **Location**: Click `...` on Subreddit Menu ➔ **TurboMod: View Recent Mod Logs**
- **Action**: Displays a quick toast summary of the most recent automated removals, reports, and rate-limit triggers.

---

## ❓ Frequently Asked Questions (FAQ)

**Q: Do moderators and approved users get filtered or rate-limited by TurboMod?**  
*No! Subreddit moderators and approved submitters are automatically detected and bypass all age/karma checks and rate limits.*

**Q: How does Anti-Stealth Edit Protection work?**  
*TurboMod listens to `PostUpdate` and `CommentUpdate` events. If a user edits an existing post or comment to add spam links or keywords, TurboMod evaluates the update immediately.*

**Q: How does Test Mode (Dry Run) work?**  
*When Test Mode is enabled, TurboMod evaluates submissions and logs what action it WOULD have taken to the Mod Logs without actually removing or reporting any posts.*

**Q: Is TurboMod open source?**  
*Yes! TurboMod is 100% open source under the MIT License on [GitHub](https://github.com/TurboRx/TurboMod-Bot).*

---

## 📬 Support & Open Source License

- **License**: [MIT License](LICENSE)
- **Reddit App Directory**: [developers.reddit.com/apps/turbomod-bot](https://developers.reddit.com/apps/turbomod-bot)
- **GitHub Repository**: [github.com/TurboRx/TurboMod-Bot](https://github.com/TurboRx/TurboMod-Bot)
