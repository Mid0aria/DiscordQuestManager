# Discord Quest Manager

<p align="center">
  <img src="https://img.shields.io/github/license/Mid0aria/DiscordQuestManager?style=for-the-badge" alt="License">
</p>

An advanced, feature-rich **Vencord** plugin that automatically manages and completes Discord Quests for you, claims your rewards, and provides a beautiful interactive dashboard.

## ✨ Features

- **Automated Quest Completion:** Supports Video watching, Desktop Games, Streaming, and In-App Activity quests using spoofing techniques.
- **Modern Dashboard UI:** A beautifully designed, premium user interface built natively into Discord with dark mode support and sleek progress bars.
- **Floating Overlay:** Track your current quest progress with a live countdown without having to open the settings menu.
- **Smart Queue System:** Automatically lines up unenrolled quests and processes them sequentially.
- **Auto-Claim Rewards:** Configurable option to automatically claim rewards once a quest is successfully completed.
- **Stealth & Safety Options:** Randomizes progress intervals to mimic human behavior. Optionally pauses the worker automatically when you enter a Voice Channel.
- **Customizable Sorting:** Prioritize Video quests, Activity quests, or sort by expiration date.

## 📦 Installation

Since this is a Vencord user plugin, you need to have a local Vencord development environment set up.

1. Open your terminal and navigate to your Vencord `src/userplugins/` directory.
2. Clone this repository:
    ```bash
    git clone https://github.com/Mid0aria/DiscordQuestManager.git
    cd QuestManager
    ```
3. Rebuild and inject Vencord:
    ```bash
    npm build
    npm inject
    ```
4. Restart your Discord client.

## 🛠️ Usage & Configuration

Once installed, a new **Quest Manager** icon will appear in your Discord header bar (next to the Inbox and Help icons). Clicking it will open the Dashboard.

You can also configure the plugin from `Settings > Vencord > Plugins > QuestManager`. Available options:

- **Auto Start:** Automatically start completing quests when Discord launches.
- **Auto Claim Rewards:** Automatically collect the reward upon completion.
- **Pause In Voice Channel:** Automatically pauses the quest worker if you join a Voice Channel to prevent conflicts.
- **Randomize Progress:** Makes the progress intervals random instead of perfectly linear to avoid detection.
- **Show Overlay:** Toggles the floating overlay on your screen.
- **Quest Sorting Order:** Define the order in which quests are processed.

## ⚠️ Disclaimer

This plugin is for educational and theoretical purposes only. Automating Discord quests and spoofing game states may violate Discord's Terms of Service. Use at your own risk. The author is not responsible for any actions taken against your account.
