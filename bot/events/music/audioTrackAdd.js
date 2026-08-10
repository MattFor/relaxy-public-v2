'use strict';

import Relaxy     from '../../../src/Client/Relaxy.js';
import { Player } from '../../../src/Client/Modules/MusicPlayer/Player.js';

export default async (client, queue, track) =>
{
    const message = queue?.metadata;

    if (!message)
    {
        return;
    }

    const sanitizedServerName = client.utils.cstr(message.guild.name);
    const voiceChannel = message.member?.voice?.channel ?? 'Unavailable.';

    return client.send(message.channel, null, {
        default:   [
            {
                color: client.data.embedColor,
                title: track.title,
                url:   track.url,

                author:    {
                    name:     'Added to the queue:',
                    icon_url: client.config.text.links.musicImage
                },
                thumbnail: {
                    url: client.utils.trackThumbnail(track)
                },

                description: `Server: **${sanitizedServerName}**\nChannel: **${voiceChannel}**\nRequested by: **${track.requestedBy}**`
            }
        ],
        alternate: `## Added\nServer: **${sanitizedServerName}**\nChannel: **${voiceChannel}**\nRequested by: **${track.requestedBy}**\n\nTitle: ${track.title}\nUrl: ${track.url}`
    });
}
