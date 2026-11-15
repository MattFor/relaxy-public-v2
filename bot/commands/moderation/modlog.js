'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'modlog',
    usage: '=modlog [event|off|all|lowspam] [channel]',
    description:
        "Relaxy creates a modlog channel for you.\nEvery important server change/interaction is going to be logged there in detail.\nTo view the options, simply type =modlog again. To turn off the modlog, do =modlog off.\nTo change something, simply type =modlog (event number, take it from the list by simply doing =modlog) (channel, if you want to redirect it somewhere else or simply nothing to turn it off).\nYou can also say =modlog all (channel) to turn on everything and push it to the desired channel.\nType 'lowspam' to turn off events that rapidly appear.",

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_CHANNELS', 'VIEW_AUDIT_LOG'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES', 'MANAGE_CHANNELS', 'VIEW_AUDIT_LOG'],

    async run(client, message, args, guild, interaction) {
        if (guild.ml?.on) {
            client.utils.modlogChannels(guild);

            if (args.length > 0) {
                switch (args[0].toLowerCase()) {
                    case 'off': {
                        client.save(guild.id, {
                            alter: 'ml',
                            value: Object.assign(guild.ml, {
                                on: false,
                                ev: structuredClone(client.types.modlogEvents)
                            })
                        });

                        return client.qEmbed('Mod log removed!', interaction ?? message);
                    }

                    case 'all': {
                        const channel = await client.utils.channel(message, args, 1);

                        if (!channel) {
                            return client.qEmbed('Cannot find channel!', interaction ?? message);
                        }

                        if (channel.type !== Discord.ChannelType.GuildText) {
                            return client.qEmbed('Invalid channel type!', interaction ?? message);
                        }

                        const allEvents = structuredClone(client.types.modlogEvents);
                        for (const key of Object.keys(allEvents)) {
                            allEvents[key] = {
                                on: true,
                                channel: channel.id
                            };
                        }

                        client.save(guild.id, {
                            alter: 'ml',
                            value: Object.assign(guild.ml, {
                                on: true,
                                ev: allEvents
                            })
                        });

                        return client.qEmbed(`Pushing all modlogs to ${channel.name}.`, interaction ?? message);
                    }

                    case 'lowspam': {
                        const mode = guild.ml.ls;

                        client.save(guild.id, {
                            alter: 'ml.ls',
                            value: !mode
                        });

                        return client.qEmbed(
                            `Low spam mode has been turned ${mode ? 'off' : 'on'}!`,
                            interaction ?? message
                        );
                    }
                }
            }

            const embed = {
                color: client.data.embedColor,
                title: 'Moderator log options:',
                thumbnail: { url: client.utils.guildIcon(message.guild) },
                fields: [
                    {
                        name: 'Low spam mode:',
                        value: guild.ml.ls ? 'Is turned ON.' : 'Is turned OFF.'
                    }
                ],
                description: '',
                footer: client.data.footer
            };

            if (args.length === 0) {
                let w = [];
                let count = 1;

                for (const part of Object.entries(guild.ml.ev)) {
                    w.push(part[0]);
                    embed.description += `${count} - \`${client.types.humanReadableEvents[part[0]]}\`\nEnabled: ${
                        part[1].on ? '**Yes.**' : '**No.**'
                    }\nChannel: **${client.channels.cache.get(part[1].channel) || 'None.'}**\n`;
                    count++;
                }

                return client.send(message.channel, null, [embed]);
            }

            let index = Number(client.utils.nums(args[0]));

            if (!index) {
                return client.qEmbed('No option index given!', interaction ?? message);
            }
            const keys = Object.keys(guild.ml.ev ?? {});

            if (!keys.length) {
                return client.qEmbed(
                    'This server has no mod log yet. Run `=modlog` on its own to create one first.',
                    interaction ?? message
                );
            }

            if (index < 1 || index > keys.length) {
                return client.qEmbed(`Number is out of bounds, min 1 max ${keys.length}.`, interaction ?? message);
            }

            index -= 1;

            const channel = await client.utils.channel(message, args, 1);
            const key = keys[index];

            if (channel) {
                client.save(guild.id, {
                    alter: `ml.ev.${key}.channel`,
                    value: channel.id
                });
                return client.qEmbed('Options saved', interaction ?? message);
            }

            const option = guild.ml.ev[key].on;

            client.save(guild.id, {
                alter: `ml.ev.${key}.on`,
                value: !option
            });

            if (!option && !guild.ml.on) {
                client.save(guild.id, {
                    alter: 'ml.on',
                    value: true
                });
            }

            return client.qEmbed(
                `"${client.types.humanReadableEvents[key].slice(0, client.types.humanReadableEvents[key].length - 2)}" has been turned ${
                    option ? 'off' : 'on'
                }!`,
                interaction ?? message
            );
        }

        let channel;

        try {
            ({ channel } = await client.module.creators.createModlog({
                guild: message.guild,
                guildDoc: guild,
                reason: `=modlog by ${client.utils.tag(message.author)}`
            }));
        } catch (error) {
            client.data.errors++;

            return client.qEmbed(
                `Could not create the modlog channel: ${error?.message ?? error}`,
                interaction ?? message
            );
        }

        client.qEmbed('Moderator log channel created.', interaction ?? message);

        return client.send(channel, null, [
            new Discord.EmbedBuilder()
                .setColor(client.data.embedColor)
                .setAuthor({ name: 'Moderator channel created!' })
                .setDescription(
                    `Channel id: \`${channel.id}\`\nEvery important interaction on this server\nIs going got get reported on this channel.\n\`\`\`diff\n- It is recommended to lock this channel from non moderators.\n\`\`\``
                )
                .setTimestamp()
                .setFooter(client.data.footer)
                .setThumbnail(
                    message.guild.iconURL({
                        dynamic: true,
                        extension: 'png'
                    })
                )
        ]);
    }
};
