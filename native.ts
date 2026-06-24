/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { execFile as cpExecFile, ExecFileOptions } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFile = promisify(cpExecFile);

const isFlatpak = process.platform === "linux" && Boolean(process.env.FLATPAK_ID?.includes("discordapp") || process.env.FLATPAK_ID?.includes("Discord"));
if (process.platform === "darwin") process.env.PATH = `/usr/local/bin:${process.env.PATH}`;

const VENCORD_USER_PLUGIN_DIR = join(__dirname, "..", "src", "userplugins");
const getCwd = async () => {
    const dirs = await readdir(VENCORD_USER_PLUGIN_DIR, { withFileTypes: true });
    for (const dir of dirs) {
        if (!dir.isDirectory()) continue;
        const pluginDir = join(VENCORD_USER_PLUGIN_DIR, dir.name);
        const files = await readdir(pluginDir);
        if (files.includes("QuestModal.tsx") || files.includes("questApi.ts") || files.includes("README.md") && files.includes("settings.ts")) {
            return pluginDir;
        }
    }
    return join(VENCORD_USER_PLUGIN_DIR, "QuestManager");
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
    const opts: ExecFileOptions = { cwd: await getCwd(), shell: true };
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
        const logOutput = await git("log", `--format="${logFormat}"`, branchRange);

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
