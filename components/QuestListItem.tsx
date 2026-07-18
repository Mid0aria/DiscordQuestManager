/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { React } from "@webpack/common";

import { getQuestReward, getTaskInfo } from "../api/questApi";
import { ORB_ICON_URL, Quest } from "../types";

interface QuestListItemProps {
    quest: Quest;
    isActive: boolean;
    onRemove?: () => void;
    onMoveUp?: () => void;
    onMoveDown?: () => void;
    canMoveUp?: boolean;
    canMoveDown?: boolean;
}

export function QuestListItem({ quest, isActive, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: QuestListItemProps) {
    const info = getTaskInfo(quest);
    const reward = getQuestReward(quest);
    const showControls = onRemove || onMoveUp || onMoveDown;

    return (
        <div className={`vc-quest-list-item ${isActive ? "active" : ""}`}>
            <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                <span className="vc-quest-list-item-name">{quest.config.messages.questName}</span>
                <span style={{ fontSize: "12px", color: "var(--text-muted)", display: "flex", gap: "6px", alignItems: "center" }}>
                    <video src={ORB_ICON_URL} autoPlay loop muted playsInline width="16" height="16" style={{ pointerEvents: "none" }} />
                    {reward.orbs > 0 ? `${reward.orbs} Orbs` : reward.name}
                </span>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span className="vc-quest-list-item-type">{info.name ?? "?"}</span>
                {showControls && (
                    <div className="vc-quest-item-controls">
                        {onMoveUp && (
                            <button
                                className="vc-quest-item-control-btn"
                                disabled={!canMoveUp}
                                title="Move up"
                                onClick={e => { e.stopPropagation(); onMoveUp(); }}
                            >▲</button>
                        )}
                        {onMoveDown && (
                            <button
                                className="vc-quest-item-control-btn"
                                disabled={!canMoveDown}
                                title="Move down"
                                onClick={e => { e.stopPropagation(); onMoveDown(); }}
                            >▼</button>
                        )}
                        {onRemove && (
                            <button
                                className="vc-quest-item-control-btn vc-quest-item-remove"
                                title="Remove from queue"
                                onClick={e => { e.stopPropagation(); onRemove(); }}
                            >✕</button>
                        )}
                    </div>
                )}
            </div>
        </div>
    );
}
