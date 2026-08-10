'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import {
    useQueue,
    useTimeline
} from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:        'pause',
    usage:       '=pause',
    description: 'Pauses the currently playing song.',

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction)
    {
        const queue = useQueue(message.guild.id);

        if (!message.member.voice.channel)
        {
            return client.qEmbed('NotConnected', interaction ?? message);
        }

        if (!queue)
        {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        const timeline = useTimeline({ node: queue });

        if (timeline.paused)
        {
            return client.qEmbed('Cannot pause while paused already!', interaction ?? message);
        }

        if (message.guild?.members?.me?.voice?.channel && message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id)
        {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        timeline.pause();

        return client.send(interaction ?? message.channel, null, [
            {
                color:       client.data.embedColor,
                title:       client.utils.firstLetterUp(queue.currentTrack.title),
                url:         queue.currentTrack.url,
                description: `Has been **paused!**`,
                thumbnail:   {
                    url: client.utils.trackThumbnail(queue.currentTrack)
                }
            }
        ]);
    }
};
