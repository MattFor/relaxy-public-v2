'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import { isStruggling }     from '../../../src/Client/Modules/Core/LoadMonitor.js';
import { buildNodeOptions } from '../../../src/Client/Modules/Music/MusicOptions.js';

import {
    useQueue,
    useMainPlayer
} from '../../../src/Client/Modules/MusicPlayer/index.js';

import {
    resolvePlaylistRequest,
    bringToFront
} from '../../../src/Client/Modules/MusicPlayer/utils/PlaylistRequest.js';

export default {
    name:             'pskip',
    aliases:          ['playskip'],
    usage:            '=pskip [playlist] <keywords/link/attachment>',
    description:      'Works exactly like **`=p`**, difference is that =pskip doesn\'t add the track to the end of the queue but instead replaces the currently playing track. Accepts mp3/4/mov/webm s.',
    slashDescription: 'Play a song immediately after skipping the current one.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option.setName('video_name').setDescription('Keywords or link, or "playlist <link>" to queue the link\'s whole playlist').setRequired(true).setMinLength(2).setMaxLength(800)),

    cooldown: 2,

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

        if (!useQueue(message.guild.id) && !client.isOwner(message.author.id) && isStruggling())
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

        if (message.guild.members.me.voice && message.guild.members.me.voice.channel && (message.member.voice.channel.full && message.guild.members.me.voice.channel.id !== message.member.voice.channel.id) && message.guild.members.me.voice.channel.id !== message.member.voice.channel.id)
        {
            return client.qEmbed('Voice channel is full!', interaction ?? message);
        }

        if (message.guild?.members?.me?.voice?.channel && message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id)
        {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        const playlist = resolvePlaylistRequest(query);

        if (playlist.error)
        {
            return client.qEmbed(playlist.error, interaction ?? message);
        }

        query = playlist.query;

        const queue = useQueue(message.guild.id);
        const player = useMainPlayer();
        const channel = message.member.voice.channel;
        const requestedBy = interaction
            ? interaction.member
            : message.member;

        queue?.setMetadata(interaction ?? message);

        client.module.profiles.Achievement(message, 'playedtrack', guild);

        if (!queue?.currentTrack)
        {
            let err = null;

            await player.play(channel, query, {
                nodeOptions: buildNodeOptions(client, guild, interaction ?? message),
                requestedBy,
                afterSearch: searched => bringToFront(searched, playlist.firstVideoId)
            }).catch(e => err = e?.code);

            if (err === 'ERR_NO_RESULT')
            {
                return client.qEmbed(`No results found for ${query}!`, interaction ?? message);
            }

            if (err === 'ERR_SSL_TLSV1_ALERT_DECRYPT_ERROR')
            {
                return client.qEmbed('Critical Decryption Error, please do =skip if this song comes up.', interaction ?? message);
            }

            return interaction
                ? client.qEmbed('Playing...', interaction)
                : null;
        }

        let error = null;

        const result = await player.search(query, { requestedBy }).catch(e =>
        {
            error = e;
            return null;
        });

        if (error)
        {
            client.data.errors++;
            client.log('ERROR', error);

            return client.qEmbed(`Encountered an error:\n${error.message}`, interaction ?? message);
        }

        if (!result || result.isEmpty())
        {
            return client.qEmbed(`No results found for ${query}!`, interaction ?? message);
        }

        bringToFront(result, playlist.firstVideoId);

        const tracks = result.playlist
            ? result.playlist.tracks
            : [result.tracks[0]];

        queue.prepend(tracks);
        queue.node.skip();

        return interaction
            ? client.qEmbed('Skipping...', interaction)
            : null;
    }
};
