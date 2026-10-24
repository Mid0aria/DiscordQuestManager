/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { RestAPI, SelectedChannelStore } from "@webpack/common";

import { enroll, getQuestName, getTaskInfo, isQuestCompleted, isQuestEnrolled, isQuestExpired, isQuestValidForEnrollment, sortQuests } from "../api/questApi";
import { vpnClient } from "../api/vpnClient";
import { settings } from "../settings";
import { Quest } from "../types";
import { AppState, debugLog, getRemainingRateLimitSec, isCurrentlyRateLimited, isRunning, log, sleep } from "./state";
import { IdleStore, QuestActions, QuestsStore, RunningGameStore, StreamingStore } from "./stores";
import { isOutsideScheduledHours, isUserStatusDisallowed, runWorker } from "./worker";

export interface RegionScanSummary {
    region: string;
    found: number;
    enrolled: number;
    error?: string;
}

export interface VpnScannerState {
    isScanning: boolean;
    currentRegion: string | null;
    lastScanTime: number | null;
    lastResults: RegionScanSummary[];
}

let isScanning = false;
let currentRegion: string | null = null;
let lastScanTime: number | null = null;
let lastResults: RegionScanSummary[] = [];
let scanIntervalTimer: any = null;

export function getVpnScannerState(): VpnScannerState {
    return {
        isScanning,
        currentRegion,
        lastScanTime,
        lastResults
    };
}

function hasConflict(): { conflict: boolean; reason?: string } {
    if (settings.store.pauseWhileInVoice && SelectedChannelStore?.getVoiceChannelId()) {
        return { conflict: true, reason: "User is in a voice channel." };
    }

    if (settings.store.pauseOnGameConflict) {
        const realGames = RunningGameStore?.getRunningGames?.() || [];
        const hasRealGame = realGames.some((g: any) => g.pid !== 1337 && g.id !== AppState.currentQuest?.config?.application?.id);
        if (hasRealGame) return { conflict: true, reason: "A real game is currently running." };

        const isStreaming = StreamingStore?.getCurrentUserActiveStream?.() != null;
        if (isStreaming) return { conflict: true, reason: "User is currently streaming." };
    }

    if (settings.store.runOnlyWhenIdle) {
        if (IdleStore && typeof IdleStore.isIdle === "function" && !IdleStore.isIdle()) {
            return { conflict: true, reason: "Discord is not idle / AFK." };
        }
    }

    if (isOutsideScheduledHours()) {
        return { conflict: true, reason: "Outside scheduled active hours." };
    }

    if (isUserStatusDisallowed()) {
        return { conflict: true, reason: "Discord status is Offline / Invisible." };
    }

    return { conflict: false };
}

/**
 * Processes newly fetched quests from Discord /quests/@me:
 * 1. Skips expired quests completely.
 * 2. Caches non-expired quests into Discord's QuestsStore.
 * 3. Checks if quest is unenrolled and valid for enrollment.
 * 4. Auto-enrolls if enabled, observing rate-limits and adding delays.
 */
const enrolledQuestIds = new Set<string>();

async function processDiscoveredQuests(
    fetchedQuests: Quest[],
    sourceLabel: string,
    isVpn = false
): Promise<{ found: number; enrolled: number }> {
    if (isCurrentlyRateLimited()) {
        log(`⚠️ [Quest Scanner] Skipping enrollment: Discord REST rate limit is active.`, "warn", true);
        return { found: 0, enrolled: 0 };
    }

    let found = 0;
    let enrolled = 0;

    for (const q of fetchedQuests) {
        // Discard expired quests immediately - never try to enroll ended campaigns!
        if (isQuestExpired(q)) continue;

        if (isQuestCompleted(q)) continue;

        const isAlreadyQueued = AppState.queue.some(queued => queued.id === q.id);
        if (isQuestEnrolled(q) || isAlreadyQueued || enrolledQuestIds.has(q.id)) continue;

        // Check if valid according to user settings and task eligibility
        if (!isQuestValidForEnrollment(q)) continue;

        found++;

        if (settings.store.autoEnrollNewQuests) {
            if (isCurrentlyRateLimited()) {
                log(`⚠️ [Quest Scanner] Skipping enrollment: Discord REST rate limit is active.`, "warn", true);
                break;
            }

            const prefix = isVpn ? "🌍 [VPN Scanner]" : "🎯 [Quest Scanner]";
            log(`${prefix} Discovered new quest: "${getQuestName(q)}" (${sourceLabel})! Enrolling...`, "info", true);

            const ok = await enroll(q);
            if (ok) {
                enrolled++;
                enrolledQuestIds.add(q.id);
                const questToQueue = QuestsStore?.quests?.get(q.id) ?? q;
                if (!AppState.queue.some(queued => queued.id === q.id)) {
                    AppState.queue.push(questToQueue);
                }
            } else if (isCurrentlyRateLimited()) {
                log(`⚠️ [Quest Scanner] Enrollment paused: Hit Discord rate limit (429).`, "warn", true);
                break;
            }

            // Throttle between consecutive enrollments to prevent Discord 429 rate limits
            const throttleSec = Math.max(1, settings.store.enrollThrottleSec ?? 3);
            await sleep(throttleSec * 1000);
        }
    }

    return { found, enrolled };
}

