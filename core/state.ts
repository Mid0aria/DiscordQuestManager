/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { showToast, Toasts } from "@webpack/common";

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
    spoofers: { setupGame: null, restoreGame: null, setupStream: null, restoreStream: null },
    nextHeartbeatTime: null
};

export let isRunning = false;
export const setRunning = (v: boolean) => { isRunning = v; };

export const sleep = (ms: number) => new Promise<void>(r => setTimeout(r, ms));

export function log(msg: string, type: "info" | "success" | "warn" | "error" = "info", showNotification = false) {
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
        const toastTypes = {
            info: Toasts.Type.MESSAGE,
            success: Toasts.Type.SUCCESS,
            error: Toasts.Type.FAILURE,
            warn: Toasts.Type.MESSAGE
        };
        showToast(msg, toastTypes[type]);
    }
}
