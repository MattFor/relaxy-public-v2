'use strict';

import Relaxy from '../../../src/Client/Relaxy.js';

import { startLoadMonitor } from '../../../src/Client/Modules/Core/LoadMonitor.js';
import { startVoiceActivity } from '../../../src/Client/Modules/Progression/VoiceActivity.js';
import { startDailyStats } from '../../../src/Client/Modules/Progression/DailyStats.js';

export default {
    async run(client) {
        client.log('DATA', `Ready event triggered. ${client.imports.time(Date.now() - client.createdAt)}`);

        startLoadMonitor();

        startVoiceActivity(client);

        startDailyStats(client);

        if (typeof client.cluster?.triggerReady === 'function' && !client.cluster.ready) {
            client.cluster.triggerReady();
        }

        let timeout = 0;

        const readyInterval = setInterval(() => {
            if (client.data.ready || timeout >= 20) {
                clearInterval(readyInterval);

                if (client._pendingStatus) {
                    client.setStatus(client._pendingStatus.status, client._pendingStatus.reclustering, true);
                    client._pendingStatus = null;
                }

                return client.core.Status();
            }

            if (timeout % 1000 === 0) {
                client.log('DATA', `Status timeout: ${timeout}`);
            }

            timeout += 100;
        }, 100);

        client.core.Mutes();
        client.core.Modlogs();
        client.core.Reminds();
        client.core.ClearingChannels();
        client.core.leaveVoiceChannels();
        client.core.blackListProcessing();
        client.core.privateChannelClearing();

        client.core.syncScamImageMemory().catch(client.swallow('clientReady: scam image sync'));

        client.clearServerCache();

        for (const discordGuild of client.guilds.cache.values()) {
            client.core.raidBoot(discordGuild).catch(client.swallow('clientReady: raidBoot'));
        }

        const readyText = `Ready on ${client.guilds.cache.size} Servers with ${client.guilds.cache
            .map((g) => {
                return g.memberCount ?? 0;
            })
            .reduce((acc, count) => {
                return acc + count;
            }, 0)} total members. [${client.imports.time(Date.now() - client.createdAt)}]`;

        const awaitForDatabase = setInterval(() => {
            if (client.module.database.isWorkerReadyToGetMessage) {
                clearInterval(awaitForDatabase);
                client.setupGuilds();
            }
        }, 100);

        setTimeout(() => client.log(readyText), 150);
    }
};