/**
 * Scans Discord quests on the current active connection (100% independent of VPN).
 */
export async function scanLocalQuests(): Promise<{ found: number; enrolled: number }> {
    debugLog("[Quest Scanner] Scanning local connection for new Discord quests...");
    try {
        const res = await Promise.race([
            RestAPI.get({ url: "/quests/@me" }),
            new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout querying /quests/@me (10s)")), 10000))
        ]);
        const fetchedQuests: Quest[] = res?.body?.quests || [];
        const result = await processDiscoveredQuests(fetchedQuests, "Local Connection", false);

        if (QuestActions && typeof QuestActions.fetchQuests === "function") {
            try {
                QuestActions.fetchQuests();
            } catch {
                // ignore
            }
        }
        return result;
    } catch (e: any) {
        log(`❌ [Quest Scanner] Error querying /quests/@me: ${e?.message || String(e)}`, "error");
        return { found: 0, enrolled: 0 };
    }
}

/**
 * Main scanner function:
 * 1. Checks conflict safeguards.
 * 2. Runs local scan (VPN-independent).
 * 3. If enableVpnScanner is true, additionally cycles through selected ExpressVPN regions.
 * 4. Automatically triggers the worker to complete newly enrolled quests if autoStartOnNewQuests is enabled.
 */
