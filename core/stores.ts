/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { filters, waitFor } from "@webpack";

export let QuestsStore: any = null;
export let StreamingStore: any = null;
export let RunningGameStore: any = null;
export let ChannelStore: any = null;
export let GuildChannelStore: any = null;

waitFor(filters.byProps("getQuest"), s => { QuestsStore = s; });
waitFor(filters.byStoreName("ApplicationStreamingStore"), s => { StreamingStore = s; });
waitFor(filters.byStoreName("RunningGameStore"), s => { RunningGameStore = s; });
waitFor(filters.byStoreName("ChannelStore"), s => { ChannelStore = s; });
waitFor(filters.byStoreName("GuildChannelStore"), s => { GuildChannelStore = s; });

export let QuestActions: any = null;
waitFor(filters.byProps("claimQuestReward"), s => { QuestActions = s; });
if (!QuestActions) {
    waitFor(filters.byProps("enrollInQuest"), s => { QuestActions = s; });
}
