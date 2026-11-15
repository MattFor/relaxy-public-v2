'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { useQueue, useTimeline } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name: 'song',
    aliases: ['track', 'nowplaying'],
    usage: '=song',
    description: 'Shows information about the currently playing song.',

    slash: new Discord.SlashCommandBuilder(),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        const queue = useQueue(message.guild.id);

        if (!queue || !queue.currentTrack) {
            return client.qEmbed('Nothing is playing!', interaction ?? message);
        }

        const track = queue.currentTrack;

        const timeline = useTimeline({ node: queue });

        let lag = queue.player.eventLoopLag.toFixed(0);
        lag = `Lag: ${lag === '-1' ? 'Calculating...' : `${lag}ms`}`;

        let fields = [
            {
                name: 'Author',
                value:
                    typeof track.author === 'object'
                        ? track.requestedBy
                            ? client.utils.firstLetterUp(track.requestedBy.username)
                            : 'Unavailable.'
                        : !!track?.raw?.channel?.url
                          ? `[${client.utils.firstLetterUp(track.author)}](${track.raw.channel.url})`
                          : client.utils.firstLetterUp(track.author),
                inline: true
            },
            {
                name: 'Requested by',
                value: `**${track.requestedBy ?? 'Unavailable.'}**`,
                inline: true
            },
            {
                name: 'Playlist',
                value: !!track.playlist ? `[${track.playlist.title}](${track.playlist.url})` : 'No',
                inline: true
            }
        ];

        if (!track?.duration?.includes('NaN')) {
            fields.push({
                name: 'Progress',
                value: `${queue.node.createProgressBar()} (${timeline.timestamp?.progress}%)`,
                inline: true
            });
        } else {
            fields.push({
                name: 'Progress',
                value:
                    typeof track.author === 'object'
                        ? 'Unable to display attachment video length.'
                        : "Video duration metadata damaged, can't display :("
            });
        }

        return client.send(interaction ?? message.channel, null, [
            {
                color: client.data.embedColor,
                title: client.utils.firstLetterUp(track.title),
                url: track.url,
                author: {
                    name: `Now playing | ${lag}`,
                    icon_url: client.config.text.links.musicImage
                },

                thumbnail: {
                    url: client.utils.trackThumbnail(track)
                },

                fields: fields,

                footer: client.data.footer,
                timestamp: new Date()
            }
        ]);
    }
};
