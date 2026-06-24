/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ButtonCompat } from "@components/Button";
import { ModalContent, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React, showToast, ThemeStore, Toasts, useEffect, useState } from "@webpack/common";

import { claimQuestReward, getAllQuests, getTaskInfo } from "../api/questApi";
import { applyUpdate, checkForUpdates, isOutdated } from "../api/updater";
import { AppState, isRunning } from "../core/state";
import { QuestsStore } from "../core/stores";
import { enrollAllAndRun, initQueue, pauseWorker, resumeWorker, runWorker } from "../core/worker";
import { settings } from "../settings";
import { Quest } from "../types";
import { ProgressBar } from "./ProgressBar";
import { QuestListItem } from "./QuestListItem";
import { StatusIcon } from "./StatusIcon";

interface QuestManagerModalProps {
    props: any;
}

export function QuestManagerModal({ props }: QuestManagerModalProps) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => {
        if (AppState.queue.length === 0) {
            initQueue();
        }
        const id = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(id);
    }, []);

    const { currentQuest, pauseManager, queue, activeWorker } = AppState;
    const { isPaused } = pauseManager;

    const workerStatus: "running" | "paused" | "idle" =
        !isRunning ? "idle"
            : isPaused ? "paused"
                : activeWorker ? "running"
                    : "idle";

    const statusLabel = {
        running: "Running",
        paused: "Paused",
        idle: "Idle"
    }[workerStatus];

    const currentInfo = currentQuest
        ? getTaskInfo((QuestsStore?.quests?.get(currentQuest.id) as Quest) ?? currentQuest)
        : null;

    const allQuests = getAllQuests();
    const completedQuests = allQuests.filter(q => q.userStatus?.completedAt);
    const claimedQuests = completedQuests.filter(q => q.userStatus?.claimedAt);
    const unclaimedQuests = completedQuests.filter(q => !q.userStatus?.claimedAt);

    const ModalRootCmp = ModalRoot as any;
    const ModalContentCmp = ModalContent as any;
    const theme = ThemeStore?.theme || "dark";

    return (
        <ModalRootCmp {...props} size={ModalSize.DYNAMIC} className={`vc-quest-modal-root theme-${theme}`}>
            <ModalContentCmp className={`vc-quest-modal-content theme-${theme}`} style={{ padding: 0, overflow: "hidden" }}>
                <div className={`vc-quest-dashboard theme-${theme}`} style={{ width: "560px", margin: "0 auto", border: "none", borderRadius: 0 }}>

                    <div className="vc-quest-hero">
                        <div className="vc-quest-hero-header">
                            <div>
                                <div className="vc-quest-hero-badge" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                    <StatusIcon status={workerStatus} />
                                    <span>{statusLabel}</span>
                                    {AppState.nextHeartbeatTime && AppState.nextHeartbeatTime > now && (
                                        <span style={{ fontSize: "11px", opacity: 0.8, textTransform: "none", color: "var(--text-muted, #949ba4)" }}>
                                            (Ping in {Math.ceil((AppState.nextHeartbeatTime - now) / 1000)}s)
                                        </span>
                                    )}
                                </div>
                                <h2 className="vc-quest-hero-title">
                                    {currentQuest ? currentQuest.config.messages.questName : "System Ready"}
                                </h2>
                                <p className="vc-quest-hero-subtitle">
                                    {currentInfo ? currentInfo.name : "No active quest is currently running."}
                                </p>
                            </div>
                            <div className="vc-quest-hero-controls">
                                {activeWorker && (
                                    isPaused ? (
                                        <ButtonCompat color={ButtonCompat.Colors.GREEN} onClick={resumeWorker}>
                                            ▶ Resume
                                        </ButtonCompat>
                                    ) : (
                                        <ButtonCompat color={ButtonCompat.Colors.PRIMARY} onClick={pauseWorker}>
                                            ⏸ Pause
                                        </ButtonCompat>
                                    )
                                )}
                                {isRunning && !activeWorker && queue.length > 0 && (
                                    <ButtonCompat color={ButtonCompat.Colors.BRAND} onClick={() => runWorker()}>
                                        ↻ Start
                                    </ButtonCompat>
                                )}
                            </div>
                        </div>

                        {currentQuest && currentInfo && (
                            <div className="vc-quest-hero-progress" style={{ background: "transparent", border: "none", padding: 0 }}>
                                <ProgressBar progress={currentInfo.progress} target={currentInfo.target} />
                            </div>
                        )}
                    </div>

                    <div className="vc-quest-action-bar">
                        <ButtonCompat color={ButtonCompat.Colors.BRAND} onClick={() => enrollAllAndRun()} className="vc-quest-btn-glow">
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 5v14M5 12h14" /></svg>
                            Enroll All and Start
                        </ButtonCompat>
                        <ButtonCompat color={ButtonCompat.Colors.PRIMARY} look={ButtonCompat.Looks.LINK} onClick={() => initQueue()}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" /></svg>
                            Refresh Quests
                        </ButtonCompat>
                        <ButtonCompat color={ButtonCompat.Colors.PRIMARY} look={ButtonCompat.Looks.LINK} onClick={() => {
                            if (isOutdated) applyUpdate();
                            else {
                                checkForUpdates().then((outdated: boolean) => {
                                    if (!outdated) {
                                        showToast("You are on the latest version!", Toasts.Type.SUCCESS);
                                    } else {
                                        applyUpdate();
                                    }
                                });
                            }
                        }}>
                            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 11a8.1 8.1 0 0 1 16 0M4 11v-4M4 11h4M20 13a8.1 8.1 0 0 1-16 0M20 13v4M20 13h-4" /></svg>
                            Check Updates
                        </ButtonCompat>
                    </div>

                    <div className="vc-quest-grid" style={{ gridTemplateColumns: "1fr" }}>
                        <div className="vc-quest-panel">
                            <h3 className="vc-quest-panel-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" /></svg>
                                Up Next <span className="vc-quest-count">{queue.length}</span>
                            </h3>
                            <div className="vc-quest-list">
                                {queue.length === 0 ? (
                                    <div className="vc-quest-empty-state">
                                        <span>No quests in queue.</span>
                                    </div>
                                ) : queue.map(q => (
                                    <QuestListItem key={q.id} quest={q} isActive={q.id === currentQuest?.id} />
                                ))}
                            </div>
                        </div>

                        <div className="vc-quest-panel">
                            <h3 className="vc-quest-panel-title">
                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" /></svg>
                                Claimable <span className="vc-quest-count">{unclaimedQuests.length}</span>
                            </h3>
                            <div className="vc-quest-list">
                                {unclaimedQuests.length === 0 ? (
                                    <div className="vc-quest-empty-state">
                                        <span>No claimable rewards.</span>
                                    </div>
                                ) : unclaimedQuests.map(q => (
                                    <div
                                        key={q.id}
                                        className="vc-quest-list-item claimable"
                                        style={{ borderColor: "var(--brand-experiment)", cursor: "pointer" }}
                                        onClick={() => claimQuestReward(q)}
                                    >
                                        <span className="vc-quest-list-item-name">🎁 {q.config.messages.questName}</span>
                                        <span className="vc-quest-list-item-type" style={{ background: "var(--brand-experiment)", color: "#fff" }}>
                                            Claim Reward
                                        </span>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {!settings.store.hideCompletedQuests && (
                            <div className="vc-quest-panel">
                                <h3 className="vc-quest-panel-title">
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" /></svg>
                                    Completed <span className="vc-quest-count">{claimedQuests.length}</span>
                                </h3>
                                <div className="vc-quest-list">
                                    {claimedQuests.length === 0 ? (
                                        <div className="vc-quest-empty-state">
                                            <span>No completed quests yet.</span>
                                        </div>
                                    ) : claimedQuests.map(q => (
                                        <div key={q.id} className="vc-quest-list-item completed">
                                            <span className="vc-quest-list-item-name">{q.config.messages.questName}</span>
                                            <span className="vc-quest-list-item-type">
                                                {q.userStatus?.completedAt ? new Date(q.userStatus.completedAt).toLocaleDateString() : ""}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}

                    </div>
                </div>
            </ModalContentCmp>
        </ModalRootCmp>
    );
}

export function openQuestManagerModal() {
    openModal(modalProps => <QuestManagerModal props={modalProps} />);
}
