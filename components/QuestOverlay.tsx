/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import ErrorBoundary from "@components/ErrorBoundary";
import { createRoot, React, useEffect, useRef, useState } from "@webpack/common";

import { getTaskInfo } from "../api/questApi";
import { AppState, isRunning } from "../core/state";
import { QuestsStore } from "../core/stores";
import { pauseWorker, resumeWorker, runWorker, skipCurrentQuest } from "../core/worker";
import { settings } from "../settings";
import { Quest } from "../types";
import { ProgressBar } from "./ProgressBar";
import { StatusIcon } from "./StatusIcon";

// Discord's renderer does not expose `window.localStorage`, so overlay position
// is persisted through Vencord's IndexedDB-backed DataStore instead.
const POSITION_STORAGE_KEY = "QuestManager_overlayPosition";

interface OverlayPosition { x: number; y: number; }

function clampPosition(pos: OverlayPosition, el: HTMLElement): OverlayPosition {
    const rect = el.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const maxY = Math.max(0, window.innerHeight - rect.height);
    return {
        x: Math.min(Math.max(0, pos.x), maxX),
        y: Math.min(Math.max(0, pos.y), maxY)
    };
}

export function QuestOverlay() {
    const [minimized, setMinimized] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [position, setPosition] = useState<OverlayPosition | null>(null);
    const rootRef = useRef<HTMLDivElement | null>(null);
    const draggingRef = useRef(false);
    const dragOffsetRef = useRef({ x: 0, y: 0 });

    useEffect(() => {
        const id = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        DataStore.get<OverlayPosition>(POSITION_STORAGE_KEY)
            .then(saved => {
                if (saved && rootRef.current) setPosition(clampPosition(saved, rootRef.current));
                else if (saved) setPosition(saved);
            })
            .catch(() => { /* storage unavailable, fall back to the default corner */ });
    }, []);

    useEffect(() => {
        const onMouseMove = (e: MouseEvent) => {
            if (!draggingRef.current || !rootRef.current) return;
            const next = { x: e.clientX - dragOffsetRef.current.x, y: e.clientY - dragOffsetRef.current.y };
            setPosition(clampPosition(next, rootRef.current));
        };
        const onMouseUp = () => {
            if (!draggingRef.current) return;
            draggingRef.current = false;
            setPosition(pos => {
                if (pos) DataStore.set(POSITION_STORAGE_KEY, pos).catch(() => { /* ignore persist failures */ });
                return pos;
            });
        };
        window.addEventListener("mousemove", onMouseMove);
        window.addEventListener("mouseup", onMouseUp);
        return () => {
            window.removeEventListener("mousemove", onMouseMove);
            window.removeEventListener("mouseup", onMouseUp);
        };
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

    const onHeaderMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("button") || !rootRef.current) return;
        const rect = rootRef.current.getBoundingClientRect();
        dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        draggingRef.current = true;
        e.preventDefault();
    };

    const positionStyle: React.CSSProperties = position
        ? { position: "fixed", left: position.x, top: position.y, right: "auto", bottom: "auto" }
        : {};

    return (
        <div className="vc-quest-overlay" ref={rootRef} style={positionStyle}>
            <div className="vc-quest-overlay-header" onMouseDown={onHeaderMouseDown} style={{ cursor: "grab" }}>
                <div className="vc-quest-overlay-title">
                    <StatusIcon status={workerStatus} />
                    Quest Manager
                    {AppState.nextHeartbeatTime && AppState.nextHeartbeatTime > now && workerStatus === "running" && (
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
                        {activeWorker && currentQuest && (
                            <button className="vc-quest-overlay-btn" onClick={() => skipCurrentQuest()}>
                                ⏭ Skip
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
    root.render(<ErrorBoundary noop={true}><QuestOverlay /></ErrorBoundary>);
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
