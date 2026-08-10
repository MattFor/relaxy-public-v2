'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';
import {
    useQueue,
    useMainPlayer
}              from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:             'lyrics',
    usage:            '=lyrics [song name]',
    description:      'Tries to show the accurate lyrics of a song (and some artist info).\nIf a song is playing on Relaxy! and you don\'t provide any title it will autosearch the current song title.\n`DISCLAIMER:` **this usually doesn\'t work as the title\'s too complicated for the search engine.**',
    slashDescription: 'Shows current song\'s lyrics or the searched song\'s lyrics.',

    slash: new Discord.SlashCommandBuilder().addStringOption(option => option.setName('song_name').setDescription('Name of the song to search.').setRequired(false).setMinLength(2).setMaxLength(800)),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const startTime = Date.now();
        const queue = useQueue(message.guild.id);
        const track = queue?.currentTrack?.title;

        const player = useMainPlayer();

        const search = args.length
            ? args.join(' ')
            : track;

        if (!search)
        {
            return client.qEmbed('No input provided and no song is playing!', interaction ?? message);
        }

        const lyrics = await player.lyrics.search({ q: search }).catch(error =>
        {
            client.log('WARN', `lyrics: search for "${search}" failed - ${error?.message ?? error}`);
            return null;
        });

        if (!lyrics?.length || !lyrics[0]?.plainLyrics)
        {
            return client.qEmbed(`No lyrics found for **${search}**!`, interaction ?? message);
        }

        const found = lyrics[0];

        const slug = text => encodeURIComponent(String(text ?? '')
            .trim()
            .replace(/['’]/g, '')
            .replace(/[^\w\s-]/g, ' ')
            .trim()
            .replace(/\s+/g, '-'));

        const artist = slug(found.artistName);
        const song = slug(found.trackName ?? found.name);

        let embed = {
            color: client.data.embedColor,
            title: `Song name: ${found.name}`,
            url:   artist && song
                       ? `https://genius.com/${artist}-${song}-lyrics`
                       : null,

            author: artist
                        ? {
                    name: `Author: ${found.artistName}`,
                    url:  `https://genius.com/artists/${artist}`
                }
                        : { name: `Author: ${found.artistName ?? 'Unknown'}` },

            fields: [],

            footer: {
                icon_url: client.config.text.links.relaxyImage,
                text:     `Scraped and combined in ${client.imports.time(Date.now() - startTime)}`
            },

            timestamp: new Date()
        };

        embed = client.utils.createDescription(`From album: ${found.albumName ?? 'Unavailable'}\n\n${found.plainLyrics.slice(0, 5500)}`, embed);

        return client.send(interaction ?? message.channel, null, [embed]);
    }
};
