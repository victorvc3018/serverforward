# Discord Message Archiver & Sync Bot

A specialized Discord bot built with Node.js and `discord.js v14` that archives message history from **🌅 🌴The Beach 🌊 🎋** and forwards them into your destination servers on demand.

---

## 🏰 Dedicated Architecture
* **Source Server (Locked):** `🌅 🌴The Beach 🌊 🎋` (ID: `988844532185595964`)
  * All message queries, channel searches, and history lookups are strictly pulled from this server.
* **Destination Servers:** Any server the bot has been invited to.

---

## ⚡ Commands

### 1. Forward Messages
```text
!forward <channel> [timeframe] [style]
```
* **`<channel>`**: Channel name (e.g. `the-beach`, `quotes`, `pets`) or Channel ID.
* **`[timeframe]`**:
  * `all` or `all-time`: Fetches the entire channel history from the very beginning!
  * `1h`, `6h`, `12h`, `24h`: Hours
  * `3d`, `7d`, `30d`: Days
  * `1w`, `2w`: Weeks
  * `1mo`, `3mo`: Months
  * `1y`: Years
  * `30m`: Minutes
* **`[style]`**:
  * *(default)*: Vibrant Speech Bubbles with 10 distinct user color badges, Discord accent borders, and native timestamps.
  * `ansi`: Terminal codeblock mode with colored ANSI usernames.

### 2. Channel Discovery
* **`!channels`** or **`!servers`**: Lists all 54 channels in The Beach with their IDs and names.
* **`!search <keyword>`**: Searches The Beach for matching channels (e.g. `!search quotes`).

### 3. Help & Status
* **`!help`**: Displays the complete interactive guide.
* **`!ping`**: Tests bot responsiveness and latency.

---

## 🎨 Visual Features
* **10 Consistent User Color Badges:** `🟣` `🔵` `🩵` `🟢` `🟡` `🟠` `🔴` `🩷` `🤎` `⚪` deterministically hashed by User ID.
* **Speech Bubble Borders:** Messages wrapped in Discord's native left accent lines (`>`).
* **Reply Context:** Inline previews showing who is replying to whom (`> ↩️ Replying to @User: "preview..."`).
* **Subtext Timestamps:** `-# 1:15 AM (2 hours ago)` dynamic timestamps adapting to each viewer's local timezone.
