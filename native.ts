/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFile as cpExecFile, ExecFileOptions } from "node:child_process";
import { readdir } from "node:fs/promises";
import * as http from "node:http";
import * as https from "node:https";
import { join } from "node:path";
import { URL } from "node:url";
import { promisify } from "node:util";

const execFile = promisify(cpExecFile);

const isFlatpak = process.platform === "linux" && Boolean(process.env.FLATPAK_ID?.includes("discordapp") || process.env.FLATPAK_ID?.includes("Discord"));
if (process.platform === "darwin") process.env.PATH = `/usr/local/bin:${process.env.PATH}`;

const VENCORD_USER_PLUGIN_DIR = join(__dirname, "..", "src", "userplugins");

// Files that only exist together in this plugin's own folder, used to confirm we
// resolved the right directory (in case the folder was renamed from "QuestManager").
const MARKER_FILES = ["questApi.ts", "QuestModal.tsx"];

let cachedCwd: string | null = null;

const dirLooksLikeQuestManager = async (dir: string) => {
    try {
        const files = await readdir(dir);
        return MARKER_FILES.every(f => files.includes(f));
    } catch {
        return false;
    }
};

const getCwd = async () => {
    if (cachedCwd) return cachedCwd;

    const defaultDir = join(VENCORD_USER_PLUGIN_DIR, "QuestManager");
    if (await dirLooksLikeQuestManager(defaultDir)) {
        cachedCwd = defaultDir;
        return cachedCwd;
    }

    const dirs = await readdir(VENCORD_USER_PLUGIN_DIR, { withFileTypes: true });
    for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const pluginDir = join(VENCORD_USER_PLUGIN_DIR, dir.name);
        if (await dirLooksLikeQuestManager(pluginDir)) {
            cachedCwd = pluginDir;
            return cachedCwd;
        }
    }

    cachedCwd = defaultDir;
    return cachedCwd;
};

export interface GitResult {
    ok: boolean;
    value?: any;
    stderr?: string;
    cmd?: string;
    message?: string;
    error?: any;
}

export interface Commit {
    hash: string;
    longHash: string;
    message: string;
    author: string;
}

export interface GitInfo {
    repo: string;
    gitHash: string;
}

async function git(...args: string[]): Promise<GitResult> {
    // No `shell: true` here on purpose: execFile passes args directly to the
    // process without shell interpretation, which avoids command injection via
    // branch names or other values that end up interpolated into args below.
    const opts: ExecFileOptions = { cwd: await getCwd() };
    try {
        let result;
        if (isFlatpak) {
            result = await execFile("flatpak-spawn", ["--host", "git", ...args], opts);
        } else {
            result = await execFile("git", args, opts);
        }
        return { value: result.stdout.trim(), stderr: result.stderr, ok: true };
    } catch (error: any) {
        return { ok: false, cmd: error.cmd as string, message: error.stderr as string, error };
    }
}

export async function questManagerUpdate() {
    return await git("pull");
}

export async function questManagerGetCommitHash() {
    return await git("rev-parse", "HEAD");
}

export async function questManagerGetRepoInfo(): Promise<GitResult> {
    const res = await git("remote", "get-url", "origin");
    if (!res.ok) return res;

    const gitHash = await questManagerGetCommitHash();
    if (!gitHash.ok) return gitHash;

    return {
        ok: true,
        value: {
            repo: res.value.replace(/git@(.+):/, "https://$1/").replace(/\.git$/, ""),
            gitHash: gitHash.value
        }
    };
}

export async function questManagerGetNewCommits(): Promise<GitResult> {
    const branch = await git("branch", "--show-current");
    if (!branch.ok) return branch;

    const logFormat = "%H;%an;%s";
    const branchRange = `HEAD..origin/${branch.value}`;

    try {
        await git("fetch");
        const logOutput = await git("log", `--format=${logFormat}`, branchRange);

        if (!logOutput.ok) return logOutput;
        if (logOutput.value.trim() === "") return { ok: true, value: [] };

        const commitLines = logOutput.value.trim().split("\n");
        const commits: Commit[] = commitLines.map(line => {
            const [hash, author, ...rest] = line.split(";");
            return { longHash: hash, hash: hash.slice(0, 7), author, message: rest.join(";") } as Commit;
        });

        return { ok: true, value: commits };
    } catch (error: any) {
        return { ok: false, cmd: error.cmd, message: error.message, error };
    }
}

export function isQuestManagerNativeBridge() { return true; }
 
export interface McpRequestOptions {
    url: string;
    method?: string;
    headers?: Record<string, string>;
    body?: string;
    timeoutMs?: number;
}

export interface McpResponse {
    ok: boolean;
    status?: number;
    headers?: Record<string, string>;
    body?: string;
    error?: string;
}

export async function questManagerMcpRequest(
    _: any,
    options: McpRequestOptions
): Promise<McpResponse> {
    return new Promise(resolve => {
        try {
            const parsedUrl = new URL(options.url);
            const isHttps = parsedUrl.protocol === "https:";
            const transport = isHttps ? https : http;

            const req = transport.request(parsedUrl, {
                method: options.method || "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Accept": "application/json, text/event-stream",
                    ...(options.headers || {})
                },
                timeout: options.timeoutMs || 25000
            }, res => {
                let data = "";
                res.on("data", (chunk: Buffer) => {
                    data += chunk.toString("utf8");
                });
                res.on("end", () => {
                    const headers: Record<string, string> = {};
                    for (const [k, v] of Object.entries(res.headers)) {
                        if (typeof v === "string") headers[k.toLowerCase()] = v;
                        else if (Array.isArray(v)) headers[k.toLowerCase()] = v.join(", ");
                    }
                    resolve({
                        ok: (res.statusCode ?? 500) >= 200 && (res.statusCode ?? 500) < 300,
                        status: res.statusCode,
                        headers,
                        body: data
                    });
                });
            });

            req.on("error", (err: any) => {
                resolve({
                    ok: false,
                    error: err?.message || String(err)
                });
            });

            req.on("timeout", () => {
                req.destroy();
                resolve({
                    ok: false,
                    error: "Request timed out"
                });
            });

            if (options.body) {
                req.write(options.body);
            }
            req.end();
        } catch (e: any) {
            resolve({
                ok: false,
                error: e?.message || String(e)
            });
        }
    });
}

