'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import {
    useQueue,
    useHistory
} from '../../../src/Client/Modules/MusicPlayer/index.js';

export default {
    name:        'back',
    aliases:     [
        'prev',
        'previous',
        'last'
    ],
    usage:       '=back',
    description: 'Play the previous song in the queue.',

    slash: new Discord.SlashCommandBuilder(),

    cooldown: 5,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: [
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        if (!message.member.voice.channel)
        {
            return client.qEmbed('NotConnected', interaction ?? message);
        }

        const queue = useQueue(message.guild.id);
        const history = useHistory(message.guild.id);

        if (!queue)
        {
            return client.qEmbed('NotPlaying', interaction ?? message);
        }

        if (message.guild?.members?.me?.voice?.channel && message.member?.voice?.channel?.id !== message.guild?.members?.me?.voice?.channel?.id)
        {
            return client.qEmbed('NotSameVoiceChannel', interaction ?? message);
        }

        if (!history?.previousTrack)
        {
            return client.qEmbed('Cannot go back at this time!', interaction ?? message);
        }

        await history.previous();

        return client.qEmbed('Going back...', interaction ?? message);
    }
};
