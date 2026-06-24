/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { createRoot, React, useEffect, useState } from "@webpack/common";

import { getTaskInfo } from "../api/questApi";
import { AppState, isRunning } from "../core/state";
import { QuestsStore } from "../core/stores";
import { pauseWorker, resumeWorker, runWorker } from "../core/worker";
import { settings } from "../settings";
import { Quest } from "../types";
import { ProgressBar } from "./ProgressBar";
import { StatusIcon } from "./StatusIcon";

export function QuestOverlay() {
    const [minimized, setMinimized] = useState(false);
    const [now, setNow] = useState(Date.now());

    useEffect(() => {
        const id = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(id);
    }, []);

    if (!settings.store.showOverlay) return null;

    const { currentQuest, pauseManager, activeWorker, queue } = AppState;
    if (!currentQuest && queue.length === 0) return null;

    const currentInfo = currentQuest
        ? getTaskInfo((QuestsStore?.quests?.get(currentQuest.id) as Quest) ?? currentQuest)
        : null;

    const workerStatus: "running" | "paused" | "idle" =
        !isRunning ? "idle"
            : pauseManager.isPaused ? "paused"
                : activeWorker ? "running"
                    : "idle";

    return (
        <div className="vc-quest-overlay">
            <div className="vc-quest-overlay-header">
                <div className="vc-quest-overlay-title">
                    <StatusIcon status={workerStatus} />
                    Quest Manager
                    {AppState.nextHeartbeatTime && AppState.nextHeartbeatTime > now && (
                        <span style={{ fontSize: "10px", opacity: 0.8, textTransform: "none", color: "var(--text-muted, #949ba4)", marginLeft: "4px" }}>
                            ({Math.ceil((AppState.nextHeartbeatTime - now) / 1000)}s)
                        </span>
                    )}
                </div>
                <button
                    onClick={() => setMinimized(m => !m)}
                    style={{ background: "transparent", border: "none", color: "var(--text-muted, #949ba4)", cursor: "pointer", fontSize: "12px", display: "flex", alignItems: "center", justifyContent: "center" }}
                    title={minimized ? "Expand" : "Minimize"}
                >
                    {minimized ? "➕" : "➖"}
                </button>
            </div>

            {!minimized && (
                <>
                    {currentQuest && currentInfo ? (
                        <div className="vc-quest-overlay-body">
                            <div className="vc-quest-overlay-name">{currentQuest.config.messages.questName}</div>
                            <ProgressBar progress={currentInfo.progress} target={currentInfo.target} compact={true} />
                        </div>
                    ) : (
                        <div className="vc-quest-overlay-body">
                            <div className="vc-quest-overlay-name" style={{ color: "var(--text-muted, #949ba4)" }}>Idle... {queue.length} quests in queue.</div>
                        </div>
                    )}

                    <div className="vc-quest-overlay-actions">
                        {activeWorker && !pauseManager.isPaused && (
                            <button className="vc-quest-overlay-btn" onClick={pauseWorker}>
                                ⏸ Pause
                            </button>
                        )}
                        {activeWorker && pauseManager.isPaused && (
                            <button className="vc-quest-overlay-btn vc-quest-btn-green" onClick={resumeWorker}>
                                ▶ Resume
                            </button>
                        )}
                        {!activeWorker && isRunning && queue.length > 0 && (
                            <button className="vc-quest-overlay-btn vc-quest-btn-brand" onClick={() => runWorker()}>
                                ▶ Start
                            </button>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}

let container: HTMLDivElement | null = null;

export function mountOverlay() {
    if (container) return;
    container = document.createElement("div");
    container.id = "vc-quest-overlay-container";
    const appMount = document.getElementById("app-mount") || document.body;
    appMount.appendChild(container);

    const root = createRoot(container);
    root.render(<QuestOverlay />);
    (container as any)._root = root;
}

export function unmountOverlay() {
    if (container) {
        if ((container as any)._root) {
            (container as any)._root.unmount();
        }
        container.remove();
        container = null;
    }
}
