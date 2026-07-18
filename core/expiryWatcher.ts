/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";

import { getAllQuests } from "../api/questApi";
import { settings } from "../settings";
import { log } from "./state";

const CHECK_INTERVAL_MS = 15 * 60 * 1000;

const warnedQuestIds = new Set<string>();
let intervalId: ReturnType<typeof setInterval> | null = null;

function checkExpiringQuests() {
    if (!settings.store.enableExpiryWarnings) return;

    const thresholdMs = settings.store.expiryWarningHours * 60 * 60 * 1000;
    const now = Date.now();

    for (const quest of getAllQuests()) {
        if (quest.userStatus?.completedAt) continue;
        if (warnedQuestIds.has(quest.id)) continue;

        const remaining = new Date(quest.config.expiresAt).getTime() - now;
        if (remaining <= 0 || remaining > thresholdMs) continue;

        warnedQuestIds.add(quest.id);
        const hoursLeft = Math.max(1, Math.round(remaining / (60 * 60 * 1000)));
        const name = quest.config.messages.questName;

        log(`Quest expiring soon: ${name} (~${hoursLeft}h left)`, "warn", true);
        showNotification?.({
            title: "Quest Expiring Soon",
            body: `"${name}" expires in about ${hoursLeft}h.`
        });
    }
}

export function startExpiryWatcher(): void {
    if (intervalId) return;
    checkExpiringQuests();
    intervalId = setInterval(checkExpiringQuests, CHECK_INTERVAL_MS);
}

export function stopExpiryWatcher(): void {
    if (intervalId) {
        clearInterval(intervalId);
        intervalId = null;
    }
    warnedQuestIds.clear();
}
