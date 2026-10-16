/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

export interface RedeemInfo {
    url: string;
    label: string;
    platform: string;
}

export function getRedeemInfo(code: string, questName = "", rewardName = ""): RedeemInfo | null {
    if (!code || typeof code !== "string") return null;

    const trimmedCode = code.trim();
    const text = `${questName} ${rewardName}`.toLowerCase();

    // 1. Direct URLs or Discord promo links
    if (trimmedCode.startsWith("http://") || trimmedCode.startsWith("https://")) {
        const isDiscord = trimmedCode.includes("discord.com") || trimmedCode.includes("discord.gift");
        return {
            url: trimmedCode,
            label: isDiscord ? "Redeem Nitro" : "Open Link",
            platform: isDiscord ? "Discord" : "External"
        };
    }

    // 2. Discord Nitro gift codes
    if (text.includes("nitro") || text.includes("discord")) {
        return {
            url: `https://discord.com/billing/promotions/${encodeURIComponent(trimmedCode)}`,
            label: "Redeem Nitro",
            platform: "Discord"
        };
    }

    // 3. Microsoft / Xbox 25-character codes (XXXXX-XXXXX-XXXXX-XXXXX-XXXXX)
    const xboxPattern = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/i;
    if (
        xboxPattern.test(trimmedCode) ||
        text.includes("xbox") ||
        text.includes("game pass") ||
        text.includes("gamepass") ||
        text.includes("microsoft") ||
        text.includes("sea of thieves") ||
        text.includes("fallout")
    ) {
        return {
            url: `https://redeem.microsoft.com/?code=${encodeURIComponent(trimmedCode)}`,
            label: "Redeem on Xbox",
            platform: "Xbox"
        };
    }

    // 4. Hoyoverse (Genshin, Honkai, ZZZ)
    if (text.includes("genshin")) {
        return {
            url: `https://genshin.hoyoverse.com/en/gift?code=${encodeURIComponent(trimmedCode)}`,
            label: "Redeem Genshin",
            platform: "Genshin"
        };
    }

    if (text.includes("honkai") || text.includes("star rail") || text.includes("hsr")) {
        return {
            url: `https://hsr.hoyoverse.com/gift?code=${encodeURIComponent(trimmedCode)}`,
            label: "Redeem HSR",
            platform: "Honkai"
        };
    }

    if (text.includes("zenless") || text.includes("zzz")) {
        return {
            url: `https://zenless.hoyoverse.com/redemption?code=${encodeURIComponent(trimmedCode)}`,
            label: "Redeem ZZZ",
            platform: "Zenless"
        };
    }

    // 5. Roblox
    if (text.includes("roblox")) {
        return {
            url: "https://www.roblox.com/redeem",
            label: "Redeem on Roblox",
            platform: "Roblox"
        };
    }

    // 6. Steam (15-character 3-part key: XXXXX-XXXXX-XXXXX)
    const steamPattern = /^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/i;
    if (steamPattern.test(trimmedCode) || text.includes("steam")) {
        return {
            url: `https://store.steampowered.com/account/registerkey?key=${encodeURIComponent(trimmedCode)}`,
            label: "Redeem on Steam",
            platform: "Steam"
        };
    }

    // 7. Epic Games / Fortnite
    if (text.includes("epic") || text.includes("fortnite")) {
        return {
            url: `https://store.epicgames.com/redeem?code=${encodeURIComponent(trimmedCode)}`,
            label: "Redeem on Epic",
            platform: "Epic Games"
        };
    }

    // 8. EA / EA Sports FC / Apex Legends
    if (text.includes("ea sports") || text.includes("fc 2") || text.includes("fifa") || text.includes("apex")) {
        return {
            url: "https://myaccount.ea.com/cp-ui/redemption/index",
            label: "Redeem on EA",
            platform: "EA"
        };
    }

    // 9. Riot Games (Valorant / League of Legends)
    if (text.includes("riot") || text.includes("valorant") || text.includes("league of legends")) {
        return {
            url: "https://shop.riotgames.com/en-us/redeem/",
            label: "Redeem on Riot",
            platform: "Riot"
        };
    }

    // Generic fallback for any other code
    return {
        url: `https://www.google.com/search?q=${encodeURIComponent(`${questName} redeem code`)}`,
        label: "Redeem Info ↗",
        platform: "External"
    };
}
