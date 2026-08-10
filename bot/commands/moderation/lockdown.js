'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'lockdown',
    usage:       '=lockdown',
    description: 'Toggle lockdown mode. While active, @everyone is denied sending messages, adding reactions, speaking and connecting in every channel.',

    slashDescription: 'Lock the server down, or lift a lockdown that is already on.',

    slash: new Discord.SlashCommandBuilder(),

    cooldown: 5,

    permissionsUser: ['ADMINISTRATOR'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'MOVE_MEMBERS',
        'MANAGE_MESSAGES',
        'MANAGE_CHANNELS',
        'MANAGE_ROLES',
        'BAN_MEMBERS'
    ],

    async run(client, message, args, guild, interaction)
    {
        if (guild.lk)
        {
            client.save(guild.id, {
                alter: 'lk',
                value: false
            });

            if (guild.ml.on)
            {
                client.pushModlog(message.guild.id, 'other', new client.class.modlog({
                    color:       'good',
                    event:       'LOCKDOWN has been lifted!',
                    description: `\`\`\`fix\n${message.guild.name}'s lockdown has been lifted! 🔑🔓\n\`\`\``,
                    thumbnail:   message.guild.iconURL({
                        dynamic: true,
                        size:    4096
                    })
                }), null);
            }

            message.guild.channels.cache.forEach(async channel =>
            {
                channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    'SendMessages': true,
                    'AddReactions': true,
                    'Speak':        true,
                    'Connect':      true
                });
            });

            client.log(`${message.guild.name} lifted LOCKDOWN!`);

            return client.qEmbed(`_ ${message.guild.name}'s lockdown has been lifted! 🔑🔓`, interaction ?? message);
        }

        client.qEmbed(`_ ${message.guild.name} has been put into LOCKDOWN! 🔒`, interaction ?? message);

        return setTimeout(async () =>
        {

            client.save(guild.id, {
                alter: 'lk',
                value: true
            });

            try
            {
                message.guild.channels.cache.forEach(async channel =>
                {
                    await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                        'SendMessages': false,
                        'AddReactions': false,
                        'Speak':        false,
                        'Connect':      false
                    });
                });
            }
            catch
            {
                client.qEmbed('Missing permissions to overwrite channel permissions.', interaction ?? message);
            }

            client.log('ERROR', `${message.guild.name} went into LOCKDOWN!`);

            if (guild.ml.on)
            {
                client.pushModlog(message.guild.id, 'other', new client.class.modlog({
                    color:       'bad',
                    event:       'LOCKDOWN INITIATED!',
                    description: `\`\`\`diff\n- ${message.guild.name}'s has been put into lockdown! 🔒\n\`\`\``,
                    thumbnail:   message.guild.iconURL({
                        dynamic: true,
                        size:    4096
                    })
                }), null);
            }
        }, 1000);
    }
};
