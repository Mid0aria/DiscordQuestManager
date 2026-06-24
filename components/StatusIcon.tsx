/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

export const StatusIcon = ({ status }: { status: string; }) => {
    if (status === "running") return <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--info-positive-background, #23a559)" stroke="var(--info-positive-background, #23a559)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>;
    if (status === "paused") return <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--info-warning-background, #f0b232)" stroke="var(--info-warning-background, #f0b232)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>;
    return <svg width="14" height="14" viewBox="0 0 24 24" fill="var(--text-muted, #949ba4)" stroke="var(--text-muted, #949ba4)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect></svg>;
};