export async function scanRegionsNow(options: { manual?: boolean; vpnOnly?: boolean } = {}): Promise<{
    ok: boolean;
    totalEnrolled: number;
    totalFound: number;
    error?: string;
}> {
    if (isScanning) {
        const msg = `Quest scanner is already actively running (${currentRegion || "switching"}).`;
        log(msg, "warn", !!options.manual);
        return { ok: false, totalEnrolled: 0, totalFound: 0, error: msg };
    }

    if (isCurrentlyRateLimited()) {
        const sec = getRemainingRateLimitSec();
        const mins = Math.ceil(sec / 60);
        const timeStr = sec > 60 ? `~${mins} min (${sec}s)` : `${sec}s`;
        const msg = `Quest scan skipped: Discord enrollment rate limit is active (${timeStr} remaining).`;
        log(msg, "warn", !!options.manual);
        return { ok: false, totalEnrolled: 0, totalFound: 0, error: msg };
    }

    if (!options.manual) {
        const conflict = hasConflict();
        if (conflict.conflict) {
            debugLog(`[Quest Scanner] Scan skipped due to conflict: ${conflict.reason}`);
            return { ok: false, totalEnrolled: 0, totalFound: 0, error: conflict.reason };
        }
    }

    isScanning = true;
    lastResults = [];
    let totalEnrolled = 0;
    let totalFound = 0;
    let vpnConnectedDuringScan = false;

    try {
        // Step 1: Scan local connection (unless explicitly vpnOnly)
        if (!options.vpnOnly) {
            currentRegion = "Local Connection";
            log("🔍 [Quest Scanner] Checking for new quests on local connection...", "info", !!options.manual);
            const localRes = await scanLocalQuests();
            totalFound += localRes.found;
            totalEnrolled += localRes.enrolled;
            lastResults.push({
                region: "Local Connection",
                found: localRes.found,
                enrolled: localRes.enrolled
            });
        }

        // Step 2: ExpressVPN Multi-Country Geo-Bypass Scan (Optional Add-on)
        const vpnActive = settings.store.enableVpnScanner || options.vpnOnly;
        if (vpnActive) {
            if (isCurrentlyRateLimited()) {
                const sec = getRemainingRateLimitSec();
                const mins = Math.ceil(sec / 60);
                const timeStr = sec > 60 ? `~${mins} min (${sec}s)` : `${sec}s`;
                log(`⚠️ [VPN Scanner] Skipping VPN scan: Discord rate limit is active (${timeStr} remaining).`, "warn", true);
            } else {
                currentRegion = "ExpressVPN Check";
                const rawTargetRegions = settings.store.vpnTargetRegions || "smart";
                const regions = rawTargetRegions
                    .split(",")
                    .map(r => r.trim())
                    .filter(Boolean);

                if (regions.length > 0) {
                    // Pre-flight check: Is ExpressVPN MCP server running and reachable?
                    log(`🌍 [VPN Scanner] Checking ExpressVPN MCP connection...`, "info", !!options.manual);
                    const vpnTest = await vpnClient.testConnection();

                    if (!vpnTest.ok) {
                        log(`⚠️ [VPN Scanner] ExpressVPN MCP server unreachable (${vpnTest.error || "Connection failed"}). Skipping VPN scan.`, "warn", true);
                    } else {
                        log(`🌍 [VPN Scanner] ExpressVPN MCP active. Scanning across ${regions.length} selected region(s)...`, "info", !!options.manual);

                        let initialVpnState = vpnTest.state || "Disconnected";
                        let initialVpnRegion = vpnTest.region || "";

                        for (const region of regions) {
                            if (isCurrentlyRateLimited()) {
                                const sec = getRemainingRateLimitSec();
                                const mins = Math.ceil(sec / 60);
                                const timeStr = sec > 60 ? `~${mins} min (${sec}s)` : `${sec}s`;
                                log(`⚠️ [VPN Scanner] Aborting scan across remaining regions: Discord rate limit is active (${timeStr} remaining).`, "warn", true);
                                break;
                            }

                            currentRegion = region;
                            log(`🌍 [VPN Scanner] Connecting to ExpressVPN region: '${region}'...`, "info");

                            const regionSummary: RegionScanSummary = {
                                region,
                                found: 0,
                                enrolled: 0
                            };

                        try {
                            const connectTimeout = Math.max(10, settings.store.vpnConnectTimeoutSec ?? 25);
                            await vpnClient.connect(region, connectTimeout);
                            vpnConnectedDuringScan = true;

                            const cooldownSec = Math.max(2, settings.store.vpnCooldownSec ?? 10);
                            debugLog(`[VPN Scanner] Waiting ${cooldownSec}s cooldown for IP propagation...`);
                            await sleep(cooldownSec * 1000);

                            debugLog(`[VPN Scanner] Querying Discord /quests/@me from region '${region}'...`);
                            const res = await Promise.race([
                                RestAPI.get({ url: "/quests/@me" }),
                                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout querying /quests/@me (10s)")), 10000))
                            ]);
                            const fetchedQuests: Quest[] = res?.body?.quests || [];
                            const regRes = await processDiscoveredQuests(fetchedQuests, region, true);
                            regionSummary.found = regRes.found;
                            regionSummary.enrolled = regRes.enrolled;
                            totalFound += regRes.found;
                            totalEnrolled += regRes.enrolled;

                            if (QuestActions && typeof QuestActions.fetchQuests === "function") {
                                try {
                                    QuestActions.fetchQuests();
                                } catch {
                                    // ignore
                                }
                            }

                            if (isCurrentlyRateLimited()) {
                                const sec = getRemainingRateLimitSec();
                                const mins = Math.ceil(sec / 60);
                                const timeStr = sec > 60 ? `~${mins} min (${sec}s)` : `${sec}s`;
                                log(`⚠️ [VPN Scanner] Discord rate limit triggered. Aborting remaining regions (${timeStr} remaining).`, "warn", true);
                                lastResults.push(regionSummary);
                                break;
                            }
                        } catch (err: any) {
                            const errMsg = err?.message || String(err);
                            regionSummary.error = errMsg;
                            log(`❌ [VPN Scanner] Error scanning region '${region}': ${errMsg}`, "error");
                        }

                        lastResults.push(regionSummary);
                    }

                    // Restore previous VPN state or disconnect
                    if (settings.store.vpnDisconnectAfterScan) {
                        const restoreTimeout = Math.max(10, settings.store.vpnConnectTimeoutSec ?? 25);
                        if (initialVpnState.toLowerCase() === "connected" && initialVpnRegion) {
                            log(`🌍 [VPN Scanner] Restoring original ExpressVPN region: '${initialVpnRegion}'...`, "info");
                            try {
                                await vpnClient.connect(initialVpnRegion, restoreTimeout);
                            } catch (e) {
                                debugLog("[VPN Scanner] Failed to restore original VPN region:", e);
                            }
                        } else {
                            log("🌍 [VPN Scanner] Disconnecting ExpressVPN tunnel...", "info");
                            try {
                                await vpnClient.disconnect(restoreTimeout);
                            } catch (e) {
                                debugLog("[VPN Scanner] Failed to disconnect VPN:", e);
                            }
                        }
                        vpnConnectedDuringScan = false;
                    }
                }
            }
        }
    }

        if (AppState.queue.length > 0) {
            AppState.queue = sortQuests(AppState.queue);
        }

        lastScanTime = Date.now();

        if (totalEnrolled > 0) {
            log(`🎉 [Quest Scanner] Scan completed! Enrolled in ${totalEnrolled} new quest(s).`, "success", true);
            if (settings.store.autoStartOnNewQuests && !AppState.activeWorker && isRunning) {
                log("🚀 [Quest Scanner] Automatically starting quest worker to complete quests...", "info");
                runWorker();
            }
        } else {
            log(`🔍 [Quest Scanner] Scan completed. No new quests discovered.`, "info", !!options.manual);
        }

        return {
            ok: true,
            totalEnrolled,
            totalFound
        };
    } catch (fatalErr: any) {
        const msg = fatalErr?.message || String(fatalErr);
        log(`❌ [Quest Scanner] Fatal scan error: ${msg}`, "error", true);
        return {
            ok: false,
            totalEnrolled,
            totalFound,
            error: msg
        };
    } finally {
        if (vpnConnectedDuringScan && settings.store.vpnDisconnectAfterScan) {
            try {
                log("🛡️ [VPN Killswitch] Executing fail-safe disconnect...", "warn");
                await Promise.race([
                    vpnClient.disconnect(10),
                    new Promise(r => setTimeout(r, 12000))
                ]);
            } catch (killErr) {
                debugLog("[VPN Killswitch] Fail-safe disconnect error:", killErr);
            }
        }
        isScanning = false;
        currentRegion = null;
    }
}

