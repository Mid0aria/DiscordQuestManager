/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";
import { React } from "@webpack/common";

import { RegionPickerSettingsButton } from "./components/RegionPickerModal";

export const settings = definePluginSettings({
    autoStart: {
        type: OptionType.BOOLEAN,
        description: "Automatically start quests when Discord opens.",
        default: false,
    },
    notifyOnNew: {
        type: OptionType.BOOLEAN,
        description:
            "Send notification when a new or incomplete quest is found.",
        default: true,
    },
    videoSpeed: {
        type: OptionType.SLIDER,
        description: "Progress speed multiplier for video quests.",
        default: 7,
        markers: [1, 2, 5, 7, 10, 15],
        stickToMarkers: false,
    },
    activityInterval: {
        type: OptionType.SLIDER,
        description: "Heartbeat interval (seconds) for game/activity quests.",
        default: 20,
        markers: [10, 20, 30, 45, 60],
        stickToMarkers: true,
    },
    questSortOrder: {
        type: OptionType.SELECT,
        description: "Order in which quests are processed in the queue.",
        default: "video_first",
        options: [
            { label: "Video Quests First", value: "video_first" },
            { label: "Activity Quests First", value: "activity_first" },
            { label: "Expiring Soonest", value: "expiring" },
        ],
    },
    autoClaimRewards: {
        type: OptionType.BOOLEAN,
        description: "Automatically claim rewards when a quest is completed.",
        default: false,
    },
    hideCompletedQuests: {
        type: OptionType.BOOLEAN,
        description: "Hide completed quests from the Quest Manager modal.",
        default: false,
    },
    playCompletionSound: {
        type: OptionType.BOOLEAN,
        description:
            "Play a celebratory chime sound when a quest is completed.",
        default: true,
    },
    soundTheme: {
        type: OptionType.SELECT,
        description: "Audio theme to play when a quest completes.",
        default: "retro",
        options: [
            { label: "🕹️ Retro 8-bit Fanfare", value: "retro" },
            { label: "🔔 Crystal Chime", value: "chime" },
            { label: "🫧 Modern Bubble Pop", value: "pop" },
            { label: "🪙 Arcade Coin / 1-Up", value: "arcade" },
            { label: "🔇 Mute", value: "mute" },
        ],
    },
    soundVolume: {
        type: OptionType.SLIDER,
        description: "Volume percentage for completion sound effects.",
        default: 80,
        markers: [10, 25, 50, 75, 100],
        stickToMarkers: false,
    },
    enableVideoQuests: {
        type: OptionType.BOOLEAN,
        description: "Enable watching video quests.",
        default: true,
    },
    enableActivityQuests: {
        type: OptionType.BOOLEAN,
        description: "Enable playing/streaming activity quests.",
        default: true,
    },
    pauseWhileInVoice: {
        type: OptionType.BOOLEAN,
        description:
            "Automatically pause quest processing when you join a voice channel.",
        default: false,
    },
    pauseOnGameConflict: {
        type: OptionType.BOOLEAN,
        description:
            "Pause quests when you are playing a real game or streaming to prevent conflicts.",
        default: true,
    },
    runOnlyWhenIdle: {
        type: OptionType.BOOLEAN,
        description: "Only process quests when Discord is idle / AFK.",
        default: false,
    },
    autoRequeueFailed: {
        type: OptionType.BOOLEAN,
        description:
            "Automatically move failed quests to the end of the queue for retry.",
        default: true,
    },
    delayBetweenQuests: {
        type: OptionType.SLIDER,
        description:
            "Delay (in seconds) between finishing one quest and starting the next.",
        default: 5,
        markers: [0, 5, 10, 15, 30],
        stickToMarkers: true,
    },
    randomizeProgress: {
        type: OptionType.BOOLEAN,
        description:
            "Randomize heartbeat progress intervals and video speed slightly to appear more human.",
        default: true,
    },
    stealthMode: {
        type: OptionType.BOOLEAN,
        description:
            "Advanced anti-detection engine: simulates window focus, input ticks, and natural human variance during active tasks.",
        default: true,
    },
    enableScheduler: {
        type: OptionType.BOOLEAN,
        description:
            "Only process quests during specified hours of the day (e.g. 10:00 - 23:00).",
        default: false,
    },
    scheduleStartHour: {
        type: OptionType.SLIDER,
        description: "Hour of the day to start processing quests (0-23).",
        default: 10,
        markers: [0, 6, 8, 10, 12, 14, 18],
        stickToMarkers: false,
    },
    scheduleEndHour: {
        type: OptionType.SLIDER,
        description: "Hour of the day to pause processing quests (0-23).",
        default: 23,
        markers: [12, 16, 18, 20, 22, 23],
        stickToMarkers: false,
    },
    runOnlyWhenOnline: {
        type: OptionType.BOOLEAN,
        description:
            "Automatically pause quest processing if your Discord status is set to Invisible or Offline.",
        default: false,
    },
    logLevel: {
        type: OptionType.SELECT,
        description: "Control which notifications and logs are shown.",
        default: "all",
        options: [
            { label: "All Messages", value: "all" },
            { label: "Completions Only", value: "completed_only" },
            { label: "Errors Only", value: "errors_only" },
            { label: "Silent (No Toasts)", value: "none" },
        ],
    },
    showOverlay: {
        type: OptionType.BOOLEAN,
        description:
            "Show a widget in the bottom right corner with the active quest status.",
        default: true,
    },
    overlayStyle: {
        type: OptionType.SELECT,
        description: "Visual appearance style for the floating overlay.",
        default: "standard",
        options: [
            { label: "Standard Box", value: "standard" },
            { label: "Compact Mini-Pill", value: "pill" },
        ],
    },
    overlayOpacity: {
        type: OptionType.SLIDER,
        description: "Base opacity percentage for the floating overlay.",
        default: 85,
        markers: [40, 60, 75, 85, 100],
        stickToMarkers: false,
    },
    overlayAutoHide: {
        type: OptionType.BOOLEAN,
        description: "Automatically hide the overlay widget when no quest is active or in queue.",
        default: false,
    },
    autoCheckUpdates: {
        type: OptionType.BOOLEAN,
        description:
            "Automatically check for QuestManager updates (git pull) shortly after Discord starts.",
        default: true,
    },
    enableExpiryWarnings: {
        type: OptionType.BOOLEAN,
        description: "Warn when an in-progress quest is about to expire.",
        default: true,
    },
    expiryWarningHours: {
        type: OptionType.SLIDER,
        description: "How many hours before expiration to send the warning.",
        default: 24,
        markers: [1, 6, 12, 24, 48],
        stickToMarkers: false,
    },
    debugMode: {
        type: OptionType.BOOLEAN,
        description:
            "Enable developer Debug Mode (adds a Debug tab in Quest Manager for inspecting raw API payloads, store states, and live logs).",
        default: false,
    },

    // --- Core Automated Quest Scanner & Auto-Completion (VPN-independent) ---
    autoScanNewQuests: {
        type: OptionType.BOOLEAN,
        description:
            "Periodically check for newly released Discord quests in the background, auto-enroll, and auto-complete them.",
        default: true,
    },
    scanIntervalHours: {
        type: OptionType.SLIDER,
        description:
            "Interval in hours between automated background quest scans.",
        default: 4,
        markers: [1, 2, 4, 6, 12, 24],
        stickToMarkers: true,
    },
    initialScanDelaySec: {
        type: OptionType.SLIDER,
        description:
            "Initial delay (seconds) before running the first background scan after Discord starts.",
        default: 20,
        markers: [5, 10, 20, 30, 60],
        stickToMarkers: true,
    },
    enrollThrottleSec: {
        type: OptionType.SLIDER,
        description:
            "Delay (seconds) between consecutive quest enrollments to prevent Discord 429 rate limits.",
        default: 3,
        markers: [1, 2, 3, 5, 8, 10, 15, 20, 30],
        stickToMarkers: true,
    },
    autoEnrollNewQuests: {
        type: OptionType.BOOLEAN,
        description:
            "Automatically enroll in newly discovered quests found during background scan.",
        default: true,
    },
    autoStartOnNewQuests: {
        type: OptionType.BOOLEAN,
        description:
            "Automatically start processing newly discovered and enrolled quests.",
        default: true,
    },

    // --- ExpressVPN Regional Multi-Country Scanner Add-on (Optional) ---
    enableVpnScanner: {
        type: OptionType.BOOLEAN,
        description:
            "Enable ExpressVPN multi-country scanner to discover and auto-enroll country-exclusive quests.",
        default: false,
    },
    vpnMcpUrl: {
        type: OptionType.STRING,
        description:
            "ExpressVPN MCP server endpoint URL with token (e.g. http://127.0.0.1:20090/mcp?token=...)",
        default: "http://127.0.0.1:20090/mcp?token=12345abcde",
    },
    vpnTargetRegions: {
        type: OptionType.STRING,
        description:
            "Selected ExpressVPN regions to scan.",
        default: "smart, usa-new-york, germany-frankfurt-1, uk-london",
        hidden: true,
    },
    vpnTargetRegionsPicker: {
        type: OptionType.COMPONENT,
        description:
            "Choose which ExpressVPN countries/regions to scan using checkboxes.",
        component: () => React.createElement(RegionPickerSettingsButton, null),
    },
    vpnDisconnectAfterScan: {
        type: OptionType.BOOLEAN,
        description:
            "Restore previous VPN state or disconnect ExpressVPN after scanning finishes.",
        default: true,
    },
    vpnCooldownSec: {
        type: OptionType.SLIDER,
        description:
            "Cooldown delay (seconds) after switching VPN region before querying Discord quests.",
        default: 10,
        markers: [3, 5, 8, 10, 15, 20, 30],
        stickToMarkers: true,
    },
    vpnConnectTimeoutSec: {
        type: OptionType.SLIDER,
        description:
            "Maximum timeout (seconds) to wait for ExpressVPN to establish a connection to a region.",
        default: 25,
        markers: [15, 20, 25, 30, 45],
        stickToMarkers: true,
    },
});
