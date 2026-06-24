/*
 * Vencord, a Discord client mod
 * Copyright (c) 2026 Vendicated and contributors
 * SPDX-License-Identifier: GPL-3.0-or-later
 */

import { FluxDispatcher, RestAPI } from "@webpack/common";

import { AppState, isRunning, log, sleep } from "../core/state";
import { ChannelStore, GuildChannelStore, RunningGameStore, StreamingStore } from "../core/stores";
import { settings } from "../settings";
import { Quest, QuestTaskInfo } from "../types";

export async function watchVideo(quest: Quest, taskInfo: QuestTaskInfo): Promise<void> {
    const baseSpeed = settings.store.videoSpeed;
    const randomize = settings.store.randomizeProgress;
    let current = taskInfo.progress;
    log(`Started video task: ${quest.config.messages.questName}`, "info", true);

    while (current < taskInfo.target && isRunning) {
        await AppState.pauseManager.waitIfPaused();

        const speed = randomize ? baseSpeed * (0.8 + Math.random() * 0.4) : baseSpeed;
        const add = Math.min(speed, taskInfo.target - current);

        AppState.nextHeartbeatTime = Date.now() + (add * 1000);
        await sleep(add * 1000);
        await AppState.pauseManager.waitIfPaused();

        current = Math.min(taskInfo.target, current + add);
        const res = await RestAPI.post({
            url: `/quests/${quest.id}/video-progress`,
            body: { timestamp: current + Math.random() }
        });

        if ((res.body as any).completed_at) break;
    }

    if (isRunning) {
        AppState.nextHeartbeatTime = null;
        await RestAPI.post({
            url: `/quests/${quest.id}/video-progress`,
            body: { timestamp: taskInfo.target }
        });
    }
}

export async function spoofDispatcherEvent(
    quest: Quest,
    taskInfo: QuestTaskInfo,
    spooferSetup: () => () => void
): Promise<void> {
    if (typeof (window as any).DiscordNative === "undefined") {
        log(`This task cannot be done in browser: ${quest.config.messages.questName}`, "error", true);
        throw new Error("Requires desktop app.");
    }

    const cleanup = spooferSetup();
    const remaining = Math.ceil((taskInfo.target - taskInfo.progress) / 60);
    log(`Detected ${quest.config.messages.questName}. Estimated time: ${remaining} minutes...`, "warn", true);

    AppState.nextHeartbeatTime = Date.now() + 60000;

    return new Promise<void>(resolve => {
        const listener = (data: any) => {
            if (AppState.pauseManager.isPaused || !isRunning) {
                if (!isRunning) cleanup();
                return;
            }

            AppState.nextHeartbeatTime = Date.now() + 60000;

            const progress = quest.config.configVersion === 1
                ? data.userStatus.streamProgressSeconds
                : Math.floor(data.userStatus.progress[taskInfo.name!].value);

            if (progress >= taskInfo.target) {
                cleanup();
                AppState.nextHeartbeatTime = null;
                FluxDispatcher.unsubscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
                resolve();
            }
        };
        FluxDispatcher.subscribe("QUESTS_SEND_HEARTBEAT_SUCCESS", listener);
    });
}

export async function playDesktop(quest: Quest, taskInfo: QuestTaskInfo): Promise<void> {
    const appId = quest.config.application.id;
    const res = await RestAPI.get({ url: `/applications/public?application_ids=${appId}` });
    const appData = (res.body as any[])[0];
    const exeName = appData.executables?.find((x: any) => x.os === "win32")?.name?.replace(">", "")
        ?? appData.name.replace(/[/\\:*?"<>|]/g, "");

    const fakeGame = {
        cmdLine: `C:\\Program Files\\${appData.name}\\${exeName}`,
        exeName,
        exePath: `c:/program files/${appData.name.toLowerCase()}/${exeName}`,
        hidden: false,
        isLauncher: false,
        id: appId,
        name: appData.name,
        pid: 1337,
        pidPath: [1337],
        processName: appData.name,
        start: Date.now()
    };
    const realGames = RunningGameStore.getRunningGames();

    return spoofDispatcherEvent(quest, taskInfo, () => {
        const setupGame = () => {
            const originalGetGames = RunningGameStore.getRunningGames;
            const originalGetGameForPID = RunningGameStore.getGameForPID;

            RunningGameStore.getRunningGames = () => [fakeGame];
            RunningGameStore.getGameForPID = () => fakeGame;
            FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: realGames, added: [fakeGame], games: [fakeGame] });

            AppState.spoofers.restoreGame = () => {
                RunningGameStore.getRunningGames = originalGetGames;
                RunningGameStore.getGameForPID = originalGetGameForPID;
                FluxDispatcher.dispatch({ type: "RUNNING_GAMES_CHANGE", removed: [fakeGame], added: [], games: [] });
                AppState.spoofers.restoreGame = null;
            };

            return AppState.spoofers.restoreGame!;
        };
        AppState.spoofers.setupGame = setupGame;
        return setupGame();
    });
}

export async function streamDesktop(quest: Quest, taskInfo: QuestTaskInfo): Promise<void> {
    const originalFunc = StreamingStore.getStreamerActiveStreamMetadata;

    return spoofDispatcherEvent(quest, taskInfo, () => {
        const setupStream = () => {
            StreamingStore.getStreamerActiveStreamMetadata = () => ({
                id: quest.config.application.id,
                pid: 1337,
                sourceName: null
            });
            AppState.spoofers.restoreStream = () => {
                StreamingStore.getStreamerActiveStreamMetadata = originalFunc;
                AppState.spoofers.restoreStream = null;
            };
            return AppState.spoofers.restoreStream!;
        };
        AppState.spoofers.setupStream = setupStream;
        return setupStream();
    });
}

export async function playActivity(quest: Quest, taskInfo: QuestTaskInfo): Promise<void> {
    const channelId =
        ChannelStore.getSortedPrivateChannels()[0]?.id ??
        (Object.values(GuildChannelStore.getAllGuilds()) as any[]).find(x => x?.VOCAL?.length > 0)?.VOCAL[0].channel.id;
    const streamKey = `call:${channelId}:1`;
    let current = taskInfo.progress;

    log(`Started activity task: ${quest.config.messages.questName}`, "info", true);

    while (current < taskInfo.target && isRunning) {
        await AppState.pauseManager.waitIfPaused();
        const res = await RestAPI.post({
            url: `/quests/${quest.id}/heartbeat`,
            body: { stream_key: streamKey, terminal: false }
        });
        current = (res.body as any).progress.PLAY_ACTIVITY.value;

        const baseInterval = settings.store.activityInterval;
        const randomize = settings.store.randomizeProgress;
        const interval = randomize ? baseInterval * (0.8 + Math.random() * 0.4) : baseInterval;

        AppState.nextHeartbeatTime = Date.now() + (interval * 1000);
        await sleep(interval * 1000);
        await AppState.pauseManager.waitIfPaused();
    }

    if (isRunning) {
        AppState.nextHeartbeatTime = null;
        await RestAPI.post({
            url: `/quests/${quest.id}/heartbeat`,
            body: { stream_key: streamKey, terminal: true }
        });
    }
}
