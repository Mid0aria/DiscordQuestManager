/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import * as DataStore from "@api/DataStore";
import ErrorBoundary from "@components/ErrorBoundary";
import { createRoot, React, useEffect, useRef, useState } from "@webpack/common";

import { calculateTotalQueueETA, formatETA, getTaskInfo } from "../api/questApi";
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

const SNAP_THRESHOLD = 24;

function clampPosition(pos: OverlayPosition, el: HTMLElement): OverlayPosition {
    const rect = el.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const maxY = Math.max(0, window.innerHeight - rect.height);
    return {
        x: Math.min(Math.max(0, pos.x), maxX),
        y: Math.min(Math.max(0, pos.y), maxY)
    };
}

/** Snaps a clamped position to the nearest screen edge once it's within SNAP_THRESHOLD of it. */
function snapToEdges(pos: OverlayPosition, el: HTMLElement): OverlayPosition {
    const rect = el.getBoundingClientRect();
    const maxX = Math.max(0, window.innerWidth - rect.width);
    const maxY = Math.max(0, window.innerHeight - rect.height);

    let { x, y } = pos;
    if (x <= SNAP_THRESHOLD) x = 0;
    else if (maxX - x <= SNAP_THRESHOLD) x = maxX;

    if (y <= SNAP_THRESHOLD) y = 0;
    else if (maxY - y <= SNAP_THRESHOLD) y = maxY;

    return { x, y };
}

function GripIcon() {
    return (
        <svg className="vc-quest-overlay-grip" width="10" height="14" viewBox="0 0 10 14" fill="currentColor">
            <circle cx="2" cy="2" r="1.4" />
            <circle cx="8" cy="2" r="1.4" />
            <circle cx="2" cy="7" r="1.4" />
            <circle cx="8" cy="7" r="1.4" />
            <circle cx="2" cy="12" r="1.4" />
            <circle cx="8" cy="12" r="1.4" />
        </svg>
    );
}

export function QuestOverlay() {
    const [minimized, setMinimized] = useState(false);
    const [now, setNow] = useState(Date.now());
    const [position, setPosition] = useState<OverlayPosition | null>(null);
    const [isDragging, setIsDragging] = useState(false);
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
            setIsDragging(false);
            setPosition(pos => {
                if (!pos || !rootRef.current) return pos;
                const snapped = snapToEdges(pos, rootRef.current);
                DataStore.set(POSITION_STORAGE_KEY, snapped).catch(() => { /* ignore persist failures */ });
                return snapped;
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

    const totalETA = calculateTotalQueueETA(queue, currentQuest);
    const isPill = settings.store.overlayStyle === "pill";
    const baseOpacity = (settings.store.overlayOpacity ?? 85) / 100;

    const onHeaderMouseDown = (e: React.MouseEvent) => {
        if ((e.target as HTMLElement).closest("button") || !rootRef.current) return;
        const rect = rootRef.current.getBoundingClientRect();
        dragOffsetRef.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };
        draggingRef.current = true;
        setIsDragging(true);
        e.preventDefault();
    };

    const resetPosition = () => {
        setPosition(null);
        DataStore.del(POSITION_STORAGE_KEY).catch(() => { /* ignore persist failures */ });
    };

    const positionStyle: React.CSSProperties = {
        opacity: isDragging ? 1 : baseOpacity,
        ...(position ? { position: "fixed", left: position.x, top: position.y, right: "auto", bottom: "auto" } : {})
    };

    if (isPill) {
        const pct = currentInfo && currentInfo.target > 0
            ? Math.min(100, Math.round((currentInfo.progress / currentInfo.target) * 100))
            : 0;

        return (
            <div
                className={`vc-quest-overlay vc-quest-overlay-pill${isDragging ? " vc-quest-overlay-dragging" : ""}`}
                ref={rootRef}
                style={positionStyle}
                onMouseDown={onHeaderMouseDown}
            >
                <GripIcon />
                <StatusIcon status={workerStatus} />
                <span className="vc-quest-pill-title">
                    {currentQuest ? currentQuest.config.messages.questName : "Idle"}
                </span>
                {currentQuest && (
                    <span className="vc-quest-pill-pct">{pct}%</span>
                )}
                {totalETA > 0 && (
                    <span className="vc-quest-pill-eta">~{formatETA(totalETA)}</span>
                )}
                <div className="vc-quest-pill-actions">
                    {activeWorker && !pauseManager.isPaused && (
                        <button className="vc-quest-pill-btn" onClick={pauseWorker} title="Pause">⏸</button>
                    )}
                    {activeWorker && pauseManager.isPaused && (
                        <button className="vc-quest-pill-btn green" onClick={resumeWorker} title="Resume">▶</button>
                    )}
                    {!activeWorker && isRunning && queue.length > 0 && (
                        <button className="vc-quest-pill-btn brand" onClick={() => runWorker()} title="Start">▶</button>
                    )}
                    {activeWorker && currentQuest && (
                        <button className="vc-quest-pill-btn" onClick={() => skipCurrentQuest()} title="Skip">⏭</button>
                    )}
                </div>
            </div>
        );
    }

    return (
        <div
            className={`vc-quest-overlay${isDragging ? " vc-quest-overlay-dragging" : ""}`}
            ref={rootRef}
            style={positionStyle}
        >
            <div className="vc-quest-overlay-header" onMouseDown={onHeaderMouseDown}>
                <div className="vc-quest-overlay-title">
                    <GripIcon />
                    <StatusIcon status={workerStatus} />
                    Quest Manager
                    {AppState.nextHeartbeatTime && AppState.nextHeartbeatTime > now && workerStatus === "running" && (
                        <span style={{ fontSize: "10px", opacity: 0.8, textTransform: "none", color: "var(--text-muted, #949ba4)", marginLeft: "4px" }}>
                            ({Math.ceil((AppState.nextHeartbeatTime - now) / 1000)}s)
                        </span>
                    )}
                </div>
                <div className="vc-quest-overlay-header-btns">
                    {totalETA > 0 && (
                        <span className="vc-quest-overlay-eta" title="Total Queue ETA">
                            ⏱️ ~{formatETA(totalETA)}
                        </span>
                    )}
                    {position && (
                        <button
                            className="vc-quest-overlay-header-btn"
                            onClick={resetPosition}
                            title="Reset position"
                        >
                            ⟲
                        </button>
                    )}
                    <button
                        className="vc-quest-overlay-header-btn"
                        onClick={() => setMinimized(m => !m)}
                        title={minimized ? "Expand" : "Minimize"}
                    >
                        {minimized ? "➕" : "➖"}
                    </button>
                </div>
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
