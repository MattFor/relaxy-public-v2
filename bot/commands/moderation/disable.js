'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const categoryReference = {
    'fun':           0,
    'image':         1,
    'miscellaneous': 2,
    'moderation':    3,
    'music':         4
};

export default {
    name:        'disable',
    usage:       '=disable [commands|categories]',
    description: 'Disable individual commands or whole categories of commands.\nAvailable categories:\n- fun\n- image\n- miscellaneous\n- moderation\n- music\nIf you do not provide any arguments it will show a list of currently disabled commands.',

    cooldown: 10,

    permissionsUser:         [
        'SEND_MESSAGES',
        'MANAGE_GUILD'
    ],
    permissionsBot:          ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        if (!args[0])
        {
            const fields = [
                {
                    name:  'Fun:',
                    value: ''
                },
                {
                    name:  'Image:',
                    value: ''
                },
                {
                    name:  'Miscellaneous:',
                    value: ''
                },
                {
                    name:  'Moderation:',
                    value: ''
                },
                {
                    name:  'Music:',
                    value: ''
                }
            ];
            for (const dirs of await client.readDir('./bot/commands'))
            {
                const commands = await client.readDir(`./bot/commands/${dirs}`);
                for (const file of commands)
                {
                    const commandName = file.split('.')[0];
                    const command = client.collections.commands.get(commandName) ?? client.collections.aliases.get(commandName);

                    if (!command)
                    {
                        continue;
                    }

                    if ((command.owner && !client.isOwner(message.author.id)) || command.leaveout)
                    {
                        continue;
                    }

                    if (guild.cmd.dis.includes(command.name))
                    {
                        fields[categoryReference[dirs]].value += `\`${command.name}\`, `;
                    }
                }
            }

            for (let i = 0; i < fields.length; i++)
            {
                if (fields[i].value.length === 0)
                {
                    fields[i].value = '**No banned commands in this category.**';
                }
                else
                {
                    fields[i].value = `${fields[i].value.slice(0, -2)}.`;
                }
            }

            return client.send(message.channel, null, [
                {
                    color:  client.data.embedColor,
                    title:  'Banned commands:',
                    fields: fields,
                    footer: client.data.footer
                }
            ]);
        }

        const flag = [];
        const added = [];
        const removed = [];

        for (let i = 0; i < args.length; i++)
        {
            const isCategory = Object.keys(categoryReference).includes(args[i]);

            if (isCategory)
            {
                for (const file of await client.readDir(`./bot/commands/${args[i]}`))
                {
                    const commandName = file.split('.')[0];
                    const command = client.collections.commands.get(commandName) ?? client.collections.aliases.get(commandName);

                    if (!command)
                    {
                        client.log(commandName);
                        continue;
                    }

                    if (guild.cmd.dis.includes(command.name))
                    {
                        removed.push(command.name);
                        guild.cmd.dis.splice(guild.cmd.dis.indexOf(command.name), 1);
                        continue;
                    }

                    added.push(command.name);
                    guild.cmd.dis.push(command.name);
                }

                continue;
            }

            const command = client.collections.commands.get(args[i].toLowerCase()) ?? client.collections.aliases.get(args[i].toLowerCase());

            if (!command)
            {
                flag.push(args[i]);
                continue;
            }

            if (guild.cmd.dis.includes(command.name))
            {
                removed.push(args[i]);
                guild.cmd.dis.splice(guild.cmd.dis.indexOf(command.name), 1);
                continue;
            }

            added.push(args[i]);
            guild.cmd.dis.push(command.name);
        }

        if (flag.length > 0)
        {
            return client.send(message.channel, null, [
                {
                    color:  client.data.embedColor,
                    fields: [
                        {
                            name:  'Those commands do not exist, try again:',
                            value: `\`${flag.map(r =>
                            {
                                return r;
                            }).join('`, `')}\`.`
                        }
                    ]
                }
            ]);
        }

        client.save(guild.id, {
            alter: 'cmd.dis',
            value: guild.cmd.dis
        });

        const embed = {
            color:  client.data.embedColor,
            fields: []
        };

        if (added.length > 0)
        {
            embed.fields.push({
                name:  'Added those commands:',
                value: `\`${added.map(r =>
                {
                    return r;
                }).join('`, `')}\`.`
            });
        }

        if (removed.length > 0)
        {
            embed.fields.push({
                name:  'Removed those commands:',
                value: `\`${removed.map(r =>
                {
                    return r;
                }).join('`, `')}\`.`
            });
        }

        return client.send(message.channel, null, [embed]);
    }
};