'use strict';

import os from 'os';
import path from 'path';
import axios from 'axios';

import Discord from 'discord.js';
import figlet from 'figlet';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import Relaxy from '../../../src/Client/Relaxy.js';

const TOGIF_MAX_INPUT_BYTES = 25 * 1024 * 1024;
const TOGIF_MAX_SECONDS = 8;
const TOGIF_FPS = 15;
const TOGIF_WIDTH = 480;

const resolveAttachment = async (client, message) => {
    const own = message.attachments?.first?.() ?? null;

    if (own) {
        return own;
    }

    const replyId = message?.reference?.messageId;

    if (!replyId) {
        return null;
    }

    const replied = await message.channel.messages.fetch(replyId).catch(() => null);

    return replied?.attachments?.first?.() ?? null;
};

const convertToGif = (inputBuffer, extension) => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const inputFile = path.join(os.tmpdir(), `relaxy-togif-${stamp}.${extension}`);
    const outputFile = path.join(os.tmpdir(), `relaxy-togif-${stamp}.gif`);

    const cleanup = () => Promise.allSettled([unlink(inputFile), unlink(outputFile)]);

    return writeFile(inputFile, inputBuffer)
        .then(
            () =>
                new Promise((resolve, reject) => {
                    const args = [
                        '-y',
                        '-t',
                        String(TOGIF_MAX_SECONDS),
                        '-i',
                        inputFile,
                        '-vf',
                        `fps=${TOGIF_FPS},scale=${TOGIF_WIDTH}:-1:flags=lanczos,split[s0][s1];[s0]palettegen[p];[s1][p]paletteuse`,
                        outputFile
                    ];

                    const proc = spawn(ffmpegPath, args);

                    let stderr = '';
                    proc.stderr.on('data', (chunk) => (stderr += chunk.toString()));
                    proc.on('error', reject);
                    proc.on('close', (code) =>
                        code === 0
                            ? resolve()
                            : reject(
                                  new Error(
                                      `ffmpeg exited with code ${code}${
                                          stderr ? `:\n${stderr.split('\n').slice(-3).join('\n')}` : ''
                                      }`
                                  )
                              )
                    );
                })
        )
        .then(() => readFile(outputFile))
        .finally(cleanup);
};
const TIMESTAMP_FORMAT = 'YYYY/MM/DD - HH:MM(:SS)';
const TIMESTAMP_REGEX = /^(\d{4})[/\-.](\d{1,2})[/\-.](\d{1,2})(?:\s*[-,]\s*|\s+)(\d{1,2}):(\d{1,2})(?::(\d{1,2}))?$/;
const TIMESTAMP_STYLES = [
    {
        label: 'Short Time',
        style: Discord.TimestampStyles.ShortTime
    },
    {
        label: 'Long Time',
        style: Discord.TimestampStyles.LongTime
    },
    {
        label: 'Short Date',
        style: Discord.TimestampStyles.ShortDate
    },
    {
        label: 'Long Date',
        style: Discord.TimestampStyles.LongDate
    },
    {
        label: 'Short Date/Time',
        style: Discord.TimestampStyles.ShortDateTime
    },
    {
        label: 'Long Date/Time',
        style: Discord.TimestampStyles.LongDateTime
    },
    {
        label: 'Relative',
        style: Discord.TimestampStyles.RelativeTime
    }
];

const deliver = ({ client, message, interaction }, payload) => {
    if (payload.text !== undefined) {
        return client.qEmbed(payload.text, interaction ?? message);
    }

    const out = {};

    if (payload.content) {
        out.content = payload.content;
    }

    if (payload.embed) {
        out.embeds = [payload.embed];
    }

    if (payload.components) {
        out.components = payload.components;
    }

    if (payload.files) {
        out.files = payload.files;
    }

    if (interaction) {
        return out;
    }

    return client.send(
        message.channel,
        out.content ?? null,
        out.embeds ?? [],
        out.files ?? null,
        null,
        out.components ?? null
    );
};

