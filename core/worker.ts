/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { SelectedChannelStore } from "@webpack/common";

import { buildQueue, claimQuestReward, enroll, getTaskInfo, getUnenrolledQuests, sortQuests } from "../api/questApi";
import { playActivity, playDesktop, streamDesktop, watchVideo } from "../api/taskHandlers";
import { settings } from "../settings";
import { AppState, isRunning, log, setRunning } from "./state";
import { QuestsStore } from "./stores";

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

        if (!isRunning) break;

        const quest = AppState.queue.shift()!;
        AppState.currentQuest = quest;

        try {
            const taskInfo = getTaskInfo(quest);
            const enrolled = await enroll(quest);

            if (enrolled && taskInfo.name) {
                if (taskInfo.name.includes("VIDEO")) await watchVideo(quest, taskInfo);
                else if (taskInfo.name === "PLAY_ON_DESKTOP") await playDesktop(quest, taskInfo);
                else if (taskInfo.name === "STREAM_ON_DESKTOP") await streamDesktop(quest, taskInfo);
                else if (taskInfo.name === "PLAY_ACTIVITY") await playActivity(quest, taskInfo);

                if (isRunning) {
                    log(`Congratulations! ${quest.config.messages.questName} completed! 🎉`, "success", true);
                    if (settings.store.autoClaimRewards) {
                        await claimQuestReward(quest);
                    }

                    if (AppState.queue.length > 0) {
                        const delay = settings.store.delayBetweenQuests ?? 0;
                        if (delay > 0) {
                            log(`Waiting ${delay} seconds before starting the next quest...`, "info");
                            await new Promise(r => setTimeout(r, delay * 1000));
                        }
                    }
                }
            }
        } catch {
            log(`Error: ${quest.config?.messages?.questName} failed.`, "error", true);
        }

        AppState.currentQuest = null;
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

export async function enrollAllAndRun(): Promise<void> {
    const unenrolled = getUnenrolledQuests();
    if (!unenrolled.length) {
        log("No new quests to enroll in.", "warn", true);
        return;
    }

    log(`Enrolling in ${unenrolled.length} new quests...`, "info", true);
    for (const q of unenrolled) {
        if (await enroll(q) && !AppState.queue.some(xq => xq.id === q.id)) {
            AppState.queue.push(q);
        }
    }

    AppState.queue = sortQuests(AppState.queue);

    runWorker();
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
    if (AppState.spoofers.restoreGame) AppState.spoofers.restoreGame();
    if (AppState.spoofers.restoreStream) AppState.spoofers.restoreStream();
}
