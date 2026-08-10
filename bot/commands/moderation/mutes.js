'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'mutes',
    aliases:     [
        'muted',
        'mutelist',
        'mutedlist'
    ],
    usage:       '=mutes',
    description: 'Show all people on the server who are muted.',

    slash: new Discord.SlashCommandBuilder(),

    defer: true,

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES',
        'MODERATE_MEMBERS'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const activeMutes = await client.module.database.getMutes(guild.id);

        if (activeMutes.length === 0)
        {
            return client.send(interaction
                ? 1
                : message.channel, null, [
                {
                    color:       client.data.embedColor,
                    title:       `Mutes of ${client.utils.cstr(message.guild.name)}`,
                    description: '# There is no one muted!',
                    footer:      client.data.footer,
                    thumbnail:   { url: client.utils.guildIcon(message.guild) }
                }
            ]);
        }

        let mutes = '';

        const membersToFetch = [...new Set(activeMutes.map(m => m.user).concat(activeMutes.map(m => m.mod)))];

        const membersFetched = await message.guild.members.fetch({ user: membersToFetch });

        for (let i = 0; i < activeMutes.length; i++)
        {
            const mute = activeMutes[i];

            const mutedMember = membersFetched.get(mute.user);
            const muteAuthor = membersFetched.get(mute.mod);

            const muteTime = mute.dur === 333333333999
                ? null
                : isFinite(mute.dur)
                    ? client.imports.time(mute.dur)
                    : 'infinite time';

            mutes += `**${i + 1}.** ${mutedMember ?? `[Unavailable] - ${mute.user}`} ${client.utils.tag(mutedMember?.user) ?? ''} for \`${mute.dur === 918273646559
                ? 'until the heat death of the universe (999999999999^100^100y)'
                : mute.dur === 333333333999
                    ? 'an unspecified amount of time'
                    : muteTime}\` by ${muteAuthor ?? '[Unavailable]'}${mute.reason !== 'X'
                ? `\n- ${mute.reason}`
                : ''}\n`;
        }

        const fields = [];
        const descriptionCopied = mutes.slice(0, 2048);
        if (mutes.length > 2048)
        {
            mutes = mutes.slice(2048, mutes.length - 1);
            let i = 0;
            while (true)
            {
                if (i * 1024 > mutes.length || fields.length > 20)
                {
                    break;
                }

                fields.push({
                    name:  'Continuation:',
                    value: mutes.slice(i * 1024, (i + 1) * 1024)
                });
                i++;
            }
        }

        return client.send(interaction
            ? 1
            : message.channel, null, [
            {
                color:       client.data.embedColor,
                title:       `Mutes of ${client.utils.cstr(message.guild.name)}`,
                description: descriptionCopied,
                fields:      fields ?? null,
                footer:      client.data.footer,
                thumbnail:   { url: client.utils.guildIcon(message.guild) }
            }
        ]);
    }
};
