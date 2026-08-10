'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const COUNTING_PAY_LIMIT = 500;

export default {
    name:        'counting',
    aliases:     ['count'],
    usage:       '=counting [setup [#channel] / on / off / reset / hardmode / pay <amount> / status]',
    description: 'Set up and configure a counting game. Members take turns posting the next number in a dedicated channel - the same person can\'t count twice in a row, and (in hard mode) a wrong number resets everyone back to 1. Per-member tallies feed `=countingleaderboard`.\n**Options:**\n`setup [#channel]` - use an existing channel, or create one if omitted\n`on` / `off` - enable or disable\n`reset` - set the count back to 0\n`hardmode` - toggle whether a wrong number resets the count\n`pay <amount>` - pay money for each correct count, rising the longer the streak survives (`0` = off)\n`status` - show the current settings',

    slashDescription: 'Set up or configure the counting game for this server.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option
                   .setName('setting')
                   .setDescription('What to do. Leave empty to set up a counting channel.')
                   .setRequired(false)
                   .addChoices({
                       name:  'setup / create channel',
                       value: 'setup'
                   }, {
                       name:  'enable',
                       value: 'on'
                   }, {
                       name:  'disable',
                       value: 'off'
                   }, {
                       name:  'reset the count',
                       value: 'reset'
                   }, {
                       name:  'toggle hard mode',
                       value: 'hardmode'
                   }, {
                       name:  'set the payout per count',
                       value: 'pay'
                   }, {
                       name:  'show status',
                       value: 'status'
                   }))
               .addChannelOption(option => option
                   .setName('channel')
                   .setDescription('Existing channel to use for counting (for setup).')
                   .addChannelTypes(Discord.ChannelType.GuildText)
                   .setRequired(false))
               .addIntegerOption(option => option
                   .setName('amount')
                   .setDescription('Money paid per correct count, before the streak multiplier. 0 turns it off.')
                   .setMinValue(0)
                   .setMaxValue(COUNTING_PAY_LIMIT)
                   .setRequired(false)),

    cooldown: 5,

    permissionsUser:         ['MANAGE_GUILD'],
    permissionsBot:          [
        'MANAGE_CHANNELS',
        'SEND_MESSAGES',
        'ADD_REACTIONS'
    ],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    owner: false,

    async run(client, message, args, guild, interaction)
    {
        const co = guild.co;

        const statusText = () => `Status: **\`${co.on
            ? 'ENABLED'
            : 'DISABLED'}\`**\n` + `Channel: ${co.c
            ? `<#${co.c}>`
            : '**`none`** - run `=counting setup`'}\n` + `Current count: **\`${co.cur}\`** · Record: **\`${co.hi}\`**\n` + `Hard mode (reset on mistake): **\`${co.rst
            ? 'ON'
            : 'OFF'}\`**\n` + `Pays per count: ${co.pay
            ? `**\`${co.pay}\`** (×1.5 past 50, ×2 past 100, ×3 past 250, ×5 past 500, ×10 past 1000)`
            : '**`off`** - run `=counting pay <amount>`'}`;

        const show = title => client.send(interaction
            ? 1
            : message.channel, null, [
            {
                color:       client.data.embedColor,
                title:       title ?? `Counting - ${message.guild.name}`,
                description: statusText(),
                thumbnail:   { url: client.utils.guildIcon(message.guild) },
                footer:      client.data.footer
            }
        ]);
        const sub = (interaction
            ? interaction.options?.getString?.('setting') ?? ''
            : args[0] ?? '').toString().toLowerCase();

        if (!sub || sub === 'setup')
        {

            let channel = await client.utils.channel(message, args, 1);

            try
            {
                ({ channel } = await client.module.creators.createCounting({
                    guild:    message.guild,
                    guildDoc: guild,
                    channel:  channel ?? null,
                    reason:   `=counting by ${client.utils.tag(message.author)}`
                }));
            }
            catch (error)
            {
                return client.qEmbed(/text channel/i.test(String(error?.message))
                    ? 'The counting channel has to be a normal text channel.'
                    : 'I couldn\'t create a channel. Give me the **Manage Channels** permission, or run `=counting setup #existing-channel`.', interaction ?? message);
            }

            client.send(channel, null, [
                {
                    color:       client.data.embedColor,
                    title:       '🔢 Counting started!',
                    description: 'Count up together - post **1** to begin!\n• One number at a time\n• You can\'t count twice in a row' + (co.rst
                        ? '\n• A wrong number resets everyone back to **1**'
                        : ''),
                    footer:      client.data.footer
                }
            ]).catch(client.swallow('counting: operation'));

            return show(`Counting set up in #${channel.name}`);
        }

        if (sub === 'status' || sub === 'settings' || sub === 'show')
        {
            return show();
        }

        if (sub === 'on' || sub === 'enable')
        {
            if (!co.c)
            {
                return client.qEmbed('Set up a counting channel first with `=counting setup`.', interaction ?? message);
            }

            co.on = true;
            client.save(guild.id, {
                alter: 'co.on',
                value: true
            });
            return show(`Counting ENABLED - ${message.guild.name}`);
        }

        if (sub === 'off' || sub === 'disable')
        {
            co.on = false;
            client.save(guild.id, {
                alter: 'co.on',
                value: false
            });
            return show(`Counting DISABLED - ${message.guild.name}`);
        }

        if (sub === 'reset')
        {
            co.cur = 0;
            co.last = '';
            client.save(guild.id, {
                alter: 'co.cur',
                value: 0
            });
            client.save(guild.id, {
                alter: 'co.last',
                value: ''
            });
            return client.qEmbed(`Count reset to **0** - the next number is **1**. The record of **${co.hi}** still stands.`, interaction ?? message);
        }

        if (sub === 'hardmode' || sub === 'hard')
        {
            co.rst = !co.rst;
            client.save(guild.id, {
                alter: 'co.rst',
                value: co.rst
            });
            return client.qEmbed(`Hard mode is now **${co.rst
                ? 'ON'
                : 'OFF'}** - a wrong number ${co.rst
                ? 'resets the count to 1'
                : 'is simply rejected and the count continues'}.`, interaction ?? message);
        }

        if (sub === 'pay' || sub === 'reward')
        {

            const raw = interaction
                ? interaction.options?.getInteger?.('amount')
                : args[1];

            const amount = Math.floor(Number(raw));

            if (raw === null || raw === undefined || raw === '' || !Number.isFinite(amount) || amount < 0)
            {
                return client.qEmbed(`Give an amount - \`=counting pay 25\` pays **25** per correct count, \`=counting pay 0\` turns it off.\nRight now: **\`${co.pay || 0}\`**.`, interaction ?? message);
            }
            if (amount > COUNTING_PAY_LIMIT)
            {
                return client.qEmbed(`**${COUNTING_PAY_LIMIT}** is the most you can pay per count. Money is shared across every server Relaxy is in, so no single server sets the rate for all of them.`, interaction ?? message);
            }

            co.pay = amount;

            client.save(guild.id, {
                alter: 'co.pay',
                value: amount
            });

            return client.qEmbed(amount === 0
                ? 'Counting no longer pays anything.'
                : `Counting now pays **${amount}** per correct count, rising to **${Math.floor(amount * 1.5)}** past 50, **${amount * 2}** past 100, **${amount * 3}** past 250, **${amount * 5}** past 500 and **${amount * 10}** past 1000.\nThe longer the streak survives, the more it is worth.`, interaction ?? message);
        }

        return client.qEmbed('Unknown option. Use one of: `setup [#channel]`, `on`, `off`, `reset`, `hardmode`, `pay <amount>`, `status`.', interaction ?? message);
    }
};
