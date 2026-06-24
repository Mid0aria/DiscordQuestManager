/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showNotification } from "@api/Notifications";
import { relaunch } from "@utils/native";
import { showToast, Toasts } from "@webpack/common";

import { log } from "../core/state";

export let newCommits: any[] = [];
export let isOutdated = false;

function getNativeBridge() {
    const { VencordNative } = (window as any);
    if (!VencordNative || !VencordNative.pluginHelpers) return null;
    return Object.values(VencordNative.pluginHelpers).find((x: any) => x.isQuestManagerNativeBridge);
}

async function unwrap(promise: Promise<any>) {
    const res = await promise;
    if (res.ok) return res.value;
    console.error("[QuestManager Updater Error]", res.error || res.message);
    return null;
}

export async function checkForUpdates() {
    const Native = getNativeBridge() as any;
    if (!Native) return false;

    const changes = await unwrap(Native.questManagerGetNewCommits());
    if (!changes || changes.length === 0) {
        isOutdated = false;
        return false;
    }

    newCommits = changes;
    isOutdated = true;
    return true;
}

export async function applyUpdate() {
    const Native = getNativeBridge() as any;
    if (!Native) return;

    showToast("Downloading QuestManager update...", Toasts.Type.MESSAGE);

    const pullRes = await Native.questManagerUpdate();
    if (!pullRes.ok) {
        log(`Update failed: ${pullRes.message}`, "error", true);
        return;
    }

    const { VencordNative } = (window as any);
    if (VencordNative && VencordNative.updater) {
        showToast("Rebuilding Vencord...", Toasts.Type.MESSAGE);
        const buildRes = await VencordNative.updater.rebuild();
        if (!buildRes.ok) {
            log("Build failed. You may need to manually build Vencord.", "error", true);
            return;
        }

        log("Update successful! Restart Discord to apply changes.", "success", true);
        setTimeout(() => {
            if (confirm("QuestManager updated successfully! Restart Discord now?")) {
                relaunch();
            }
        }, 500);
    }
}

export async function checkForUpdatesAndNotify() {
    const outdated = await checkForUpdates();
    if (outdated && newCommits.length > 0) {
        log(`QuestManager Update Available! (${newCommits.length} new changes)`, "warn", false);

        if (showNotification) {
            showNotification({
                title: "QuestManager Update",
                body: `There are ${newCommits.length} new updates available. Click here to update now!`,
                onClick: () => applyUpdate()
            });
        }
    }
}
