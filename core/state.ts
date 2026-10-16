/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast } from "@webpack/common";

import { settings } from "../settings";
import { AppState as AppStateType } from "../types";

export const AppState: AppStateType = {
    activeWorker: false,
    currentQuest: null,
    queue: [],
    pauseManager: {
        promise: null,
        resolve: null,
        get isPaused() { return !!this.promise; },
        pause() {
            if (!this.promise) this.promise = new Promise(r => this.resolve = r);
        },
        resume() {
            if (this.resolve) {
                this.resolve();
                this.promise = null;
                this.resolve = null;
            }
        },
        async waitIfPaused() {
            if (this.promise) await this.promise;
        }
    },
    spoofers: { setupGame: null, restoreGame: null, setupStream: null, restoreStream: null, cancelActiveTask: null },
    nextHeartbeatTime: null,
    skipRequested: false
};

export let isRunning = false;
export const setRunning = (v: boolean) => { isRunning = v; };

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export interface DebugLogEntry {
    id: number;
    time: string;
    msg: string;
    type: "info" | "success" | "warn" | "error";
}

let nextLogId = 1;
export const debugLogs: DebugLogEntry[] = [];

export function clearDebugLogs() {
    debugLogs.length = 0;
}

export function debugLog(msg: string, ...args: any[]) {
    if (!settings?.store?.debugMode) return;
    const formattedArgs = args.length > 0 ? " " + args.map(a => typeof a === "object" ? JSON.stringify(a) : String(a)).join(" ") : "";
    console.log(`%c[QuestManager:Debug]%c ${msg}${formattedArgs}`, "color: #f38ba8; font-weight: bold;", "");
    debugLogs.push({
        id: nextLogId++,
        time: new Date().toLocaleTimeString(),
        msg: `[DEBUG] ${msg}${formattedArgs}`,
        type: "info"
    });
    if (debugLogs.length > 300) debugLogs.shift();
}

export function log(msg: string, type: "info" | "success" | "warn" | "error" = "info", showNotification = false) {
    debugLogs.push({
        id: nextLogId++,
        time: new Date().toLocaleTimeString(),
        msg,
        type
    });
    if (debugLogs.length > 300) debugLogs.shift();

    const level = settings?.store?.logLevel ?? "all";

    let shouldShow = true;
    if (level === "none") shouldShow = false;
    else if (level === "errors_only" && type !== "error") shouldShow = false;
    else if (level === "completed_only" && type !== "success" && type !== "error") shouldShow = false;

    const styles = {
        info: "color: #5865F2;",
        success: "color: #57F287;",
        warn: "color: #FEE75C;",
        error: "color: #ED4245;"
    };

    console.log(`%c[QuestManager]%c ${msg}`, `${styles[type]} font-weight: bold;`, "");

    if (showNotification && shouldShow) {
        try {
            const variants: Record<string, "default" | "success" | "critical"> = {
                info: "default",
                success: "success",
                error: "critical",
                warn: "default"
            };
            showToast({ text: msg, variant: variants[type] });
        } catch (e) {
            console.warn("[QuestManager] showToast failed:", e);
        }
    }
}
