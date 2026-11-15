'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

import { useQueue, QueueRepeatMode } from '../../../src/Client/Modules/MusicPlayer/index.js';

const PER_PAGE = 5;

const truncate = (value, max) => {
    const string = String(value ?? '');
    return string.length > max ? `${string.slice(0, max - 1)}…` : string;
};

const repeatLabel = (mode) =>
    mode === QueueRepeatMode.QUEUE
        ? 'Queue'
        : mode === QueueRepeatMode.TRACK
          ? 'Track'
          : mode === QueueRepeatMode.AUTOPLAY
            ? 'Autoplay'
            : 'Off';
const renderQueue = (client, message, queue, page) => {
    const upcoming = queue.tracks.map((track) => track);
    const pages = Math.max(1, Math.ceil(upcoming.length / PER_PAGE));
    page = Math.min(Math.max(0, page), pages - 1);

    const lines = upcoming
        .slice(page * PER_PAGE, page * PER_PAGE + PER_PAGE)
        .map(
            (track, i) =>
                `\`${page * PER_PAGE + i + 2}.\` **[${truncate(track.title, 55)}](${track.url})** [__${track.requestedBy ?? '?'}__]`
        );

    const total = client.imports.time((queue.estimatedDuration || 0) + (queue.currentTrack?.durationMS || 0));

    const description = [
        `**Now playing:** [${truncate(queue.currentTrack?.title ?? 'Nothing', 55)}](${queue.currentTrack?.url ?? ''})`,
        '',
        lines.length ? lines.join('\n') : '*No further tracks queued.*',
        `\`\`\`fix\n${upcoming.length + 1} track(s) · Total ${total} · Loop: ${repeatLabel(queue.repeatMode)}\n\`\`\``
    ].join('\n');

    const embed = {
        color: client.data.embedColor,
        author: {
            name: `Queue · ${message.guild.name} - Page ${page + 1}/${pages}`,
            icon_url: client.config.text.links.musicImage
        },
        description,
        thumbnail: { url: client.utils.trackThumbnail(queue.currentTrack) },
        footer: client.data.footer,
        timestamp: new Date()
    };

    const paused = queue.node.isPaused();

    const nav = new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
            .setCustomId('queueui_prev')
            .setEmoji('◀️')
            .setStyle(Discord.ButtonStyle.Secondary)
            .setDisabled(page === 0),
        new Discord.ButtonBuilder()
            .setCustomId('queueui_next')
            .setEmoji('▶️')
            .setStyle(Discord.ButtonStyle.Secondary)
            .setDisabled(page >= pages - 1),
        new Discord.ButtonBuilder()
            .setCustomId('queueui_refresh')
            .setEmoji('🔄')
            .setStyle(Discord.ButtonStyle.Secondary)
    );

    const controls = new Discord.ActionRowBuilder().addComponents(
        new Discord.ButtonBuilder()
            .setCustomId('queueui_pause')
            .setEmoji(paused ? '▶️' : '⏸️')
            .setStyle(Discord.ButtonStyle.Primary),
        new Discord.ButtonBuilder().setCustomId('queueui_skip').setEmoji('⏭️').setStyle(Discord.ButtonStyle.Primary),
        new Discord.ButtonBuilder()
            .setCustomId('queueui_shuffle')
            .setEmoji('🔀')
            .setStyle(Discord.ButtonStyle.Primary)
            .setDisabled(upcoming.length < 2),
        new Discord.ButtonBuilder()
            .setCustomId('queueui_loop')
            .setEmoji('🔁')
            .setStyle(
                queue.repeatMode === QueueRepeatMode.OFF ? Discord.ButtonStyle.Secondary : Discord.ButtonStyle.Success
            ),
        new Discord.ButtonBuilder().setCustomId('queueui_stop').setEmoji('⏹️').setStyle(Discord.ButtonStyle.Danger)
    );

    return {
        embeds: [embed],
        components: [nav, controls],
        pages
    };
};

const endedView = (client) => ({
    embeds: [
        {
            color: client.data.embedColor,
            description: 'The queue has ended.',
            footer: client.data.footer,
            timestamp: new Date()
        }
    ],
    components: []
});

export default {
    name: 'queue',
    aliases: ['showqueue', 'q', 'showq'],
    usage: '=queue',
    description: 'Show the song queue with buttons to page through it and control playback.',
    slashDescription: 'Show the current song queue.',

    slash: new Discord.SlashCommandBuilder(),

    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'MANAGE_MESSAGES'],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        const queue = useQueue(message.guild.id);

        if (!queue || (queue.tracks.size === 0 && !queue.currentTrack)) {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        let page = 0;
        const view = renderQueue(client, message, queue, page);

        let uiMessage;
        if (interaction) {
            await interaction.editReply({
                embeds: view.embeds,
                components: view.components
            });

            uiMessage = await interaction.fetchReply();
        } else {
            uiMessage = await message.channel.send({
                embeds: view.embeds,
                components: view.components
            });
        }

        const collector = uiMessage.createMessageComponentCollector({
            componentType: Discord.ComponentType.Button,
            filter: (pressed) => {
                const vc = message.guild.members.me?.voice?.channel;
                return vc ? vc.members.has(pressed.user.id) : pressed.user.id === message.author.id;
            },
            idle: 120 * 1000
        });

        collector.on('collect', async (pressed) => {
            const q = useQueue(message.guild.id);

            if (!q || (!q.currentTrack && q.tracks.size === 0)) {
                collector.stop('ended');
                return pressed.update(endedView(client)).catch(client.swallow('queue: endedView'));
            }

            switch (pressed.customId) {
                case 'queueui_prev':
                    page--;
                    break;

                case 'queueui_next':
                    page++;
                    break;

                case 'queueui_refresh':
                    break;

                case 'queueui_pause':
                    q.node.setPaused(!q.node.isPaused());
                    break;

                case 'queueui_skip':
                    q.node.skip();
                    break;

                case 'queueui_shuffle':
                    if (q.tracks.size >= 2) {
                        q.tracks.shuffle();
                    }
                    break;

                case 'queueui_loop':
                    q.setRepeatMode(q.repeatMode === QueueRepeatMode.OFF ? QueueRepeatMode.QUEUE : QueueRepeatMode.OFF);
                    break;

                case 'queueui_stop':
                    q.delete();
                    collector.stop('stopped');

                    return pressed
                        .update({
                            embeds: [
                                {
                                    color: client.data.embedColor,
                                    description: 'Playback stopped and the queue was cleared.',
                                    footer: client.data.footer,
                                    timestamp: new Date()
                                }
                            ],
                            components: []
                        })
                        .catch(client.swallow('queue: Date'));
            }

            const fresh = useQueue(message.guild.id);
            if (!fresh || (!fresh.currentTrack && fresh.tracks.size === 0)) {
                collector.stop('ended');
                return pressed.update(endedView(client)).catch(client.swallow('queue: endedView'));
            }

            const next = renderQueue(client, message, fresh, page);
            page = Math.min(Math.max(0, page), next.pages - 1);

            return pressed
                .update({
                    embeds: next.embeds,
                    components: next.components
                })
                .catch(client.swallow('queue: update'));
        });

        collector.on('end', (_collected, reason) => {
            if (reason === 'stopped' || reason === 'ended') {
                return;
            }

            uiMessage.edit({ components: [] }).catch(client.swallow('queue: edit'));
        });
    }
};
