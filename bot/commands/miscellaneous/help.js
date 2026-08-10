'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const byCategory = client =>
{
    const grouped = new Map();

    for (const command of client.collections.commands.values())
    {
        if (!command?.dir)
        {
            continue;
        }

        if (!grouped.has(command.dir))
        {
            grouped.set(command.dir, []);
        }

        grouped.get(command.dir).push(command);
    }

    for (const commands of grouped.values())
    {
        commands.sort((a, b) => a.name.localeCompare(b.name));
    }

    return new Map([...grouped].sort(([a], [b]) => a.localeCompare(b)));
};

export default {
    name:        'help',
    aliases:     ['commands'],
    usage:       '=help [commandname]',
    description: 'Get a list of all commands or information about a single command.',

    slash: new Discord.SlashCommandBuilder().addStringOption(option => option.setName('command_name').setDescription('Name or alias of the command to search.').setRequired(false)),

    defer: true,

    permissionsUser:         ['SEND_MESSAGES'],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: [
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const fallBack = !message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks);

        const categories = byCategory(client);

        if (args[0] && !categories.has(args[0]))
        {
            const command = client.collections.commands.get(args[0].toLowerCase()) || client.collections.aliases.get(args[0].toLowerCase());

            if (!command)
            {
                if (interaction)
                {
                    return { embeds: [client.qEmbed('There\'s no command like that!', 1)] };
                }

                return client.qEmbed('There\'s no command like that!', interaction ?? message);
            }

            const fallBackFile = !message.guild.members.me.permissions.has(Discord.PermissionFlagsBits.AttachFiles);

            let fallBackMessageContent = `## Usage: ${guild.px[0]}${command.usage.slice(1, command.usage.length)}\n`;

            let file = [];
            let embed = new client.imports.discord.EmbedBuilder()
                .setColor(client.data.embedColor)
                .setTimestamp()
                .setTitle(`**${guild.px[0]}${command.name} explanation:**`)
                .addFields([
                    {
                        name:  'Usage:',
                        value: `${guild.px[0]}${command.usage.slice(1, command.usage.length)}`
                    }
                ])
                .setFooter(client.data.footer)
                .setThumbnail(client.cdn.spinner);

            if (await client.pathExists(client.cdn.helpImage(command.name)) && !fallBackFile)
            {
                file.push(new Discord.AttachmentBuilder(client.cdn.helpImage(command.name), { name: `${command.name}.png` }));
                embed.setImage(`attachment://${command.name}.png`);
            }

            let description = command.description;

            if (command.aliases)
            {
                description += '\n\n**Aliases:**   **';
                let alias_length = command.aliases.length;

                for (let i = 0; i < alias_length; i++)
                {
                    description += `\`${command.aliases[i]}\`, `;
                }

                description = `${description.slice(0, -2)}.**\n`;
            }

            if (command.undergoingchange)
            {
                fallBackMessageContent += `\nCommand is being upgraded!\n\`\`\`diff\n- This command is undergoing changes! Unstable!\n\`\`\`\n`;
                embed.addFields([
                    {
                        name:  'Command is being upgraded!',
                        value: '```diff\n- This command is undergoing changes! Unstable!\n```'
                    }
                ]);
            }

            if (command.cooldown)
            {
                fallBackMessageContent += `\nCooldown\n**Time: \`${client.imports.time(command.cooldown * 1000)}\`.**\n`;
                embed.addFields([
                    {
                        name:  'Cooldown',
                        value: `**Time: \`${client.imports.time(command.cooldown * 1000)}\`.**`
                    }
                ]);
            }

            if (command.nsfw)
            {
                fallBackMessageContent += `\nNSFW\n**This command can only be used in nsfw channels.**\n`;
                embed.addFields([
                    {
                        name:  'NSFW',
                        value: '**This command can only be used in nsfw channels.**'
                    }
                ]);
            }

            if (command.args)
            {
                fallBackMessageContent += `\nArguments\n**This command requires arguments.**\n`;
                embed.addFields([
                    {
                        name:  'Arguments',
                        value: '**This command requires arguments.**'
                    }
                ]);
            }
            else
            {
                fallBackMessageContent += `\nArguments\n**This command doesn\'t require arguments.**\n`;
                embed.addFields([
                    {
                        name:  'Arguments',
                        value: '**This command doesn\'t require arguments.**'
                    }
                ]);
            }

            if (command.name === 'welcomechannel')
            {
                fallBackMessageContent += `\nAvailable options\n${command.description.split('XXXX')[1]}\n`;
                embed.addFields([
                    {
                        name:  'Available options',
                        value: '`1`. Only welcomers (messages)\n`2`. Only welcomers (cards)\n`3`. Only welcomers (everything)\n`4`. Only leavers (everything)\n`5`. Only leavers (messages)\n`6`. Only leavers (cards)\n`7`. Everything enabled\n`8`. Both (leaver everything, welcomer messages)\n`9`. Both (leaver everything, welcomer cards)\n`10`. Both (leaver messages, welcomer everything)\n`11`. Both (leaver cards, welcomer everything)\n`12`. Both (messages only for both)\n`13`. Both (cards only for both)'
                    }
                ]);
            }

            if (command.permissionsUser)
            {
                fallBackMessageContent += `\n### User permissions\n${command.permissionsUser.map((permission) =>
                {
                    return `\`${permission}\``;
                }).join(', ')}.\n`;

                embed.addFields([
                    {
                        name:  'User permissions',
                        value: `${command.permissionsUser.map((permission) =>
                        {
                            return `\`${permission}\``;
                        }).join(', ')}.`
                    }
                ]);
            }

            if (command.suggestedPermissionsUser)
            {
                fallBackMessageContent += `\n### Suggested User permissions\n${command.suggestedPermissionsUser.map((permission) =>
                {
                    return `\`${permission}\``;
                }).join(', ')}.\n`;

                embed.addFields([
                    {
                        name:  'Suggested User permissions',
                        value: `${command.suggestedPermissionsUser.map((permission) =>
                        {
                            return `\`${permission}\``;
                        }).join(', ')}.`
                    }
                ]);
            }

            if (command.permissionsBot)
            {
                fallBackMessageContent += `\n### Required Relaxy permissions\n${command.permissionsBot.map((permission) =>
                {
                    return `\`${permission}\``;
                }).join(', ')}.\n`;

                embed.addFields([
                    {
                        name:  'Required Relaxy permissions',
                        value: `${command.permissionsBot.map((permission) =>
                        {
                            return `\`${permission}\``;
                        }).join(', ')}.`
                    }
                ]);
            }

            if (command.suggestedPermissionsBot)
            {
                fallBackMessageContent += `\n### Suggested Relaxy permissions\n${command.suggestedPermissionsBot.map((permission) =>
                {
                    return `\`${permission}\``;
                }).join(', ')}.\n`;

                embed.addFields([
                    {
                        name:  'Suggested Relaxy permissions',
                        value: `${command.suggestedPermissionsBot.map((permission) =>
                        {
                            return `\`${permission}\``;
                        }).join(', ')}.`
                    }
                ]);
            }

            embed.setDescription(description);
            fallBackMessageContent += `\n${description}`;

            if (interaction)
            {
                return {
                    embeds: [embed],
                    files:  file
                };
            }

            if (fallBack)
            {
                return client.send(message.channel, fallBackMessageContent);
            }

            return client.send(message.channel, null, [embed], file);
        }

        let fallBackMessageContent = `\n## Server prefix: ${guild.px[0]}\n`;

        let embed = new client.imports.discord.EmbedBuilder()
            .setColor(client.data.embedColor)
            .setTimestamp()
            .setTitle('List of commands:', client.cdn.spinner)
            .setFooter(client.data.footer)
            .setThumbnail('https://media.tenor.com/images/822fb670841c6f6582fefbb82e338a50/tenor.gif')
            .setDescription(`The main prefix on this server is **\`${guild.px[0]}\`**.\n\nDefault global prefix is **\`${client.config.text.defaultPrefix}\`**.\n\nTo use a command type it like this **${guild.px[0]}\`command\`**  f.e  **=image**.\n\nSome commands have aliases, cooldowns or can only be used in __nsfw__ channels.\n\nTo see the specifics of any command type **=help \`command\`**.\n`);

        let commandCount = 0;

        const isOwner = client.isOwner(message.author.id);

        for (const [dir, commands] of categories)
        {
            if (['administrator'].includes(dir) && !isOwner || args[0] && args[0] !== dir)
            {
                continue;
            }

            const listed = commands.filter(command => command.leaveout
                ? !isOwner
                : true);
            const label = client.utils.firstLetterUp(dir);
            const tag = command => `${command.name}${command.leaveout
                ? ' [Out of order]'
                : ''}${command.undergoingchange
                ? ' [UPGRADING - UNSTABLE]'
                : ''}`;

            commandCount += listed.length;

            fallBackMessageContent += `### ${label}:\n${listed.map(command => tag(command)).join(', ')}.\n\n`;

            embed.addFields([
                {
                    name:  `${label}:`,
                    value: `${listed.map(command => `\`${tag(command)}\``).join(', ')}.`
                }
            ]);
        }

        fallBackMessageContent = `## Command count: \`${commandCount}\`\n${fallBackMessageContent}`;
        fallBackMessageContent += `\n${await client.cdnText('help_special_exceptions.txt')}\n# **fallback non-embed version**`;

        embed.setAuthor({ name: `Command count: ${commandCount}` });

        const row1 = new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder().setLabel('Website').setEmoji('<:relaxy:1526916768159895702>').setStyle(Discord.ButtonStyle.Link).setURL('https://relaxy.xyz'), new Discord.ButtonBuilder().setLabel('Dashboard').setEmoji('<:discordgear:1526918854863749150>').setStyle(Discord.ButtonStyle.Link).setURL('https://dashboard.relaxy.xyz'), ...client.utils.voteButtons());

        const row2 = new Discord.ActionRowBuilder().addComponents(new Discord.ButtonBuilder().setLabel('Support Relaxy!').setEmoji('<:relaxygif:1526921690481819798>').setStyle(Discord.ButtonStyle.Link).setURL('https://pay.relaxy.xyz'));

        if (args[0])
        {
            embed = Object.assign({}, {
                color:  embed.data.color,
                footer: embed.data.footer,
                fields: embed.data.fields
            });
        }
        else
        {
            embed.addFields([
                {
                    name:  'Special exceptions',
                    value: await client.cdnText('help_special_exceptions.txt')
                }
            ]);
        }

        if (interaction)
        {
            return {
                embeds:     [embed],
                components: [
                    row1,
                    row2
                ]
            };
        }

        if (fallBack)
        {
            return client.send(message.channel, fallBackMessageContent.slice(0, 2048));
        }

        await client.send(message.channel, null, [embed], null, null, [
            row1,
            row2
        ]);
    }
};
