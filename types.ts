/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export const SUPPORTED_TASKS = [
    "WATCH_VIDEO",
    "PLAY_ON_DESKTOP",
    "STREAM_ON_DESKTOP",
    "PLAY_ACTIVITY",
    "WATCH_VIDEO_ON_MOBILE",
    "PLAY_ON_XBOX",
    "PLAY_ON_PLAYSTATION",
    "PLAY_ON_MOBILE"
] as const;

export type SupportedTask = typeof SUPPORTED_TASKS[number];

export const ORB_ICON_URL = "https://cdn.discordapp.com/assets/content/b8fe318002139f2fabd6255aef10a0a625bb10aa9f8394efd6575115c1dca19a.webm";

export interface QuestTaskInfo {
    name: SupportedTask | undefined;
    target: number;
    progress: number;
}

export interface QuestTaskConfigEntry {
    target: number;
    applications?: { id: string; }[];
    type?: string;
    assets?: any;
    messages?: any;
}

export interface QuestConfig {
    expiresAt?: string;
    expires_at?: string;
    application?: {
        id: string;
        name?: string;
        link?: string;
    };
    messages: {
        questName?: string;
        quest_name?: string;
        gameTitle?: string;
        game_title?: string;
        gamePublisher?: string;
        game_publisher?: string;
        rewardName?: string;
        reward_name?: string;
    };
    taskConfig?: { tasks: Record<string, QuestTaskConfigEntry | null>; };
    taskConfigV2?: { tasks: Record<string, QuestTaskConfigEntry | null>; join_operator?: string; };
    task_config_v2?: { tasks: Record<string, QuestTaskConfigEntry | null>; join_operator?: string; };
    task_config?: { tasks: Record<string, QuestTaskConfigEntry | null>; };
    configVersion?: number;
    config_version?: number;
    rewards?: any[];
    rewardsConfig?: any;
    rewards_config?: any;
}

export interface QuestUserStatus {
    enrolledAt?: string;
    enrolled_at?: string;
    completedAt?: string;
    completed_at?: string;
    claimedAt?: string;
    claimed_at?: string;
    progress?: Record<string, {
        value: number;
        event_name?: string;
        updated_at?: string;
        completed_at?: string;
        heartbeat?: any;
    }>;
    streamProgressSeconds?: number;
    stream_progress_seconds?: number;
    orbQuantityClaimed?: number;
    orb_quantity_claimed?: number;
}

export interface Quest {
    id: string;
    config: QuestConfig;
    userStatus?: QuestUserStatus;
    user_status?: QuestUserStatus;
    isTargeted?: boolean;
    is_targeted?: boolean;
    trafficMetadata?: any;
    traffic_metadata_sealed?: any;
    _retryCount?: number;
}

export interface NormalizedQuest {
    id: string;
    name: string;
    gameTitle?: string;
    gamePublisher?: string;
    rewardName: string;
    orbs: number;
    expiresAt: string | null;
    isExpired: boolean;
    enrolledAt: string | null;
    isEnrolled: boolean;
    completedAt: string | null;
    isCompleted: boolean;
    claimedAt: string | null;
    isClaimed: boolean;
    taskInfo: QuestTaskInfo;
    configVersion: number;
    isTargeted: boolean;
    trafficMetadata: any;
    raw: Quest;
}

export type WorkerStatus = "idle" | "running" | "paused" | "stopped";

export interface PauseManager {
    promise: Promise<void> | null;
    resolve: (() => void) | null;
    readonly isPaused: boolean;
    pause(): void;
    resume(): void;
    waitIfPaused(): Promise<void>;
}

export interface AppSpoofers {
    setupGame: (() => void) | null;
    restoreGame: (() => void) | null;
    setupStream: (() => void) | null;
    restoreStream: (() => void) | null;
    cancelActiveTask: (() => void) | null;
}

export interface AppState {
    activeWorker: boolean;
    currentQuest: Quest | null;
    queue: Quest[];
    pauseManager: PauseManager;
    spoofers: AppSpoofers;
    nextHeartbeatTime: number | null;
    skipRequested: boolean;
}
