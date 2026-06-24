/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { UserStore } from "@webpack/common";

export interface QuestHistoryEntry {
    id: string;
    name: string;
    date: string;
    rewardName: string;
    orbs: number;
}

export interface UserStats {
    userId: string;
    totalQuests: number;
    totalOrbs: number;
    history: QuestHistoryEntry[];
}

const DB_NAME = "QuestManagerDB";
const DB_VERSION = 1;
const STORE_NAME = "stats";

function getDB(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);
        req.onupgradeneeded = () => {
            const db = req.result;
            if (!db.objectStoreNames.contains(STORE_NAME)) {
                db.createObjectStore(STORE_NAME, { keyPath: "userId" });
            }
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

export async function getUserStats(): Promise<UserStats> {
    const userId = UserStore?.getCurrentUser()?.id || "unknown";
    const db = await getDB();
    return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readonly");
        const store = tx.objectStore(STORE_NAME);
        const req = store.get(userId);
        req.onsuccess = () => {
            if (req.result) {
                resolve(req.result);
            } else {
                resolve({ userId, totalQuests: 0, totalOrbs: 0, history: [] });
            }
        };
        req.onerror = () => reject(req.error);
    });
}

export async function addQuestToHistory(questId: string, questName: string, rewardName: string, orbs: number) {
    const db = await getDB();
    const stats = await getUserStats();


    if (stats.history.find(x => x.id === questId)) return;

    stats.totalQuests += 1;
    stats.totalOrbs += orbs;
    stats.history.unshift({
        id: questId,
        name: questName,
        date: new Date().toISOString(),
        rewardName,
        orbs
    });

    return new Promise<void>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, "readwrite");
        const store = tx.objectStore(STORE_NAME);
        const req = store.put(stats);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
    });
}
