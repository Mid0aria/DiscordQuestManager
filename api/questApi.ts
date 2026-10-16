/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI } from "@webpack/common";

import { addQuestToHistory } from "../core/db";
import { withRetry } from "../core/http";
import { log, sleep } from "../core/state";
import { QuestActions, QuestsStore } from "../core/stores";
import { settings } from "../settings";
import { Quest, QuestTaskInfo, SUPPORTED_TASKS, SupportedTask } from "../types";

export function getQuestName(quest: Quest): string {
    return quest.config?.messages?.questName ||
        quest.config?.messages?.quest_name ||
        quest.config?.messages?.gameTitle ||
        quest.config?.messages?.game_title ||
        "Unknown Quest";
}

export function getQuestExpiresAt(quest: Quest): string {
    return quest.config?.expiresAt ||
        quest.config?.expires_at ||
        "";
}

export function getTaskInfo(quest: Quest): QuestTaskInfo {
    const rawConfig = quest.config as any;
    const config = rawConfig?.taskConfig ?? rawConfig?.taskConfigV2 ?? rawConfig?.task_config_v2 ?? rawConfig?.task_config;
    const rawStatus = quest.userStatus ?? quest.user_status ?? (quest as any)?.user_status;
    const taskName = SUPPORTED_TASKS.find(t => config?.tasks?.[t] != null);
    return {
        name: taskName,
        target: (taskName && config?.tasks?.[taskName]?.target) || 0,
        progress: (taskName && rawStatus?.progress?.[taskName]?.value) || 0
    };
}

export function getTaskApplicationId(quest: Quest, taskName: SupportedTask): string | undefined {
    const rawConfig = quest.config as any;
    const config = rawConfig?.taskConfig ?? rawConfig?.taskConfigV2 ?? rawConfig?.task_config_v2 ?? rawConfig?.task_config;
    return config?.tasks?.[taskName]?.applications?.[0]?.id ?? quest.config?.application?.id;
}

export function getQuestReward(quest: Quest): { name: string, orbs: number; } {
    let name = "Unknown Reward";
    let orbs = 0;

    const rewards = quest.config?.rewards ||
        (quest.config as any)?.rewardsConfig?.rewards ||
        (quest.config as any)?.rewards_config?.rewards ||
        (quest as any)?.rewardsConfig?.rewards ||
        (quest as any)?.rewards_config?.rewards ||
        (quest as any)?.rewards;

    if (rewards && rewards.length > 0) {
        const first = rewards[0];
        name = first.messages?.nameWithArticle ||
            first.messages?.name_with_article ||
            first.messages?.name ||
            first.name ||
            name;
        if (first.premiumOrbQuantity || first.premium_orb_quantity || first.orbQuantity || first.orb_quantity) {
            orbs = first.premiumOrbQuantity || first.premium_orb_quantity || first.orbQuantity || first.orb_quantity || 0;
        }
    } else if ((quest.config as any)?.messages?.rewardName || (quest.config as any)?.messages?.reward_name) {
        name = (quest.config as any).messages.rewardName || (quest.config as any).messages.reward_name;
    }

    if (!orbs) {
        orbs = (quest.config as any)?.rewardsConfig?.orbQuantity ||
            (quest.config as any)?.rewards_config?.orb_quantity ||
            (quest.config as any)?.rewardsConfig?.premiumOrbQuantity ||
            (quest.config as any)?.rewards_config?.premium_orb_quantity ||
            (quest.config as any)?.orbQuantity ||
            (quest.config as any)?.orb_quantity ||
            (quest.userStatus as any)?.orbQuantityClaimed ||
            (quest.user_status as any)?.orb_quantity_claimed ||
            (quest as any)?.user_status?.orb_quantity_claimed ||
            0;
    }

    if (!orbs) {
        const orbMatch = name.match(/(\d+)\s*orb/i);
        if (orbMatch) orbs = parseInt(orbMatch[1], 10);
    }

    if (name === "Unknown Reward") {
        if (orbs > 0) {
            name = `${orbs} Discord Orbs`;
        } else {
            console.warn("[QuestManager] Could not determine reward for quest:", getQuestName(quest), quest);
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
            return new Date(getQuestExpiresAt(a)).getTime() - new Date(getQuestExpiresAt(b)).getTime();
        }
    });
}

export function buildQueue(): Quest[] {
    if (!QuestsStore) return [];
    const { store } = settings;
    const quests = [...QuestsStore.quests.values()] as Quest[];
    const filtered = quests
        .filter(x => {
            const status = x.userStatus ?? x.user_status ?? (x as any)?.user_status;
            const enrolledAt = status?.enrolledAt ?? status?.enrolled_at;
            const completedAt = status?.completedAt ?? status?.completed_at;
            if (!enrolledAt || completedAt) return false;

            const expiresAt = getQuestExpiresAt(x);
            if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return false;

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
        const status = x.userStatus ?? x.user_status ?? (x as any)?.user_status;
        const enrolledAt = status?.enrolledAt ?? status?.enrolled_at;
        const completedAt = status?.completedAt ?? status?.completed_at;
        if (enrolledAt || completedAt) return false;

        const expiresAt = getQuestExpiresAt(x);
        if (expiresAt && new Date(expiresAt).getTime() <= Date.now()) return false;

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
    const status = quest.userStatus ?? quest.user_status ?? (quest as any)?.user_status;
    if (status?.enrolledAt || status?.enrolled_at) return true;
    const questName = getQuestName(quest);
    try {
        if (QuestActions && typeof QuestActions.enrollInQuest === "function") {
            try {
                await QuestActions.enrollInQuest(quest.id, { location: 11, platform: 0 });
            } catch {
                await withRetry(() => RestAPI.post({
                    url: `/quests/${quest.id}/enroll`,
                    body: {
                        location: 11,
                        platform: 0,
                        is_targeted: quest.isTargeted ?? quest.is_targeted ?? false,
                        traffic_metadata_sealed: quest.trafficMetadata ?? quest.traffic_metadata_sealed ?? null
                    }
                }));
            }
        } else {
            await withRetry(() => RestAPI.post({
                url: `/quests/${quest.id}/enroll`,
                body: {
                    location: 11,
                    platform: 0,
                    is_targeted: quest.isTargeted ?? quest.is_targeted ?? false,
                    traffic_metadata_sealed: quest.trafficMetadata ?? quest.traffic_metadata_sealed ?? null
                }
            }));
        }
        log(`Enrolled: ${questName}`, "success", true);
        quest.userStatus = quest.userStatus || {};
        quest.userStatus.enrolledAt = new Date().toISOString();
        await sleep(1500);
        return true;
    } catch (e) {
        console.error("[QuestManager]", e);
        log(`Enrollment failed: ${questName}`, "error", true);
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
        const questName = getQuestName(quest);
        await addQuestToHistory(
            quest.id,
            questName,
            reward.name,
            reward.orbs,
            code,
            taskInfo.name
        );

        if (code) {
            log(`Reward claimed! Promo code saved: ${code} 🎁`, "success", true);
        } else {
            log(`Claim triggered: ${questName}`, "success", true);
        }
        return { success: true, code };
    } catch (e) {
        console.error("[QuestManager]", e);
        log("Failed to claim reward.", "warn", true);
        return { success: false };
    }
}
