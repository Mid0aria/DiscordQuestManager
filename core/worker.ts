/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SelectedChannelStore, UserStore } from "@webpack/common";

import { buildQueue, claimQuestReward, enroll, getQuestName, getTaskInfo, getUnenrolledQuests, isQuestCompleted, isQuestEnrolled, sortQuests } from "../api/questApi";
import { playActivity, playDesktop, streamDesktop, watchVideo } from "../api/taskHandlers";
import { settings } from "../settings";
import { Quest } from "../types";
import { playQuestCompleteSound } from "../utils/sound";
import { AppState, getRemainingRateLimitSec, isCurrentlyRateLimited, isRunning, log, setRunning } from "./state";
import { IdleStore, QuestsStore, RunningGameStore, StatusStore, StreamingStore } from "./stores";

function hasGameOrStreamConflict(): boolean {
    if (!settings.store.pauseOnGameConflict) return false;

    const realGames = RunningGameStore?.getRunningGames?.() || [];
    const hasRealGame = realGames.some((g: any) => g.pid !== 1337 && g.id !== AppState.currentQuest?.config?.application?.id);
    if (hasRealGame) return true;

    const isStreaming = StreamingStore?.getCurrentUserActiveStream?.() != null;
    if (isStreaming) return true;

    return false;
}

function isUserActiveWhenIdleOnly(): boolean {
    if (!settings.store.runOnlyWhenIdle) return false;
    if (IdleStore && typeof IdleStore.isIdle === "function") {
        return !IdleStore.isIdle();
    }
    return false;
}

export function isOutsideScheduledHours(): boolean {
    if (!settings.store.enableScheduler) return false;
    const start = settings.store.scheduleStartHour ?? 10;
    const end = settings.store.scheduleEndHour ?? 23;
    const currentHour = new Date().getHours();

    const isActive = start <= end
        ? (currentHour >= start && currentHour < end)
        : (currentHour >= start || currentHour < end);

    return !isActive;
}

export function isUserStatusDisallowed(): boolean {
    if (!settings.store.runOnlyWhenOnline) return false;
    try {
        const userId = UserStore?.getCurrentUser?.()?.id;
        if (!userId || !StatusStore) return false;
        const status = StatusStore?.getStatus?.(userId);
        return status === "invisible" || status === "offline";
    } catch {
        return false;
    }
}

