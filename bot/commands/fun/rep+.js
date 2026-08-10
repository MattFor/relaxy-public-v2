'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'rep+',
    aliases:     ['rep'],
    usage:       '=rep+ <user>',
    description: 'Give someone an arbitrary reputation point **(some money and xp too)**!',

    args:     true,
    cooldown: 7,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        let user = null;

        try
        {
            user = (await client.utils.member(message, args, 0))?.user;
        }
        catch
        {
            return client.qEmbed('No... you cannot do that!', interaction ?? message);
        }

        if (!user || (user.bot && user.id !== client.user.id))
        {
            return client.qEmbed('Invalid user!', interaction ?? message);
        }

        if (user.id === message.author.id)
        {
            return client.qEmbed('Cannot rep+ yourself!', interaction ?? message);
        }

        let userDb = await client.module.database.User(user.id);
        let rep_length = userDb.rep.length;

        for (let i = 0; i < rep_length; i++)
        {
            if (userDb.rep[i].includes(message.author.id))
            {
                return client.qEmbed('You already rep+ this user!', interaction ?? message);
            }
        }

        userDb.rep.push(message.author.id);
        let r = Math.floor(Math.random() * 20) + 5;
        userDb.xp += r;
        userDb.m += r;

        client.saveProfile(user.id, {
            alter: 'xp',
            value: userDb.xp
        }, {
            alter: 'm',
            value: userDb.m
        }, {
            alter: 'rep',
            value: userDb.rep
        });

        return client.qEmbed(`You have rep+ ${user}!`, interaction ?? message);
    }
};
