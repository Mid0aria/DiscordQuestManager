/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { ButtonCompat } from "@components/Button";
import { React, showToast, useState } from "@webpack/common";

import { settings } from "../settings";
import { openRegionPickerModal } from "./RegionPickerModal";

export function SettingsView() {
    // Local state to trigger reactive re-render when settings.store properties update
    const [_, setRenderTick] = useState(0);
    const rerender = () => setRenderTick(t => t + 1);

    const store = settings.store;

    const setBoolean = (key: keyof typeof settings.store, val: boolean) => {
        (store as any)[key] = val;
        rerender();
    };

    const setNumber = (key: keyof typeof settings.store, val: number) => {
        (store as any)[key] = val;
        rerender();
    };

    const setString = (key: keyof typeof settings.store, val: string) => {
        (store as any)[key] = val;
        rerender();
    };

    const [vpnUrlDraft, setVpnUrlDraft] = useState(() => store.vpnMcpUrl || "");

    const handleSaveVpnUrl = () => {
        store.vpnMcpUrl = vpnUrlDraft.trim();
        showToast({ text: "ExpressVPN MCP URL saved successfully! 🌐", variant: "success" });
        rerender();
    };

    const handleResetDefaults = () => {
        store.autoScanNewQuests = true;
        store.scanIntervalHours = 4;
        store.initialScanDelaySec = 20;
        store.enrollThrottleSec = 3;
        store.autoEnrollNewQuests = true;
        store.autoStartOnNewQuests = true;
        store.autoStart = false;

        store.videoSpeed = 7;
        store.delayBetweenQuests = 5;
        store.questSortOrder = "video_first";
        store.randomizeProgress = true;
        store.enableVideoQuests = true;
        store.enableActivityQuests = true;

        store.pauseWhileInVoice = false;
        store.pauseOnGameConflict = true;
        store.runOnlyWhenIdle = false;
        store.autoRequeueFailed = true;

        store.vpnCooldownSec = 10;
        store.vpnConnectTimeoutSec = 25;
        store.vpnDisconnectAfterScan = true;

        store.autoClaimRewards = false;
        store.playCompletionSound = true;
        store.showOverlay = true;
        store.overlayStyle = "standard";
        store.overlayOpacity = 85;
        store.debugMode = false;

        showToast({ text: "Settings reset to recommended defaults! 🔄", variant: "info" });
        rerender();
    };

    return (
        <div className="vc-quest-settings-container">
            {/* Header info bar */}
            <div className="vc-quest-settings-topbar">
                <div>
                    <h3 className="vc-quest-settings-main-title">⚙️ QuestManager Settings</h3>
                    <p className="vc-quest-settings-main-desc">
                        Configure automation rules, enrollment delays, and task behavior directly from this panel.
                    </p>
                </div>
                <ButtonCompat
                    size={ButtonCompat.Sizes.SMALL}
                    color={ButtonCompat.Colors.PRIMARY}
                    look={ButtonCompat.Looks.OUTLINED}
                    onClick={handleResetDefaults}
                    title="Reset all settings to recommended defaults"
                >
                    ↺ Reset Defaults
                </ButtonCompat>
            </div>

            {/* 1. Automation & Enrollment Section */}
            <div className="vc-quest-settings-section">
                <div className="vc-quest-settings-section-header">
                    <span className="vc-quest-settings-section-icon">⚡</span>
                    <div>
                        <h4 className="vc-quest-settings-section-title">Automation & Enrollment Delays</h4>
                        <span className="vc-quest-settings-section-sub">
                            Background quest detection and 429 rate-limit prevention
                        </span>
                    </div>
                </div>

                <div className="vc-quest-settings-card">
                    {/* Enrollment Throttle Delay */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Enrollment Throttle Delay</span>
                            <span className="vc-quest-settings-hint">
                                Delay between consecutive quest enrollments to protect your account against Discord 429 rate limits.
                            </span>
                        </div>
                        <div className="vc-quest-settings-control">
                            <span className="vc-quest-settings-badge-val">
                                {store.enrollThrottleSec ?? 3}s
                            </span>
                            <input
                                type="range"
                                min={1}
                                max={30}
                                step={1}
                                value={store.enrollThrottleSec ?? 3}
                                onChange={e => setNumber("enrollThrottleSec", parseInt(e.target.value, 10))}
                                className="vc-quest-settings-slider"
                            />
                        </div>
                    </div>

                    {/* Auto Enroll */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Auto-Enroll In New Quests</span>
                            <span className="vc-quest-settings-hint">
                                Automatically enroll in newly discovered quests found during scans.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.autoEnrollNewQuests}
                                onChange={e => setBoolean("autoEnrollNewQuests", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Background Quest Scanner */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Background Quest Scanner</span>
                            <span className="vc-quest-settings-hint">
                                Periodically scan Discord for newly released quests in the background.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.autoScanNewQuests}
                                onChange={e => setBoolean("autoScanNewQuests", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Scan Interval Hours */}
                    {store.autoScanNewQuests && (
                        <div className="vc-quest-settings-row">
                            <div className="vc-quest-settings-info">
                                <span className="vc-quest-settings-label">Scan Frequency</span>
                                <span className="vc-quest-settings-hint">
                                    How often the background quest scanner checks for new quests.
                                </span>
                            </div>
                            <div className="vc-quest-settings-control">
                                <span className="vc-quest-settings-badge-val">
                                    Every {store.scanIntervalHours || 4}h
                                </span>
                                <input
                                    type="range"
                                    min={1}
                                    max={24}
                                    step={1}
                                    value={store.scanIntervalHours || 4}
                                    onChange={e => setNumber("scanIntervalHours", parseInt(e.target.value, 10))}
                                    className="vc-quest-settings-slider"
                                />
                            </div>
                        </div>
                    )}

                    {/* Initial Scan Delay */}
                    {store.autoScanNewQuests && (
                        <div className="vc-quest-settings-row">
                            <div className="vc-quest-settings-info">
                                <span className="vc-quest-settings-label">Startup Scan Delay</span>
                                <span className="vc-quest-settings-hint">
                                    Delay before the first background scan runs after Discord starts.
                                </span>
                            </div>
                            <div className="vc-quest-settings-control">
                                <span className="vc-quest-settings-badge-val">
                                    {store.initialScanDelaySec ?? 20}s
                                </span>
                                <input
                                    type="range"
                                    min={5}
                                    max={60}
                                    step={5}
                                    value={store.initialScanDelaySec ?? 20}
                                    onChange={e => setNumber("initialScanDelaySec", parseInt(e.target.value, 10))}
                                    className="vc-quest-settings-slider"
                                />
                            </div>
                        </div>
                    )}

                    {/* Auto-Start on New Quests */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Auto-Start On New Quests</span>
                            <span className="vc-quest-settings-hint">
                                Immediately start processing newly discovered and enrolled quests.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.autoStartOnNewQuests}
                                onChange={e => setBoolean("autoStartOnNewQuests", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Auto-Start On Discord Launch */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Auto-Start On Launch</span>
                            <span className="vc-quest-settings-hint">
                                Automatically begin processing incomplete quests when Discord opens.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.autoStart}
                                onChange={e => setBoolean("autoStart", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>
                </div>
            </div>

            {/* 2. Tasks & Execution Speed Section */}
            <div className="vc-quest-settings-section">
                <div className="vc-quest-settings-section-header">
                    <span className="vc-quest-settings-section-icon">🎮</span>
                    <div>
                        <h4 className="vc-quest-settings-section-title">Task Execution & Speed</h4>
                        <span className="vc-quest-settings-section-sub">
                            Video playback spoofing and game session controls
                        </span>
                    </div>
                </div>

                <div className="vc-quest-settings-card">
                    {/* Video Speed Multiplier */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Video Speed Multiplier</span>
                            <span className="vc-quest-settings-hint">
                                Progress speed for video quests (1x is real-time, 7x-10x is fast & safe).
                            </span>
                        </div>
                        <div className="vc-quest-settings-control">
                            <span className="vc-quest-settings-badge-val brand">
                                {store.videoSpeed || 7}x Speed
                            </span>
                            <input
                                type="range"
                                min={1}
                                max={15}
                                step={1}
                                value={store.videoSpeed || 7}
                                onChange={e => setNumber("videoSpeed", parseInt(e.target.value, 10))}
                                className="vc-quest-settings-slider"
                            />
                        </div>
                    </div>

                    {/* Delay Between Quests */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Delay Between Quests</span>
                            <span className="vc-quest-settings-hint">
                                Pause duration (seconds) before starting the next queued quest.
                            </span>
                        </div>
                        <div className="vc-quest-settings-control">
                            <span className="vc-quest-settings-badge-val">
                                {store.delayBetweenQuests ?? 5}s
                            </span>
                            <input
                                type="range"
                                min={0}
                                max={30}
                                step={1}
                                value={store.delayBetweenQuests ?? 5}
                                onChange={e => setNumber("delayBetweenQuests", parseInt(e.target.value, 10))}
                                className="vc-quest-settings-slider"
                            />
                        </div>
                    </div>

                    {/* Quest Sort Order */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Queue Processing Priority</span>
                            <span className="vc-quest-settings-hint">
                                Determines which quests are processed first in the worker queue.
                            </span>
                        </div>
                        <select
                            className="vc-quest-settings-select"
                            value={store.questSortOrder || "video_first"}
                            onChange={e => setString("questSortOrder", e.target.value)}
                        >
                            <option value="video_first">🎬 Video Quests First (Fastest)</option>
                            <option value="activity_first">🎮 Activity/Game Quests First</option>
                            <option value="expiring">⏳ Expiring Soonest First</option>
                        </select>
                    </div>

                    {/* Randomize Progress */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Humanized Progress Jitter</span>
                            <span className="vc-quest-settings-hint">
                                Adds realistic jitter and micro-pauses so progress events appear organic to Discord.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.randomizeProgress}
                                onChange={e => setBoolean("randomizeProgress", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Enable Video Quests */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Process Video Quests</span>
                            <span className="vc-quest-settings-hint">
                                Automatically complete watch-to-earn video quests.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.enableVideoQuests}
                                onChange={e => setBoolean("enableVideoQuests", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Enable Activity Quests */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Process Game & Stream Quests</span>
                            <span className="vc-quest-settings-hint">
                                Automatically spoof game sessions and screen streams for quest progress.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.enableActivityQuests}
                                onChange={e => setBoolean("enableActivityQuests", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>
                </div>
            </div>

            {/* 3. Safety & Conflict Management Section */}
            <div className="vc-quest-settings-section">
                <div className="vc-quest-settings-section-header">
                    <span className="vc-quest-settings-section-icon">🛡️</span>
                    <div>
                        <h4 className="vc-quest-settings-section-title">Safety & Conflict Prevention</h4>
                        <span className="vc-quest-settings-section-sub">
                            Pause rules while gaming, streaming, or speaking in voice channels
                        </span>
                    </div>
                </div>

                <div className="vc-quest-settings-card">
                    {/* Pause on Game/Stream Conflict */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Pause on Real Game or Stream</span>
                            <span className="vc-quest-settings-hint">
                                Pause spoofing whenever you are actually playing a real game or streaming to prevent Discord conflicts.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.pauseOnGameConflict}
                                onChange={e => setBoolean("pauseOnGameConflict", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Pause While In Voice */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Pause While In Voice Channel</span>
                            <span className="vc-quest-settings-hint">
                                Automatically pauses quest execution when you join any Discord voice channel.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.pauseWhileInVoice}
                                onChange={e => setBoolean("pauseWhileInVoice", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Run Only When Idle */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Run Only When AFK / Idle</span>
                            <span className="vc-quest-settings-hint">
                                Only process quests when your Discord status is AFK or idle.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.runOnlyWhenIdle}
                                onChange={e => setBoolean("runOnlyWhenIdle", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Auto-Requeue Failed */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Auto-Requeue Failed Quests</span>
                            <span className="vc-quest-settings-hint">
                                Move any temporarily failed quest to the end of the queue for a retry (up to 2 attempts).
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.autoRequeueFailed}
                                onChange={e => setBoolean("autoRequeueFailed", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>
                </div>
            </div>

            {/* 4. ExpressVPN Geo-Scanner Section */}
            <div className="vc-quest-settings-section">
                <div className="vc-quest-settings-section-header">
                    <span className="vc-quest-settings-section-icon">🌍</span>
                    <div>
                        <h4 className="vc-quest-settings-section-title">ExpressVPN Geo-Scanner Add-on</h4>
                        <span className="vc-quest-settings-section-sub">
                            Multi-country scanner to discover and auto-enroll region-locked Discord quests
                        </span>
                    </div>
                </div>

                <div className="vc-quest-settings-card">
                    {/* Enable VPN Scanner */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Enable ExpressVPN Scanner</span>
                            <span className="vc-quest-settings-hint">
                                Connects to a local ExpressVPN MCP server to scan international regions for quests.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.enableVpnScanner}
                                onChange={e => setBoolean("enableVpnScanner", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* ExpressVPN MCP URL */}
                    <div className="vc-quest-settings-row vertical">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">ExpressVPN MCP Endpoint URL</span>
                            <span className="vc-quest-settings-hint">
                                The local MCP server URL with token (e.g. <code>http://127.0.0.1:20096/mcp?token=...</code>).
                            </span>
                        </div>
                        <div className="vc-quest-settings-input-group">
                            <input
                                type="text"
                                className="vc-quest-settings-text-input"
                                placeholder="http://127.0.0.1:20096/mcp?token=..."
                                value={vpnUrlDraft}
                                onChange={e => setVpnUrlDraft(e.target.value)}
                            />
                            <ButtonCompat
                                size={ButtonCompat.Sizes.SMALL}
                                color={ButtonCompat.Colors.BRAND}
                                onClick={handleSaveVpnUrl}
                            >
                                Save URL
                            </ButtonCompat>
                        </div>
                    </div>

                    {/* Target Regions Picker */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Target Countries & Regions</span>
                            <span className="vc-quest-settings-hint">
                                Selected regions: <strong>{(store.vpnTargetRegions || "smart").split(",").map(s => s.trim()).filter(Boolean).length}</strong> region(s) configured.
                            </span>
                        </div>
                        <ButtonCompat
                            size={ButtonCompat.Sizes.SMALL}
                            color={ButtonCompat.Colors.PRIMARY}
                            onClick={() => openRegionPickerModal()}
                        >
                            🌍 Select Regions...
                        </ButtonCompat>
                    </div>

                    {/* Region Switch Cooldown */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">IP Propagation Cooldown</span>
                            <span className="vc-quest-settings-hint">
                                Wait duration (seconds) after switching VPN region before querying Discord quests.
                            </span>
                        </div>
                        <div className="vc-quest-settings-control">
                            <span className="vc-quest-settings-badge-val">
                                {store.vpnCooldownSec ?? 10}s
                            </span>
                            <input
                                type="range"
                                min={3}
                                max={30}
                                step={1}
                                value={store.vpnCooldownSec ?? 10}
                                onChange={e => setNumber("vpnCooldownSec", parseInt(e.target.value, 10))}
                                className="vc-quest-settings-slider"
                            />
                        </div>
                    </div>

                    {/* Connection Timeout */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">VPN Connection Timeout</span>
                            <span className="vc-quest-settings-hint">
                                Maximum time (seconds) to wait for ExpressVPN to establish a tunnel connection.
                            </span>
                        </div>
                        <div className="vc-quest-settings-control">
                            <span className="vc-quest-settings-badge-val">
                                {store.vpnConnectTimeoutSec ?? 25}s
                            </span>
                            <input
                                type="range"
                                min={10}
                                max={45}
                                step={5}
                                value={store.vpnConnectTimeoutSec ?? 25}
                                onChange={e => setNumber("vpnConnectTimeoutSec", parseInt(e.target.value, 10))}
                                className="vc-quest-settings-slider"
                            />
                        </div>
                    </div>

                    {/* Disconnect After Scan */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Disconnect / Restore After Scan</span>
                            <span className="vc-quest-settings-hint">
                                Restore your previous VPN state or disconnect ExpressVPN tunnel when scanning completes.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.vpnDisconnectAfterScan}
                                onChange={e => setBoolean("vpnDisconnectAfterScan", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>
                </div>
            </div>

            {/* 5. Rewards & Notifications Section */}
            <div className="vc-quest-settings-section">
                <div className="vc-quest-settings-section-header">
                    <span className="vc-quest-settings-section-icon">🎁</span>
                    <div>
                        <h4 className="vc-quest-settings-section-title">Rewards & Notifications</h4>
                        <span className="vc-quest-settings-section-sub">
                            Automatic reward collection and celebratory sounds
                        </span>
                    </div>
                </div>

                <div className="vc-quest-settings-card">
                    {/* Auto Claim Rewards */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Auto-Claim Rewards</span>
                            <span className="vc-quest-settings-hint">
                                Automatically claim Orbs and promo codes when quests reach 100% completion.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.autoClaimRewards}
                                onChange={e => setBoolean("autoClaimRewards", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Completion Sound */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Play Completion Sound</span>
                            <span className="vc-quest-settings-hint">
                                Play an uplifting chime sound whenever a quest successfully finishes.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.playCompletionSound}
                                onChange={e => setBoolean("playCompletionSound", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Toast Notification Level */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Notification Level</span>
                            <span className="vc-quest-settings-hint">
                                Control which toast popups and messages are displayed in Discord.
                            </span>
                        </div>
                        <select
                            className="vc-quest-settings-select"
                            value={store.logLevel || "all"}
                            onChange={e => setString("logLevel", e.target.value)}
                        >
                            <option value="all">🔔 All Messages & Progress</option>
                            <option value="completed_only">🎉 Completions Only</option>
                            <option value="errors_only">⚠️ Errors & Warnings Only</option>
                            <option value="none">🔇 Silent (No Toasts)</option>
                        </select>
                    </div>
                </div>
            </div>

            {/* 6. Interface & Overlay Section */}
            <div className="vc-quest-settings-section">
                <div className="vc-quest-settings-section-header">
                    <span className="vc-quest-settings-section-icon">🎨</span>
                    <div>
                        <h4 className="vc-quest-settings-section-title">Interface & Floating Overlay</h4>
                        <span className="vc-quest-settings-section-sub">
                            HUD appearance and developer inspection tools
                        </span>
                    </div>
                </div>

                <div className="vc-quest-settings-card">
                    {/* Show Floating Overlay */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Floating Status Overlay</span>
                            <span className="vc-quest-settings-hint">
                                Display a floating HUD widget in the bottom corner with real-time quest progress.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.showOverlay}
                                onChange={e => setBoolean("showOverlay", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>

                    {/* Overlay Style */}
                    {store.showOverlay && (
                        <div className="vc-quest-settings-row">
                            <div className="vc-quest-settings-info">
                                <span className="vc-quest-settings-label">Overlay Visual Style</span>
                                <span className="vc-quest-settings-hint">
                                    Choose between full-detail standard box or ultra-minimal mini-pill.
                                </span>
                            </div>
                            <select
                                className="vc-quest-settings-select"
                                value={store.overlayStyle || "standard"}
                                onChange={e => setString("overlayStyle", e.target.value)}
                            >
                                <option value="standard">📦 Standard Floating Box</option>
                                <option value="pill">💊 Compact Mini-Pill</option>
                            </select>
                        </div>
                    )}

                    {/* Overlay Opacity */}
                    {store.showOverlay && (
                        <div className="vc-quest-settings-row">
                            <div className="vc-quest-settings-info">
                                <span className="vc-quest-settings-label">Overlay Opacity</span>
                                <span className="vc-quest-settings-hint">
                                    Transparency percentage of the floating overlay.
                                </span>
                            </div>
                            <div className="vc-quest-settings-control">
                                <span className="vc-quest-settings-badge-val">
                                    {store.overlayOpacity ?? 85}%
                                </span>
                                <input
                                    type="range"
                                    min={40}
                                    max={100}
                                    step={5}
                                    value={store.overlayOpacity ?? 85}
                                    onChange={e => setNumber("overlayOpacity", parseInt(e.target.value, 10))}
                                    className="vc-quest-settings-slider"
                                />
                            </div>
                        </div>
                    )}

                    {/* Developer Debug Mode */}
                    <div className="vc-quest-settings-row">
                        <div className="vc-quest-settings-info">
                            <span className="vc-quest-settings-label">Developer Debug Mode</span>
                            <span className="vc-quest-settings-hint">
                                Enables the 🐛 Debug tab in Quest Manager for API payloads, raw store inspections, and live logs.
                            </span>
                        </div>
                        <label className="vc-quest-settings-toggle">
                            <input
                                type="checkbox"
                                checked={store.debugMode}
                                onChange={e => setBoolean("debugMode", e.target.checked)}
                            />
                            <span className="vc-quest-settings-toggle-track" />
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
