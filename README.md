# Discord Quest Manager

<p align="center">
  <img src="https://img.shields.io/github/license/Mid0aria/DiscordQuestManager?style=for-the-badge" alt="License">
  <img src="https://img.shields.io/badge/Platform-Vencord-5865F2?style=for-the-badge" alt="Platform">
</p>

An all-in-one **Vencord** plugin that automatically discovers, enrolls in, and completes Discord Quests, collects rewards, and tracks your progress through a sleek interactive dashboard.

---

## ✨ Features

* 🚀 **Automated Quest Completion:** Completes Video watching, Desktop Games, Streaming, and In-App Activity quests using stealth spoofing.
* 🔍 **Background Quest Scanner:** Periodically checks for newly launched Discord quests in the background, auto-enrolls, and queues them up automatically (100% VPN-independent).
* 🌍 **ExpressVPN Geo-Scanner (Optional Add-on):** Connects to an ExpressVPN MCP server to scan selected countries/regions and auto-enroll in region-exclusive quests worldwide. Includes an interactive country picker.
* 🎁 **Reward Vault & Analytics:** Stores completed quest codes and claimed Discord Orbs. One-click copy, mark as used, and JSON export.
* 🛡️ **Account Safety & Stealth:**
  * Smart Discord 429 rate-limit detection and automatic backoff.
  * Auto-pause when in a Voice Channel, playing a real game, streaming, or active (idle-only mode).
  * Human-like progress randomization.
* 📊 **Modern Dashboard & Mini-Overlay:** Embedded Discord modal with live queue ETA, plus a customizable floating overlay widget.
* 🔄 **One-Click Updater:** Check and apply Git updates directly from within the plugin UI.

---

## 📦 Quick Installation

Requires a local [Vencord](https://github.com/Vendicated/Vencord) development environment.

1. Clone into your Vencord user plugins folder:
   ```bash
   git clone https://github.com/Mid0aria/DiscordQuestManager.git src/userplugins/QuestManager
   ```

2. Build Vencord:
   ```bash
   pnpm build
   ```

3. Restart Discord (`Ctrl + R`). A new **Quest Manager** icon will appear in the top header bar next to Inbox.

---

## ⚙️ Configuration

Open **Settings > Vencord > Plugins > QuestManager** or configure options directly within the dashboard:

### 🔍 Automation & Quest Scanner
| Setting | Description | Default |
|---|---|:---:|
| **Auto Scan New Quests** | Periodically scan for newly released Discord quests in the background | `true` |
| **Scan Interval (Hours)** | Frequency of background quest checks (1h, 2h, 4h, 6h, 12h, 24h) | `4` |
| **Auto Enroll New Quests** | Automatically enroll in newly discovered quests found during scans | `true` |
| **Auto Start On New Quests** | Immediately start worker on newly enrolled quests | `true` |
| **Auto Start on Launch** | Automatically begin processing incomplete quests when Discord opens | `false` |
| **Auto Requeue Failed** | Move failed quests to the end of the queue for retry | `true` |
| **Delay Between Quests** | Buffer delay (in seconds) between finishing one quest and starting the next | `5s` |

### ⚡ Engine & Spoofing
| Setting | Description | Default |
|---|---|:---:|
| **Video Speed Multiplier** | Progress speed multiplier for video quests (1x - 15x) | `7x` |
| **Activity Heartbeat Interval** | Heartbeat interval (seconds) for desktop game & stream quests | `20s` |
| **Quest Sort Order** | Queue priority (`Video First`, `Activity First`, or `Expiring Soonest`) | `video_first` |
| **Enable Video Quests** | Allow automatic video watching quests | `true` |
| **Enable Activity Quests** | Allow automatic gaming / stream spoofing quests | `true` |
| **Randomize Progress** | Slightly randomize heartbeats and playback speed to appear human | `true` |

### 🛡️ Safety & Stealth
| Setting | Description | Default |
|---|---|:---:|
| **Pause While In Voice** | Automatically pause quest processing when joining a voice channel | `false` |
| **Pause On Game Conflict** | Pause quests when playing a real game or streaming to avoid conflicts | `true` |
| **Run Only When Idle** | Only run the worker when Discord is idle / AFK | `false` |

### 🌍 ExpressVPN Multi-Country Scanner (Optional)
| Setting | Description | Default |
|---|---|:---:|
| **Enable ExpressVPN Scanner** | Multi-country scan for discovering worldwide region-locked quests | `false` |
| **ExpressVPN MCP URL** | Local MCP endpoint (e.g. `http://127.0.0.1:20090/mcp?token=...`) | Configurable |
| **Target Regions Picker** | Select which countries/regions to scan via interactive checkboxes | Popular 8 |
| **VPN Cooldown Delay** | Cooldown (seconds) after switching VPN region before Discord query | `6s` |
| **Disconnect After Scan** | Disconnect or restore previous VPN state when scan finishes | `true` |

### 🎁 Rewards & Notifications
| Setting | Description | Default |
|---|---|:---:|
| **Auto Claim Rewards** | Automatically claim quest rewards upon completion | `false` |
| **Play Completion Sound** | Play celebratory chime sound when a quest completes | `true` |
| **Notify on New Quests** | Send notification when new or incomplete quests are discovered | `true` |
| **Expiry Warnings** | Warn when an active quest is nearing expiration | `true` (24h) |
| **Notification Level** | Filter toast alerts (`All`, `Completions Only`, `Errors Only`, `Silent`) | `all` |

### 🎨 UI, Overlay & Developer
| Setting | Description | Default |
|---|---|:---:|
| **Show Floating Overlay** | Show live mini-status overlay widget in the bottom-right corner | `true` |
| **Overlay Style** | Visual style (`Standard Box` or `Compact Mini-Pill`) | `standard` |
| **Overlay Opacity** | Base opacity percentage for the floating widget | `85%` |
| **Hide Completed Quests** | Hide completed quests from the main dashboard modal | `false` |
| **Auto Check Updates** | Automatically check for Git updates on Discord startup | `true` |
| **Debug Mode** | Enable developer Debug tab for inspecting API payloads, stores & logs | `false` |

---

## 🌍 ExpressVPN MCP Setup (Optional)

ExpressVPN includes a built-in local **Model Context Protocol (MCP)** server that allows Quest Manager to switch regions automatically and discover worldwide region-locked quests.

1. **Enable MCP in ExpressVPN:**
   * Open the ExpressVPN desktop app (Windows, macOS, or Linux).
   * Go to **Add-ons** (or *Options > Advanced*).
   * Toggle on **Enable MCP Server**.
2. **Copy Server URL:**
   * Copy the generated local URL and device token provided by the app (e.g. `http://127.0.0.1:20090/mcp?token=YOUR_TOKEN`).
3. **Configure Quest Manager:**
   * In Quest Manager settings, turn on **Enable ExpressVPN Scanner**.
   * Paste your copied endpoint into **ExpressVPN MCP URL**.
4. **Choose Target Regions:**
   * Click **🗺️ Regions** in the Quest Manager dashboard header to select which countries to scan.

> ℹ️ *For eligibility and more details, see the official [ExpressVPN MCP Server Guide](https://www.expressvpn.com/support/mcp-server/).*

---

## ⚠️ Disclaimer

This plugin is for educational and research purposes only. Automating quests or spoofing game presence may violate Discord's Terms of Service. Use at your own discretion.
