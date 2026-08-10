'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'raidprotection',
    aliases:     [
        'raidprevention',
        'raidprot',
        'raid'
    ],
    usage:       '=raidprotection [on/off/ban/kick/threshold <n>/window <time>/age <time>/status]',
    description: 'Configure raid protection. It watches for bursts of suspicious joins (accounts younger than the configured age); once enough of them arrive inside the detection window it removes the whole burst and keeps removing suspicious joiners - and any bots - until the raid subsides.\nRun with no option to toggle it on or off.\n**Options:**\n`on` / `off` - enable or disable\n`ban` / `kick` - how suspects are removed\n`threshold <n>` - suspicious joins needed to trigger\n`window <time>` - how long the burst is measured over (e.g. `5 minutes`)\n`age <time>` - accounts younger than this are suspicious (e.g. `7 days`)\n`status` - show the current settings',

    slashDescription: 'Configure raid protection against bursts of suspicious joins.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option
                   .setName('setting')
                   .setDescription('What to change. Leave empty to toggle protection on/off.')
                   .setRequired(false)
                   .addChoices({
                       name:  'toggle on/off',
                       value: 'toggle'
                   }, {
                       name:  'show status',
                       value: 'status'
                   }, {
                       name:  'action: ban suspects',
                       value: 'ban'
                   }, {
                       name:  'action: kick suspects',
                       value: 'kick'
                   }, {
                       name:  'set trigger threshold',
                       value: 'threshold'
                   }, {
                       name:  'set detection window',
                       value: 'window'
                   }, {
                       name:  'set min account age',
                       value: 'age'
                   }))
               .addStringOption(option => option
                   .setName('value')
                   .setDescription('New value - a count for threshold, or a time like "5 minutes" for window/age.')
                   .setRequired(false)),

    cooldown: 5,

    permissionsUser: [
        'MANAGE_GUILD',
        'BAN_MEMBERS'
    ],
    permissionsBot:  [
        'KICK_MEMBERS',
        'BAN_MEMBERS'
    ],

    owner: false,

    async run(client, message, args, guild, interaction)
    {
        const rd = guild.rd;

        const settingsText = () => `Status: **\`${rd.on
            ? 'ENABLED'
            : 'DISABLED'}\`**\n` + `Action on suspects: **\`${rd.bn
            ? 'BAN'
            : 'KICK'}\`**\n` + `Trigger threshold: **\`${rd.th}\`** suspicious joins\n` + `Detection window: **\`${client.imports.time(rd.tp)}\`**\n` + `Suspicious if account younger than: **\`${client.imports.time(rd.al)}\`**`;

        const show = title => client.send(interaction
            ? 1
            : message.channel, null, [
            {
                color:       client.data.embedColor,
                title:       title ?? `Raid protection - ${message.guild.name}`,
                description: settingsText(),
                thumbnail:   { url: client.utils.guildIcon(message.guild) },
                footer:      client.data.footer
            }
        ]);

        const sub = (args[0] ?? '').toLowerCase();
        const timeArgs = args.slice(1).join(' ').trim().split(/\s+/).filter(Boolean);
        if (!sub || sub === 'toggle')
        {
            rd.on = !rd.on;
            client.save(guild.id, {
                alter: 'rd.on',
                value: rd.on
            });
            return show(`Raid protection ${rd.on
                ? 'ENABLED'
                : 'DISABLED'} - ${message.guild.name}`);
        }

        if (sub === 'status' || sub === 'settings' || sub === 'show')
        {
            return show();
        }

        if (sub === 'on' || sub === 'enable')
        {
            rd.on = true;
            client.save(guild.id, {
                alter: 'rd.on',
                value: true
            });
            return show(`Raid protection ENABLED - ${message.guild.name}`);
        }

        if (sub === 'off' || sub === 'disable')
        {
            rd.on = false;
            client.save(guild.id, {
                alter: 'rd.on',
                value: false
            });
            return show(`Raid protection DISABLED - ${message.guild.name}`);
        }

        if (sub === 'ban')
        {
            client.save(guild.id, {
                alter: 'rd.bn',
                value: true
            });
            return client.qEmbed('Suspected raiders will now be **banned**, and their recent messages purged.', interaction ?? message);
        }

        if (sub === 'kick')
        {
            client.save(guild.id, {
                alter: 'rd.bn',
                value: false
            });
            return client.qEmbed('Suspected raiders will now be **kicked**.', interaction ?? message);
        }

        if (sub === 'threshold' || sub === 'count' || sub === 'th')
        {
            const count = Number(args[1]);

            if (!Number.isInteger(count) || count < 2 || count > 100)
            {
                return client.qEmbed('Give a whole number between **2** and **100** for the trigger threshold.', interaction ?? message);
            }

            client.save(guild.id, {
                alter: 'rd.th',
                value: count
            });
            return client.qEmbed(`Raid protection will now trigger after **${count}** suspicious joins inside the detection window.`, interaction ?? message);
        }

        if (sub === 'window' || sub === 'timeperiod' || sub === 'time' || sub === 'tp')
        {
            const ms = client.utils.getTime(timeArgs);

            if (!ms || ms < 5_000 || ms > 3_600_000)
            {
                return client.qEmbed('Give a detection window between **5 seconds** and **1 hour**, e.g. `=raidprotection window 5 minutes`.', interaction ?? message);
            }

            client.save(guild.id, {
                alter: 'rd.tp',
                value: ms
            });
            return client.qEmbed(`Detection window set to **${client.imports.time(ms)}**.`, interaction ?? message);
        }

        if (sub === 'age' || sub === 'accountage' || sub === 'al')
        {
            const ms = client.utils.getTime(timeArgs);

            if (!ms || ms < 60_000 || ms > 31_536_000_000)
            {
                return client.qEmbed('Give an account-age threshold between **1 minute** and **1 year**, e.g. `=raidprotection age 7 days`.', interaction ?? message);
            }

            client.save(guild.id, {
                alter: 'rd.al',
                value: ms
            });
            return client.qEmbed(`Accounts younger than **${client.imports.time(ms)}** will now be treated as suspicious.`, interaction ?? message);
        }

        return client.qEmbed('Unknown option. Use one of: `on`, `off`, `ban`, `kick`, `threshold <n>`, `window <time>`, `age <time>`, `status`.', interaction ?? message);
    }
};