export function startVpnScanner(): void {
    stopVpnScanner();

    if (!settings.store.autoScanNewQuests) {
        debugLog("[Quest Scanner] Auto-scanner is disabled in settings.");
        return;
    }

    const hours = Math.max(1, settings.store.scanIntervalHours || 4);
    const intervalMs = hours * 60 * 60 * 1000;

    debugLog(`[Quest Scanner] Scheduled background quest scan every ${hours} hours.`);

    // Delay initial scan to let Discord and plugins settle (configurable)
    const initialDelaySec = Math.max(5, settings.store.initialScanDelaySec ?? 20);
    setTimeout(() => {
        if (settings.store.autoScanNewQuests && isRunning) {
            scanRegionsNow();
        }
    }, initialDelaySec * 1000);

    scanIntervalTimer = setInterval(() => {
        if (settings.store.autoScanNewQuests && isRunning) {
            scanRegionsNow();
        }
    }, intervalMs);
}

export function resetScannerLock(): void {
    isScanning = false;
    currentRegion = null;
    log("🔄 Quest scanner state lock has been reset.", "info", true);
}

export function stopVpnScanner(): void {
    if (scanIntervalTimer) {
        clearInterval(scanIntervalTimer);
        scanIntervalTimer = null;
    }
    isScanning = false;
    currentRegion = null;
}

export const startQuestScanner = startVpnScanner;
export const stopQuestScanner = stopVpnScanner;
