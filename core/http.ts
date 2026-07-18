/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { log, sleep } from "./state";

/**
 * Runs `fn`, retrying on HTTP 429 (rate limited) responses using the
 * `retry_after` value Discord returns (in seconds), up to `maxRetries` times.
 * Any other error is rethrown immediately.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    for (; ;) {
        try {
            return await fn();
        } catch (e: any) {
            attempt++;
            if (e?.status !== 429 || attempt > maxRetries) throw e;

            const retryAfterSec = typeof e?.body?.retry_after === "number" ? e.body.retry_after : 1;
            const waitMs = Math.min(30000, Math.max(500, retryAfterSec * 1000));
            log(`Rate limited, retrying in ${(waitMs / 1000).toFixed(1)}s... (${attempt}/${maxRetries})`, "warn");
            await sleep(waitMs);
        }
    }
}
