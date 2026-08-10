'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'reminds',
    usage:       '=reminds',
    description: 'Show all of your active Relaxy reminds - the list is sent to your DMs.\n\nTo remove one, reply **in that DM** with `=erase <the number next to it>` (using this server\'s prefix). `erase` is not a command of its own - it only means anything as a reply to the list, and only for about 50 minutes.',

    cooldown: 4,

    permissionsBot: [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, guild, interaction)
    {
        const user = await client.module.database.User(message.author.id);

        if (!user.rm.length)
        {
            return client.qEmbed('You have no active reminds!', interaction ?? message);
        }

        let reminds = new Discord.EmbedBuilder().setColor(client.data.embedColor).setThumbnail(message.author.displayAvatarURL({
            dynamic: true,
            size:    4096
        }));

        reminds.setTitle(`${message.author.username}'s reminds:`);

        const listed = [...user.rm];

        for (let i = 0; i < listed.length; i++)
        {
            let remind = listed[i].split('_');
            reminds.addFields([
                {
                    name: `\`${i + 1}\`. - In ${client.imports.time(Number(remind[0]) - Date.now())}:`,

                    value: remind.slice(1).join('_').slice(0, 250) || 'No note.'
                }
            ]);
        }

        let flag = false;

        const m = await client.send(message.author, null, [reminds]).catch(e =>
        {
            return flag = true;
        });

        if (flag)
        {
            return;
        }

        const collected = await m.channel.awaitMessages({
            filter: msg => msg.author.id === message.author.id,
            max:    1,
            time:   3000000,
            errors: ['time']
        }).catch(() => null);

        if (!collected?.size)
        {
            return;
        }

        const answer = collected.first();
        const words = answer.content.split(' ');

        if (words.shift()?.toLowerCase() !== `${guild.px[0]}erase`)
        {
            return;
        }

        const index = Number(words[0]) - 1;

        if (!words[0] || isNaN(words[0]) || index < 0 || index >= listed.length)
        {
            return client.qEmbed('Number given is invalid!', answer);
        }

        const target = listed[index];
        const fresh = await client.module.database.User(message.author.id);
        const at = fresh.rm.indexOf(target);

        if (at === -1)
        {
            return client.qEmbed('That remind already went off while you were looking at the list - nothing was removed.', answer);
        }

        fresh.rm.splice(at, 1);

        client.saveProfile(message.author.id, {
            alter: 'rm',
            value: fresh.rm
        });

        return client.qEmbed(`Remind number ${words[0]} has been removed:\n**${target.split('_').slice(1).join('_').slice(0, 250) || 'No note.'}**`, answer);
    }
};