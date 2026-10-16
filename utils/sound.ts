/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "../settings";

export function playQuestCompleteSound() {
    if (settings?.store?.playCompletionSound === false) return;

    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        // Ascending 4-note celebratory chime: C5 -> E5 -> G5 -> C6
        const notes = [
            { freq: 523.25, time: 0.0, duration: 0.15 },
            { freq: 659.25, time: 0.09, duration: 0.15 },
            { freq: 783.99, time: 0.18, duration: 0.2 },
            { freq: 1046.50, time: 0.28, duration: 0.45 }
        ];

        notes.forEach(({ freq, time, duration }) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();

            osc.type = "sine";
            osc.frequency.setValueAtTime(freq, now + time);

            gain.gain.setValueAtTime(0, now + time);
            gain.gain.linearRampToValueAtTime(0.12, now + time + 0.02);
            gain.gain.exponentialRampToValueAtTime(0.0001, now + time + duration);

            osc.connect(gain);
            gain.connect(ctx.destination);

            osc.start(now + time);
            osc.stop(now + time + duration);
        });

        setTimeout(() => {
            try { ctx.close(); } catch { }
        }, 1500);
    } catch {
        // Audio playback error or autoplay policy
    }
}
