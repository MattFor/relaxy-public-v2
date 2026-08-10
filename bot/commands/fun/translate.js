'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:             'translate',
    usage:            '=translate <from> <to> <text>',
    description:      'Translates text from one language to another.\n**from** and **to** are language names or `ISO 639-1` codes, and **text** is the text to translate.',
    slashDescription: 'Translate text from one language to another.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option.setName('from').setDescription('Language to translate from (name or ISO 639-1 code).').setRequired(true))
               .addStringOption(option => option.setName('to').setDescription('Language to translate to (name or ISO 639-1 code).').setRequired(true))
               .addStringOption(option => option.setName('text').setDescription('The text to translate.').setRequired(true)),
    args:  true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, guild, interaction)
    {
        if (!args[1] || !args[2])
        {
            return client.qEmbed('Too few arguments!', interaction ?? message);
        }

        let flag = false;
        let lang1 = args.shift();
        let lang2 = args.shift();

        const text = await client.imports.translator(args.join(' '), {
            from: lang1,
            to:   lang2
        }).catch((e) =>
        {
            return flag = e.message;
        });

        const fallBack = !message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks);

        const description = flag
            ? `There has been an error translating!\n**${flag}**`
            : text.text.slice(0, 2048);

        if (fallBack)
        {
            return client.send(message.channel, `## Translation\n${description}`);
        }

        return client.send(interaction
            ? 1
            : message.channel, null, [
            {
                color: client.data.embedColor,
                title: 'Translation:',
                description
            }
        ]);
    }
};