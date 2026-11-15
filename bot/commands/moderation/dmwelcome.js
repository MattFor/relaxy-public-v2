'use strict';

export default {
    name: 'dmwelcome',
    usage: '=dmwelcome <welcome|leave> [text]',
    description:
        'Set a message that will be DMed to a user who joins (welcome) or leaves your server.\nYou can provide a text file with the =embed formatting to have the message be an embed (when doing that just type `=dmwelcome <welcome|leave>` and attach the file to the message).\n**People can opt out with `=dmout`**\n```diff\n- leave messages only visible for users who are also with relaxy on other servers\n```Provide no arguments to turn DM join/leave messages off. Messages must not exceed 1950 characters.',

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_GUILD'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        if (!args[0] && !guild.dg.on) {
            return client.qEmbed('No arguments provided!', interaction ?? message);
        }

        if (!args[0]) {
            client.save(guild.id, {
                alter: 'dg.on',
                value: false
            });
            return client.qEmbed(`Turned off DM join/leave messages for ${message.guild.name}`, interaction ?? message);
        }

        if (args[0] !== 'welcome' && args[0] !== 'leave') {
            return client.qEmbed('The first argument must be either welcome or leave!', interaction ?? message);
        }

        if (message.attachments.size > 0 && args[1]) {
            return client.qEmbed('Too many arguments!', interaction ?? message);
        }

        const joinLeave = args.shift();
        const dgKey = joinLeave === 'welcome' ? 'j' : 'l';
        const embed = new client.class.customEmbed(client);
        let text = '';
        let flag = false;

        client.save(guild.id, {
            alter: 'dg.on',
            value: true
        });

        if (message.attachments.size > 0) {
            try {
                await embed.createFromFile(message);
            } catch {}

            if (embed.data === undefined || embed.data === null) {
                return client.qEmbed('The data you provided is invalid!', interaction ?? message);
            }

            client.send(message.channel, null, [
                {
                    color: client.data.embedColor,
                    description:
                        'Do you want text above the embed? It will not show any text if you reply with **`no`**.'
                }
            ]);

            await message.channel
                .awaitMessages({
                    filter: (m) => m.author.id === message.author.id,
                    max: 1,
                    time: 300000,
                    errors: ['time']
                })
                .then((c) => {
                    const messageReceived = c.first();

                    if (!messageReceived.content) {
                        flag = true;
                        return client.qEmbed('Invalid response!', interaction ?? message);
                    }

                    const a = messageReceived.content.toLowerCase();

                    if (a !== 'no' && a !== '`no`' && a !== '**`no`**') {
                        return (text = a);
                    }
                });

            if (flag) {
                return;
            }

            client.save(guild.id, {
                alter: `dg.${dgKey}`,
                value: `${text}NULL(0)[SPLIT_FLAG]NULL(0)${await client.stringifyJSON(embed)}`
            });

            return client.qEmbed(`DM ${joinLeave} message changed!`, interaction ?? message);
        }

        if (args.join(' ').length > 1950) {
            return client.qEmbed('DM welcome message is too long! (maximum 1950 characters)', interaction ?? message);
        }

        if (await client.censored(args, guild, message)) {
            return client.qEmbed(
                "That message trips this server's censor - it has not been saved.",
                interaction ?? message
            );
        }

        client.save(guild.id, {
            alter: `dg.${dgKey}`,
            value: `${args.join(' ')}NULL(0)[SPLIT_FLAG]NULL(0)`
        });

        return client.qEmbed(`DM ${joinLeave} message changed!`, interaction ?? message);
    }
};
