'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'move',
    aliases: [],
    usage: '=move [option_number] [args]',
    description:
        '## Shows the Relaxy! music options on your server.\nThere are 4 types of options, to change them simply type =move [option_number] (additional arguments)\n**1.** Set whether the bot should leave or not after calling =stop.\n**2.** Set whether the bot should leave the channel after music stops.\n**3.** Set how long Relaxy! will buffer music before it plays (in MS). May impact quality.\n**4.** Set the initial volume of the bot. Default: `10`',

    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_GUILD'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES'],

    owner: false,

    async run(client, message, args, guild, interaction) {
        const embed = [
            {
                color: client.data.embedColor,
                title: `${message.guild.name}'s music options:`,
                description: `\`1.\` Leave after calling ${guild.px[0]}stop: **\`${
                    guild.mo.ls ? 'YES' : 'NO'
                }\`**\n\`2.\` Leave after music ends: **\`${
                    guild.mo.le ? 'YES' : 'NO'
                }\`**\n\`3.\` Music buffer timeout: **\`${client.imports.time(guild.mo.bt)}\`**\n\`4.\` Initial volume: **\`${guild.mo.iv}\`**`,
                thumbnail: { url: client.utils.guildIcon(message.guild) }
            }
        ];

        if (!args[0]) {
            return client.send(message.channel, null, embed);
        }

        const type = Number(args.shift());

        if (isNaN(type) || type < 1 || type > 4) {
            return client.qEmbed('Invalid option number!', interaction ?? message);
        }

        switch (type) {
            case 1:
                if (guild.mo.ls) {
                    client.save(guild.id, {
                        alter: 'mo.ls',
                        value: false
                    });
                    return client.qEmbed(
                        'Relaxy will now stay in the channel, even after =stop is called!',
                        interaction ?? message
                    );
                }

                client.save(guild.id, {
                    alter: 'mo.ls',
                    value: true
                });
                return client.qEmbed('Relaxy will leave the channel when =stop is called!', interaction ?? message);
            case 2:
                if (guild.mo.le) {
                    client.save(guild.id, {
                        alter: 'mo.le',
                        value: false
                    });
                    return client.qEmbed(
                        'Relaxy will now stay in channels, even after the music ends!',
                        interaction ?? message
                    );
                }

                client.save(guild.id, {
                    alter: 'mo.le',
                    value: true
                });
                return client.qEmbed('Relaxy will now leave channels when music ends!', interaction ?? message);
            case 3:
                if (!args[0]) {
                    return client.qEmbed('No arguments provided!', interaction ?? message);
                }

                args[0] = Number(args[0]);
                if (args[0] < 0 || args[0] > 60000) {
                    return client.qEmbed('Time is invalid!', interaction ?? message);
                }

                client.save(guild.id, {
                    alter: 'mo.bt',
                    value: args[0]
                });
                return client.qEmbed(`Buffering time set to ${client.imports.time(args[0])}!`, interaction ?? message);
            case 4:
                if (!args[0]) {
                    return client.qEmbed('No arguments provided!', interaction ?? message);
                }

                args[0] = Number(args[0]);
                if (args[0] < 1 || args[0] > 100) {
                    return client.qEmbed('Volume is invalid! 1-100', interaction ?? message);
                }

                client.save(guild.id, {
                    alter: 'mo.iv',
                    value: args[0]
                });
                return client.qEmbed(`Set initial volume to ${args[0]}!`, interaction ?? message);
        }
    }
};
