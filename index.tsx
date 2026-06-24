/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import "./styles.css";

import ErrorBoundary from "@components/ErrorBoundary";
import definePlugin, { StartAt } from "@utils/types";
import { onceReady } from "@webpack";
import { React } from "@webpack/common";

import { buildQueue, getUnenrolledQuests } from "./api/questApi";
import { checkForUpdatesAndNotify } from "./api/updater";
import { QuestHeaderButton } from "./components/QuestButton";
import { openQuestManagerModal } from "./components/QuestModal";
import { mountOverlay, unmountOverlay } from "./components/QuestOverlay";
import { AppState, log, setRunning } from "./core/state";
import { initQueue, stopAndCleanup } from "./core/worker";
import { settings } from "./settings";

export default definePlugin({
    name: "QuestManager",
    description: "A Vencord plugin for Discord quests.",
    authors: [
        { name: "midohazretleri", id: 526822284694913042n }
    ],
    tags: ["Utility"],
    settings,
    toolboxActions: {
        "Quest Manager": () => openQuestManagerModal(),
        "Toggle Quest Overlay": () => {
            settings.store.showOverlay = !settings.store.showOverlay;
        }
    },
    startAt: StartAt.WebpackReady,

    patches: [
        {
            find: /toolbar:\i,mobileToolbar:\i/,
            replacement: {
                match: /(function \i\(\i\){)(.{1,200}toolbar.{1,100}mobileToolbar)/,
                replace: "$1$self.addIconToToolBar(arguments[0]);$2"
            }
        }
    ],

    addIconToToolBar(e: { toolbar: React.ReactNode[] | React.ReactNode; }) {
        if (Array.isArray(e.toolbar)) {
            return e.toolbar.unshift(
                <ErrorBoundary noop={true}>
                    <QuestHeaderButton />
                </ErrorBoundary>
            );
        }

        e.toolbar = [
            <ErrorBoundary noop={true} key="quest-btn">
                <QuestHeaderButton />
            </ErrorBoundary>,
            e.toolbar,
        ];
    },

    async start() {
        this.isRunning = true;
        setRunning(true);
        await onceReady;
        if (!this.isRunning) return;

        setTimeout(() => checkForUpdatesAndNotify(), 10000);

        if (settings.store.autoStart) {
            initQueue(true);
        } else {
            AppState.queue = buildQueue();
            const unenrolled = getUnenrolledQuests();
            const totalPending = AppState.queue.length + unenrolled.length;

            if (totalPending > 0 && settings.store.notifyOnNew) {
                log(`Quests ready! ${totalPending} pending quests waiting to be processed.`, "info", true);
            }
        }

        log("QuestCompleter started successfully. 🚀", "success", true);

        mountOverlay();
    },

    isRunning: false,

    stop() {
        this.isRunning = false;
        stopAndCleanup();
        unmountOverlay();
        log("Plugin stopped.", "warn", true);

        AppState.activeWorker = false;
        AppState.currentQuest = null;
        AppState.queue = [];
    }
});
