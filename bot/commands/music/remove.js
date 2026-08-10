'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import { useQueue } from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:        'remove',
    aliases:     ['r'],
    usage:       '=remove <index>',
    description: 'Remove a song from the queue by its index. **index** corresponds to the number shown in =queue.',

    slash: new Discord.SlashCommandBuilder()
               .addIntegerOption(option => option.setName('index').setDescription('Index of the song to remove').setRequired(true).setMinValue(1)),
    args:  true,

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

        if (message.guild.members.me.voice && message.guild.members.me.voice.channel && (message.member.voice.channel.full && message.guild.members.me.voice.channel.id !== message.member.voice.channel.id) && message.guild.members.me.voice.channel.id !== message.member.voice.channel.id)
        {
            return client.qEmbed('Voice channel is full!', interaction ?? message);
        }

        if (message.guild?.members?.me?.voice?.channel && message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id)
        {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        const remove = Number(args[0]) - 2;
        const trackResolvable = queue.tracks.at(remove);

        if (!trackResolvable)
        {
            return client.qEmbed('Invalid index / Track does not exist!', interaction ?? message);
        }

        queue.node.remove(trackResolvable);

        return client.send(interaction ?? message.channel, null, [
            {
                color:       client.data.embedColor,
                title:       client.utils.firstLetterUp(trackResolvable.title),
                url:         trackResolvable.url,
                description: '## Has been removed!',
                thumbnail:   {
                    url: client.utils.trackThumbnail(trackResolvable)
                }
            }
        ]);
    }
};
