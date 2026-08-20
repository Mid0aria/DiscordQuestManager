/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ButtonCompat } from "@components/Button";
import { ModalContent, ModalRoot, ModalSize, openModal } from "@utils/modal";
import { React, showToast, ThemeStore, Toasts, useEffect, useMemo, useState } from "@webpack/common";

import { calculateTotalQueueETA, claimQuestReward, formatETA, getAllQuests, getQuestReward, getTaskInfo, getUnenrolledQuests } from "../api/questApi";
import { applyUpdate, checkForUpdates, isOutdated } from "../api/updater";
import { clearUserHistory, getUserStats, markRewardCodeUsed, UserStats } from "../core/db";
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
    const [activeTab, setActiveTab] = useState<"quests" | "vault" | "stats">("quests");
    const [userStats, setUserStats] = useState<UserStats | null>(null);
    const [searchQuery, setSearchQuery] = useState("");
    const [filterCategory, setFilterCategory] = useState<"all" | "video" | "activity" | "expiring" | "orbs">("all");
    const [vaultFilter, setVaultFilter] = useState<"all" | "unused" | "used">("all");

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
        if (activeTab === "stats" || activeTab === "vault") {
            getUserStats().then(s => setUserStats(s));
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
    const unclaimedQuests = completedQuests.filter(q => !q.userStatus?.claimedAt);
    const unenrolledQuests = getUnenrolledQuests();

    const totalETA = calculateTotalQueueETA(queue, currentQuest);

    const refresh = () => {
        setNow(Date.now());
        if (activeTab === "stats" || activeTab === "vault") {
            getUserStats().then(s => setUserStats(s));
        }
    };

    // Filter quests based on search query and category
    const filterQuest = (q: Quest) => {
        if (searchQuery.trim()) {
            const name = q.config.messages?.questName?.toLowerCase() || "";
            if (!name.includes(searchQuery.toLowerCase().trim())) return false;
        }

        if (filterCategory === "video") {
            const info = getTaskInfo(q);
            return info.name?.includes("VIDEO") ?? false;
        } else if (filterCategory === "activity") {
            const info = getTaskInfo(q);
            return (info.name?.includes("PLAY") || info.name?.includes("STREAM") || info.name?.includes("ACTIVITY")) ?? false;
        } else if (filterCategory === "expiring") {
            const remaining = new Date(q.config.expiresAt).getTime() - Date.now();
            return remaining > 0 && remaining <= 48 * 60 * 60 * 1000;
        } else if (filterCategory === "orbs") {
            const r = getQuestReward(q);
            return r.orbs > 0;
        }

        return true;
    };

    const filteredUnenrolled = unenrolledQuests.filter(filterQuest);
    const filteredQueue = queue.filter(filterQuest);
    const filteredUnclaimed = unclaimedQuests.filter(filterQuest);

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

    const exportCodesTxt = () => {
        if (!userStats || !userStats.history) return;
        const codes = userStats.history.filter(h => h.code);
        if (codes.length === 0) {
            showToast("No promo codes found to export.", Toasts.Type.MESSAGE);
            return;
        }

        const lines = codes.map(c => `Quest: ${c.name}\nReward: ${c.rewardName}\nCode: ${c.code}\nStatus: ${c.codeUsed ? "USED" : "AVAILABLE"}\nDate: ${new Date(c.date).toLocaleString()}\n-------------------------`);
        const blob = new Blob([lines.join("\n\n")], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `quest-manager-promo-codes-${new Date().toISOString().slice(0, 10)}.txt`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const clearHistory = async () => {
        if (!confirm("Are you sure you want to clear quest history? This action cannot be undone.")) return;
        await clearUserHistory();
        setUserStats(await getUserStats());
    };

    const copyCode = (code: string) => {
        navigator.clipboard.writeText(code).then(() => {
            showToast("Code copied to clipboard! 📋", Toasts.Type.SUCCESS);
        }).catch(() => {
            showToast("Failed to copy code.", Toasts.Type.FAILURE);
        });
    };

    const toggleCodeUsed = async (questId: string, currentUsed: boolean) => {
        await markRewardCodeUsed(questId, !currentUsed);
        setUserStats(await getUserStats());
    };

    // Analytics calculations
    const analytics = useMemo(() => {
        if (!userStats || !userStats.history) return null;
        const history = userStats.history;

        // Last 7 days distribution
        const daysMap: Record<string, { label: string; orbs: number; quests: number; }> = {};
        for (let i = 6; i >= 0; i--) {
            const d = new Date();
            d.setDate(d.getDate() - i);
            const dateStr = d.toISOString().slice(0, 10);
            const label = d.toLocaleDateString(undefined, { weekday: "short" });
            daysMap[dateStr] = { label, orbs: 0, quests: 0 };
        }

        let totalTimeSavedSec = 0;
        let videoCount = 0;
        let gameCount = 0;
        let streamCount = 0;
        let activityCount = 0;
        let promoCodeCount = 0;

        for (const h of history) {
            if (h.code) promoCodeCount++;
            const dateStr = h.date.slice(0, 10);
            if (daysMap[dateStr]) {
                daysMap[dateStr].orbs += h.orbs || 0;
                daysMap[dateStr].quests += 1;
            }

            const t = (h.taskType || "").toUpperCase();
            if (t.includes("VIDEO")) {
                videoCount++;
                totalTimeSavedSec += 600;
            } else if (t.includes("PLAY_ON_DESKTOP") || t.includes("GAME")) {
                gameCount++;
                totalTimeSavedSec += 900;
            } else if (t.includes("STREAM")) {
                streamCount++;
                totalTimeSavedSec += 900;
            } else {
                activityCount++;
                totalTimeSavedSec += 600;
            }
        }

        const maxDailyOrbs = Math.max(1, ...Object.values(daysMap).map(d => d.orbs));
        const totalCategoryQuests = Math.max(1, videoCount + gameCount + streamCount + activityCount);

        return {
            days: Object.values(daysMap),
            maxDailyOrbs,
            promoCodeCount,
            totalTimeSaved: formatETA(totalTimeSavedSec),
            breakdown: {
                videoPct: Math.round((videoCount / totalCategoryQuests) * 100),
                gamePct: Math.round((gameCount / totalCategoryQuests) * 100),
                streamPct: Math.round((streamCount / totalCategoryQuests) * 100),
                activityPct: Math.round((activityCount / totalCategoryQuests) * 100)
            }
        };
    }, [userStats]);

    const ModalRootCmp = ModalRoot as any;
    const ModalContentCmp = ModalContent as any;
    const theme = ThemeStore?.theme || "dark";

    const vaultList = (userStats?.history || []).filter(h => {
        if (!h.code && h.rewardName === "Unknown Reward") return false;
        if (vaultFilter === "unused") return h.code && !h.codeUsed;
        if (vaultFilter === "used") return h.code && h.codeUsed;
        return true;
    });

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
                        width: "600px",
                        margin: "0 auto",
                        border: "none",
                        borderRadius: 0,
                    }}
                >
                    {/* Hero Header */}
                    <div className="vc-quest-hero">
                        <div className="vc-quest-hero-header">
                            <div>
                                <div
                                    className="vc-quest-hero-badge"
                                    style={{
                                        display: "flex",
                                        alignItems: "center",
                                        gap: "8px",
                                    }}
                                >
                                    <StatusIcon status={workerStatus} />
                                    <span>{statusLabel}</span>
                                    {AppState.nextHeartbeatTime &&
                                        AppState.nextHeartbeatTime > now &&
                                        workerStatus === "running" && (
                                            <span style={{ fontSize: "11px", opacity: 0.8, textTransform: "none", color: "var(--text-muted, #949ba4)" }}>
                                                (Ping in {Math.ceil((AppState.nextHeartbeatTime - now) / 1000)}s)
                                            </span>
                                        )}
                                    {totalETA > 0 && (
                                        <span className="vc-quest-hero-eta-pill">
                                            ⏱️ Queue ETA: ~{formatETA(totalETA)}
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

                    {/* Navigation Tabs */}
                    <div className="vc-quest-tab-container">
                        <div
                            className={`vc-quest-tab ${activeTab === "quests" ? "active" : ""}`}
                            onClick={() => setActiveTab("quests")}
                        >
                            Quests
                        </div>
                        <div
                            className={`vc-quest-tab ${activeTab === "vault" ? "active" : ""}`}
                            onClick={() => setActiveTab("vault")}
                        >
                            🎁 Reward Vault
                            {analytics && analytics.promoCodeCount > 0 && (
                                <span className="vc-quest-tab-badge">{analytics.promoCodeCount}</span>
                            )}
                        </div>
                        <div
                            className={`vc-quest-tab ${activeTab === "stats" ? "active" : ""}`}
                            onClick={() => setActiveTab("stats")}
                        >
                            📊 Analytics & Stats
                        </div>
                    </div>

                    {/* Quests View */}
                    {activeTab === "quests" && (
                        <>
                            {/* Action Bar */}
                            <div className="vc-quest-action-bar">
                                <ButtonCompat
                                    color={ButtonCompat.Colors.BRAND}
                                    onClick={() => enrollAll().then(refresh)}
                                    className="vc-quest-btn-glow"
                                    disabled={unenrolledQuests.length === 0}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M12 5v14M5 12h14" />
                                    </svg>
                                    Enroll All
                                </ButtonCompat>
                                <ButtonCompat
                                    color={ButtonCompat.Colors.GREEN}
                                    onClick={() => runWorker()}
                                    disabled={activeWorker || queue.length === 0}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <polygon points="5 3 19 12 5 21 5 3" />
                                    </svg>
                                    Start
                                </ButtonCompat>
                                <ButtonCompat
                                    color={ButtonCompat.Colors.PRIMARY}
                                    look={ButtonCompat.Looks.LINK}
                                    onClick={() => initQueue()}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
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
                                            checkForUpdates().then((outdated: boolean) => {
                                                if (!outdated) showToast("You are on the latest version!", Toasts.Type.SUCCESS);
                                                else applyUpdate();
                                            });
                                        }
                                    }}
                                >
                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <path d="M4 11a8.1 8.1 0 0 1 16 0M4 11v-4M4 11h4M20 13a8.1 8.1 0 0 1-16 0M20 13v4M20 13h-4" />
                                    </svg>
                                    Updates
                                </ButtonCompat>
                            </div>

                            {/* Search and Category Filter Toolbar */}
                            <div className="vc-quest-filter-toolbar">
                                <div className="vc-quest-search-box">
                                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                        <circle cx="11" cy="11" r="8" />
                                        <line x1="21" y1="21" x2="16.65" y2="16.65" />
                                    </svg>
                                    <input
                                        type="text"
                                        placeholder="Search quests by title..."
                                        value={searchQuery}
                                        onChange={e => setSearchQuery(e.target.value)}
                                        className="vc-quest-search-input"
                                    />
                                    {searchQuery && (
                                        <button className="vc-quest-search-clear" onClick={() => setSearchQuery("")}>✕</button>
                                    )}
                                </div>
                                <div className="vc-quest-filter-chips">
                                    <button
                                        className={`vc-quest-chip ${filterCategory === "all" ? "active" : ""}`}
                                        onClick={() => setFilterCategory("all")}
                                    >
                                        All
                                    </button>
                                    <button
                                        className={`vc-quest-chip ${filterCategory === "video" ? "active" : ""}`}
                                        onClick={() => setFilterCategory("video")}
                                    >
                                        🎬 Video
                                    </button>
                                    <button
                                        className={`vc-quest-chip ${filterCategory === "activity" ? "active" : ""}`}
                                        onClick={() => setFilterCategory("activity")}
                                    >
                                        🎮 Games / Stream
                                    </button>
                                    <button
                                        className={`vc-quest-chip ${filterCategory === "expiring" ? "active" : ""}`}
                                        onClick={() => setFilterCategory("expiring")}
                                    >
                                        ⏳ Expiring
                                    </button>
                                    <button
                                        className={`vc-quest-chip ${filterCategory === "orbs" ? "active" : ""}`}
                                        onClick={() => setFilterCategory("orbs")}
                                    >
                                        🔮 Orbs
                                    </button>
                                </div>
                            </div>

                            <div className="vc-quest-grid" style={{ gridTemplateColumns: "1fr" }}>
                                {/* Not Enrolled */}
                                <div className="vc-quest-panel">
                                    <h3 className="vc-quest-panel-title">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2M8.5 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM20 8v6M23 11h-6" />
                                        </svg>
                                        Not Enrolled <span className="vc-quest-count">{filteredUnenrolled.length}</span>
                                    </h3>
                                    <div className="vc-quest-list">
                                        {filteredUnenrolled.length === 0 ? (
                                            <div className="vc-quest-empty-state">
                                                <span>No unenrolled quests found.</span>
                                            </div>
                                        ) : (
                                            filteredUnenrolled.map(q => (
                                                <div
                                                    key={q.id}
                                                    className="vc-quest-list-item"
                                                    style={{ cursor: "pointer" }}
                                                    onClick={() => enrollQuest(q).then(refresh)}
                                                >
                                                    <span className="vc-quest-list-item-name">{q.config.messages.questName}</span>
                                                    <span className="vc-quest-list-item-type">Enroll</span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Up Next Queue */}
                                <div className="vc-quest-panel">
                                    <h3 className="vc-quest-panel-title">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                                        </svg>
                                        Up Next <span className="vc-quest-count">{filteredQueue.length}</span>
                                    </h3>
                                    <div className="vc-quest-list">
                                        {filteredQueue.length === 0 ? (
                                            <div className="vc-quest-empty-state">
                                                <span>No quests in queue.</span>
                                            </div>
                                        ) : (
                                            filteredQueue.map((q, i) => (
                                                <QuestListItem
                                                    key={q.id}
                                                    quest={q}
                                                    isActive={q.id === currentQuest?.id}
                                                    onRemove={() => {
                                                        removeFromQueue(q.id);
                                                        refresh();
                                                    }}
                                                    onMoveUp={() => {
                                                        moveQueueItem(q.id, "up");
                                                        refresh();
                                                    }}
                                                    onMoveDown={() => {
                                                        moveQueueItem(q.id, "down");
                                                        refresh();
                                                    }}
                                                    canMoveUp={i > 0}
                                                    canMoveDown={i < queue.length - 1}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>

                                {/* Claimable */}
                                <div className="vc-quest-panel">
                                    <h3 className="vc-quest-panel-title">
                                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                            <path d="M20 12v10H4V12M2 7h20v5H2zM12 22V7M12 7H7.5a2.5 2.5 0 0 1 0-5C11 2 12 7 12 7zM12 7h4.5a2.5 2.5 0 0 0 0-5C13 2 12 7 12 7z" />
                                        </svg>
                                        Claimable <span className="vc-quest-count">{filteredUnclaimed.length}</span>
                                    </h3>
                                    <div className="vc-quest-list">
                                        {filteredUnclaimed.length === 0 ? (
                                            <div className="vc-quest-empty-state">
                                                <span>No claimable rewards.</span>
                                            </div>
                                        ) : (
                                            filteredUnclaimed.map(q => (
                                                <div
                                                    key={q.id}
                                                    className="vc-quest-list-item claimable"
                                                    style={{ borderColor: "var(--brand-experiment)", cursor: "pointer" }}
                                                    onClick={() => claimQuestReward(q).then(refresh)}
                                                >
                                                    <span className="vc-quest-list-item-name">🎁 {q.config.messages.questName}</span>
                                                    <span className="vc-quest-list-item-type" style={{ background: "var(--brand-experiment)", color: "#fff" }}>
                                                        Claim Reward
                                                    </span>
                                                </div>
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}

                    {/* Reward Vault View */}
                    {activeTab === "vault" && (
                        <div className="vc-quest-vault-container">
                            <div className="vc-quest-vault-header">
                                <div className="vc-quest-filter-chips">
                                    <button
                                        className={`vc-quest-chip ${vaultFilter === "all" ? "active" : ""}`}
                                        onClick={() => setVaultFilter("all")}
                                    >
                                        All Rewards ({userStats?.history?.length || 0})
                                    </button>
                                    <button
                                        className={`vc-quest-chip ${vaultFilter === "unused" ? "active" : ""}`}
                                        onClick={() => setVaultFilter("unused")}
                                    >
                                        ✨ Available Codes
                                    </button>
                                    <button
                                        className={`vc-quest-chip ${vaultFilter === "used" ? "active" : ""}`}
                                        onClick={() => setVaultFilter("used")}
                                    >
                                        ✓ Used Codes
                                    </button>
                                </div>
                                <div style={{ display: "flex", gap: "8px" }}>
                                    <ButtonCompat
                                        color={ButtonCompat.Colors.PRIMARY}
                                        look={ButtonCompat.Looks.FILLED}
                                        size={ButtonCompat.Sizes.SMALL}
                                        onClick={exportCodesTxt}
                                    >
                                        Export TXT
                                    </ButtonCompat>
                                </div>
                            </div>

                            <div className="vc-quest-vault-list">
                                {vaultList.length === 0 ? (
                                    <div className="vc-quest-empty-state" style={{ padding: "40px 0" }}>
                                        <span>No claimed promo codes or rewards found.</span>
                                    </div>
                                ) : (
                                    vaultList.map(h => (
                                        <div key={h.id} className={`vc-quest-vault-card ${h.codeUsed ? "used" : ""}`}>
                                            <div className="vc-quest-vault-card-main">
                                                <div className="vc-quest-vault-card-title">
                                                    <span>{h.name}</span>
                                                    {h.codeUsed && <span className="vc-quest-badge-used">USED</span>}
                                                </div>
                                                <div className="vc-quest-vault-card-reward">
                                                    {h.orbs > 0 ? (
                                                        <span style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                                            <video src={ORB_ICON_URL} autoPlay loop muted playsInline width="14" height="14" style={{ pointerEvents: "none" }} />
                                                            {h.orbs} Orbs
                                                        </span>
                                                    ) : (
                                                        <span>🎁 {h.rewardName}</span>
                                                    )}
                                                    <span style={{ opacity: 0.6 }}>• {new Date(h.date).toLocaleDateString()}</span>
                                                </div>
                                                {h.code && (
                                                    <div className="vc-quest-code-box">
                                                        <code>{h.code}</code>
                                                    </div>
                                                )}
                                            </div>
                                            <div className="vc-quest-vault-card-actions">
                                                {h.code && (
                                                    <ButtonCompat
                                                        color={ButtonCompat.Colors.BRAND}
                                                        size={ButtonCompat.Sizes.SMALL}
                                                        onClick={() => copyCode(h.code!)}
                                                    >
                                                        📋 Copy
                                                    </ButtonCompat>
                                                )}
                                                {h.code && (
                                                    <ButtonCompat
                                                        color={h.codeUsed ? ButtonCompat.Colors.PRIMARY : ButtonCompat.Colors.GREEN}
                                                        look={ButtonCompat.Looks.LINK}
                                                        size={ButtonCompat.Sizes.SMALL}
                                                        onClick={() => toggleCodeUsed(h.id, !!h.codeUsed)}
                                                    >
                                                        {h.codeUsed ? "Mark Unused" : "Mark Used"}
                                                    </ButtonCompat>
                                                )}
                                            </div>
                                        </div>
                                    ))
                                )}
                            </div>
                        </div>
                    )}

                    {/* Analytics & Stats View */}
                    {activeTab === "stats" && (
                        <div className="vc-quest-grid" style={{ gridTemplateColumns: "1fr", padding: "20px" }}>
                            {userStats && analytics ? (
                                <>
                                    {/* 4 Metrics Cards */}
                                    <div className="vc-quest-stats-grid">
                                        <div className="vc-quest-stat-card">
                                            <span className="vc-quest-stat-label">Total Earned Orbs</span>
                                            <div className="vc-quest-stat-val">
                                                <video src={ORB_ICON_URL} autoPlay loop muted playsInline width="30" height="30" style={{ pointerEvents: "none" }} />
                                                {userStats.totalOrbs.toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="vc-quest-stat-card">
                                            <span className="vc-quest-stat-label">Completed Quests</span>
                                            <div className="vc-quest-stat-val" style={{ color: "#23a559" }}>
                                                ✓ {userStats.totalQuests.toLocaleString()}
                                            </div>
                                        </div>
                                        <div className="vc-quest-stat-card">
                                            <span className="vc-quest-stat-label">Claimed Codes</span>
                                            <div className="vc-quest-stat-val" style={{ color: "#5865F2" }}>
                                                🎁 {analytics.promoCodeCount}
                                            </div>
                                        </div>
                                        <div className="vc-quest-stat-card">
                                            <span className="vc-quest-stat-label">Est. Time Saved</span>
                                            <div className="vc-quest-stat-val" style={{ color: "#f0b232" }}>
                                                ⏱️ {analytics.totalTimeSaved}
                                            </div>
                                        </div>
                                    </div>

                                    {/* 7-Day Chart */}
                                    <div className="vc-quest-panel" style={{ padding: "16px" }}>
                                        <h4 className="vc-quest-chart-title">Weekly Orbs Activity (Last 7 Days)</h4>
                                        <div className="vc-quest-bar-chart">
                                            {analytics.days.map((d, idx) => {
                                                const heightPct = Math.max(8, Math.round((d.orbs / analytics.maxDailyOrbs) * 100));
                                                return (
                                                    <div key={idx} className="vc-quest-chart-col">
                                                        <div className="vc-quest-chart-bar-wrapper">
                                                            <div
                                                                className="vc-quest-chart-bar"
                                                                style={{ height: `${heightPct}%` }}
                                                                title={`${d.label}: ${d.orbs} Orbs (${d.quests} quests)`}
                                                            />
                                                        </div>
                                                        <span className="vc-quest-chart-label">{d.label}</span>
                                                    </div>
                                                );
                                            })}
                                        </div>
                                    </div>

                                    {/* Quest Types Breakdown */}
                                    <div className="vc-quest-panel" style={{ padding: "16px" }}>
                                        <h4 className="vc-quest-chart-title">Completed Quests Breakdown</h4>
                                        <div className="vc-quest-breakdown-bar">
                                            <div style={{ width: `${analytics.breakdown.videoPct}%`, background: "#5865F2" }} title={`Video: ${analytics.breakdown.videoPct}%`} />
                                            <div style={{ width: `${analytics.breakdown.gamePct}%`, background: "#57F287" }} title={`Desktop Game: ${analytics.breakdown.gamePct}%`} />
                                            <div style={{ width: `${analytics.breakdown.streamPct}%`, background: "#EB459E" }} title={`Stream: ${analytics.breakdown.streamPct}%`} />
                                            <div style={{ width: `${analytics.breakdown.activityPct}%`, background: "#FEE75C" }} title={`Activity: ${analytics.breakdown.activityPct}%`} />
                                        </div>
                                        <div className="vc-quest-breakdown-legend">
                                            <span><span className="dot" style={{ background: "#5865F2" }} /> Video ({analytics.breakdown.videoPct}%)</span>
                                            <span><span className="dot" style={{ background: "#57F287" }} /> Games ({analytics.breakdown.gamePct}%)</span>
                                            <span><span className="dot" style={{ background: "#EB459E" }} /> Stream ({analytics.breakdown.streamPct}%)</span>
                                            <span><span className="dot" style={{ background: "#FEE75C" }} /> Activity ({analytics.breakdown.activityPct}%)</span>
                                        </div>
                                    </div>

                                    {/* History Table */}
                                    <div className="vc-quest-panel">
                                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "16px" }}>
                                            <h3 className="vc-quest-panel-title" style={{ margin: 0 }}>
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                                                    <path d="M12 8v4l3 3m6-3a9 9 0 1 1-18 0 9 9 0 0 1 18 0z" />
                                                </svg>
                                                Quest History <span className="vc-quest-count">{userStats.history.length}</span>
                                            </h3>
                                            <div style={{ display: "flex", gap: "8px" }}>
                                                <ButtonCompat
                                                    color={ButtonCompat.Colors.PRIMARY}
                                                    look={ButtonCompat.Looks.LINK}
                                                    onClick={exportHistory}
                                                    disabled={userStats.history.length === 0}
                                                >
                                                    Export JSON
                                                </ButtonCompat>
                                                <ButtonCompat
                                                    color={ButtonCompat.Colors.RED}
                                                    look={ButtonCompat.Looks.LINK}
                                                    onClick={clearHistory}
                                                    disabled={userStats.history.length === 0}
                                                >
                                                    Clear
                                                </ButtonCompat>
                                            </div>
                                        </div>
                                        <div className="vc-quest-list" style={{ maxHeight: "250px", overflowY: "auto" }}>
                                            {userStats.history.length === 0 ? (
                                                <div className="vc-quest-empty-state">
                                                    <span>No quests claimed yet.</span>
                                                </div>
                                            ) : (
                                                userStats.history.map(h => (
                                                    <div key={h.id} className="vc-quest-list-item completed">
                                                        <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                                                            <span className="vc-quest-list-item-name">{h.name}</span>
                                                            <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: "6px", alignItems: "center" }}>
                                                                <video src={ORB_ICON_URL} autoPlay loop muted playsInline width="16" height="16" style={{ pointerEvents: "none" }} />
                                                                {h.orbs > 0 ? `+${h.orbs} Orbs` : h.rewardName}
                                                            </span>
                                                        </div>
                                                        <span className="vc-quest-list-item-type">
                                                            {new Date(h.date).toLocaleDateString()}
                                                        </span>
                                                    </div>
                                                ))
                                            )}
                                        </div>
                                    </div>
                                </>
                            ) : (
                                <div style={{ display: "flex", justifyContent: "center", padding: "40px" }}>
                                    Loading analytics & stats...
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
