'use strict';

const isUrl = string =>
{
    try
    {
        new URL(string);
        return true;
    }
    catch
    {
        return false;
    }
};
import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const BULK_DELETE_MAX_AGE = 14 * 24 * 60 * 60 * 1000;
const MAX_AMOUNT = 10000;
const MAX_SCAN = 100000;
const SNOWFLAKE = /^\d{17,20}$/;
const REGEX_LITERAL = /^([/~@;%#'])(.*)\1([gimsuy]*)$/;

const parseRegexLiteral = token =>
{
    const match = token.match(REGEX_LITERAL);
    if (!match)
    {
        return null;
    }

    try
    {
        return new RegExp(match[2], match[3]);
    }
    catch
    {
        return null;
    }
};

const chunk = (array, size) =>
{
    const chunks = [];

    for (let i = 0; i < array.length; i += size)
    {
        chunks.push(array.slice(i, i + size));
    }

    return chunks;
};

export default {
    name:        'purge',
    usage:       '=purge <amount> [#channel] [messageId] [secondMessageId] [after] [@user] [embeds|links|images] [/regex/flags]',
    description: 'Delete messages in bulk. Run `=purge` on its own for a fill-in-the-blanks popup, or pass arguments directly.\n\n**Arguments (any order):**\n- `amount` - how many messages to delete (`1`-`10000`).\n- `#channel` - delete in another channel (mention required). Defaults to the current channel.\n- `messageId` - anchor onto a message. By default the `amount` messages *before* it are deleted.\n- `secondMessageId` - give two message IDs to delete the **range** between them (direction is detected automatically).\n- `after` (or `below` / `new` / `newerthan`) - delete messages *after* the anchor instead of before.\n- `@user` - only delete messages from this user (mention required).\n- `embeds` / `links` / `images` - only delete messages that contain embeds / links / attachments.\n- `/regex/flags` - only delete messages whose content matches the expression.\n\n```diff\n- Channel and user targeting REQUIRE a mention. -\n- Messages older than 14 days are removed one-by-one and will be slower. -\n```',

    permissionsUser:         [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES'
    ],
    permissionsBot:          [
        'SEND_MESSAGES',
        'MANAGE_MESSAGES'
    ],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async openPurgeBuilder(client, message, guild)
    {
        const openRow = new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder()
            .setCustomId('purgeui_open')
            .setLabel('Set up a purge')
            .setEmoji('🧹')
            .setStyle(Discord.ButtonStyle.Primary));

        const prompt = await client.send(message.channel, null, [
            {
                color:       client.data.embedColor,
                author:      {
                    name:     'Purge messages',
                    icon_url: client.utils.guildIcon(message.guild)
                },
                description: 'Press the button to fill in what you want deleted. Everything is optional except giving **either** an amount **or** a message ID to anchor onto.\nPrefer typing it out? See `=help purge`.',
                footer:      client.data.footer
            }
        ], [], [], [openRow]);

        if (!prompt)
        {
            return;
        }

        const settle = view => client.edit(prompt, null, [view], [], []).catch(client.swallow('purge: edit'));

        const button = await prompt.awaitMessageComponent({
            filter:        pressed => pressed.user.id === message.author.id && pressed.customId === 'purgeui_open',
            componentType: Discord.ComponentType.Button,
            time:          60 * 1000
        }).catch(() => null);

        if (!button)
        {

            return settle({
                color:       client.data.embedColor,
                description: 'Purge setup timed out.',
                footer:      client.data.footer
            });
        }

        const field = (id, label, placeholder, required = false) => new Discord.ActionRowBuilder().addComponents(new Discord.TextInputBuilder()
            .setCustomId(id)
            .setLabel(label)
            .setPlaceholder(placeholder)
            .setStyle(Discord.TextInputStyle.Short)
            .setRequired(required)
            .setMaxLength(100));

        const modal = new Discord.ModalBuilder()
            .setCustomId('purgeui_modal')
            .setTitle('Purge messages')
            .addComponents(field('purgeui_amount', 'Amount (1–10000)', 'e.g. 50 - or leave blank if using a message ID'), field('purgeui_user', 'Only from user (ID or @mention)', 'optional'), field('purgeui_filter', 'Only messages containing', 'optional: embeds, links, images'), field('purgeui_anchor', 'Anchor message ID(s)', 'optional: one ID, or two for a range; add "after"'), field('purgeui_regex', 'Content must match', 'optional: /pattern/flags, e.g. /discord.gg/i'));

        await button.showModal(modal);

        const submitted = await button.awaitModalSubmit({
            filter: modalInteraction => modalInteraction.user.id === message.author.id && modalInteraction.customId === 'purgeui_modal',
            time:   5 * 60 * 1000
        }).catch(() => null);

        if (!submitted)
        {
            return settle({
                color:       client.data.embedColor,
                description: 'Purge setup timed out.',
                footer:      client.data.footer
            });
        }

        await submitted.deferUpdate().catch(client.swallow('purge: deferUpdate'));
        await client.delete(prompt).catch(client.swallow('purge: delete'));

        const value = id => submitted.fields.getTextInputValue(id).trim();

        const built = [];

        const amount = value('purgeui_amount').match(/\d+/)?.[0];
        if (amount)
        {
            built.push(amount);
        }

        const userId = value('purgeui_user').replace(/[<@!>]/g, '');
        if (/^\d{17,20}$/.test(userId))
        {
            built.push(`<@${userId}>`);
        }

        for (const token of value('purgeui_filter').toLowerCase().split(/[\s,]+/))
        {
            if ([
                'embeds',
                'links',
                'images'
            ].includes(token))
            {
                built.push(token);
            }
        }

        for (const token of value('purgeui_anchor').split(/\s+/))
        {
            if (/^\d{17,20}$/.test(token))
            {
                built.push(token);
            }
            else if ([
                'after',
                'below',
                'new',
                'newerthan'
            ].includes(token.toLowerCase()))
            {
                built.push('after');
            }
        }

        const regex = value('purgeui_regex');
        if (regex)
        {
            built.push(regex);
        }

        if (!built.length)
        {
            return client.qEmbed('You need to give at least an amount or a message ID to purge.', message);
        }

        return this.run(client, message, built, guild);
    },

    async run(client, message, args, guild, interaction)
    {
        const reply = text => client.qEmbed(text, interaction ?? message);

        if (!args.length)
        {
            return this.openPurgeBuilder(client, message, guild);
        }

        let rest = [...args];

        const takeFlag = (...words) =>
        {
            const found = rest.find(a => words.includes(a.toLowerCase())) ?? null;

            if (found)
            {
                rest = rest.filter(a => a !== found);
            }

            return found;
        };

        const wantEmbeds = !!takeFlag('embeds');
        const wantLinks = !!takeFlag('links');
        const wantImages = !!takeFlag('images');

        const afterMode = !!takeFlag('after', 'below', 'new', 'newerthan');

        let channel = message.channel;
        const channelMention = rest.find(a => /^<#\d{17,20}>$/.test(a));
        if (channelMention)
        {
            const id = channelMention.slice(2, -1);
            channel = message.guild.channels.cache.get(id) ?? await message.guild.channels.fetch(id).catch(() => null);

            if (!channel)
            {
                return reply('That channel doesn\'t exist!');
            }

            rest = rest.filter(a => a !== channelMention);
        }

        if (!channel.isTextBased())
        {
            return reply('That channel isn\'t a text channel!');
        }

        let userId = null;
        const userMention = rest.find(a => /^<@!?\d{17,20}>$/.test(a));
        if (userMention)
        {
            userId = userMention.match(/^<@!?(\d{17,20})>$/)[1];
            rest = rest.filter(a => a !== userMention);
        }

        const messageIds = rest.filter(a => SNOWFLAKE.test(a));
        rest = rest.filter(a => !SNOWFLAKE.test(a));
        const [anchorId = null, secondAnchorId = null] = messageIds;

        let contentRegex = null;
        const regexToken = rest.find(a => parseRegexLiteral(a));
        if (regexToken)
        {
            contentRegex = parseRegexLiteral(regexToken);
            rest = rest.filter(a => a !== regexToken);
        }

        const amountToken = rest.find(a => /^\d+$/.test(a));
        const amount = amountToken !== undefined
            ? parseInt(amountToken, 10)
            : null;

        const rangeMode = !!(anchorId && secondAnchorId);

        if (afterMode && !anchorId)
        {
            return reply('The **after** deletion mode needs a `messageId` to anchor onto - please provide one.');
        }

        if (amount !== null && (amount < 1 || amount > MAX_AMOUNT))
        {
            return reply(`Please provide an amount between **1** and **${MAX_AMOUNT}**!`);
        }

        if (!anchorId && amount === null)
        {
            return reply(`Please provide an amount between **1** and **${MAX_AMOUNT}**!`);
        }

        let startId;
        let fetchAfter;
        let stopAtId = null;

        if (rangeMode)
        {
            const first = await channel.messages.fetch(anchorId).catch(() => null);
            const second = await channel.messages.fetch(secondAnchorId).catch(() => null);

            if (!first || !second)
            {
                return reply('One of the provided message IDs doesn\'t point to a message in that channel!');
            }

            const ascending = first.createdTimestamp <= second.createdTimestamp;
            fetchAfter = true;
            startId = ascending
                ? anchorId
                : secondAnchorId;
            stopAtId = ascending
                ? secondAnchorId
                : anchorId;
        }
        else if (anchorId)
        {
            const anchor = await channel.messages.fetch(anchorId).catch(() => null);

            if (!anchor)
            {
                return reply('That message ID doesn\'t point to a message in that channel!');
            }

            fetchAfter = afterMode || amount === null;
            startId = anchorId;
        }
        else
        {

            fetchAfter = false;
            startId = message.id;
        }

        const matches = m =>
        {
            const content = m.content ?? '';

            if (userId && m.author.id !== userId)
            {
                return false;
            }

            if (wantEmbeds && m.embeds.length === 0)
            {
                return false;
            }

            if (wantImages && m.attachments.size === 0)
            {
                return false;
            }

            if (wantLinks && !content.split(/\s+/).some(word => isUrl(word)))
            {
                return false;
            }

            return !(contentRegex && !content.match(contentRegex));
        };

        const recent = [];
        const old = [];

        let cursor = startId;
        let scanned = 0;
        let stop = false;

        while (!stop && scanned < MAX_SCAN)
        {
            const batch = await channel.messages.fetch({
                limit:           100,
                cache:           false,
                [fetchAfter
                    ? 'after'
                    : 'before']: cursor
            }).catch(() => null);

            if (!batch || batch.size === 0)
            {
                break;
            }

            cursor = Array.from(batch.keys()).reduce((acc, id) =>
            {
                if (fetchAfter)
                {
                    return BigInt(id) > BigInt(acc)
                        ? id
                        : acc;
                }

                return BigInt(id) < BigInt(acc)
                    ? id
                    : acc;
            });

            const ordered = Array.from(batch.values()).sort((a, b) => fetchAfter
                ? a.createdTimestamp - b.createdTimestamp
                : b.createdTimestamp - a.createdTimestamp);

            for (const m of ordered)
            {
                if (rangeMode && m.id === stopAtId)
                {
                    stop = true;
                    break;
                }

                if (m.id === message.id)
                {
                    continue;
                }

                scanned++;

                if (!matches(m))
                {
                    continue;
                }

                (m.createdTimestamp < Date.now() - BULK_DELETE_MAX_AGE
                    ? old
                    : recent).push(m);

                if (amount !== null && recent.length + old.length >= amount)
                {
                    stop = true;
                    break;
                }
            }
        }

        if (recent.length === 0 && old.length === 0)
        {
            return reply('No matching messages were found to delete.');
        }

        if (message.deletable)
        {
            await client.delete(message);
        }

        let deleted = 0;

        for (const group of chunk(recent, 100))
        {
            if (group.length === 1)
            {
                deleted += await client.delete(group[0])
                    ? 1
                    : 0;
                continue;
            }

            const removed = await channel.bulkDelete(group, true).catch(() => null);

            if (removed)
            {
                deleted += removed.size;
            }
            else
            {

                for (const m of group)
                {
                    deleted += await client.delete(m)
                        ? 1
                        : 0;
                }
            }

            await client.utils.sleep(1500);
        }

        if (old.length > 0)
        {
            const notice = await reply(`Found **${old.length}** message(s) older than 14 days. Discord can't bulk-delete those, so they're being removed one by one - this is slower, please wait.`);

            setTimeout(() => client.delete(notice).catch(client.swallow('purge: delete')), 8 * 1000);

            for (const m of old)
            {
                deleted += await client.delete(m)
                    ? 1
                    : 0;
                await client.utils.sleep(1200);
            }
        }

        client.cacheFor(guild.id, `bulk_${message.author.id}`, 60 * 1000);

        const where = channel.id !== message.channel.id
            ? ` in ${channel}`
            : '';
        const confirmation = await reply(`Successfully deleted **${deleted}** message${deleted === 1
            ? ''
            : 's'}${where}.`);

        if (channel.id === message.channel.id)
        {
            setTimeout(() => client.delete(confirmation).catch(client.swallow('purge: delete')), 5 * 1000);
        }

        return null;
    }
};
