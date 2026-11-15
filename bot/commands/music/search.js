'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { buildNodeOptions } from '../../../src/Client/Modules/Music/MusicOptions.js';

import { useQueue, useMainPlayer } from '../../../src/Client/Modules/MusicPlayer/index.js';

const truncate = (value, max) => {
    const string = String(value ?? '');
    return string.length > max ? `${string.slice(0, max - 1)}…` : string;
};

const hasDuration = (track) => track?.duration && track.duration !== '0:00' && !track.duration.includes('NaN');

export default {
    name: 'search',
    usage: '=search <keywords>',
    description: 'Search YouTube and pick a result from a dropdown menu to play.',

    slash: new Discord.SlashCommandBuilder().addStringOption((option) =>
        option
            .setName('song_name')
            .setDescription('Name of the video to search.')
            .setRequired(true)
            .setMinLength(2)
            .setMaxLength(800)
    ),

    args: true,

    permissionsUser: ['SEND_MESSAGES', 'CONNECT'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'CONNECT', 'SPEAK'],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        if (!message.member.voice.channel) {
            return client.qEmbed('NotConnected', interaction ?? message);
        }

        if (
            message.guild.members.me.voice?.channel &&
            message.member.voice.channel.full &&
            message.guild.members.me.voice.channel.id !== message.member.voice.channel.id
        ) {
            return client.qEmbed('Voice channel is full!', interaction ?? message);
        }

        if (!message.member.voice.channel.joinable) {
            return client.qEmbed("Can't join your voice channel!", interaction ?? message);
        }

        if (
            message.guild?.members?.me?.voice?.channel &&
            message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id
        ) {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        if (message.attachments.size > 0) {
            return client.qEmbed('Cannot search with an attachment!', interaction ?? message);
        }

        const player = useMainPlayer();
        const channel = message.member.voice.channel;
        const query = args.join(' ').replaceAll('\n', '').replaceAll('\r\n', '');

        const song = await client.player.search(query, { requestedBy: message.author }).catch(() => null);
        const results = (song?.tracks ?? []).slice(0, 15);

        if (!results.length) {
            return client.qEmbed(`No results found for ${query}!`, interaction ?? message);
        }

        const listText = results
            .map(
                (track, i) =>
                    `\`${i + 1}.\` **[${truncate(track.title, 60)}](${track.url})**${
                        hasDuration(track) ? ` \`${track.duration}\`` : ''
                    }`
            )
            .join('\n');

        const menu = new Discord.StringSelectMenuBuilder()
            .setCustomId('searchui_pick')
            .setPlaceholder('Pick a track to play…')
            .addOptions(
                results.map((track, i) => ({
                    label: truncate(`${i + 1}. ${track.title}`, 100),
                    description: truncate(
                        `${track.author ?? 'Unknown'}${hasDuration(track) ? ` · ${track.duration}` : ''}`,
                        100
                    ),
                    value: String(i)
                }))
            );

        const embed = {
            color: client.data.embedColor,
            author: {
                name: `Search results for: ${client.utils.firstLetterUp(query)}`,
                icon_url: client.config.text.links.musicImage
            },
            description: listText,
            thumbnail: { url: results[0].thumbnail },
            footer: client.data.footer,
            timestamp: new Date()
        };

        const row = new Discord.ActionRowBuilder().addComponents(menu);

        let uiMessage;
        if (interaction) {
            await interaction.editReply({
                embeds: [embed],
                components: [row]
            });

            uiMessage = await interaction.fetchReply();
        } else {
            uiMessage = await message.channel.send({
                embeds: [embed],
                components: [row]
            });
        }

        const collector = uiMessage.createMessageComponentCollector({
            componentType: Discord.ComponentType.StringSelect,
            filter: (pressed) => pressed.user.id === message.author.id && pressed.customId === 'searchui_pick',
            idle: 60 * 1000,
            max: 1
        });

        collector.on('collect', async (pressed) => {
            const track = results[parseInt(pressed.values[0], 10)];
            if (!track) {
                return;
            }

            const existing = useQueue(message.guild.id);
            const willPlayNow = existing ? existing.isEmpty() && !existing.isPlaying() : true;

            existing?.setMetadata(interaction ?? message);

            const err = await player
                .play(channel, track.url, {
                    nodeOptions: buildNodeOptions(client, guild, interaction ?? message),
                    requestedBy: message.member
                })
                .then(() => null)
                .catch((e) => e);

            if (err) {
                client.log('ERROR', err);
            }

            return pressed
                .update({
                    embeds: [
                        {
                            color: client.data.embedColor,
                            author: {
                                name: err
                                    ? 'Could not play that track'
                                    : willPlayNow
                                      ? 'Now playing'
                                      : 'Added to queue',
                                icon_url: client.config.text.links.musicImage
                            },
                            description: `**[${truncate(track.title, 80)}](${track.url})**${
                                hasDuration(track) ? ` \`${track.duration}\`` : ''
                            }`,
                            thumbnail: { url: track.thumbnail },
                            footer: client.data.footer,
                            timestamp: new Date()
                        }
                    ],
                    components: []
                })
                .catch(client.swallow('search: Date'));
        });

        collector.on('end', (collected, reason) => {
            if (reason === 'limit' || collected.size) {
                return;
            }

            const expired = new Discord.ActionRowBuilder().addComponents(
                Discord.StringSelectMenuBuilder.from(menu).setDisabled(true).setPlaceholder('Search timed out')
            );
            uiMessage.edit({ components: [expired] }).catch(client.swallow('search: edit'));
        });
    }
};
