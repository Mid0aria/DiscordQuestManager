/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { getTaskInfo } from "../api/questApi";
import { Quest } from "../types";

interface QuestListItemProps {
    quest: Quest;
    isActive: boolean;
}

export function QuestListItem({ quest, isActive }: QuestListItemProps) {
    const info = getTaskInfo(quest);
    return (
        <div className={`vc-quest-list-item ${isActive ? "active" : ""}`}>
            <span className="vc-quest-list-item-name">{quest.config.messages.questName}</span>
            <span className="vc-quest-list-item-type">{info.name ?? "?"}</span>
        </div>
    );
}