export async function runWorker(): Promise<void> {
    if (AppState.activeWorker) return;
    if (AppState.queue.length === 0) {
        log("No quests in queue to process.", "warn", true);
        return;
    }
    AppState.activeWorker = true;
    setRunning(true);
    AppState.pauseManager.resume();

    let processedCount = 0;
    while (AppState.queue.length > 0 && isRunning) {
        await AppState.pauseManager.waitIfPaused();

        if (settings.store.pauseWhileInVoice) {
            if (SelectedChannelStore?.getVoiceChannelId()) {
                log("Quest paused because you are in a voice channel...", "warn", true);
                while (SelectedChannelStore?.getVoiceChannelId() && isRunning && !AppState.pauseManager.isPaused) {
                    await new Promise(r => setTimeout(r, 5000));
                }
                if (isRunning && !AppState.pauseManager.isPaused) log("Voice channel left, resuming quests...", "info", true);
            }
        }

        if (hasGameOrStreamConflict()) {
            log("Quest paused because a real game or stream is active...", "warn", true);
            while (hasGameOrStreamConflict() && isRunning && !AppState.pauseManager.isPaused) {
                await new Promise(r => setTimeout(r, 5000));
            }
            if (isRunning && !AppState.pauseManager.isPaused) log("Game/stream ended, resuming quests...", "info", true);
        }

        if (isUserActiveWhenIdleOnly()) {
            log("Quest paused: Waiting for Discord to become idle / AFK...", "info", true);
            while (isUserActiveWhenIdleOnly() && isRunning && !AppState.pauseManager.isPaused) {
                await new Promise(r => setTimeout(r, 5000));
            }
            if (isRunning && !AppState.pauseManager.isPaused) log("Discord is idle, resuming quests...", "info", true);
        }

        if (isOutsideScheduledHours()) {
            const start = settings.store.scheduleStartHour ?? 10;
            const end = settings.store.scheduleEndHour ?? 23;
            log(`Quest paused: Outside scheduled active hours (${start}:00 - ${end}:00)...`, "info", true);
            while (isOutsideScheduledHours() && isRunning && !AppState.pauseManager.isPaused) {
                await new Promise(r => setTimeout(r, 30000));
            }
            if (isRunning && !AppState.pauseManager.isPaused) log("Active hours reached, resuming quests...", "info", true);
        }

        if (isUserStatusDisallowed()) {
            log("Quest paused: Discord status is Offline / Invisible...", "info", true);
            while (isUserStatusDisallowed() && isRunning && !AppState.pauseManager.isPaused) {
                await new Promise(r => setTimeout(r, 10000));
            }
            if (isRunning && !AppState.pauseManager.isPaused) log("Discord status is active, resuming quests...", "info", true);
        }

        if (!isRunning) break;

        const rawQuest = AppState.queue.shift()!;
        const quest = (QuestsStore?.quests?.get(rawQuest.id) as Quest) ?? rawQuest;
        AppState.currentQuest = quest;
        AppState.skipRequested = false;

        try {
            const taskInfo = getTaskInfo(quest);
            let enrolled = isQuestEnrolled(quest);

            if (!enrolled) {
                enrolled = await enroll(quest);
            }

            if (!enrolled) {
                const questName = getQuestName(quest);
                log(`Skipping "${questName}": Quest is not enrolled yet and Discord enrollment rate limit is active.`, "warn", true);
                continue;
            }

            if (isQuestCompleted(quest)) {
                const questName = getQuestName(quest);
                log(`Quest "${questName}" is already completed! Claiming reward if needed...`, "info", true);
                if (settings.store.autoClaimRewards) {
                    await claimQuestReward(quest);
                }
                continue;
            }

            if (!taskInfo.name) {
                const questName = getQuestName(quest);
                log(`Skipping "${questName}": No supported task found.`, "warn", true);
                continue;
            }

            if (taskInfo.name.includes("VIDEO")) {
                await watchVideo(quest, taskInfo);
            } else if (
                taskInfo.name === "PLAY_ON_DESKTOP" ||
                taskInfo.name === "PLAY_ON_XBOX" ||
                taskInfo.name === "PLAY_ON_PLAYSTATION" ||
                taskInfo.name === "PLAY_ON_MOBILE"
            ) {
                await playDesktop(quest, taskInfo);
            } else if (taskInfo.name === "STREAM_ON_DESKTOP") {
                await streamDesktop(quest, taskInfo);
            } else if (taskInfo.name === "PLAY_ACTIVITY") {
                await playActivity(quest, taskInfo);
            }

            processedCount++;

            // skipCurrentQuest() already logged the skip; nothing left to do for this quest.
            if (isRunning && !AppState.skipRequested) {
                const questName = getQuestName(quest);
                log(`Congratulations! ${questName} completed! 🎉`, "success", true);
                playQuestCompleteSound();
                if (settings.store.autoClaimRewards) {
                    await claimQuestReward(quest);
                }

                if (AppState.queue.length > 0) {
                    const delay = settings.store.delayBetweenQuests ?? 0;
                    if (delay > 0) {
                        const actualDelay = settings.store.randomizeProgress
                            ? Math.max(1, Math.round(delay * (0.8 + Math.random() * 0.4)))
                            : delay;
                        log(`Waiting ${actualDelay} seconds before starting the next quest...`, "info");
                        await new Promise(r => setTimeout(r, actualDelay * 1000));
                    }
                }
            }
        } catch (e) {
            console.error("[QuestManager]", e);
            const questName = quest ? getQuestName(quest) : "Unknown Quest";
            log(`Error: ${questName} failed.`, "error", true);

            if (settings.store.autoRequeueFailed && isRunning) {
                quest._retryCount = (quest._retryCount || 0) + 1;
                if (quest._retryCount <= 2) {
                    log(`Requeueing "${questName}" to retry later (Attempt ${quest._retryCount}/2)...`, "warn", true);
                    AppState.queue.push(quest);
                } else {
                    log(`Max retries reached for "${questName}". Skipping.`, "error", true);
                }
            }
        } finally {
            AppState.currentQuest = null;
            AppState.skipRequested = false;
        }
    }

    AppState.activeWorker = false;
    if (isRunning && processedCount > 0) log("All queued quests have been processed successfully! 🎉", "success", true);
}

