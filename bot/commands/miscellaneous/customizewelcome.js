'use strict';

export default {
    name: 'customizewelcome',
    usage: '=customizewelcome <option> <text>',
    description:
        "Customise welcome/goodbye messages. **option** must be one of:\n- `join_message`\n- `leave_message`\n- `join_top`\n- `leave_top`\n- `join_bottom`\n- `leave_bottom`\n\nIn `join_message`/`leave_message`, `|U|` is replaced with the joining/leaving user and `|G|` with the server name.\nYou can use `=embed` formatting to send an embedded message - because embed code can get large, this only works when supplied as a text file.\nIf a welcome option uses an image, it appears in the embed's large image field.",

    args: true,
    cooldown: 5,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_GUILD'],
    permissionsBot: ['SEND_MESSAGES'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        let type = args.shift().toLowerCase();

        if (!args[0] && !message.attachments.first()) {
            return client.qEmbed('No text given!', interaction ?? message);
        }

        if (!guild.wc.on) {
            return client.qEmbed('This feature of Relaxy! is not enabled on this server', interaction ?? message);
        }

        let text = '';
        let flag = false;

        if (message.attachments.first()) {
            switch (type) {
                case 'join_top':
                    if (guild.wc.j.c === '') {
                        return client.qEmbed(
                            'This feature of Relaxy! is not enabled on this server',
                            interaction ?? message
                        );
                    }

                    return client.qEmbed(
                        'You can only have an embed when using join_message or leave_message!',
                        interaction ?? message
                    );
                case 'leave_top':
                    if (guild.wc.l.c === '') {
                        return client.qEmbed(
                            'This feature of Relaxy! is not enabled on this server',
                            interaction ?? message
                        );
                    }

                    return client.qEmbed(
                        'You can only have an embed when using join_message or leave_message!',
                        interaction ?? message
                    );
                case 'join_bottom':
                    if (guild.wc.j.c === '') {
                        return client.qEmbed(
                            'This feature of Relaxy! is not enabled on this server',
                            interaction ?? message
                        );
                    }

                    return client.qEmbed(
                        'You can only have an embed when using join_message or leave_message!',
                        interaction ?? message
                    );
                case 'leave_bottom':
                    if (guild.wc.l.c === '') {
                        return client.qEmbed(
                            'This feature of Relaxy! is not enabled on this server',
                            interaction ?? message
                        );
                    }

                    return client.qEmbed(
                        'You can only have an embed when using join_message or leave_message!',
                        interaction ?? message
                    );
                default:
                    if (['leave_message', 'join_message'].includes(type)) {
                        break;
                    } else {
                        return client.qEmbed('Invalid option specified', interaction ?? message);
                    }
            }

            let embed = new client.class.customEmbed(client);

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

            message.channel
                .awaitMessages({
                    filter: (m) => m.author.id === message.author.id,
                    max: 1,
                    time: 300000,
                    errors: ['time']
                })
                .then((c) => {
                    if (!c.first().content) {
                        flag = true;
                        return client.qEmbed('Invalid response!', interaction ?? message);
                    }

                    let a = c.first().content.toLowerCase();

                    if (a !== 'no' && a !== '`no`' && a !== '**`no`**') {
                        return (text = a);
                    }
                });

            if (flag) {
                return;
            }

            switch (type) {
                case 'join_message':
                    if (guild.wc.j.c === '') {
                        return client.qEmbed(
                            'This feature of Relaxy! is not enabled on this server',
                            interaction ?? message
                        );
                    }

                    guild.wc.j.m = `${text}NULL(0)[SPLIT_FLAG]${await client.stringifyJSON(embed)}`;
                    client.save(guild.id, {
                        alter: 'wc.j.m',
                        value: guild.wc.j.m
                    });

                    break;
                case 'leave_message':
                    if (guild.wc.l.c === '') {
                        return client.qEmbed(
                            'This feature of Relaxy! is not enabled on this server',
                            interaction ?? message
                        );
                    }

                    guild.wc.l.m = `${text}NULL(0)[SPLIT_FLAG]${await client.stringifyJSON(embed)}`;
                    client.save(guild.id, {
                        alter: 'wc.l.m',
                        value: guild.wc.l.m
                    });

                    break;
            }

            return client.qEmbed('Options changed & saved!', interaction ?? message);
        }

        switch (type) {
            case 'join_message':
                if (guild.wc.j.c === '') {
                    return client.qEmbed(
                        'This feature of Relaxy! is not enabled on this server',
                        interaction ?? message
                    );
                }

                guild.wc.j.m = args.join(' ').slice(0, 1960);
                client.save(guild.id, {
                    alter: 'wc.j.m',
                    value: guild.wc.j.m
                });

                break;
            case 'leave_message':
                if (guild.wc.l.c === '') {
                    return client.qEmbed(
                        'This feature of Relaxy! is not enabled on this server',
                        interaction ?? message
                    );
                }

                guild.wc.l.m = args.join(' ').slice(0, 1960);
                client.save(guild.id, {
                    alter: 'wc.l.m',
                    value: guild.wc.l.m
                });

                break;
            case 'join_top':
                if (guild.wc.j.c === '') {
                    return client.qEmbed(
                        'This feature of Relaxy! is not enabled on this server',
                        interaction ?? message
                    );
                }

                guild.wc.j.t = args.join(' ').slice(0, 15);
                client.save(guild.id, {
                    alter: 'wc.j.t',
                    value: guild.wc.j.t
                });

                break;
            case 'leave_top':
                if (guild.wc.l.c === '') {
                    return client.qEmbed(
                        'This feature of Relaxy! is not enabled on this server',
                        interaction ?? message
                    );
                }

                guild.wc.l.t = args.join(' ').slice(0, 15);
                client.save(guild.id, {
                    alter: 'wc.l.t',
                    value: guild.wc.l.t
                });

                break;
            case 'join_bottom':
                if (guild.wc.j.c === '') {
                    return client.qEmbed(
                        'This feature of Relaxy! is not enabled on this server',
                        interaction ?? message
                    );
                }

                guild.wc.j.b = args.join(' ').slice(0, 30);
                client.save(guild.id, {
                    alter: 'wc.j.b',
                    value: guild.wc.j.b
                });

                break;
            case 'leave_bottom':
                if (guild.wc.l.c === '') {
                    return client.qEmbed(
                        'This feature of Relaxy! is not enabled on this server',
                        interaction ?? message
                    );
                }

                guild.wc.l.b = args.join(' ').slice(0, 30);
                client.save(guild.id, {
                    alter: 'wc.l.b',
                    value: guild.wc.l.b
                });

                break;
            default:
                return client.qEmbed('Invalid option specified', interaction ?? message);
        }

        return client.qEmbed('Options changed & saved!', interaction ?? message);
    }
};
