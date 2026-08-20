/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { NavigationRouter, RestAPI } from "@webpack/common";

import { addQuestToHistory } from "../core/db";
import { withRetry } from "../core/http";
import { log, sleep } from "../core/state";
import { QuestActions, QuestsStore } from "../core/stores";
import { settings } from "../settings";
import { Quest, QuestTaskInfo, SUPPORTED_TASKS, SupportedTask } from "../types";

export function getTaskInfo(quest: Quest): QuestTaskInfo {
    const config = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const taskName = SUPPORTED_TASKS.find(t => config?.tasks?.[t] != null);
    return {
        name: taskName,
        target: (taskName && config?.tasks?.[taskName]?.target) || 0,
        progress: (taskName && quest.userStatus?.progress?.[taskName]?.value) || 0
    };
}

export function getTaskApplicationId(quest: Quest, taskName: SupportedTask): string | undefined {
    const config = quest.config.taskConfig ?? quest.config.taskConfigV2;
    return config?.tasks?.[taskName]?.applications?.[0]?.id ?? quest.config.application?.id;
}

export function getQuestReward(quest: Quest): { name: string, orbs: number; } {
    let name = "Unknown Reward";
    let orbs = 0;

    const rewards = quest.config?.rewards || (quest.config as any)?.rewardsConfig?.rewards || (quest as any)?.rewards;

    if (rewards && rewards.length > 0) {
        name = rewards[0].messages?.name || rewards[0].name || name;
        if (rewards[0].orbQuantity) {
            orbs = rewards[0].orbQuantity;
        }
    } else if ((quest.config as any)?.messages?.rewardName) {
        name = (quest.config as any).messages.rewardName;
    }

    if (name === "Unknown Reward") {
        console.warn("[QuestManager] Could not determine reward for quest:", quest.config?.messages?.questName, quest);
    }

    if (!orbs) {
        // Prefer the structured claimed-quantity field over the regex fallback below,
        // since that regex only matches English reward text and silently returns 0
        // orbs on non-English Discord locales.
        if (quest.userStatus && (quest.userStatus as any).orbQuantityClaimed) {
            orbs = (quest.userStatus as any).orbQuantityClaimed;
        } else {
            const orbMatch = name.match(/(\d+)\s*orb/i);
            if (orbMatch) orbs = parseInt(orbMatch[1], 10);
        }
    }

    return { name, orbs };
}

export function sortQuests(quests: Quest[]): Quest[] {
    const { store } = settings;
    return quests.sort((a, b) => {
        if (store.questSortOrder === "video_first") {
            const isVidA = getTaskInfo(a).name?.includes("VIDEO") ? 1 : 0;
            const isVidB = getTaskInfo(b).name?.includes("VIDEO") ? 1 : 0;
            return isVidB - isVidA;
        } else if (store.questSortOrder === "activity_first") {
            const isActA = getTaskInfo(a).name?.includes("ACTIVITY") ? 1 : 0;
            const isActB = getTaskInfo(b).name?.includes("ACTIVITY") ? 1 : 0;
            return isActB - isActA;
        } else {
            return new Date(a.config.expiresAt).getTime() - new Date(b.config.expiresAt).getTime();
        }
    });
}

export function buildQueue(): Quest[] {
    if (!QuestsStore) return [];
    const { store } = settings;
    const quests = [...QuestsStore.quests.values()] as Quest[];
    const filtered = quests
        .filter(x => {
            if (!x.userStatus?.enrolledAt || x.userStatus?.completedAt) return false;
            if (new Date(x.config.expiresAt).getTime() <= Date.now()) return false;

            const info = getTaskInfo(x);
            if (!info.name) return false;

            if (info.name.includes("VIDEO") && !store.enableVideoQuests) return false;
            if ((info.name.includes("ACTIVITY") || info.name.includes("STREAM") || info.name.includes("PLAY")) && !store.enableActivityQuests) return false;

            return true;
        });
    return sortQuests(filtered);
}

