'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const types = {
    1: `\nShowing levelup images & messages!`,
    2: `\nShowing only levelup messages!`,
    3: `\nShowing only levelup images!`,
    4: `\nNot showing levelup images or messages!`
};

export default {
    name:        'leveling',
    aliases:     ['lvling'],
    usage:       '=leveling [type]',
    description: 'Toggle leveling on the server and set how level-ups are displayed.\nWith leveling off, running it enables it; with leveling on, running it without a type disables it.\nTypes of leveling are:\n**1** - Shows messages on levelup along with cards,\n**2** - Shows only messages on levelup,\n**3** - Shows only levelup cards,\n**4** - Doesn\'t show anything.\nEnabling leveling gives access to the `=leaderboard` and `=level` commands.',

    cooldown: 30,

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_GUILD'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const type = Number(args[0]);
        const guildName = client.utils.firstLetterUp(message.guild.name);

        if (guild.lv.on && type)
        {
            if ([
                1,
                2,
                3,
                4
            ].includes(type))
            {
                client.save(guild.id, {
                    alter: 'lv.t',
                    value: type
                });
                return client.qEmbed(`Setting leveling type ${type} for use in ${guildName}${types[type]}`, interaction ?? message);
            }

            return client.qEmbed('Invalid leveling type specified, use 1-4!', interaction ?? message);
        }

        if (guild.lv.on && !type)
        {
            client.save(guild.id, {
                alter: 'lv.on',
                value: false
            });
            return client.qEmbed(`Disabled leveling in ${guildName}!`, interaction ?? message);
        }

        if (!guild.lv.on && !type)
        {
            client.save(guild.id, {
                alter: 'lv.t',
                value: 1
            }, {
                alter: 'lv.on',
                value: true
            });
            return client.qEmbed(`No type specified for ${guildName}, using type 1!\nShowing levelup images & messages!`, interaction ?? message);
        }

        if ([
            1,
            2,
            3,
            4
        ].includes(type))
        {
            client.save(guild.id, {
                alter: 'lv.t',
                value: type
            }, {
                alter: 'lv.on',
                value: true
            });
            return client.qEmbed(`Setting leveling type ${type} for use in ${guildName}${types[type]}`, interaction ?? message);
        }

        return client.qEmbed('Invalid leveling type specified, use 1-4!', interaction ?? message);
    }
};