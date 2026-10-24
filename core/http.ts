/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { log, markRateLimited, sleep } from "./state";

/**
 * Runs `fn`, retrying on HTTP 429 (rate limited) and 5xx (server error) responses
 * using exponential backoff or the `retry_after` header value, up to `maxRetries` times.
 */
export async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
    let attempt = 0;
    for (; ;) {
        try {
            return await fn();
        } catch (e: any) {
            attempt++;
            const isRateLimit = e?.status === 429;
            const isServerError = typeof e?.status === "number" && e.status >= 500 && e.status < 600;

            if ((!isRateLimit && !isServerError) || attempt > maxRetries) throw e;

            let waitMs = Math.pow(2, attempt) * 1000;
            if (isRateLimit) {
                const retryAfterSec = typeof e?.body?.retry_after === "number"
                    ? e.body.retry_after
                    : typeof e?.headers?.["retry-after"] === "string"
                        ? parseFloat(e.headers["retry-after"])
                        : Math.min(60, Math.pow(2, attempt) * 2);
                markRateLimited(retryAfterSec);
                waitMs = Math.min(60000, Math.max(1000, Math.round(retryAfterSec * 1000 * (0.9 + Math.random() * 0.25))));
                log(`Rate limited (429), retrying in ${(waitMs / 1000).toFixed(1)}s... (${attempt}/${maxRetries})`, "warn");
            } else {
                waitMs = Math.round(waitMs * (0.85 + Math.random() * 0.3));
                log(`Discord server error (${e?.status}), retrying in ${(waitMs / 1000).toFixed(1)}s... (${attempt}/${maxRetries})`, "warn");
            }

            await sleep(waitMs);
        }
    }
}
