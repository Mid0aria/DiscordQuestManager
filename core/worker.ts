/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SelectedChannelStore } from "@webpack/common";

import { buildQueue, claimQuestReward, enroll, getTaskInfo, getUnenrolledQuests, sortQuests } from "../api/questApi";
import { playActivity, playDesktop, streamDesktop, watchVideo } from "../api/taskHandlers";
import { settings } from "../settings";
import { Quest } from "../types";
import { AppState, isRunning, log, setRunning } from "./state";
import { IdleStore, QuestsStore, RunningGameStore, StreamingStore } from "./stores";

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

export async function runWorker(): Promise<void> {
    if (AppState.activeWorker) return;
    AppState.activeWorker = true;

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

        if (!isRunning) break;

        const quest = AppState.queue.shift()!;
        AppState.currentQuest = quest;
        AppState.skipRequested = false;

        try {
            const taskInfo = getTaskInfo(quest);
            const enrolled = await enroll(quest);

            if (enrolled && taskInfo.name) {
                if (taskInfo.name.includes("VIDEO")) await watchVideo(quest, taskInfo);
                else if (taskInfo.name === "PLAY_ON_DESKTOP") await playDesktop(quest, taskInfo);
                else if (taskInfo.name === "STREAM_ON_DESKTOP") await streamDesktop(quest, taskInfo);
                else if (taskInfo.name === "PLAY_ACTIVITY") await playActivity(quest, taskInfo);

                // skipCurrentQuest() already logged the skip; nothing left to do for this quest.
                if (isRunning && !AppState.skipRequested) {
                    log(`Congratulations! ${quest.config.messages.questName} completed! 🎉`, "success", true);
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
            }
        } catch (e) {
            console.error("[QuestManager]", e);
            log(`Error: ${quest.config?.messages?.questName} failed.`, "error", true);

            if (settings.store.autoRequeueFailed && isRunning) {
                quest._retryCount = (quest._retryCount || 0) + 1;
                if (quest._retryCount <= 2) {
                    log(`Requeueing "${quest.config?.messages?.questName}" to retry later (Attempt ${quest._retryCount}/2)...`, "warn", true);
                    AppState.queue.push(quest);
                } else {
                    log(`Max retries reached for "${quest.config?.messages?.questName}". Skipping.`, "error", true);
                }
            }
        }

        AppState.currentQuest = null;
        AppState.skipRequested = false;
    }

    AppState.activeWorker = false;
    if (isRunning) log("All queued quests have been processed successfully!", "success", true);
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
    log(`Skipped: ${AppState.currentQuest.config.messages.questName}`, "warn", true);
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
    const unenrolled = getUnenrolledQuests();
    if (!unenrolled.length) {
        log("No new quests to enroll in.", "warn", true);
        return;
    }

    log(`Enrolling in ${unenrolled.length} new quests...`, "info", true);
    for (const q of unenrolled) {
        await enrollQuest(q);
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
