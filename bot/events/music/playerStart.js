'use strict';

import Relaxy from '../../../src/Client/Relaxy.js';
import { Player } from '../../../src/Client/Modules/MusicPlayer/Player.js';

export default (client, queue, track) => {
    client.prefetcher?.onTrackStart(queue, track);

    if (client.data.serverCache[queue.metadata.guild.id]) {
        if (client.data.serverCache[queue.metadata.guild.id]['musicmessage_1']) {
            return;
        } else {
            client.data.serverCache[queue.metadata.guild.id]['musicmessage_1'] = true;

            setTimeout(() => {
                client.data.serverCache[queue.metadata.guild.id]['musicmessage_1'] = false;
            }, 1000);
        }
    }

    const message = queue.metadata;
    const sanitizedServerName = client.utils.cstr(message.guild.name);
    const voiceChannel = message.member?.voice?.channel ?? 'Unavailable.';

    if (!message.channel) {
        client.log('Queue metadata playerStart', queue.metadata);
        return;
    }

    return client.send(message.channel, null, {
        default: [
            {
                thumbnail: {
                    url: client.utils.trackThumbnail(track)
                },
                color: client.data.embedColor,
                title: track.title,
                url: track.url,
                description: `Server: **${sanitizedServerName}**\nChannel: **${voiceChannel}**\nRequested by: **${track.requestedBy}**`,
                author: {
                    name: queue.JUMPED ? 'Jumped to:' : 'Now playing:',
                    icon_url: client.config.text.links.musicImage
                }
            }
        ],
        alternative: `Server: **${sanitizedServerName}**\nChannel: **${voiceChannel}**\nRequested by: **${track.requestedBy}**\n\nTitle: ${track.title}\nUrl: ${track.url}`
    });
};
