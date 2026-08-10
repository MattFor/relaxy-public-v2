'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'autoname',
    usage:       '=autoname',
    description: '```diff\n- Only works while censoring is enabled -\n```Toggle automatic name censoring. While on, anyone with a censored word in their name is automatically renamed to something like "Renamed(random numbers)".',

    permissionsUser:         [
        'SEND_MESSAGES',
        'MANAGE_NICKNAMES',
        'MANAGE_GUILD'
    ],
    permissionsBot:          [
        'SEND_MESSAGES',
        'MANAGE_NICKNAMES'
    ],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        if (!guild.cn.on)
        {
            return client.qEmbed('Censoring isn\'t on on the server!', interaction ?? message);
        }

        if (guild.cn.rn)
        {
            client.save(message.guild.id, {
                alter: 'cn.rn',
                value: false
            });
            return client.qEmbed('Automatic name censoring removed!', interaction ?? message);
        }

        client.save(message.guild.id, {
            alter: 'cn.rn',
            value: true
        });

        return client.qEmbed('Automatic name censoring on!', interaction ?? message);
    }
};