export function getUnenrolledQuests(): Quest[] {
    if (!QuestsStore) return [];
    const { store } = settings;
    const quests = [...QuestsStore.quests.values()] as Quest[];
    return quests.filter(x => {
        if (x.userStatus?.enrolledAt || x.userStatus?.completedAt) return false;
        if (new Date(x.config.expiresAt).getTime() <= Date.now()) return false;

        const info = getTaskInfo(x);
        if (!info.name) return false;

        if (info.name.includes("VIDEO") && !store.enableVideoQuests) return false;
        if ((info.name.includes("ACTIVITY") || info.name.includes("STREAM") || info.name.includes("PLAY")) && !store.enableActivityQuests) return false;

        return true;
    });
}

export function getAllQuests(): Quest[] {
    if (!QuestsStore) return [];
    return [...QuestsStore.quests.values()] as Quest[];
}

export async function enroll(quest: Quest): Promise<boolean> {
    if (quest.userStatus?.enrolledAt) return true;
    try {
        await withRetry(() => RestAPI.post({
            url: `/quests/${quest.id}/enroll`,
            body: {
                location: 11,
                is_targeted: quest.isTargeted ?? quest.is_targeted ?? false,
                traffic_metadata_sealed: quest.trafficMetadata ?? quest.traffic_metadata_sealed ?? null
            }
        }));
        log(`Enrolled: ${quest.config.messages.questName}`, "success", true);
        quest.userStatus = quest.userStatus || {};
        quest.userStatus.enrolledAt = new Date().toISOString();
        await sleep(1500);
        return true;
    } catch (e) {
        console.error("[QuestManager]", e);
        log(`Enrollment failed: ${quest.config.messages.questName}`, "error", true);
        return false;
    }
}

export function calculateQuestETA(quest: Quest): number {
    const info = getTaskInfo(quest);
    if (!info.name) return 0;
    const remaining = Math.max(0, info.target - info.progress);
    if (info.name.includes("VIDEO")) {
        const speed = Math.max(1, settings.store.videoSpeed || 7);
        return Math.ceil(remaining / speed);
    }
    return remaining;
}

export function formatETA(seconds: number): string {
    if (seconds <= 0) return "0s";
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    if (m === 0) return `${s}s`;
    if (s === 0) return `${m}m`;
    return `${m}m ${s}s`;
}

export function calculateTotalQueueETA(queue: Quest[], currentQuest: Quest | null): number {
    let totalSec = 0;
    if (currentQuest) {
        totalSec += calculateQuestETA(currentQuest);
    }
    for (const q of queue) {
        totalSec += calculateQuestETA(q);
        totalSec += (settings.store.delayBetweenQuests ?? 0);
    }
    return totalSec;
}

export async function claimQuestReward(quest: Quest): Promise<{ success: boolean; code?: string; }> {
    try {
        let code: string | undefined;
        if (QuestActions && typeof QuestActions.claimQuestReward === "function") {
            const res = await QuestActions.claimQuestReward(quest.id, 11);
            code = res?.code ?? res?.claim_code ?? res?.redemption_code ?? res?.body?.code;
        } else {
            const res = await withRetry(() => RestAPI.post({
                url: `/quests/${quest.id}/claim-reward`,
                body: {
                    platform: 0,
                    location: 11,
                    is_targeted: quest.isTargeted ?? quest.is_targeted ?? false,
                    metadata_sealed: null,
                    traffic_metadata_sealed: quest.trafficMetadata ?? quest.traffic_metadata_sealed ?? null
                }
            }));
            code = res?.body?.code ?? res?.body?.claim_code ?? res?.body?.redemption_code ?? (quest.userStatus as any)?.claim_code;
            if (quest.userStatus) quest.userStatus.claimedAt = new Date().toISOString();
        }

        const reward = getQuestReward(quest);
        const taskInfo = getTaskInfo(quest);
        await addQuestToHistory(
            quest.id,
            quest.config.messages.questName,
            reward.name,
            reward.orbs,
            code,
            taskInfo.name
        );

        if (code) {
            log(`Reward claimed! Promo code saved: ${code} 🎁`, "success", true);
        } else {
            log(`Claim triggered: ${quest.config.messages.questName}`, "success", true);
        }
        return { success: true, code };
    } catch (e) {
        console.error("[QuestManager]", e);
        log("Failed to claim reward. Redirecting for manual claim...", "warn", true);
        try {
            NavigationRouter.transitionTo("/quest-home");
        } catch { }
        return { success: false };
    }
}
