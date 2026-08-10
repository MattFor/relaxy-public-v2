'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'rename',
    usage:       '=rename <channel|user|role> [name]',
    description: 'Rename a channel, member or role. **name** is the new name; if omitted a random name is assigned.',

    permissionsUser:         [
        'SEND_MESSAGES',
        'MANAGE_NICKNAMES'
    ],
    permissionsBot:          [
        'SEND_MESSAGES',
        'MANAGE_CHANNELS',
        'MANAGE_ROLES',
        'MANAGE_NICKNAMES'
    ],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        let error = null;

        const role = client.utils.role(message, args, 0) ?? null;
        const member = await client.utils.member(message, args, 0) ?? null;
        const channel = await client.utils.channel(message, args, 0) ?? null;

        args = client.utils.cutObjectDataFromArgs(args, member);

        if (args.length > 0 && await client.censored(args, guild, message))
        {
            return client.qEmbed('That name trips this server\'s censor - pick another one.', interaction ?? message);
        }

        if (member)
        {
            const oldName = member.nickname ?? member.user.username;
            const newName = args.length === 0
                ? `Renamed${Math.floor(Math.random() * 100000000000)}`
                : args.join(' ');

            await member.setNickname(newName).catch((e) => error = e);

            if (error)
            {
                return client.qEmbed('An error has occurred while changing the name!', interaction ?? message);
            }

            return client.qEmbed(`${oldName} has been renamed to ${member}!`, interaction ?? message);
        }

        const userExempt = client.utils.isExempt(guild, message);

        let permissionsFlag = client.permissions(message, {
            permissionsUser:          ['MANAGE_CHANNELS'],
            suggestedPermissionsUser: [
                'MANAGE_CHANNELS',
                'MANAGE_ROLES'
            ],
            permissionsBot:           ['MANAGE_CHANNELS'],
            suggestedPermissionsBot:  ['MANAGE_ROLES']
        }, {
            textChannel:  message.channel,
            voiceChannel: null
        }, { userExempt: userExempt });

        if (permissionsFlag.bot || (!userExempt && permissionsFlag.user))
        {
            return;
        }

        if (channel)
        {
            const oldName = channel.name;
            const newName = args.length === 0
                ? `renamed-${Math.floor(Math.random() * 100)}`
                : args.join(' ');

            await channel.setName(newName).catch((e) => error = e);

            if (error)
            {
                return client.qEmbed('An error has occurred while changing the name!', interaction ?? message);
            }

            return client.qEmbed(`${oldName} has been renamed to ${channel}!`, interaction ?? message);
        }

        permissionsFlag = client.permissions(message, {
            permissionsUser:          ['MANAGE_ROLES'],
            suggestedPermissionsUser: null,
            permissionsBot:           ['MANAGE_ROLES'],
            suggestedPermissionsBot:  null
        }, {
            textChannel:  message.channel,
            voiceChannel: null
        }, { userExempt: userExempt });

        if (permissionsFlag.bot || (!userExempt && permissionsFlag.user))
        {
            return;
        }

        if (role)
        {
            const oldName = role.name;
            const newName = args.length === 0
                ? `Renamed${Math.floor(Math.random() * 10000)}`
                : args.join(' ');

            await role.setName(newName).catch((e) => error = e);

            if (error)
            {
                return client.qEmbed('An error has occurred while changing the name!', interaction ?? message);
            }

            return client.qEmbed(`${oldName} has been renamed to ${role}!`, interaction ?? message);
        }

        return client.qEmbed('Error whatever you searched for doesn\'t exist!', interaction ?? message);
    }
};