const TOOLS = {
    len: {
        label: 'Length',
        aliases: ['length'],
        description: 'Get the character length of a message.',
        input: {
            label: 'Message',
            style: 'Paragraph',
            maxLength: 2000
        },
        run: (ctx) => {
            if (!ctx.args[0]) {
                return deliver(ctx, { text: 'No arguments present!' });
            }

            return deliver(ctx, { text: `The length of that message is ${ctx.args.join(' ').length}` });
        }
    },

    smallify: {
        label: 'Smallify',
        aliases: ['small'],
        description: "Strip and replace numbers and special characters (Relaxy's censor normaliser).",
        input: {
            label: 'Text',
            style: 'Paragraph',
            maxLength: 2000
        },
        run: (ctx) => {
            if (!ctx.args[0]) {
                return deliver(ctx, { text: 'No arguments present!' });
            }

            return deliver(ctx, { text: ctx.client.utils.smallify(ctx.args.join(' ')) });
        }
    },

    spam: {
        label: 'Spam Check',
        description: 'Check whether a message is considered spam by Relaxy.',
        input: {
            label: 'Message',
            style: 'Paragraph',
            maxLength: 2000
        },
        run: (ctx) => {
            if (!ctx.args[0]) {
                return deliver(ctx, { text: 'No arguments present!' });
            }

            return deliver(ctx, {
                text: ctx.client.utils.isSpam(ctx.args.join(' ')) ? 'This is spam.' : 'This is not spam.'
            });
        }
    },

    censor: {
        label: 'Censor Check',
        description: 'Check if something trips the Relaxy censor filter.',
        input: {
            label: 'Text',
            style: 'Paragraph',
            maxLength: 2000
        },
        run: async (ctx) => {
            if (!ctx.args[0]) {
                return deliver(ctx, { text: 'No arguments present!' });
            }

            const censored = await ctx.client.censored(ctx.args, ctx.guild, ctx.message);

            return deliver(ctx, {
                text: `Censored: ${censored ? '**Yes**' : '**No**'}${
                    censored
                        ? `\nReason: ${await ctx.client.utils.censorCheck(ctx.args, ctx.guild, ctx.message.guild, true)}`
                        : ''
                }`
            });
        }
    },

    hextodec: {
        label: 'Hex to Decimal',
        description: 'Convert a hexadecimal colour to decimal (useful for embed colours).',
        input: {
            label: 'Hex code',
            style: 'Short',
            placeholder: '#RRGGBB',
            maxLength: 7
        },
        run: (ctx) => {
            if (!ctx.args[0]) {
                return deliver(ctx, { text: 'No arguments present!' });
            }

            const hex = ctx.args.join(' ').match(/^#?([0-9A-Fa-f]{6})$/g)?.[0] ?? null;

            if (!hex) {
                return deliver(ctx, { text: 'No hex code present!' });
            }

            return deliver(ctx, {
                text: `**${hex}** converted to decimal is **${parseInt(hex.toLowerCase().replace('#', ''), 16)}**`
            });
        }
    },

    asciify: {
        label: 'ASCII Art',
        aliases: ['ascii'],
        description: 'Turn text into ASCII art. Prefix with "big" or "small" to set the font.',
        input: {
            label: 'Text (optionally prefixed big/small)',
            style: 'Short',
            placeholder: 'big Hello',
            maxLength: 100
        },
        run: (ctx) => {
            if (!ctx.args[0]) {
                return deliver(ctx, { text: 'No arguments present!' });
            }

            const firstArg = ctx.args[0].toLowerCase();

            const font = firstArg === 'big' ? 'Big' : 'Small';

            const text = firstArg === 'big' || firstArg === 'small' ? ctx.args.slice(1).join(' ') : ctx.args.join(' ');

            if (!text) {
                return deliver(ctx, {
                    text: "When typing small / big as the first argument you're actually setting the font!"
                });
            }

            let renderedText;

            try {
                renderedText = figlet.textSync(text, { font });
            } catch (e) {
                return deliver(ctx, { text: `Failed to render ASCII text.\n\`${e.message}\`` });
            }

            let block = `\`\`\`\n${renderedText}\n\`\`\``;

            if (block.length > 2000) {
                block = `${block.slice(0, 1993)}\n\`\`\``;
            }

            return deliver(ctx, { content: block });
        }
    },

    calculate: {
        label: 'Calculator',
        aliases: ['calc'],
        description: 'Evaluate a basic math expression (+ - * / ** and parentheses).',
        input: {
            label: 'Expression',
            style: 'Short',
            placeholder: '(2 + 3) * 4',
            maxLength: 200
        },
        run: (ctx) => {
            if (!ctx.args[0]) {
                return deliver(ctx, { text: 'No arguments present!' });
            }

            const text = ctx.args.join('').toLowerCase().replaceAll('x', '*').replaceAll('^', '**');

            if (!text.match(/^[\d+\-*\/().\s**]+$/)) {
                return deliver(ctx, { text: 'Invalid math expression! Only basic operations are allowed.' });
            }

            let evaluated = '';

            try {
                evaluated = eval(text);
            } catch (e) {
                return deliver(ctx, { text: `_ ERROR:\n\`${e.message}\`` });
            }

            if (!evaluated) {
                return deliver(ctx, { text: 'The result is too big/small to display!' });
            }

            return deliver(ctx, { text: `\`${ctx.args.join(' ')}\` = **${evaluated}**` });
        }
    },

    cc: {
        label: 'Currency Converter',
        aliases: ['currency', 'convert'],
        description: 'Convert an amount between two currencies (e.g. 10 usd eur).',
        input: {
            label: 'Amount, from, to',
            style: 'Short',
            placeholder: '10 USD EUR',
            maxLength: 40
        },
        run: async (ctx) => {
            if (ctx.args.length !== 3) {
                return deliver(ctx, {
                    text: 'Usage: `cc <amount> <from_currency> <to_currency>` - e.g. `cc 10 USD EUR`.'
                });
            }

            const [rawAmount, rawFrom, rawTo] = ctx.args;
            const from = rawFrom.toUpperCase();
            const to = rawTo.toUpperCase();

            if (!/^\d+(\.\d+)?$/.test(rawAmount)) {
                return deliver(ctx, { text: 'The amount must be a number!' });
            }

            if (from === to) {
                return deliver(ctx, {
                    text: `**${Number(rawAmount).toFixed(2)} ${from}** = **${Number(rawAmount).toFixed(2)} ${to}**`
                });
            }

            if (!/^[A-Z]{3}$/.test(from) || !/^[A-Z]{3}$/.test(to)) {
                return deliver(ctx, { text: 'Currencies must be 3-letter codes, like `USD` or `EUR`.' });
            }

            let rates = null;

            try {
                const { data } = await axios.get('https://api.frankfurter.dev/v1/latest', {
                    params: {
                        base: from,
                        symbols: to
                    },
                    timeout: 10000
                });

                rates = data?.rates ?? null;
            } catch (e) {
                ctx.client.data.errors++;

                if (e.response?.status === 404) {
                    return deliver(ctx, { text: `\`${from}\` or \`${to}\` is not a currency I can convert.` });
                }

                return deliver(ctx, { text: 'The currency service is unreachable right now, try again later!' });
            }

            const rate = rates?.[to];

            if (typeof rate !== 'number') {
                return deliver(ctx, { text: `No exchange rate available for \`${from}\` -> \`${to}\`.` });
            }

            const amount = Number(rawAmount);

            return deliver(ctx, {
                text: `**${amount.toFixed(2)} ${from}** = **${(amount * rate).toFixed(2)} ${to}**\n-# Rate: 1 ${from} = ${rate} ${to}`
            });
        }
    },

    time: {
        label: 'Time Converter',
        description: 'Convert milliseconds into bigger, human-readable units.',
        input: {
            label: 'Milliseconds',
            style: 'Short',
            placeholder: '90000',
            maxLength: 20
        },
        run: (ctx) => {
            if (!ctx.args[0]) {
                return deliver(ctx, { text: 'No arguments present!' });
            }

            const ms = Number(ctx.args.join(' '));

            if (Number.isNaN(ms)) {
                return deliver(ctx, { text: 'That converts to **error**.' });
            }

            const converted = ctx.client.imports.time(ms);

            return deliver(ctx, {
                text: `That converts to ${converted === '0ms' ? '**error**' : converted}.`
            });
        }
    },

    timestamp: {
        label: 'Discord Timestamp',
        aliases: ['timemarkdown'],
        description: `Convert a date (${TIMESTAMP_FORMAT}) into copyable Discord timestamp markdown.`,
        input: {
            label: 'Date',
            style: 'Short',
            placeholder: TIMESTAMP_FORMAT,
            maxLength: 25
        },
        run: (ctx) => {
            const input = ctx.args.join(' ').trim();
            const match = TIMESTAMP_REGEX.exec(input);

            if (!match) {
                return deliver(ctx, {
                    text: `Invalid date! Use the format \`${TIMESTAMP_FORMAT}\` (e.g. \`2026/06/28 - 14:30:00\`).`
                });
            }

            const [, year, month, day, hour, minute, second = 0] = match.map((part) =>
                part === undefined ? undefined : Number(part)
            );

            const date = new Date(year, month - 1, day, hour, minute, second);

            const valid =
                !isNaN(date.getTime()) &&
                date.getFullYear() === year &&
                date.getMonth() === month - 1 &&
                date.getDate() === day &&
                date.getHours() === hour &&
                date.getMinutes() === minute &&
                date.getSeconds() === second;

            if (!valid) {
                return deliver(ctx, {
                    text: `That date doesn't exist! Use the format \`${TIMESTAMP_FORMAT}\` (e.g. \`2026/06/28 - 14:30:00\`).`
                });
            }

            const fields = TIMESTAMP_STYLES.map(({ label, style }) => {
                const markdown = Discord.time(date, style);

                return {
                    name: label,
                    value: `${markdown}\n\`${markdown}\``,
                    inline: true
                };
            });

            return deliver(ctx, {
                embed: {
                    color: ctx.client.data.embedColor,
                    title: 'Discord timestamp markdown',
                    description: `Timestamp formats for \`${input}\` (read as server time).\nEach one shows how it renders, with the copyable markdown underneath.`,
                    fields
                }
            });
        }
    },

    togif: {
        label: 'To GIF',
        description: 'Convert an attached (or replied-to) image or short video into a GIF.',
        attachment: true,
        run: async (ctx) => {
            const { client, message, interaction } = ctx;

            if (!message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.AttachFiles)) {
                return deliver(ctx, { text: 'I need the **Attach Files** permission to send GIFs!' });
            }

            const attachment = await resolveAttachment(client, message);

            if (!attachment) {
                return deliver(ctx, {
                    text: 'No attachment found! Attach an image/video (or reply to a message that has one) and run `=toolkit togif`.'
                });
            }

            const contentType = attachment.contentType ?? '';

            if (!contentType.startsWith('image/') && !contentType.startsWith('video/')) {
                return deliver(ctx, { text: 'Unsupported file type! Provide an image or a video.' });
            }

            if ((attachment.size ?? 0) > TOGIF_MAX_INPUT_BYTES) {
                return deliver(ctx, {
                    text: `File too big! (max ${Math.floor(TOGIF_MAX_INPUT_BYTES / 1024 / 1024)}MB)`
                });
            }

            const waiting = await client.send(message.channel, null, [
                {
                    color: client.data.embedColor,
                    title: 'Generating GIF...',
                    thumbnail: { url: client.cdn.loading }
                }
            ]);

            try {
                const response = await axios.get(attachment.url, {
                    responseType: 'arraybuffer',
                    maxContentLength: TOGIF_MAX_INPUT_BYTES,
                    maxBodyLength: TOGIF_MAX_INPUT_BYTES
                });

                const extension = (
                    attachment.name?.split('.').pop() || (contentType.startsWith('video/') ? 'mp4' : 'png')
                ).toLowerCase();

                const gif = await convertToGif(Buffer.from(response.data), extension);

                if (gif.length > 8 * 1024 * 1024) {
                    return client.edit(waiting, null, [
                        {
                            color: client.data.embedColor,
                            description: '**The resulting GIF is too large to upload!** Try a shorter / smaller source.'
                        }
                    ]);
                }

                return client.edit(waiting, null, null, [
                    new Discord.AttachmentBuilder(gif, {
                        name: `${(attachment.name ?? 'relaxy').replace(/\.[^.]+$/, '')}.gif`
                    })
                ]);
            } catch (e) {
                client.log('ERROR', 'togif conversion failed:', e);

                return client.edit(waiting, null, [
                    {
                        color: client.data.embedColor,
                        description: '**Something went wrong converting that to a GIF!**'
                    }
                ]);
            }
        }
    }
};
const MENU_TOOLS = [
    'len',
    'smallify',
    'spam',
    'censor',
    'hextodec',
    'asciify',
    'calculate',
    'cc',
    'time',
    'timestamp',
    'togif'
];
const ALIASES = (() => {
    const map = {};

    for (const id of Object.keys(TOOLS)) {
        map[id] = id;

        for (const alias of TOOLS[id].aliases ?? []) {
            map[alias] = id;
        }
    }

    return map;
})();

