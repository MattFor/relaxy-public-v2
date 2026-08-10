'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import { isStruggling }     from '../../../src/Client/Modules/Core/LoadMonitor.js';
import { buildNodeOptions } from '../../../src/Client/Modules/Music/MusicOptions.js';

import {
    useQueue,
    useMainPlayer,
    QueryResolver
} from '../../../src/Client/Modules/MusicPlayer/index.js';

import {
    resolvePlaylistRequest,
    bringToFront
} from '../../../src/Client/Modules/MusicPlayer/utils/PlaylistRequest.js';

import {
    isYouTubeUrl,
    extractVideoId
} from '../../../src/Client/Modules/MusicPlayer/extractors/youtubeUrls.js';

export default {
    name:        'play',
    aliases:     ['p'],
    usage:       '=play [playlist] <keywords/link/attachment>',
    description: 'Play Youtube, Soundcloud, Spotify music, playlist or an attachment.\nA link that holds both a video and a playlist plays just that video - put **playlist** in front of it (`=play playlist <link>`) to queue the whole list with that video first.',

    slashDescription: 'Play a track, playlist or attachment from YouTube, SoundCloud or Spotify.',

    slash: new Discord.SlashCommandBuilder().addStringOption(option => option.setName('song').setDescription('Keywords or link, or "playlist <link>" to queue the link\'s whole playlist').setRequired(true).setMinLength(2).setMaxLength(800)),

    permissionsUser:         [
        'SEND_MESSAGES',
        'CONNECT'
    ],
    permissionsBot:          [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'CONNECT',
        'SPEAK'
    ],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction)
    {
        const queue = useQueue(message.guild.id);

        if (!queue && !client.isOwner(message.author.id) && isStruggling())
        {
            return client.qEmbed('Relaxy! is under heavy load right now and cannot start music on another server just yet - try again in a minute.', interaction ?? message);
        }

        let query = args?.[0]
            ? args.join(' ')
            : message.attachments?.first()?.url;

        if (!query)
        {
            return client.respond('No query provided!', interaction ?? message);
        }

        if (!message.member.voice.channel)
        {
            return client.qEmbed('NotConnected', interaction ?? message);
        }

        const empty = queue
            ? queue.isEmpty() && !queue.isPlaying()
            : true;

        const player = useMainPlayer();
        const channel = message.member.voice.channel;

        const playlist = resolvePlaylistRequest(query);

        if (playlist.error)
        {
            return client.qEmbed(playlist.error, interaction ?? message);
        }

        query = playlist.query;

        const isSingleVideo = isYouTubeUrl(query) && !!extractVideoId(query);

        const isPlaylist = !isSingleVideo && /[?&]list=|\/playlist|\/album\/|\/sets\/|spotify\.com\/playlist/i.test(query);

        const wait = isPlaylist
            ? await client.waiting(message, interaction, {
                title:       '⏳ Queueing playlist...',
                description: 'Resolving every track in the list. Large playlists can take a while.'
            })
            : null;

        const wasIdle = !queue;

        const abandon = () =>
        {
            if (!wasIdle)
            {
                return;
            }

            const node = useQueue(message.guild.id);

            if (node && node.isEmpty() && !node.isPlaying())
            {
                node.delete();
            }
        };

        const settle = async text =>
        {
            abandon();

            if (!wait)
            {
                return client.qEmbed(text, interaction ?? message);
            }

            await wait.finish(null, [
                {
                    color:       client.data.embedColor,
                    description: text
                }
            ]);

            return Infinity;
        };

        const nodeOptions = buildNodeOptions(client, guild, interaction ?? message);

        try
        {
            let err = null;

            const node = player.nodes.create(message.guild, nodeOptions);

            node.setMetadata(interaction ?? message);

            const connecting = node.channel
                ? null
                : node.connect(channel);

            const [searched] = await Promise.all([
                player.search(query, {
                    requestedBy: interaction
                                     ? interaction.member
                                     : message.member
                }),

                connecting?.catch(() =>
                {
                }) ?? Promise.resolve()
            ]);

            const result = await player.play(channel, searched, {
                nodeOptions,
                requestedBy: interaction
                                 ? interaction.member
                                 : message.member,
                afterSearch: found => bringToFront(found, playlist.firstVideoId)
            }).catch(e => err = e?.code);

            if (err === 'ERR_NO_RESULT')
            {
                return await settle(`No results found for ${query}!`);
            }

            if (err === 'ERR_SSL_TLSV1_ALERT_DECRYPT_ERROR')
            {
                return await settle('Critical Decryption Error, please do =skip if this song comes up.');
            }
        }
        catch (e)
        {
            if (e?.code === 'ERR_SSL_TLSV1_ALERT_DECRYPT_ERROR')
            {
                return await settle('Critical Decryption Error, please do =skip if this song comes up.');
            }

            client.log('ERROR', e);

            return await settle('Something went wrong queueing that.');
        }

        if (wait && !interaction)
        {
            await wait.dismiss();
            return;
        }

        if (interaction)
        {
            return await settle(empty
                ? 'Playing...'
                : 'Adding...');
        }
    }
};

