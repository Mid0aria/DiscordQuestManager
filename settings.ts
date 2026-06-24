/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { definePluginSettings } from "@api/Settings";
import { OptionType } from "@utils/types";

export const settings = definePluginSettings({
    autoStart: {
        type: OptionType.BOOLEAN,
        description: "Automatically start quests when Discord opens.",
        default: false
    },
    notifyOnNew: {
        type: OptionType.BOOLEAN,
        description: "Send notification when a new or incomplete quest is found.",
        default: true
    },
    videoSpeed: {
        type: OptionType.SLIDER,
        description: "Progress speed multiplier for video quests.",
        default: 7,
        markers: [1, 2, 5, 7, 10, 15],
        stickToMarkers: false
    },
    activityInterval: {
        type: OptionType.SLIDER,
        description: "Heartbeat interval (seconds) for game/activity quests.",
        default: 20,
        markers: [10, 20, 30, 45, 60],
        stickToMarkers: true
    },
    questSortOrder: {
        type: OptionType.SELECT,
        description: "Order in which quests are processed in the queue.",
        default: "video_first",
        options: [
            { label: "Video Quests First", value: "video_first" },
            { label: "Activity Quests First", value: "activity_first" },
            { label: "Expiring Soonest", value: "expiring" }
        ]
    },
    autoClaimRewards: {
        type: OptionType.BOOLEAN,
        description: "Automatically claim rewards when a quest is completed.",
        default: false
    },
    hideCompletedQuests: {
        type: OptionType.BOOLEAN,
        description: "Hide completed quests from the Quest Manager modal.",
        default: false
    },
    enableVideoQuests: {
        type: OptionType.BOOLEAN,
        description: "Enable watching video quests.",
        default: true
    },
    enableActivityQuests: {
        type: OptionType.BOOLEAN,
        description: "Enable playing/streaming activity quests.",
        default: true
    },
    pauseWhileInVoice: {
        type: OptionType.BOOLEAN,
        description: "Automatically pause quest processing when you join a voice channel.",
        default: false
    },
    delayBetweenQuests: {
        type: OptionType.SLIDER,
        description: "Delay (in seconds) between finishing one quest and starting the next.",
        default: 5,
        markers: [0, 5, 10, 15, 30],
        stickToMarkers: true
    },
    randomizeProgress: {
        type: OptionType.BOOLEAN,
        description: "Randomize heartbeat progress intervals slightly to appear more human.",
        default: true
    },
    logLevel: {
        type: OptionType.SELECT,
        description: "Control which notifications and logs are shown.",
        default: "all",
        options: [
            { label: "All Messages", value: "all" },
            { label: "Completions Only", value: "completed_only" },
            { label: "Errors Only", value: "errors_only" },
            { label: "Silent (No Toasts)", value: "none" }
        ]
    },
    showOverlay: {
        type: OptionType.BOOLEAN,
        description: "Show a widget in the bottom right corner with the active quest status.",
        default: true
    }
});