const buildToolMenu = () => {
    const select = new Discord.StringSelectMenuBuilder()
        .setCustomId('toolkit_select')
        .setPlaceholder('Select a tool to use')
        .addOptions(
            MENU_TOOLS.map((id) => ({
                label: TOOLS[id].label,
                description: TOOLS[id].description.slice(0, 100),
                value: id
            }))
        );

    return new Discord.ActionRowBuilder().addComponents(select);
};

const showToolModal = (interaction, toolId) => {
    const tool = TOOLS[toolId];
    const input = tool.input;

    const field = new Discord.TextInputBuilder()
        .setCustomId('toolkit_input')
        .setLabel(input.label.slice(0, 45))
        .setStyle(Discord.TextInputStyle[input.style])
        .setRequired(true);

    if (input.placeholder) {
        field.setPlaceholder(input.placeholder.slice(0, 100));
    }

    if (input.maxLength) {
        field.setMaxLength(input.maxLength);
    }

    const modal = new Discord.ModalBuilder()
        .setCustomId(`toolkit_modal-${toolId}`)
        .setTitle(tool.label.slice(0, 45))
        .addComponents(new Discord.ActionRowBuilder().addComponents(field));

    return interaction.showModal(modal);
};

export default {
    name: 'toolkit',
    aliases: ['toolbox', 'utilities', 'tools', 'timestamp', 'timemarkdown'],
    usage: '=toolkit [tool] [arguments]  ·  =timestamp <YYYY/MM/DD - HH:MM(:SS)>',
    description:
        'Wide arrangement of random tools.\nRun with no arguments to open the tool picker.\n`=timestamp` is a shortcut straight to the Discord Timestamp tool.',

    slash: new Discord.SlashCommandBuilder()
        .addStringOption((option) =>
            option.setName('tool_name').setDescription('Name of the tool you want to choose.').setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('arguments')
                .setDescription('Additional arguments (depends on the tool used)')
                .setRequired(false)
        ),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],

    suggestedPermissionsBot: ['ATTACH_FILES'],
    async run(client, message, args, guild, interaction) {
        if (interaction?.isAnySelectMenu?.()) {
            const toolId = ALIASES[interaction.values[0]];

            if (!toolId) {
                return 0b01100101_01110010_01110010_01101111_01110010;
            }

            if (TOOLS[toolId].attachment) {
                await interaction
                    .reply({
                        embeds: [
                            client.qEmbed(
                                `**${TOOLS[toolId].label}** needs a file. Attach an image/video (or reply to one) and run \`=toolkit ${toolId}\`.`,
                                1
                            )
                        ],
                        flags: Discord.MessageFlags.Ephemeral
                    })
                    .catch(client.swallow('toolkit: video'));

                return;
            }

            return showToolModal(interaction, toolId);
        }

        if (interaction?.isModalSubmit?.()) {
            const toolId = ALIASES[interaction.customId.replace('toolkit_modal-', '')];

            if (!toolId) {
                return client.qEmbed('Invalid tool name!', interaction);
            }

            const value = (interaction.fields.getTextInputValue('toolkit_input') ?? '').trim();
            const toolArgs = value.length ? value.split(/\s+/) : [];

            return TOOLS[toolId].run({
                client,
                message,
                args: toolArgs,
                guild,
                interaction
            });
        }

        const typedName = (message?.content ?? '')
            .trim()
            .split(/[ 　]+/)[0]
            .replace(/^[^\p{L}\p{N}]+/u, '')
            .toLowerCase();

        const directTool = interaction?.isChatInputCommand?.() ? null : (ALIASES[typedName] ?? null);

        if (directTool) {
            return TOOLS[directTool].run({
                client,
                message,
                args,
                guild,
                interaction
            });
        }
        let toolName;
        let toolArgs;

        if (interaction?.isChatInputCommand?.()) {
            toolName = args[0];

            const rest = (args[1] ?? '').toString().trim();
            toolArgs = rest.length ? rest.split(/\s+/) : [];
        } else {
            toolName = args[0];
            toolArgs = args.slice(1);
        }
        if (!toolName) {
            const list = MENU_TOOLS.map((id) => `\`${id}\` - ${TOOLS[id].description}`).join('\n');

            return deliver(
                {
                    client,
                    message,
                    interaction
                },
                {
                    embed: {
                        color: client.data.embedColor,
                        title: 'Toolkit',
                        description: `A collection of small utilities. Pick one from the dropdown below, or run \`=toolkit <tool> <input>\` directly.\n\n${list}`,
                        footer: client.data.footer
                    },
                    components: [buildToolMenu()]
                }
            );
        }

        const toolId = ALIASES[toolName.toLowerCase()];

        if (!toolId) {
            return deliver(
                {
                    client,
                    message,
                    interaction
                },
                { text: 'Invalid tool name!' }
            );
        }

        return TOOLS[toolId].run({
            client,
            message,
            args: toolArgs,
            guild,
            interaction
        });
    }
};
