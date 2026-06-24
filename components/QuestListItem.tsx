/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { getQuestReward, getTaskInfo } from "../api/questApi";
import { Quest } from "../types";

interface QuestListItemProps {
    quest: Quest;
    isActive: boolean;
}

export function QuestListItem({ quest, isActive }: QuestListItemProps) {
    const info = getTaskInfo(quest);
    const reward = getQuestReward(quest);
    return (
        <div className={`vc-quest-list-item ${isActive ? "active" : ""}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="vc-quest-list-item-name">{quest.config.messages.questName}</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: "6px", alignItems: "center" }}>
                    <video src="https://cdn.discordapp.com/assets/content/b8fe318002139f2fabd6255aef10a0a625bb10aa9f8394efd6575115c1dca19a.webm" autoPlay loop muted playsInline width="16" height="16" style={{ pointerEvents: "none" }} />
                    {reward.orbs > 0 ? `${reward.orbs} Orbs` : reward.name}
                </span>
            </div>
            <span className="vc-quest-list-item-type">{info.name ?? "?"}</span>
        </div>
    );
}
