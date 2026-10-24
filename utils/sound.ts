/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { settings } from "../settings";

export const SOUND_THEMES = [
    { id: "retro", label: "🕹️ Retro 8-bit Fanfare" },
    { id: "chime", label: "🔔 Crystal Chime" },
    { id: "pop", label: "🫧 Modern Bubble Pop" },
    { id: "arcade", label: "🪙 Arcade Coin / 1-Up" },
    { id: "mute", label: "🔇 Mute (No Sound)" }
] as const;

export type SoundThemeId = typeof SOUND_THEMES[number]["id"];

export function playQuestCompleteSound(themeOverride?: string, volumeOverride?: number) {
    if (!themeOverride && settings?.store?.playCompletionSound === false) return;

    const theme = (themeOverride || settings?.store?.soundTheme || "retro") as SoundThemeId;
    if (theme === "mute") return;

    const volPct = volumeOverride != null ? volumeOverride : (settings?.store?.soundVolume ?? 80);
    const masterGainValue = Math.max(0.01, Math.min(1, volPct / 100)) * 0.16;

    try {
        const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
        if (!AudioCtx) return;

        const ctx = new AudioCtx();
        const now = ctx.currentTime;

        const masterGain = ctx.createGain();
        masterGain.gain.setValueAtTime(masterGainValue, now);
        masterGain.connect(ctx.destination);

        if (theme === "retro") {
            // Retro 8-bit celebratory level-up arpeggio (Square wave)
            const notes = [
                { freq: 523.25, time: 0.0, dur: 0.08 },  // C5
                { freq: 659.25, time: 0.07, dur: 0.08 }, // E5
                { freq: 783.99, time: 0.14, dur: 0.08 }, // G5
                { freq: 1046.50, time: 0.21, dur: 0.12 },// C6
                { freq: 1318.51, time: 0.31, dur: 0.40 } // E6
            ];

            notes.forEach(({ freq, time, dur }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "square";
                osc.frequency.setValueAtTime(freq, now + time);

                gain.gain.setValueAtTime(0, now + time);
                gain.gain.linearRampToValueAtTime(0.7, now + time + 0.01);
                gain.gain.exponentialRampToValueAtTime(0.001, now + time + dur);

                osc.connect(gain);
                gain.connect(masterGain);

                osc.start(now + time);
                osc.stop(now + time + dur);
            });
        } else if (theme === "arcade") {
            // Classic Mario/Arcade coin sound (B5 -> E6 jump)
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "square";

            osc.frequency.setValueAtTime(987.77, now); // B5
            osc.frequency.setValueAtTime(1318.51, now + 0.08); // E6

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(0.8, now + 0.01);
            gain.gain.setValueAtTime(0.8, now + 0.08);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.45);

            osc.connect(gain);
            gain.connect(masterGain);

            osc.start(now);
            osc.stop(now + 0.45);
        } else if (theme === "pop") {
            // Modern crisp, satisfying bubble pop
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.type = "sine";

            osc.frequency.setValueAtTime(900, now);
            osc.frequency.exponentialRampToValueAtTime(320, now + 0.09);

            gain.gain.setValueAtTime(0, now);
            gain.gain.linearRampToValueAtTime(1.0, now + 0.01);
            gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

            osc.connect(gain);
            gain.connect(masterGain);

            osc.start(now);
            osc.stop(now + 0.12);
        } else {
            // Default "chime": Crystal 4-note chord (Sine waves with rich harmonic decay)
            const notes = [
                { freq: 523.25, time: 0.0, dur: 0.20 },  // C5
                { freq: 659.25, time: 0.08, dur: 0.22 }, // E5
                { freq: 783.99, time: 0.16, dur: 0.28 }, // G5
                { freq: 1046.50, time: 0.24, dur: 0.60 } // C6
            ];

            notes.forEach(({ freq, time, dur }) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.type = "sine";
                osc.frequency.setValueAtTime(freq, now + time);

                gain.gain.setValueAtTime(0, now + time);
                gain.gain.linearRampToValueAtTime(0.7, now + time + 0.02);
                gain.gain.exponentialRampToValueAtTime(0.0001, now + time + dur);

                osc.connect(gain);
                gain.connect(masterGain);

                osc.start(now + time);
                osc.stop(now + time + dur);
            });
        }

        setTimeout(() => {
            try { ctx.close(); } catch { }
        }, 1200);
    } catch {
        // Audio playback error or autoplay policy
    }
}
