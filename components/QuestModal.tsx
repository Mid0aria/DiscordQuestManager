/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ButtonCompat } from "@components/Button";
import { ModalContent, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React, showToast, ThemeStore, Toasts, useEffect, useState } from "@webpack/common";

import { claimQuestReward, getAllQuests, getTaskInfo, getUnenrolledQuests } from "../api/questApi";
import { applyUpdate, checkForUpdates, isOutdated } from "../api/updater";
import { clearUserHistory, getUserStats } from "../core/db";
import { AppState, isRunning } from "../core/state";
import { QuestsStore } from "../core/stores";
import { enrollAll, enrollQuest, initQueue, moveQueueItem, pauseWorker, removeFromQueue, resumeWorker, runWorker, skipCurrentQuest } from "../core/worker";
import { ORB_ICON_URL, Quest } from "../types";
import { ProgressBar } from "./ProgressBar";
import { QuestListItem } from "./QuestListItem";
import { StatusIcon } from "./StatusIcon";

interface QuestManagerModalProps {
    props: any;
}

export function QuestManagerModal({ props }: QuestManagerModalProps) {
    const [now, setNow] = useState(Date.now());
    const [activeTab, setActiveTab] = useState("quests");
    const [userStats, setUserStats] = useState<any>(null);

    useEffect(() => {
        if (AppState.queue.length === 0) {
            initQueue();
        }
        const id = setInterval(() => {
            setNow(Date.now());
        }, 1000);
        return () => clearInterval(id);
    }, []);

    useEffect(() => {
        if (activeTab === "stats") {
            getUserStats().then((s: any) => setUserStats(s));
        }
    }, [activeTab]);

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
    const unenrolledQuests = getUnenrolledQuests();

    const refresh = () => setNow(Date.now());

    const exportHistory = () => {
        if (!userStats) return;
        const blob = new Blob([JSON.stringify(userStats, null, 2)], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `quest-manager-history-${new Date().toISOString().slice(0, 10)}.json`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const clearHistory = async () => {
        if (!confirm("Quest geçmişini temizlemek istediğinize emin misiniz? Bu işlem geri alınamaz.")) return;
        await clearUserHistory();
        setUserStats(await getUserStats());
    };

    const ModalRootCmp = ModalRoot as any;
    const ModalContentCmp = ModalContent as any;
    const theme = ThemeStore?.theme || "dark";

    return (
        <ModalRootCmp
            {...props}
            size={ModalSize.DYNAMIC}
            className={`vc-quest-modal-root theme-${theme}`}
        >
            <ModalContentCmp
                className={`vc-quest-modal-content theme-${theme}`}
                style={{ padding: 0, overflow: "hidden" }}
            >
                <div
                    className={`vc-quest-dashboard theme-${theme}`}
                    style={{
                        width: "560px",
                        margin: "0 auto",
                        border: "none",
                        borderRadius: 0,
                    }}
                >
                    <div className="vc-quest-hero">
                        <div className="vc-quest-hero-header">
                            <div>
                                <div
                                    className="vc-quest-hero-badge"
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "6px",
                                    }}
                                >
                                    <StatusIcon status={workerStatus} />
                                    <span>{statusLabel}</span>
                                    {AppState.nextHeartbeatTime &&
                                        AppState.nextHeartbeatTime > now &&
                                        workerStatus === "running" && (
                                            <span
                                                style={{
                                                    fontSize: "11px",
                                                    opacity: 0.8,
                                                    textTransform: "none",
                                                    color: "var(--text-muted, #949ba4)",
                                                }}
                                            >
                                                (Ping in{" "}
                                                {Math.ceil(
                                                    (AppState.nextHeartbeatTime -
                                                        now) /
                                                        1000,
                                                )}
                                                s)
                                            </span>
                                        )}
                                </div>
                                <h2 className="vc-quest-hero-title">
                                    {currentQuest
                                        ? currentQuest.config.messages.questName
                                        : "System Ready"}
                                </h2>
                                <p className="vc-quest-hero-subtitle">
                                    {currentInfo
                                        ? currentInfo.name
                                        : "No active quest is currently running."}
                                </p>
                            </div>
                            <div className="vc-quest-hero-controls">
                                {activeWorker &&
                                    (isPaused ? (
                                        <ButtonCompat
                                            color={ButtonCompat.Colors.GREEN}
                                            onClick={resumeWorker}
                                        >
                                            ▶ Resume
                                        </ButtonCompat>
                                    ) : (
                                        <ButtonCompat
                                            color={ButtonCompat.Colors.PRIMARY}
                                            onClick={pauseWorker}
                                        >
                                            ⏸ Pause
                                        </ButtonCompat>
                                    ))}
                                {activeWorker && currentQuest && (
                                    <ButtonCompat
                                        color={ButtonCompat.Colors.RED}
                                        onClick={() => {
                                            skipCurrentQuest();
                                            refresh();
                                        }}
                                    >
                                        ⏭ Skip
                                    </ButtonCompat>
                                )}
                                {isRunning &&
                                    !activeWorker &&
                                    queue.length > 0 && (
                                        <ButtonCompat
                                            color={ButtonCompat.Colors.BRAND}
                                            onClick={() => runWorker()}
                                        >
                                            ↻ Start
                                        </ButtonCompat>
                                    )}
                            </div>
                        </div>

                        {currentQuest && currentInfo && (
                            <div
                                className="vc-quest-hero-progress"
                                style={{
                                    background: "transparent",
                                    border: "none",
                                    padding: 0,
                                }}
                            >
                                <ProgressBar
                                    progress={currentInfo.progress}
                                    target={currentInfo.target}
                                />
                            </div>
                        )}
                    </div>

                    <div className="vc-quest-tab-container">
                        <div
                            className={`vc-quest-tab ${activeTab === "quests" ? "active" : ""}`}
                            onClick={() => setActiveTab("quests")}
                        >
                            Quests
                        </div>
                        <div
                            className={`vc-quest-tab ${activeTab === "stats" ? "active" : ""}`}
                            onClick={() => setActiveTab("stats")}
                        >
                            Stats & History
                        </div>
                    </div>

                    {activeTab === "quests" ? (
                        <>
                            <div className="vc-quest-action-bar">
                                <ButtonCompat
                                    color={ButtonCompat.Colors.BRAND}
                                    onClick={() => enrollAll().then(refresh)}
                                    className="vc-quest-btn-glow"
                                    disabled={unenrolledQuests.length === 0}
                                >
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M12 5v14M5 12h14" />
                                    </svg>
                                    Enroll All
                                </ButtonCompat>
                                <ButtonCompat
                                    color={ButtonCompat.Colors.GREEN}
                                    onClick={() => runWorker()}
                                    disabled={
                                        activeWorker || queue.length === 0
                                    }
                                >
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                    Start
                                </ButtonCompat>
                                <ButtonCompat
                                    color={ButtonCompat.Colors.PRIMARY}
                                    look={ButtonCompat.Looks.LINK}
                                    onClick={() => initQueue()}
                                >
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M21 2v6h-6M3 12a9 9 0 0 1 15-6.7L21 8M3 22v-6h6M21 12a9 9 0 0 1-15 6.7L3 16" />
                                    </svg>
                                    Refresh
                                </ButtonCompat>
                                <ButtonCompat
                                    color={ButtonCompat.Colors.PRIMARY}
                                    look={ButtonCompat.Looks.LINK}
                                    onClick={() => {
                                        if (isOutdated) applyUpdate();
                                        else {
                                            checkForUpdates().then(
                                                (outdated: boolean) => {
                                                    if (!outdated)
                                                        showToast(
                                                            "You are on the latest version!",
                                                            Toasts.Type.SUCCESS,
                                                        );
                                                    else applyUpdate();
                                                },
                                            );
                                        }
                                    }}
                                >
                                    <svg
                                        width="18"
                                        height="18"
                                        viewBox="0 0 24 24"
                                        fill="none"
                                        stroke="currentColor"
                                        strokeWidth="2"
                                    >
                                        <path d="M4 11a8.1 8.1 0 0 1 16 0M4 11v-4M4 11h4M20 13a8.1 8.1 0 0 1-16 0M20 13v4M20 13h-4" />
                                    </svg>
                                    Updates
                                </ButtonCompat>
                            </div>

                            <div
                                className="vc-quest-grid"
                                style={{ gridTemplateColumns: "1fr" }}
                            >
                                <div className="vc-quest-panel">
                                    <h3 className="vc-quest-panel-title">
                                        <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" />
                                        </svg>
                                        Not Enrolled{" "}
                                        <span className="vc-quest-count">
                                            {unenrolledQuests.length}
                                        </span>
                                    </h3>
                                    <div className="vc-quest-list">
                                        {unenrolledQuests.length === 0 ? (
                                            <div className="vc-quest-empty-state">
                                                <span>
                                                    No unenrolled quests.
                                                </span>
                                            </div>
                                        ) : (
                                            unenrolledQuests.map(q => (
                                                <div
                                                    key={q.id}
                                                    className="vc-quest-list-item"
                                                    style={{
                                                        cursor: "pointer",
                                                    }}
                                                    onClick={() =>
                                                        enrollQuest(q).then(
                                                            refresh,
                                                        )
                                                    }
                                                >
                                                    <span className="vc-quest-list-item-name">
                                                        {
                                                            q.config.messages
                                                                .questName
                                                        }
                                                    </span>
                                                    <span className="vc-quest-list-item-type">
                                                        Enroll
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="vc-quest-panel">
                                    <h3 className="vc-quest-panel-title">
                                        <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                                        </svg>
                                        Up Next{" "}
                                        <span className="vc-quest-count">
                                            {queue.length}
                                        </span>
                                    </h3>
                                    <div className="vc-quest-list">
                                        {queue.length === 0 ? (
                                            <div className="vc-quest-empty-state">
                                                <span>No quests in queue.</span>
                                            </div>
                                        ) : (
                                            queue.map((q, i) => (
                                                <QuestListItem
                                                    key={q.id}
                                                    quest={q}
                                                    isActive={
                                                        q.id ===
                                                        currentQuest?.id
                                                    }
                                                    onRemove={() => {
                                                        removeFromQueue(q.id);
                                                        refresh();
                                                    }}
                                                    onMoveUp={() => {
                                                        moveQueueItem(
                                                            q.id,
                                                            "up",
                                                        );
                                                        refresh();
                                                    }}
                                                    onMoveDown={() => {
                                                        moveQueueItem(
                                                            q.id,
                                                            "down",
                                                        );
                                                        refresh();
                                                    }}
                                                    canMoveUp={i > 0}
                                                    canMoveDown={
                                                        i < queue.length - 1
                                                    }
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>

                                <div className="vc-quest-panel">
                                    <h3 className="vc-quest-panel-title">
                                        <svg
                                            width="18"
                                            height="18"
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                        >
                                            <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                                        </svg>
                                        Claimable{" "}
                                        <span className="vc-quest-count">
                                            {unclaimedQuests.length}
                                        </span>
                                    </h3>
                                    <div className="vc-quest-list">
                                        {unclaimedQuests.length === 0 ? (
                                            <div className="vc-quest-empty-state">
                                                <span>
                                                    No claimable rewards.
                                                </span>
                                            </div>
                                        ) : (
                                            unclaimedQuests.map(q => (
                                                <div
                                                    key={q.id}
                                                    className="vc-quest-list-item claimable"
                                                    style={{
                                                        borderColor:
                                                            "var(--brand-experiment)",
                                                        cursor: "pointer",
                                                    }}
                                                    onClick={() =>
                                                        claimQuestReward(
                                                            q,
                                                        ).then(refresh)
                                                    }
                                                >
                                                    <span className="vc-quest-list-item-name">
                                                        🎁{" "}
                                                        {
                                                            q.config.messages
                                                                .questName
                                                        }
                                                    </span>
                                                    <span
                                                        className="vc-quest-list-item-type"
                                                        style={{
                                                            background:
                                                                "var(--brand-experiment)",
                                                            color: "#fff",
                                                        }}
                                                    >
                                                        Claim Reward
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    ) : (
                        <div
                            className="vc-quest-grid"
                            style={{
                                gridTemplateColumns: "1fr",
                                padding: "24px",
                            }}
                        >
                            {userStats ? (
                                <>
                                    <div
                                        style={{
                                            display: "grid",
                                            gridTemplateColumns: "1fr 1fr",
                                            gap: "16px",
                                            marginBottom: "16px",
                                        }}
                                    >
                                        <div
                                            className="vc-quest-panel"
                                            style={{
                                                padding: "20px",
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "8px",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontSize: "12px",
                                                    color: "var(--text-muted)",
                                                    textTransform: "uppercase",
                                                    fontWeight: 700,
                                                    letterSpacing: "0.5px",
                                                }}
                                            >
                                                Total Earned Orbs
                                            </span>{" "}
                                            <div
                                                style={{
                                                    fontSize: "36px",
                                                    fontWeight: 800,
                                                    color: "var(--header-primary, #ffffff)",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "12px",
                                                }}
                                            >
                                                <video
                                                    src={ORB_ICON_URL}
                                                    autoPlay
                                                    loop
                                                    muted
                                                    playsInline
                                                    width="36"
                                                    height="36"
                                                    style={{
                                                        pointerEvents: "none",
                                                    }}
                                                />
                                                {userStats.totalOrbs.toLocaleString()}
                                            </div>
                                        </div>
                                        <div
                                            className="vc-quest-panel"
                                            style={{
                                                padding: "20px",
                                                display: "flex",
                                                flexDirection: "column",
                                                alignItems: "center",
                                                justifyContent: "center",
                                                gap: "8px",
                                            }}
                                        >
                                            <span
                                                style={{
                                                    fontSize: "14px",
                                                    color: "var(--text-muted, #b5bac1)",
                                                    textTransform: "uppercase",
                                                    fontWeight: 600,
                                                    letterSpacing: "0.5px",
                                                }}
                                            >
                                                Completed Quests
                                            </span>
                                            <div
                                                style={{
                                                    fontSize: "36px",
                                                    fontWeight: 800,
                                                    color: "var(--header-primary, #ffffff)",
                                                    display: "flex",
                                                    alignItems: "center",
                                                    gap: "12px",
                                                }}
                                            >
                                                <svg
                                                    width="32"
                                                    height="32"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="#23a559"
                                                    strokeWidth="3"
                                                    strokeLinecap="round"
                                                    strokeLinejoin="round"
                                                >
                                                    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" />
                                                </svg>
                                                {userStats.totalQuests.toLocaleString()}
                                            </div>
                                        </div>
                                    </div>

                                    <div className="vc-quest-panel">
                                        <div
                                            style={{
                                                display: "flex",
                                                alignItems: "center",
                                                justifyContent: "space-between",
                                                marginBottom: "16px",
                                            }}
                                        >
                                            <h3
                                                className="vc-quest-panel-title"
                                                style={{ margin: 0 }}
                                            >
                                                <svg
                                                    width="18"
                                                    height="18"
                                                    viewBox="0 0 24 24"
                                                    fill="none"
                                                    stroke="currentColor"
                                                    strokeWidth="2"
                                                >
                                                    <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                                                </svg>
                                                Quest History{" "}
                                                <span className="vc-quest-count">
                                                    {userStats.history.length}
                                                </span>
                                            </h3>
                                            <div
                                                style={{
                                                    display: "flex",
                                                    gap: "8px",
                                                }}
                                            >
                                                <ButtonCompat
                                                    color={
                                                        ButtonCompat.Colors
                                                            .PRIMARY
                                                    }
                                                    look={
                                                        ButtonCompat.Looks.LINK
                                                    }
                                                    onClick={exportHistory}
                                                    disabled={
                                                        userStats.history
                                                            .length === 0
                                                    }
                                                >
                                                    Export
                                                </ButtonCompat>
                                                <ButtonCompat
                                                    color={
                                                        ButtonCompat.Colors.RED
                                                    }
                                                    look={
                                                        ButtonCompat.Looks.LINK
                                                    }
                                                    onClick={clearHistory}
                                                    disabled={
                                                        userStats.history
                                                            .length === 0
                                                    }
                                                >
                                                    Clear
                                                </ButtonCompat>
                                            </div>
                                        </div>
                                        <div
                                            className="vc-quest-list"
                                            style={{
                                                maxHeight: "300px",
                                                overflowY: "auto",
                                            }}
                                        >
                                            {userStats.history.length === 0 ? (
                                                <div className="vc-quest-empty-state">
                                                    <span>
                                                        No quests claimed yet.
                                                    </span>
                                                </div>
                                            ) : (
                                                userStats.history.map(
                                                    (h: any) => (
                                                        <div
                                                            key={h.id}
                                                            className="vc-quest-list-item completed"
                                                        >
                                                            <div
                                                                style={{
                                                                    display:
                                                                        "flex",
                                                                    flexDirection:
                                                                        "column",
                                                                    gap: "4px",
                                                                }}
                                                            >
                                                                <span className="vc-quest-list-item-name">
                                                                    {h.name}
                                                                </span>
                                                                <span
                                                                    style={{
                                                                        fontSize:
                                                                            "12px",
                                                                        color: "var(--text-muted)",
                                                                        display:
                                                                            "flex",
                                                                        gap: "6px",
                                                                        alignItems:
                                                                            "center",
                                                                    }}
                                                                >
                                                                    <video
                                                                        src={
                                                                            ORB_ICON_URL
                                                                        }
                                                                        autoPlay
                                                                        loop
                                                                        muted
                                                                        playsInline
                                                                        width="16"
                                                                        height="16"
                                                                        style={{
                                                                            pointerEvents:
                                                                                "none",
                                                                        }}
                                                                    />
                                                                    {h.orbs > 0
                                                                        ? `+${h.orbs} Orbs`
                                                                        : h.rewardName}
                                                                </span>
                                                            </div>
                                                            <span className="vc-quest-list-item-type">
                                                                {new Date(
                                                                    h.date,
                                                                ).toLocaleDateString()}
                                                            </span>
                                                        </div>
                                                    ),
                                                )
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div
                                    style={{
                                        display: "flex",
                                        justifyContent: "center",
                                        padding: "40px",
                                    }}
                                >
                                    Loading stats...
                                </div>
                            )}
                        </div>
                    )}
                </div>
            </ModalContentCmp>
        </ModalRootCmp>
    );
}

export function openQuestManagerModal() {
    openModal(modalProps => <QuestManagerModal props={modalProps} />);
}
