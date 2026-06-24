/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

interface ProgressBarProps {
    progress: number;
    target: number;
    compact?: boolean;
}

export const ProgressBar = ({ progress, target, compact = false }: ProgressBarProps) => {
    const pct = target > 0 ? Math.min(100, Math.round((progress / target) * 100)) : 0;

    const containerClasses = ["vc-quest-progress-container", compact && "vc-compact"]
        .filter(Boolean)
        .join(" ");

    return (
        <div
            className={containerClasses}
            role="progressbar"
            aria-valuenow={progress}
            aria-valuemin={0}
            aria-valuemax={target}
        >
            <div className="vc-quest-progress-header">
                <div className="vc-quest-progress-title">
                    {!compact && (
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                        </svg>
                    )}
                    <span>PROGRESS</span>
                </div>
                <span className="vc-quest-progress-pct">{pct}%</span>
            </div>

            <div className="vc-quest-progress-track">
                <div className="vc-quest-progress-fill" style={{ width: `${pct}%` }}>
                    <div className="vc-quest-progress-glow" />
                </div>
            </div>

            <div className="vc-quest-progress-footer">
                <span className="vc-progress-current">{progress}s</span>
                <span className="vc-progress-target">{compact ? "" : "/ "}{target}s</span>
            </div>
        </div>
    );
};
