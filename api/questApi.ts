/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI } from "@webpack/common";

import { log, sleep } from "../core/state";
import { QuestActions, QuestsStore } from "../core/stores";
import { settings } from "../settings";
import { Quest, QuestTaskInfo, SUPPORTED_TASKS } from "../types";

export function getTaskInfo(quest: Quest): QuestTaskInfo {
    const config = quest.config.taskConfig ?? quest.config.taskConfigV2;
    const taskName = SUPPORTED_TASKS.find(t => config?.tasks?.[t] != null);
    return {
        name: taskName,
        target: (taskName && config?.tasks?.[taskName]?.target) || 0,
        progress: (taskName && quest.userStatus?.progress?.[taskName]?.value) || 0
    };
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
            if (x.id === "1412491570820812933") return false;
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
        await RestAPI.post({
            url: `/quests/${quest.id}/enroll`,
            body: {
                location: 11,
                is_targeted: quest.isTargeted ?? quest.is_targeted ?? false,
                traffic_metadata_sealed: quest.trafficMetadata ?? quest.traffic_metadata_sealed ?? null
            }
        });
        log(`Enrolled: ${quest.config.messages.questName}`, "success", true);
        quest.userStatus = quest.userStatus || {};
        quest.userStatus.enrolledAt = new Date().toISOString();
        await sleep(1500);
        return true;
    } catch {
        log(`Enrollment failed: ${quest.config.messages.questName}`, "error", true);
        return false;
    }
}

export async function claimQuestReward(quest: Quest): Promise<boolean> {
    try {
        if (QuestActions && typeof QuestActions.claimQuestReward === "function") {
            await QuestActions.claimQuestReward(quest.id, 11);
        } else {
            await RestAPI.post({
                url: `/quests/${quest.id}/claim-reward`,
                body: {
                    platform: 0,
                    location: 11,
                    is_targeted: quest.isTargeted ?? quest.is_targeted ?? false,
                    metadata_sealed: null,
                    traffic_metadata_sealed: quest.trafficMetadata ?? quest.traffic_metadata_sealed ?? null
                }
            });
            if (quest.userStatus) quest.userStatus.claimedAt = new Date().toISOString();
        }

        log(`Claim triggered: ${quest.config.messages.questName}`, "success", true);
        return true;
    } catch (e) {
        log("Failed to claim reward. Redirecting for manual claim...", "warn", true);
        try {
            const { NavigationRouter } = require("@webpack/common");
            NavigationRouter.transitionTo("/quest-home");
        } catch { }
        return false;
    }
}
