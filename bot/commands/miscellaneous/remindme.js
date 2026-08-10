'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const MAX_REMINDS = 24;

export default {
    name:        'remindme',
    aliases:     ['remind'],
    usage:       '=remindme <time> about <thing>',
    description: 'Relaxy will remind you about the thing you requested after the specified amount of time.',

    slash:    new Discord.SlashCommandBuilder()
                  .addStringOption(option => option.setName('time').setDescription('Amount of time after which you will be notified.').setRequired(true))
                  .addStringOption(option => option.setName('message').setDescription('Message that you will be sent.').setRequired(true)),
    args:     true,
    cooldown: 4,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        const user = await client.module.database.User(message.author.id);

        if (user.rm.length >= MAX_REMINDS)
        {
            return client.qEmbed(`You can't have any more reminds! (max ${MAX_REMINDS})`, interaction ?? message);
        }

        let duration;
        let note;

        if (interaction)
        {

            duration = client.utils.getTime([args[0]]);
            note = args.slice(1).join(' ');
        }
        else
        {

            const parts = args.join(' ').split(/\babout\b/);

            if (parts.length < 2)
            {
                return client.qEmbed('No \'about\' keyword, invalid formatting!', interaction ?? message);
            }

            duration = client.utils.getTime(parts[0].trim().split(/\s+/));
            note = parts.slice(1).join('about');
        }

        if (!duration)
        {
            return client.qEmbed('Invalid time formatting!', interaction ?? message);
        }

        if (duration > 315360000000)
        {
            return client.qEmbed('Maximum remind time is 10 years!', interaction ?? message);
        }

        note = note.trim().slice(0, 250);

        if (!note)
        {
            return client.qEmbed('You need to say what to remind you about!', interaction ?? message);
        }

        if (await client.censored(note, guild, message))
        {
            return client.qEmbed('That reminder trips this server\'s censor - it has not been saved.', interaction ?? message);
        }

        user.rm.push(`${Date.now() + duration}_${note}`);

        client.saveProfile(message.author.id, {
            alter: 'rm',
            value: user.rm
        });

        return client.qEmbed(`You will be reminded in **\`${client.imports.time(duration)}\`** about:\n**${note}.**`, interaction ?? message);
    }
};