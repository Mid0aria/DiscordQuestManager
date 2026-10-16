/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { debugLog, log, sleep } from "../core/state";
import { settings } from "../settings";

export interface VpnTestResult {
    ok: boolean;
    state?: string;
    region?: string;
    error?: string;
}

function getNativeBridge(): any {
    const { VencordNative } = (window as any);
    if (!VencordNative || !VencordNative.pluginHelpers) return null;
    return Object.values(VencordNative.pluginHelpers).find((x: any) => x?.isQuestManagerNativeBridge);
}

function parseMcpSseResponse(body: string): any {
    if (!body) return null;
    const lines = body.split("\n");
    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (line.startsWith("data:")) {
            const jsonStr = line.slice(5).trim();
            if (jsonStr) {
                try {
                    return JSON.parse(jsonStr);
                } catch {
                    // Ignore line parse errors and continue
                }
            }
        }
    }
    try {
        return JSON.parse(body);
    } catch {
        return null;
    }
}

class ExpressVpnClient {
    private sessionId: string | null = null;
    private rpcId = 1;

    public resetSession(): void {
        this.sessionId = null;
    }

    private async executeHttpRequest(
        url: string,
        headers: Record<string, string>,
        body: string
    ): Promise<{ ok: boolean; status: number; headers: Record<string, string>; body: string; error?: string; }> {
        const Native = getNativeBridge();
        if (Native && typeof Native.questManagerMcpRequest === "function") {
            return await Native.questManagerMcpRequest({
                url,
                method: "POST",
                headers,
                body,
                timeoutMs: 8000
            });
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), 8000);
            const res = await fetch(url, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    ...headers
                },
                body,
                signal: controller.signal
            });
            clearTimeout(timeoutId);
            const text = await res.text();
            const resHeaders: Record<string, string> = {};
            res.headers.forEach((v, k) => {
                resHeaders[k.toLowerCase()] = v;
            });
            return {
                ok: res.ok,
                status: res.status,
                headers: resHeaders,
                body: text
            };
        } catch (e: any) {
            return {
                ok: false,
                status: 0,
                headers: {},
                body: "",
                error: e?.name === "AbortError" ? "ExpressVPN request timed out (8s)" : (e?.message || String(e))
            };
        }
    }

    private async initSession(): Promise<string> {
        const url = settings.store.vpnMcpUrl?.trim();
        if (!url) {
            throw new Error("ExpressVPN MCP URL is not configured in settings.");
        }

        debugLog("ExpressVPN: Initializing new MCP session...", url);

        const initPayload = {
            jsonrpc: "2.0",
            id: this.rpcId++,
            method: "initialize",
            params: {
                protocolVersion: "2024-11-05",
                capabilities: {},
                clientInfo: {
                    name: "QuestManager",
                    version: "1.0.0"
                }
            }
        };

        const res = await this.executeHttpRequest(url, {}, JSON.stringify(initPayload));
        if (!res.ok) {
            throw new Error(`Failed to initialize MCP session (Status ${res.status}): ${res.error || res.body}`);
        }

        const sid = res.headers["mcp-session-id"];
        if (!sid) {
            throw new Error("ExpressVPN MCP server did not return 'mcp-session-id' header.");
        }

        // Send notifications/initialized to confirm handshake
        const notifyPayload = {
            jsonrpc: "2.0",
            method: "notifications/initialized"
        };
        await this.executeHttpRequest(url, { "mcp-session-id": sid }, JSON.stringify(notifyPayload));

        this.sessionId = sid;
        debugLog("ExpressVPN: MCP session established successfully.", sid);
        return sid;
    }

    public async callTool(name: string, toolArgs: Record<string, any> = {}): Promise<string> {
        const url = settings.store.vpnMcpUrl?.trim();
        if (!url) throw new Error("ExpressVPN MCP URL is empty.");

        let attempts = 0;
        while (attempts < 2) {
            attempts++;
            if (!this.sessionId) {
                await this.initSession();
            }

            const payload = {
                jsonrpc: "2.0",
                id: this.rpcId++,
                method: "tools/call",
                params: {
                    name,
                    arguments: toolArgs
                }
            };

            const res = await this.executeHttpRequest(
                url,
                { "mcp-session-id": this.sessionId! },
                JSON.stringify(payload)
            );

            if (!res.ok || res.status === 400 || res.status === 404) {
                debugLog(`ExpressVPN: Call failed with status ${res.status}. Resetting session and retrying...`, res.error || res.body);
                this.sessionId = null;
                if (attempts < 2) continue;
                throw new Error(`MCP tool call '${name}' failed (Status ${res.status}): ${res.error || res.body}`);
            }

            const parsed = parseMcpSseResponse(res.body);
            if (!parsed) {
                throw new Error(`Invalid SSE response from MCP server: ${res.body}`);
            }

            if (parsed.error) {
                const errMsg = parsed.error?.message || JSON.stringify(parsed.error);
                if (errMsg.includes("session") && attempts < 2) {
                    this.sessionId = null;
                    continue;
                }
                throw new Error(`MCP Tool '${name}' returned error: ${errMsg}`);
            }

            const result = parsed.result;
            if (result?.isError) {
                const text = result?.content?.[0]?.text || "Unknown tool error";
                throw new Error(`ExpressVPN error: ${text}`);
            }

            const contentText = result?.content?.[0]?.text ?? "";
            return contentText;
        }

        throw new Error(`MCP Tool call '${name}' exceeded retry attempts.`);
    }

    public async testConnection(): Promise<VpnTestResult> {
        try {
            const state = await Promise.race([
                this.getConnectionState(),
                new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Connection test timed out (6s)")), 6000))
            ]);
            let region = "";
            try {
                region = await Promise.race([
                    this.getRegion(),
                    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), 3000))
                ]);
            } catch {
                // If disconnected or region call fails, region might be blank
            }
            return {
                ok: true,
                state,
                region
            };
        } catch (e: any) {
            return {
                ok: false,
                error: e?.message || String(e)
            };
        }
    }

    public async getConnectionState(): Promise<string> {
        const text = await this.callTool("expressvpn_get_connectionstate");
        return text.trim();
    }

    public async getRegion(): Promise<string> {
        const text = await this.callTool("expressvpn_get_region");
        return text.trim();
    }

    public async getStatus(): Promise<string> {
        const text = await this.callTool("expressvpn_status");
        return text.trim();
    }

    public async getRegions(): Promise<string[]> {
        const text = await this.callTool("expressvpn_get_regions");
        return text
            .split(/\r?\n/)
            .map(r => r.trim())
            .filter(Boolean);
    }

    public async connect(region: string, timeoutSec: number = 25): Promise<void> {
        debugLog(`ExpressVPN: Requesting connect to region '${region}'...`);
        await this.callTool("expressvpn_connect", { region });

        const startTime = Date.now();
        const maxMs = timeoutSec * 1000;

        while (Date.now() - startTime < maxMs) {
            await sleep(1000);
            try {
                const state = await this.getConnectionState();
                debugLog(`ExpressVPN: Polling connection state -> '${state}'`);
                if (state.toLowerCase() === "connected") {
                    debugLog(`ExpressVPN: Successfully connected to '${region}'.`);
                    return;
                }
            } catch (err) {
                debugLog("ExpressVPN: Polling error:", err);
            }
        }

        throw new Error(`ExpressVPN connect to '${region}' timed out after ${timeoutSec}s.`);
    }

    public async disconnect(timeoutSec: number = 15): Promise<void> {
        debugLog("ExpressVPN: Requesting disconnect...");
        await this.callTool("expressvpn_disconnect");

        const startTime = Date.now();
        const maxMs = timeoutSec * 1000;

        while (Date.now() - startTime < maxMs) {
            await sleep(1000);
            try {
                const state = await this.getConnectionState();
                debugLog(`ExpressVPN: Polling disconnect state -> '${state}'`);
                if (state.toLowerCase() === "disconnected" || state.toLowerCase() === "not connected") {
                    debugLog("ExpressVPN: Successfully disconnected.");
                    return;
                }
            } catch (err) {
                debugLog("ExpressVPN: Polling disconnect error:", err);
            }
        }

        log("ExpressVPN: Disconnect wait timed out, continuing...", "warn");
    }
}

export const vpnClient = new ExpressVpnClient();
