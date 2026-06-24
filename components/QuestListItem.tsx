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
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="var(--brand-experiment)" stroke="none"><circle cx="12" cy="12" r="10" /></svg>
                    {reward.orbs > 0 ? `${reward.orbs} Orbs` : reward.name}
                </span>
            </div>
            <span className="vc-quest-list-item-type">{info.name ?? "?"}</span>
        </div>
    );
}
