'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const MIN_SIDE = 2;
const MAX_SIDE = 20;
const MAX_COMBINED = 29;

export default {
    name: 'minesweeper',
    aliases: ['mine'],
    usage: '=minesweeper [rows] [columns] [mines] [reveal]',
    description:
        'Play a game of minesweeper - the board is posted as clickable spoilers.\n\nEverything is optional and has a sensible default:\n- **rows** / **columns** - board size (2–20 each, 29 combined). Default 9×9.\n- **mines** - how many mines. Default is about a fifth of the board.\n- **reveal** - pass `yes` to uncover a safe starting cell (classic start).\n\nExample: `=minesweeper 12 12 30 yes`',
    slashDescription: 'Play a game of minesweeper.',

    slash: new Discord.SlashCommandBuilder()
        .addIntegerOption((option) =>
            option
                .setName('rows')
                .setDescription('Rows, 2-20 (default 9).')
                .setMinValue(MIN_SIDE)
                .setMaxValue(MAX_SIDE)
                .setRequired(false)
        )
        .addIntegerOption((option) =>
            option
                .setName('columns')
                .setDescription('Columns, 2-20 (default 9).')
                .setMinValue(MIN_SIDE)
                .setMaxValue(MAX_SIDE)
                .setRequired(false)
        )
        .addIntegerOption((option) =>
            option
                .setName('mines')
                .setDescription('Number of mines (default ~20% of the board).')
                .setMinValue(1)
                .setRequired(false)
        )
        .addBooleanOption((option) =>
            option.setName('reveal').setDescription('Uncover a safe starting cell (classic start).').setRequired(false)
        ),

    cooldown: 15,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async reward(client, message, guild, mines) {
        const money = Math.min(60, 5 + Math.floor(mines * 1.5));
        const xp = Math.min(30, 3 + mines);

        const profile = await client.module.database.User(message.author.id).catch(() => null);

        if (profile) {
            client.saveProfile(
                message.author.id,
                {
                    alter: 'm',
                    value: (profile.m ?? 0) + money
                },
                {
                    alter: 'xp',
                    value: (profile.xp ?? 0) + xp
                }
            );
        }

        if (guild.lv?.on) {
            const member = await client.module.database.Member(message.author.id, message.guild.id).catch(() => null);

            if (member) {
                client.saveMember(message.guild.id, message.author.id, {
                    alter: 'xp',
                    value: (member.xp ?? 0) + xp
                });
            }
        }
    },

    async run(client, message, args, guild, interaction) {
        const intOf = (name, index) => {
            if (interaction) {
                return interaction.options.getInteger(name);
            }

            const raw = args[index];

            return raw === undefined || raw === '' || isNaN(raw) ? null : Math.trunc(Number(raw));
        };

        const rows = intOf('rows', 0) ?? 9;
        const columns = intOf('columns', 1) ?? 9;

        if (rows < MIN_SIDE || columns < MIN_SIDE || rows > MAX_SIDE || columns > MAX_SIDE) {
            return client.qEmbed(
                `Rows and columns each have to be between ${MIN_SIDE} and ${MAX_SIDE}.`,
                interaction ?? message
            );
        }

        if (rows + columns > MAX_COMBINED) {
            return client.qEmbed(
                `Rows and columns together have to be ${MAX_COMBINED} or fewer.`,
                interaction ?? message
            );
        }

        const total = rows * columns;

        const mines = intOf('mines', 2) ?? Math.max(1, Math.round(total * 0.2));

        if (mines < 1) {
            return client.qEmbed('You need at least one mine!', interaction ?? message);
        }

        if (mines * 2 >= total) {
            return client.qEmbed(
                `That's too many mines for a ${rows}×${columns} board - keep it under **${Math.ceil(total / 2)}**.`,
                interaction ?? message
            );
        }

        const reveal = interaction
            ? (interaction.options.getBoolean('reveal') ?? false)
            : args[3]?.toLowerCase() === 'yes';

        const board = new client.class.minesweeper({
            rows,
            columns,
            mines,
            spaces: false,
            revealFirstCell: reveal
        }).start();

        if (!board) {
            return client.qEmbed(
                'Could not build a board with those options, try fewer mines.',
                interaction ?? message
            );
        }

        this.reward(client, message, guild, mines).catch(client.swallow('minesweeper: reward'));

        const canEmbed = message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks);

        if (!canEmbed) {
            return client.send(
                interaction ? 1 : message.channel,
                `**Minesweeper!** (${rows}×${columns}, ${mines} mines)\n${board}`
            );
        }

        return client.send(interaction ? 1 : message.channel, null, [
            {
                color: client.data.embedColor,
                title: 'Minesweeper!',
                description: board,
                footer: {
                    text: `${rows}×${columns} · ${mines} mines${reveal ? ' · classic start' : ''}`
                }
            }
        ]);
    }
};
