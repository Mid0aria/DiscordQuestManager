/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ButtonCompat } from "@components/Button";
import { React, RestAPI, showToast, useEffect, useMemo, useState } from "@webpack/common";

import { clearFailedEnrollmentCache, failedEnrollmentQuestIds, getAllQuests, getQuestName, getQuestReward, getTaskInfo } from "../api/questApi";
import { vpnClient } from "../api/vpnClient";
import { AppState, clearDebugLogs, debugLogs, getRemainingRateLimitSec, isCurrentlyRateLimited, isRunning } from "../core/state";
import { ChannelStore, IdleStore, QuestActions, QuestsStore, RunningGameStore, StreamingStore } from "../core/stores";
import { getVpnScannerState, resetScannerLock, scanRegionsNow } from "../core/vpnScanner";
import { settings } from "../settings";
import { Quest } from "../types";
import { addRegionChangeListener, openRegionPickerModal } from "./RegionPickerModal";

export function DebugView() {
    const [subTab, setSubTab] = useState<"explorer" | "probe" | "stores" | "logs" | "vpn">("explorer");
    const [allQuests, setAllQuests] = useState<Quest[]>([]);
    const [selectedQuestId, setSelectedQuestId] = useState<string>("");
    const [jsonSearchQuery, setJsonSearchQuery] = useState("");
    const [probeResult, setProbeResult] = useState<{ url: string; status?: number; timeMs?: number; data: any; error?: boolean; } | null>(null);
    const [probeLoading, setProbeLoading] = useState(false);
    const [logFilter, setLogFilter] = useState<"all" | "info" | "success" | "warn" | "error">("all");
    const [logSearch, setLogSearch] = useState("");
    const [logsVersion, setLogsVersion] = useState(0);
    const [targetRegionsStr, setTargetRegionsStr] = useState(() => settings.store.vpnTargetRegions || "None");

    useEffect(() => {
        return addRegionChangeListener(val => setTargetRegionsStr(val));
    }, []);

    // ExpressVPN MCP states
    const [vpnStatus, setVpnStatus] = useState<{
        tested: boolean;
        state?: string;
        region?: string;
        statusText?: string;
        error?: string;
    } | null>(null);
    const [vpnLoading, setVpnLoading] = useState(false);
    const [vpnRegions, setVpnRegions] = useState<string[]>([]);
    const [selectedVpnRegion, setSelectedVpnRegion] = useState("");
    const [vpnScanRunning, setVpnScanRunning] = useState(false);

    const refreshQuests = () => {
        try {
            const list = getAllQuests();
            setAllQuests(list);
            if (list.length > 0 && (!selectedQuestId || !list.some(q => q.id === selectedQuestId))) {
                setSelectedQuestId(list[0].id);
            }
        } catch (e) {
            console.error("[QuestManager:Debug] Failed to fetch quests:", e);
        }
    };

    useEffect(() => {
        refreshQuests();
        const id = setInterval(() => {
            setLogsVersion(v => v + 1);
        }, 1500);
        return () => clearInterval(id);
    }, []);

    const selectedQuest = useMemo(() => {
        return allQuests.find(q => q.id === selectedQuestId) || allQuests[0];
    }, [allQuests, selectedQuestId]);

    const formattedQuestJson = useMemo(() => {
        if (!selectedQuest) return "No quest selected.";
        try {
            const str = JSON.stringify(selectedQuest, null, 2);
            if (!jsonSearchQuery.trim()) return str;
            // Filter lines containing query
            const lines = str.split("\n");
            const matched = lines.filter(l => l.toLowerCase().includes(jsonSearchQuery.toLowerCase()));
            if (matched.length === 0) return `// No lines matching "${jsonSearchQuery}" in JSON\n` + str;
            return `// ${matched.length} line(s) matching "${jsonSearchQuery}":\n` + matched.join("\n");
        } catch (e) {
            return String(e);
        }
    }, [selectedQuest, jsonSearchQuery]);

    const copyToClipboard = (text: string, label: string) => {
        navigator.clipboard.writeText(text).then(() => {
            showToast({ text: `${label} copied to clipboard! 📋`, variant: "success" });
        }).catch(() => {
            showToast({ text: "Failed to copy to clipboard", variant: "critical" });
        });
    };

    // Live endpoint probe helper
    const runProbe = async (url: string) => {
        setProbeLoading(true);
        setProbeResult(null);
        const startTime = performance.now();
        try {
            const res = await RestAPI.get({ url });
            const elapsed = Math.round(performance.now() - startTime);
            setProbeResult({
                url,
                status: res?.status ?? 200,
                timeMs: elapsed,
                data: res?.body ?? res
            });
            showToast({ text: `Probe ${url} succeeded (${elapsed}ms)`, variant: "success" });
        } catch (err: any) {
            const elapsed = Math.round(performance.now() - startTime);
            setProbeResult({
                url,
                status: err?.status || 500,
                timeMs: elapsed,
                data: err?.body || { error: err?.message || String(err) },
                error: true
            });
            showToast({ text: `Probe ${url} failed`, variant: "critical" });
        } finally {
            setProbeLoading(false);
        }
    };

    const testVpn = async () => {
        setVpnLoading(true);
        try {
            const testRes = await vpnClient.testConnection();
            let statusText = "";
            try {
                statusText = await vpnClient.getStatus();
            } catch {
                // ignore
            }
            setVpnStatus({
                tested: true,
                state: testRes.state,
                region: testRes.region,
                statusText,
                error: testRes.error
            });
            if (testRes.ok) {
                showToast({ text: `ExpressVPN: ${testRes.state || "OK"}`, variant: "success" });
            } else {
                showToast({ text: `ExpressVPN error: ${testRes.error}`, variant: "critical" });
            }
        } catch (e: any) {
            setVpnStatus({
                tested: true,
                error: e?.message || String(e)
            });
            showToast({ text: "ExpressVPN connection error", variant: "critical" });
        } finally {
            setVpnLoading(false);
        }
    };

    const fetchVpnRegions = async () => {
        setVpnLoading(true);
        try {
            const list = await vpnClient.getRegions();
            setVpnRegions(list);
            if (list.length > 0 && !selectedVpnRegion) {
                setSelectedVpnRegion(list[0]);
            }
            showToast({ text: `Loaded ${list.length} ExpressVPN regions`, variant: "success" });
        } catch (e: any) {
            showToast({ text: `Failed to fetch regions: ${e?.message || String(e)}`, variant: "critical" });
        } finally {
            setVpnLoading(false);
        }
    };

    const connectVpnRegion = async (reg: string) => {
        if (!reg) return;
        setVpnLoading(true);
        try {
            showToast({ text: `Connecting to ${reg}...` });
            await vpnClient.connect(reg, 25);
            showToast({ text: `Connected to ${reg}!`, variant: "success" });
            await testVpn();
        } catch (e: any) {
            showToast({ text: `Connect failed: ${e?.message || String(e)}`, variant: "critical" });
        } finally {
            setVpnLoading(false);
        }
    };

    const disconnectVpn = async () => {
        setVpnLoading(true);
        try {
            showToast({ text: "Disconnecting ExpressVPN..." });
            await vpnClient.disconnect(15);
            showToast({ text: "ExpressVPN disconnected", variant: "success" });
            await testVpn();
        } catch (e: any) {
            showToast({ text: `Disconnect failed: ${e?.message || String(e)}`, variant: "critical" });
        } finally {
            setVpnLoading(false);
        }
    };

    const triggerVpnScan = async () => {
        setVpnScanRunning(true);
        try {
            const res = await scanRegionsNow({ manual: true });
            if (res.ok) {
                showToast({ text: `Scan finished! Enrolled: ${res.totalEnrolled}`, variant: "success" });
            }
            refreshQuests();
        } finally {
            setVpnScanRunning(false);
        }
    };

    // Store inspector helpers
    const storeDiagnostics = useMemo(() => {
        const runningGames = RunningGameStore?.getRunningGames?.() ?? [];
        const isIdle = IdleStore?.isIdle?.() ?? false;
        const idleSince = IdleStore?.getIdleSince?.() ?? null;
        const isStreaming = StreamingStore?.hasAnyResult?.() ?? false;

        const questsStoreKeys = QuestsStore ? Object.keys(QuestsStore).filter(k => typeof QuestsStore[k] !== "function").slice(0, 20) : [];
        const questActionMethods = QuestActions ? Object.keys(QuestActions).filter(k => typeof QuestActions[k] === "function") : [];

        return {
            questsStoreLoaded: !!QuestsStore,
            questsStoreCount: QuestsStore?.quests?.size ?? allQuests.length,
            claimedQuestsCount: QuestsStore?.claimedQuests?.size ?? 0,
            questsStoreKeys,
            questActionsLoaded: !!QuestActions,
            questActionMethods,
            runningGames,
            isIdle,
            idleSince: idleSince ? new Date(idleSince).toLocaleTimeString() : "Not idle",
            isStreaming
        };
    }, [allQuests, logsVersion]);

    const filteredLogs = useMemo(() => {
        return debugLogs.filter(item => {
            if (logFilter !== "all" && item.type !== logFilter) return false;
            if (logSearch.trim() && !item.msg.toLowerCase().includes(logSearch.toLowerCase())) return false;
            return true;
        });
    }, [logFilter, logSearch, logsVersion]);

    return (
        <div className="vc-quest-debug-container">
            {/* Top Diagnostics Status Bar */}
            <div className="vc-quest-debug-header-cards">
                <div className="vc-quest-debug-chip">
                    <span className="vc-quest-debug-chip-label">QuestsStore:</span>
                    <span className={`vc-quest-debug-badge ${storeDiagnostics.questsStoreLoaded ? "ok" : "err"}`}>
                        {storeDiagnostics.questsStoreLoaded ? `Loaded (${storeDiagnostics.questsStoreCount})` : "Missing"}
                    </span>
                </div>
                <div className="vc-quest-debug-chip">
                    <span className="vc-quest-debug-chip-label">QuestActions:</span>
                    <span className={`vc-quest-debug-badge ${storeDiagnostics.questActionsLoaded ? "ok" : "err"}`}>
                        {storeDiagnostics.questActionsLoaded ? `Found (${storeDiagnostics.questActionMethods.length} methods)` : "Missing"}
                    </span>
                </div>
                <div className="vc-quest-debug-chip">
                    <span className="vc-quest-debug-chip-label">Worker State:</span>
                    <span className={`vc-quest-debug-badge ${isRunning ? "ok" : "idle"}`}>
                        {isRunning ? (AppState.activeWorker ? "Running" : "Idle") : "Stopped"}
                        {AppState.pauseManager.isPaused ? " (Paused)" : ""}
                    </span>
                </div>
                <div className="vc-quest-debug-chip">
                    <span className="vc-quest-debug-chip-label">Queue / Quests:</span>
                    <span className="vc-quest-debug-badge info">
                        {AppState.queue.length} in queue / {allQuests.length} total
                    </span>
                </div>
                <ButtonCompat
                    size={ButtonCompat.Sizes.MIN}
                    color={ButtonCompat.Colors.PRIMARY}
                    look={ButtonCompat.Looks.LINK}
                    onClick={refreshQuests}
                    title="Refresh all Quest Store entries"
                >
                    🔄 Refresh
                </ButtonCompat>
            </div>

            {/* Sub Tabs */}
            <div className="vc-quest-debug-subtabs">
                <button
                    className={`vc-quest-debug-subtab ${subTab === "explorer" ? "active" : ""}`}
                    onClick={() => setSubTab("explorer")}
                >
                    🔎 Raw Quest Explorer
                </button>
                <button
                    className={`vc-quest-debug-subtab ${subTab === "probe" ? "active" : ""}`}
                    onClick={() => setSubTab("probe")}
                >
                    📡 Live API Prober
                </button>
                <button
                    className={`vc-quest-debug-subtab ${subTab === "stores" ? "active" : ""}`}
                    onClick={() => setSubTab("stores")}
                >
                    📦 Stores Inspector
                </button>
                <button
                    className={`vc-quest-debug-subtab ${subTab === "logs" ? "active" : ""}`}
                    onClick={() => setSubTab("logs")}
                >
                    📜 Event Logs ({debugLogs.length})
                </button>
                <button
                    className={`vc-quest-debug-subtab ${subTab === "vpn" ? "active" : ""}`}
                    onClick={() => setSubTab("vpn")}
                >
                    🌍 ExpressVPN MCP
                </button>
            </div>

            {/* TAB 1: RAW QUEST EXPLORER */}
            {subTab === "explorer" && (
                <div className="vc-quest-debug-tab-content">
                    <div className="vc-quest-debug-row">
                        <div style={{ flex: 1 }}>
                            <label className="vc-quest-debug-label">Select Quest to Inspect:</label>
                            <select
                                className="vc-quest-debug-select"
                                value={selectedQuestId}
                                onChange={e => setSelectedQuestId(e.target.value)}
                            >
                                {allQuests.map(q => {
                                    const task = getTaskInfo(q);
                                    const reward = getQuestReward(q);
                                    const enrolled = q.userStatus?.enrolledAt ? "✅" : "⏳";
                                    return (
                                        <option key={q.id} value={q.id}>
                                            {enrolled} {getQuestName(q)} [{task.name || "UNKNOWN"}] ({reward.name})
                                        </option>
                                    );
                                })}
                            </select>
                        </div>
                        <div style={{ width: "240px" }}>
                            <label className="vc-quest-debug-label">Filter JSON Keys / Content:</label>
                            <input
                                type="text"
                                placeholder="e.g. taskConfig, rewards..."
                                value={jsonSearchQuery}
                                onChange={e => setJsonSearchQuery(e.target.value)}
                                className="vc-quest-debug-input"
                            />
                        </div>
                    </div>

                    {selectedQuest && (
                        <div className="vc-quest-debug-meta-box">
                            <div><strong>ID:</strong> <code>{selectedQuest.id}</code></div>
                            <div><strong>App ID:</strong> <code>{selectedQuest.config.application?.id || "None"}</code></div>
                            <div><strong>Expires:</strong> {selectedQuest.config.expiresAt ? new Date(selectedQuest.config.expiresAt).toLocaleString() : "Unknown"}</div>
                            <div><strong>Targeted:</strong> {selectedQuest.isTargeted ?? selectedQuest.is_targeted ? "Yes" : "No"}</div>
                            <div><strong>Status:</strong> {selectedQuest.userStatus?.completedAt ? "Completed" : selectedQuest.userStatus?.enrolledAt ? "Enrolled" : "Unenrolled"}</div>
                        </div>
                    )}

                    <div className="vc-quest-debug-toolbar">
                        <ButtonCompat
                            size={ButtonCompat.Sizes.SMALL}
                            color={ButtonCompat.Colors.BRAND}
                            onClick={() => copyToClipboard(JSON.stringify(selectedQuest, null, 2), "Full Quest JSON")}
                        >
                            📋 Copy Full JSON
                        </ButtonCompat>
                        <ButtonCompat
                            size={ButtonCompat.Sizes.SMALL}
                            color={ButtonCompat.Colors.PRIMARY}
                            onClick={() => copyToClipboard(JSON.stringify(selectedQuest?.config?.taskConfig || selectedQuest?.config?.taskConfigV2 || {}, null, 2), "Task Config")}
                        >
                            📋 Copy TaskConfig
                        </ButtonCompat>
                        <ButtonCompat
                            size={ButtonCompat.Sizes.SMALL}
                            color={ButtonCompat.Colors.PRIMARY}
                            onClick={() => copyToClipboard(JSON.stringify(selectedQuest?.config?.rewards || (selectedQuest?.config as any)?.rewardsConfig || [], null, 2), "Rewards Config")}
                        >
                            📋 Copy Rewards
                        </ButtonCompat>
                        <ButtonCompat
                            size={ButtonCompat.Sizes.SMALL}
                            color={ButtonCompat.Colors.PRIMARY}
                            onClick={() => copyToClipboard(JSON.stringify(selectedQuest?.userStatus || {}, null, 2), "User Status")}
                        >
                            📋 Copy UserStatus
                        </ButtonCompat>
                    </div>

                    <pre className="vc-quest-debug-json-pre">
                        <code>{formattedQuestJson}</code>
                    </pre>
                </div>
            )}

            {/* TAB 2: LIVE API PROBER */}
            {subTab === "probe" && (
                <div className="vc-quest-debug-tab-content">
                    <p style={{ color: "var(--text-muted, #b5bac1)", fontSize: "13px", margin: "0 0 14px 0" }}>
                        Directly query Discord's internal Quest endpoints using your active authentication session to test for schema modifications or API errors.
                    </p>
                    <div className="vc-quest-debug-probe-buttons">
                        <ButtonCompat
                            color={ButtonCompat.Colors.BRAND}
                            onClick={() => runProbe("/quests/@me")}
                            disabled={probeLoading}
                        >
                            📡 GET /quests/@me
                        </ButtonCompat>
                        {selectedQuest && (
                            <>
                                <ButtonCompat
                                    color={ButtonCompat.Colors.PRIMARY}
                                    onClick={() => {
                                        setProbeResult({
                                            url: `/quests/${selectedQuest.id}/enroll (Payload Preview)`,
                                            status: 200,
                                            data: {
                                                method: "POST",
                                                url: `/quests/${selectedQuest.id}/enroll`,
                                                payload: {
                                                    location: 11,
                                                    platform: 0,
                                                    is_targeted: selectedQuest.isTargeted ?? selectedQuest.is_targeted ?? false,
                                                    traffic_metadata_sealed: selectedQuest.trafficMetadata ?? selectedQuest.traffic_metadata_sealed ?? null
                                                }
                                            }
                                        });
                                    }}
                                >
                                    🔍 Preview Enroll Payload ({getQuestName(selectedQuest)})
                                </ButtonCompat>
                                <ButtonCompat
                                    color={ButtonCompat.Colors.PRIMARY}
                                    onClick={() => {
                                        setProbeResult({
                                            url: `/quests/${selectedQuest.id}/claim-reward (Payload Preview)`,
                                            status: 200,
                                            data: {
                                                method: "POST",
                                                url: `/quests/${selectedQuest.id}/claim-reward`,
                                                payload: {
                                                    platform: 0,
                                                    location: 11,
                                                    is_targeted: selectedQuest.isTargeted ?? selectedQuest.is_targeted ?? false,
                                                    metadata_sealed: null,
                                                    traffic_metadata_sealed: selectedQuest.trafficMetadata ?? selectedQuest.traffic_metadata_sealed ?? null
                                                }
                                            }
                                        });
                                    }}
                                >
                                    🎁 Preview Claim Payload ({getQuestName(selectedQuest)})
                                </ButtonCompat>
                            </>
                        )}
                    </div>

                    {probeLoading && (
                        <div style={{ textAlign: "center", padding: "20px", color: "var(--text-muted, #b5bac1)" }}>
                            Querying Discord API... ⏳
                        </div>
                    )}

                    {probeResult && !probeLoading && (
                        <div className="vc-quest-debug-probe-card">
                            <div className="vc-quest-debug-probe-card-header">
                                <div>
                                    <span className={`vc-quest-debug-badge ${probeResult.error ? "err" : "ok"}`}>
                                        HTTP {probeResult.status || 200}
                                    </span>
                                    <strong style={{ marginLeft: "10px", color: "var(--header-primary, #ffffff)" }}>{probeResult.url}</strong>
                                    {probeResult.timeMs != null && (
                                        <span style={{ marginLeft: "8px", fontSize: "12px", color: "var(--text-muted, #949ba4)" }}>
                                            ({probeResult.timeMs}ms)
                                        </span>
                                    )}
                                </div>
                                <ButtonCompat
                                    size={ButtonCompat.Sizes.MIN}
                                    color={ButtonCompat.Colors.PRIMARY}
                                    onClick={() => copyToClipboard(JSON.stringify(probeResult.data, null, 2), "Probe Response")}
                                >
                                    📋 Copy
                                </ButtonCompat>
                            </div>
                            <pre className="vc-quest-debug-json-pre" style={{ maxHeight: "300px" }}>
                                <code>{JSON.stringify(probeResult.data, null, 2)}</code>
                            </pre>
                        </div>
                    )}
                </div>
            )}

            {/* TAB 3: STORES INSPECTOR */}
            {subTab === "stores" && (
                <div className="vc-quest-debug-tab-content">
                    <div className="vc-quest-stats-grid" style={{ marginBottom: "16px" }}>
                        <div className="vc-quest-stat-card">
                            <span className="vc-quest-stat-label">Running Games</span>
                            <div className="vc-quest-stat-val" style={{ fontSize: "16px", color: "var(--header-primary, #ffffff)" }}>
                                {storeDiagnostics.runningGames.length > 0
                                    ? storeDiagnostics.runningGames.map((g: any) => g.name).join(", ")
                                    : "None detected"}
                            </div>
                        </div>
                        <div className="vc-quest-stat-card">
                            <span className="vc-quest-stat-label">Active Stream</span>
                            <div className="vc-quest-stat-val" style={{ fontSize: "16px", color: "var(--header-primary, #ffffff)" }}>
                                {storeDiagnostics.isStreaming ? "Streaming active" : "None"}
                            </div>
                        </div>
                        <div className="vc-quest-stat-card">
                            <span className="vc-quest-stat-label">Idle / AFK Status</span>
                            <div className="vc-quest-stat-val" style={{ fontSize: "16px", color: storeDiagnostics.isIdle ? "#f0b232" : "#23a559" }}>
                                {storeDiagnostics.isIdle ? `Idle since ${storeDiagnostics.idleSince}` : "Active (Not Idle)"}
                            </div>
                        </div>
                        <div className="vc-quest-stat-card">
                            <span className="vc-quest-stat-label">QuestActions</span>
                            <div className="vc-quest-stat-val" style={{ fontSize: "13px", color: "var(--header-primary, #ffffff)", wordBreak: "break-all" }}>
                                {storeDiagnostics.questActionMethods.length > 0
                                    ? storeDiagnostics.questActionMethods.join(", ")
                                    : "No actions found"}
                            </div>
                        </div>
                    </div>

                    <div className="vc-quest-panel">
                        <div className="vc-quest-panel-title">
                            <span>QuestsStore Raw Breakdown</span>
                            <ButtonCompat
                                size={ButtonCompat.Sizes.MIN}
                                color={ButtonCompat.Colors.PRIMARY}
                                onClick={() => copyToClipboard(JSON.stringify(QuestsStore?.quests ? Array.from(QuestsStore.quests.entries()) : {}, null, 2), "QuestsStore entries")}
                            >
                                📋 Copy QuestsStore Map
                            </ButtonCompat>
                        </div>
                        <pre className="vc-quest-debug-json-pre" style={{ maxHeight: "250px" }}>
                            <code>
                                {JSON.stringify({
                                    loaded: storeDiagnostics.questsStoreLoaded,
                                    questCount: storeDiagnostics.questsStoreCount,
                                    claimedCount: storeDiagnostics.claimedQuestsCount,
                                    detectedKeys: storeDiagnostics.questsStoreKeys,
                                    questActions: storeDiagnostics.questActionMethods
                                }, null, 2)}
                            </code>
                        </pre>
                    </div>
                </div>
            )}

            {/* TAB 4: LIVE CONSOLE LOGS */}
            {subTab === "logs" && (
                <div className="vc-quest-debug-tab-content">
                    <div className="vc-quest-debug-toolbar" style={{ justifyContent: "space-between", alignItems: "center", flexWrap: "wrap" }}>
                        <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" }}>
                            <span style={{ fontSize: "12px", color: "var(--text-muted, #b5bac1)" }}>Level:</span>
                            {(["all", "info", "success", "warn", "error"] as const).map(lvl => (
                                <button
                                    key={lvl}
                                    className={`vc-quest-chip ${logFilter === lvl ? "active" : ""}`}
                                    onClick={() => setLogFilter(lvl)}
                                    style={{ padding: "4px 10px", fontSize: "11px" }}
                                >
                                    {lvl.toUpperCase()}
                                </button>
                            ))}
                        </div>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                            <input
                                type="text"
                                placeholder="Search logs..."
                                value={logSearch}
                                onChange={e => setLogSearch(e.target.value)}
                                className="vc-quest-debug-input"
                                style={{ width: "160px" }}
                            />
                            <ButtonCompat
                                size={ButtonCompat.Sizes.MIN}
                                color={ButtonCompat.Colors.PRIMARY}
                                onClick={() => copyToClipboard(debugLogs.map(l => `[${l.time}] [${l.type.toUpperCase()}] ${l.msg}`).join("\n"), "Logs")}
                            >
                                📋 Copy
                            </ButtonCompat>
                            <ButtonCompat
                                size={ButtonCompat.Sizes.MIN}
                                color={ButtonCompat.Colors.RED}
                                onClick={() => clearDebugLogs()}
                            >
                                🗑️ Clear
                            </ButtonCompat>
                        </div>
                    </div>

                    <div className="vc-quest-debug-log-list">
                        {filteredLogs.length === 0 ? (
                            <div className="vc-quest-empty-state" style={{ padding: "30px" }}>
                                <span>No logs recorded for current filter.</span>
                            </div>
                        ) : (
                            filteredLogs.map(item => (
                                <div key={item.id} className={`vc-quest-debug-log-item log-${item.type}`}>
                                    <span className="vc-quest-debug-log-time">{item.time}</span>
                                    <span className={`vc-quest-debug-log-badge log-${item.type}`}>
                                        {item.type.toUpperCase()}
                                    </span>
                                    <span className="vc-quest-debug-log-msg">{item.msg}</span>
                                </div>
                            ))
                        )}
                    </div>
                </div>
            )}

            {/* TAB 5: EXPRESSVPN MCP */}
            {subTab === "vpn" && (
                <div className="vc-quest-debug-tab-content">
                    <p style={{ color: "var(--text-muted, #b5bac1)", fontSize: "13px", margin: "0 0 14px 0" }}>
                        Interact with the local ExpressVPN Model Context Protocol (MCP) server to inspect connection states, switch server locations, and run regional bypass scans.
                    </p>

                    {/* Rate Limit Warning Banner if active */}
                    {isCurrentlyRateLimited() && (
                        <div style={{ backgroundColor: "#3a2a14", border: "1px solid #f9e2af", borderRadius: "8px", padding: "10px 14px", marginBottom: "14px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                            <span style={{ color: "#f9e2af", fontSize: "13px" }}>
                                ⏳ <strong>Discord REST Rate Limit Active:</strong> Pausing quest enrollment for ~{getRemainingRateLimitSec()}s to protect your account.
                            </span>
                        </div>
                    )}

                    {/* Active Configuration Overview Card */}
                    <div className="vc-quest-debug-probe-card" style={{ marginBottom: "14px" }}>
                        <div className="vc-quest-debug-probe-card-header">
                            <span style={{ fontWeight: 600, color: "var(--text-normal, #dbdee1)" }}>
                                ⚙️ VPN Scanner Configuration
                            </span>
                            <span className={`vc-quest-debug-badge ${settings.store.enableVpnScanner ? "ok" : "idle"}`}>
                                {settings.store.enableVpnScanner ? "Scanner Active" : "Scanner Disabled"}
                            </span>
                        </div>
                        <div className="vc-quest-debug-meta-box" style={{ margin: 0 }}>
                            <div className="vc-quest-debug-meta-row">
                                <strong>MCP URL:</strong>
                                <code>{settings.store.vpnMcpUrl || "Not configured"}</code>
                            </div>
                            <div className="vc-quest-debug-meta-row" style={{ alignItems: "center" }}>
                                <strong>Target Regions:</strong>
                                <span style={{ flex: 1 }}>{targetRegionsStr || "None"}</span>
                                <ButtonCompat
                                    size={ButtonCompat.Sizes.MIN}
                                    color={ButtonCompat.Colors.BRAND}
                                    onClick={openRegionPickerModal}
                                    style={{ marginLeft: "8px" }}
                                >
                                    🗺️ Checklist
                                </ButtonCompat>
                            </div>
                            <div className="vc-quest-debug-meta-row">
                                <strong>Scan Interval:</strong>
                                <span>Every {settings.store.scanIntervalHours || 4} hour(s)</span>
                            </div>
                            <div className="vc-quest-debug-meta-row">
                                <strong>Cooldown Delay:</strong>
                                <span>{settings.store.vpnCooldownSec || 6} seconds per region</span>
                            </div>
                            <div className="vc-quest-debug-meta-row">
                                <strong>Post-Scan Behavior:</strong>
                                <span>{settings.store.vpnDisconnectAfterScan ? "Restore Previous / Disconnect" : "Stay on Last Region"}</span>
                            </div>
                        </div>
                    </div>

                    {/* Live MCP Diagnostics Card */}
                    <div className="vc-quest-debug-probe-card" style={{ marginBottom: "14px" }}>
                        <div className="vc-quest-debug-probe-card-header">
                            <span style={{ fontWeight: 600, color: "var(--text-normal, #dbdee1)" }}>
                                🛡️ ExpressVPN MCP Live State
                            </span>
                            <div style={{ display: "flex", gap: "8px", flexWrap: "wrap", alignItems: "center" }}>
                                <ButtonCompat
                                    size={ButtonCompat.Sizes.SMALL}
                                    color={ButtonCompat.Colors.BRAND}
                                    onClick={testVpn}
                                    disabled={vpnLoading}
                                >
                                    {vpnLoading ? "Connecting..." : "⚡ Test Connection"}
                                </ButtonCompat>
                                <ButtonCompat
                                    size={ButtonCompat.Sizes.SMALL}
                                    color={ButtonCompat.Colors.PRIMARY}
                                    onClick={fetchVpnRegions}
                                    disabled={vpnLoading}
                                >
                                    🗺️ Get Regions ({vpnRegions.length})
                                </ButtonCompat>
                                <ButtonCompat
                                    size={ButtonCompat.Sizes.SMALL}
                                    color={ButtonCompat.Colors.RED}
                                    onClick={disconnectVpn}
                                    disabled={vpnLoading}
                                >
                                    🔌 Disconnect
                                </ButtonCompat>
                            </div>
                        </div>

                        <div className="vc-quest-debug-meta-box" style={{ margin: 0 }}>
                            <div className="vc-quest-debug-meta-row">
                                <strong>Connection State:</strong>
                                <span className={`vc-quest-debug-badge ${vpnStatus?.state?.toLowerCase() === "connected" ? "ok" : "err"}`}>
                                    {vpnStatus?.state || (vpnStatus?.tested ? "Disconnected" : "Untested")}
                                </span>
                            </div>
                            <div className="vc-quest-debug-meta-row">
                                <strong>Current Region:</strong>
                                <span>{vpnStatus?.region || "None / Inactive"}</span>
                            </div>
                            {vpnStatus?.error && (
                                <div className="vc-quest-debug-meta-row">
                                    <strong>Last Error:</strong>
                                    <span style={{ color: "#f38ba8" }}>{vpnStatus.error}</span>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Manual Region Switcher & Scan Card */}
                    <div className="vc-quest-debug-probe-card" style={{ marginBottom: "14px" }}>
                        <span style={{ fontWeight: 600, color: "var(--text-normal, #dbdee1)" }}>
                            🌐 Manual Actions & Regional Scan
                        </span>

                        <div className="vc-quest-debug-row" style={{ alignItems: "flex-end", gap: "10px", flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: "200px" }}>
                                <label className="vc-quest-debug-label">Connect to Specific Region:</label>
                                {vpnRegions.length > 0 ? (
                                    <select
                                        className="vc-quest-debug-select"
                                        value={selectedVpnRegion}
                                        onChange={e => setSelectedVpnRegion(e.target.value)}
                                    >
                                        {vpnRegions.map(r => (
                                            <option key={r} value={r}>{r}</option>
                                        ))}
                                    </select>
                                ) : (
                                    <input
                                        className="vc-quest-debug-input"
                                        placeholder="e.g. smart, usa-new-york, germany-frankfurt-1"
                                        value={selectedVpnRegion}
                                        onChange={e => setSelectedVpnRegion(e.target.value)}
                                    />
                                )}
                            </div>
                            <ButtonCompat
                                color={ButtonCompat.Colors.BRAND}
                                onClick={() => connectVpnRegion(selectedVpnRegion)}
                                disabled={vpnLoading || !selectedVpnRegion}
                                style={{ flexShrink: 0 }}
                            >
                                🚀 Connect Region
                            </ButtonCompat>
                        </div>

                        <div style={{ borderTop: "1px solid var(--background-modifier-accent)", paddingTop: "12px", display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "8px" }}>
                            <div>
                                <span style={{ fontWeight: 600, display: "block", color: "var(--text-normal, #dbdee1)" }}>
                                    🌍 Execute Full Target Scan
                                </span>
                                <span style={{ fontSize: "12px", color: "var(--text-muted, #b5bac1)" }}>
                                    Iterates through: {settings.store.vpnTargetRegions || "smart"}
                                </span>
                            </div>
                            <div style={{ display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap", justifyContent: "flex-end" }}>
                                {(getVpnScannerState().isScanning || vpnScanRunning) && (
                                    <ButtonCompat
                                        size={ButtonCompat.Sizes.SMALL}
                                        color={ButtonCompat.Colors.RED}
                                        onClick={() => {
                                            resetScannerLock();
                                            setVpnScanRunning(false);
                                            showToast({ text: "Scanner lock reset 🔓", variant: "success" });
                                        }}
                                    >
                                        🔓 Reset Lock
                                    </ButtonCompat>
                                )}
                                {failedEnrollmentQuestIds.size > 0 && (
                                    <ButtonCompat
                                        size={ButtonCompat.Sizes.SMALL}
                                        color={ButtonCompat.Colors.PRIMARY}
                                        onClick={() => {
                                            clearFailedEnrollmentCache();
                                            showToast({ text: "Cleared failed quest blacklist", variant: "success" });
                                        }}
                                    >
                                        🧹 Clear Blacklist ({failedEnrollmentQuestIds.size})
                                    </ButtonCompat>
                                )}
                                <ButtonCompat
                                    color={ButtonCompat.Colors.GREEN}
                                    onClick={triggerVpnScan}
                                    disabled={vpnScanRunning || vpnLoading}
                                >
                                    {vpnScanRunning ? "🔄 Scanning..." : "▶ Run Scan Now"}
                                </ButtonCompat>
                            </div>
                        </div>
                    </div>

                    {/* Raw VPN Status Output */}
                    {vpnStatus?.statusText && (
                        <div className="vc-quest-debug-probe-card">
                            <div className="vc-quest-debug-probe-card-header">
                                <span style={{ fontWeight: 600, color: "var(--text-normal, #dbdee1)" }}>
                                    📜 Raw Status Output
                                </span>
                                <ButtonCompat
                                    size={ButtonCompat.Sizes.MIN}
                                    color={ButtonCompat.Colors.PRIMARY}
                                    onClick={() => copyToClipboard(vpnStatus.statusText!, "Status")}
                                >
                                    📋 Copy
                                </ButtonCompat>
                            </div>
                            <pre className="vc-quest-debug-json-pre">
                                <code>{vpnStatus.statusText}</code>
                            </pre>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}
