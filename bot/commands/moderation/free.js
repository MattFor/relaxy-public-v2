'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'free',
    usage:       '=free <user|all> [index] [tier]',
    description: 'Remove all of the specified user\'s warnings.\nIf the first argument is \'all\' then all server warnings will be removed (requires ManageGuild).\nProvide a warning **index** to remove a single warning, or an **index** and a **tier** (0 - 30) to change that warning\'s tier instead.',

    args:     true,
    cooldown: 10,

    permissionsUser:         [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES',
        'MODERATE_MEMBERS'
    ],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        if (args[0].toLowerCase() === 'all')
        {
            const fallBack = !message.member.permissions.has(Discord.PermissionFlagsBits.ManageGuild);

            if (fallBack)
            {
                return client.qEmbed('You lack the permissions to do this action! [ManageGuild]', interaction ?? message);
            }

            await client.module.database.clearAllWarnings(guild.id);
            return client.qEmbed(`${message.guild.name} has been freed of warnings!`, interaction ?? message);
        }

        let memberLeftFlag = false;
        let member = await client.utils.member(message, args, 0, { cut: true });

        if (!member && (await client.module.database.warningsOf(guild.id, args[0])).length)
        {
            memberLeftFlag = true;
            member = `${args[0]}`;
            args.shift();
        }

        if (!member && !memberLeftFlag)
        {
            return client.qEmbed('Member doesn\'t exist', interaction ?? message);
        }

        const targetId = memberLeftFlag
            ? member
            : member.user.id;
        const warns = await client.module.database.warningsOf(guild.id, targetId);

        if (warns.length)
        {
            let _f = false;
            const number1 = args[0]
                ? client.utils.nums(args[0])
                : null;
            const number2 = args[1]
                ? client.utils.nums(args[1])
                : null;

            if (args[0] && number1 && !(args[1] && number2))
            {
                if (number1 < 1 || number1 > warns.length)
                {
                    return client.qEmbed('There is no warning with that index!', interaction ?? message);
                }

                warns.splice(number1 - 1, 1);
                client.qEmbed(`Warning ${number1} removed successfully.`, interaction ?? message);

                _f = true;
                if (warns.length === 0)
                {
                    _f = false;
                    await client.module.database.clearWarnings(guild.id, targetId);
                }
                else
                {
                    await client.module.database.setWarnings(guild.id, targetId, warns);
                }
            }
            else if (args[0] && args[1] && number1 && number2)
            {
                if (number1 < 1 || number1 > warns.length)
                {
                    return client.qEmbed('There is no warning with that index!', interaction ?? message);
                }

                if (number2 < 0 || number2 > 30)
                {
                    return client.qEmbed('Warning tier out of bounds, please choose 0 - 30!', interaction ?? message);
                }

                warns[number1 - 1].tier = number2;

                await client.module.database.setWarnings(guild.id, targetId, warns);

                _f = true;
                client.qEmbed(`Warning ${number2} tier changed successfully.`, interaction ?? message);
            }
            else
            {
                await client.module.database.clearWarnings(guild.id, targetId);
            }

            return _f
                ? null
                : client.qEmbed(`${member} has been freed of warnings!`, interaction ?? message);
        }

        return client.qEmbed('This user does not have any warnings', interaction ?? message);
    }
};