export function pauseWorker() {
    if (AppState.pauseManager.isPaused) return;
    AppState.pauseManager.pause();
    if (AppState.spoofers.restoreGame) AppState.spoofers.restoreGame();
    if (AppState.spoofers.restoreStream) AppState.spoofers.restoreStream();
    log("Quest process paused. ⏸️", "warn", true);
}

export function resumeWorker() {
    if (!AppState.pauseManager.isPaused) return;

    if (AppState.spoofers.setupGame) AppState.spoofers.setupGame();
    if (AppState.spoofers.setupStream) AppState.spoofers.setupStream();

    AppState.pauseManager.resume();
    log("Quest process resuming... ▶️", "success", true);
}

export function skipCurrentQuest() {
    if (!AppState.currentQuest) return;
    AppState.skipRequested = true;
    if (AppState.spoofers.cancelActiveTask) AppState.spoofers.cancelActiveTask();
    log(`Skipped: ${getQuestName(AppState.currentQuest)}`, "warn", true);
}

export async function enrollQuest(quest: Quest): Promise<boolean> {
    const ok = await enroll(quest);
    if (ok && !AppState.queue.some(xq => xq.id === quest.id)) {
        AppState.queue.push(quest);
        AppState.queue = sortQuests(AppState.queue);
    }
    return ok;
}

export async function enrollAll(): Promise<void> {
    if (isCurrentlyRateLimited()) {
        const remaining = getRemainingRateLimitSec();
        const mins = Math.ceil(remaining / 60);
        const timeStr = remaining > 60 ? `~${mins} minutes (${remaining}s)` : `${remaining}s`;
        log(`⚠️ Cannot enroll right now: Discord rate limit is active. Please wait ${timeStr}.`, "warn", true);
        return;
    }

    const unenrolled = getUnenrolledQuests();
    if (!unenrolled.length) {
        log("No new quests to enroll in.", "warn", true);
        return;
    }

    log(`Enrolling in ${unenrolled.length} new quests...`, "info", true);
    for (const q of unenrolled) {
        if (isCurrentlyRateLimited()) {
            log(`⚠️ Enrollment paused: Discord rate limit active.`, "warn", true);
            break;
        }
        const ok = await enrollQuest(q);
        if (!ok && isCurrentlyRateLimited()) {
            break;
        }
        const throttleSec = Math.max(1, settings.store.enrollThrottleSec ?? 3);
        await new Promise(r => setTimeout(r, throttleSec * 1000));
    }
}

export function removeFromQueue(questId: string): void {
    AppState.queue = AppState.queue.filter(q => q.id !== questId);
}

export function moveQueueItem(questId: string, direction: "up" | "down"): void {
    const idx = AppState.queue.findIndex(q => q.id === questId);
    if (idx === -1) return;

    const swapIdx = direction === "up" ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= AppState.queue.length) return;

    const newQueue = [...AppState.queue];
    [newQueue[idx], newQueue[swapIdx]] = [newQueue[swapIdx], newQueue[idx]];
    AppState.queue = newQueue;
}

export function initQueue(autoRun: boolean = false): void {
    if (!QuestsStore) {
        log("QuestsStore not found. Quests might not be supported in this Discord version.", "error", true);
        return;
    }
    const queue = buildQueue();
    AppState.queue = queue;

    if (queue.length === 0) {
        log("No quests in queue.", "warn", true);
    } else {
        log(`${queue.length} quests added to queue.`, "success", true);
        if (autoRun) runWorker();
    }
}

export function stopAndCleanup(): void {
    setRunning(false);
    AppState.pauseManager.resume();
    if (AppState.spoofers.cancelActiveTask) AppState.spoofers.cancelActiveTask();
    if (AppState.spoofers.restoreGame) AppState.spoofers.restoreGame();
    if (AppState.spoofers.restoreStream) AppState.spoofers.restoreStream();
}
