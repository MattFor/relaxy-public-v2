'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { useQueue, QueueRepeatMode } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name: 'repeat',
    aliases: ['repeater'],
    usage: '=repeat',
    description: 'Toggle repeating of the currently playing song.',

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        const queue = useQueue(message.guild.id);

        if (!message.member.voice.channel) {
            return client.qEmbed('NotConnected', interaction ?? message);
        }

        if (!queue) {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        if (
            message.guild?.members?.me?.voice?.channel &&
            message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id
        ) {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        const track = queue?.currentTrack;

        if (!track) {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        if (queue.repeatMode === QueueRepeatMode.TRACK) {
            queue.setRepeatMode(QueueRepeatMode.OFF);

            return client.send(interaction ? 1 : message.channel, null, [
                {
                    color: client.data.embedColor,
                    author: {
                        name: 'Repeating disabled for:',
                        icon_url: client.config.text.links.musicImage
                    },
                    title: client.utils.firstLetterUp(track.title),
                    url: track.url,
                    thumbnail: {
                        url: client.utils.trackThumbnail(track)
                    },
                    timestamp: new Date()
                }
            ]);
        }

        queue.setRepeatMode(QueueRepeatMode.TRACK);

        return client.send(interaction ? 1 : message.channel, null, [
            {
                color: client.data.embedColor,
                author: {
                    name: 'Repeating on for:',
                    icon_url: client.config.text.links.musicImage
                },
                title: client.utils.firstLetterUp(track.title),
                url: track.url,
                thumbnail: {
                    url: client.utils.trackThumbnail(track)
                },
                timestamp: new Date()
            }
        ]);
    }
};
