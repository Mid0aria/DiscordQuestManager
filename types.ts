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
    "WATCH_VIDEO_ON_MOBILE"
] as const;

export type SupportedTask = typeof SUPPORTED_TASKS[number];

export interface QuestTaskInfo {
    name: SupportedTask | undefined;
    target: number;
    progress: number;
}

export interface QuestConfig {
    expiresAt: string;
    application: {
        id: string;
        name?: string;
    };
    messages: {
        questName: string;
    };
    taskConfig?: { tasks: Record<string, { target: number; } | null>; };
    taskConfigV2?: { tasks: Record<string, { target: number; } | null>; };
    configVersion?: number;
    rewards?: { messages?: { name: string, nameWithArticle?: string; }; orbQuantity?: number; }[];
}

export interface QuestUserStatus {
    enrolledAt?: string;
    completedAt?: string;
    claimedAt?: string;
    progress?: Record<string, { value: number; }>;
    streamProgressSeconds?: number;
}

export interface Quest {
    id: string;
    config: QuestConfig;
    userStatus?: QuestUserStatus;
    isTargeted?: boolean;
    is_targeted?: boolean;
    trafficMetadata?: any;
    traffic_metadata_sealed?: any;
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
}

export interface AppState {
    activeWorker: boolean;
    currentQuest: Quest | null;
    queue: Quest[];
    pauseManager: PauseManager;
    spoofers: AppSpoofers;
    nextHeartbeatTime: number | null;
}
