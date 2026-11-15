'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';
import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';
import { AudioFilters } from '../../../src/Client/Modules/MusicPlayer/utils/AudioFilters.js';

const filterNames = AudioFilters.names;
const filtersDescription = filterNames.map((f) => `\`${f}\``).join(', ');

export default {
    name: 'filter',
    usage: '=filter [filter]',
    description: `Apply an audio filter to the currently playing song and everything queued after it. Run with no argument to see the active filters.\n**Available filters:** ${filtersDescription}`,
    slashDescription: 'Apply an audio filter to the current song.',

    slash: new Discord.SlashCommandBuilder().addStringOption((option) =>
        option
            .setName('filter_name')
            .setDescription('Filter to toggle. Leave empty to list the active ones.')
            .setRequired(false)
    ),

    cooldown: 10,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const queue = useQueue(message.guild.id);

        if (!message.member.voice.channel) {
            return client.qEmbed('You need to be in a voice channel to use this!', interaction ?? message);
        }

        if (!queue || !queue.currentTrack) {
            return client.qEmbed('Nothing is playing right now!', interaction ?? message);
        }

        const botVoice = message.guild.members.me.voice;
        if (botVoice?.channel && botVoice.channel.id !== message.member.voice.channel.id) {
            return client.qEmbed('You need to be in the same voice channel as Relaxy!', interaction ?? message);
        }

        const describe = () => {
            const enabled = queue.filters.ffmpeg.getFiltersEnabled();
            return `**Active filters:**\n${
                enabled.length === 0 ? 'No filters are enabled right now!' : enabled.map((f) => `- \`${f}\``).join('\n')
            }`;
        };

        if (!args[0]) {
            return client.qEmbed(describe(), interaction ?? message);
        }

        const input = String(args[0]).toLowerCase();
        const filter = filterNames.find((f) => f.toLowerCase() === input);

        if (!filter) {
            return client.qEmbed(
                `Unknown filter \`${args[0]}\`.\n\n**Available filters:** ${filtersDescription}`,
                interaction ?? message
            );
        }

        const alreadyOn = queue.filters.ffmpeg.getFiltersEnabled().includes(filter);

        if (!alreadyOn && queue.filters.ffmpeg.getFiltersEnabled().length >= 4) {
            return client.qEmbed(
                'You can only have up to 4 filters active at once. Remove one first!',
                interaction ?? message
            );
        }

        await queue.filters.ffmpeg.toggle([filter]);

        return client.qEmbed(
            `${
                alreadyOn ? 'Removing' : 'Adding'
            } \`${filter}\`. The longer the song, the longer this takes to apply.\n\n${describe()}`,
            interaction ?? message
        );
    }
};
