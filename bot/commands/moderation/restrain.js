'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'restrain',
    usage: '=restrain <type> <roles1> from <roles2>',
    description:
        "**Type**:\n`1` - if you DO have [roles2] you cannot have [roles1]\n`2` - if you DON'T have [roles1] you cannot have [roles2]\n`3` - if you DO have [roles2] you can have [roles1]\n`4` - if you DON'T have [roles2] you can have [roles1]\n\n[roles1] or [roles2] is just a list of roles separated by spaces, can be either a role id, an @ or the role name.",

    permissionsUser: ['SEND_MESSAGES', 'EMBED_LINKS', 'MANAGE_ROLES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const type = Number(args.shift());

        if (![1, 2, 3, 4].includes(type)) {
            return client.qEmbed('Invalid type!', interaction ?? message);
        }

        const content = client.utils.cleanup(args.join(' ').toLowerCase().split('from'));

        const roles1 = client.utils.cleanup(content[0].split(' '));
        const roles2 = client.utils.cleanup(content[1].split(' '));

        const toAdd = [];
        const toRemove = [];
        let flag = [];

        let count = 0;

        roles1.forEach((role) => {
            const roleGotten = message.guild.roles.cache.find((r) => r.id === client.utils.nums(role))
                ? message.guild.roles.cache.find((r) => r.id === client.utils.nums(role))
                : message.guild.roles.cache.find((r) => r.name === role.replaceAll('-', ' '))
                  ? message.guild.roles.cache.find((r) => r.name === role.replaceAll('-', ' '))
                  : null;

            if (!roleGotten) {
                count++;
                return flag.push(count);
            }

            count++;
            roleGotten.ID = count;
            return toAdd.push(roleGotten);
        });

        if (flag.length > 0) {
            return client.qEmbed(
                `Roles: [${flag
                    .map((r) => {
                        return `\`${roles1[r - 1]}\``;
                    })
                    .join(', ')}] are invalid!`,
                interaction ?? message
            );
        }

        flag = [];
        count = 0;

        roles2.forEach((role) => {
            const roleGotten = message.guild.roles.cache.find((r) => r.id === client.utils.nums(role))
                ? message.guild.roles.cache.find((r) => r.id === client.utils.nums(role))
                : message.guild.roles.cache.find((r) => r.name === role.replaceAll('-', ' '))
                  ? message.guild.roles.cache.find((r) => r.name === role.replaceAll('-', ' '))
                  : null;

            if (!roleGotten) {
                count++;
                return flag.push(count);
            }

            count++;
            roleGotten.ID = count;

            return toRemove.push(roleGotten);
        });

        if (flag.length > 0) {
            return client.qEmbed(
                `Roles: [${flag
                    .map((r) => {
                        return `\`${roles2[r - 1]}\``;
                    })
                    .join(', ')}] are invalid!`,
                interaction ?? message
            );
        }

        flag = [];

        switch (type) {
            case 1: {
                const restrictors = guild.rt[1];

                toAdd.forEach((role) => {
                    toRemove.forEach((r) => {
                        if (!restrictors[role.id] || restrictors[role.id].length === 0) {
                            restrictors[role.id] = [];
                            role.ADDED = true;
                        }

                        if (restrictors[role.id].includes(r.id)) {
                            restrictors[role.id].splice(restrictors[role.id].indexOf(r.id), 1);
                            r.ADDED = false;
                        } else {
                            r.ADDED = true;
                            restrictors[role.id].push(r.id);
                        }

                        if (restrictors[role.id].length === 0) {
                            restrictors[role.id] = [];
                            return (role.ADDED = false);
                        }
                    });
                });

                client.save(guild.id, {
                    alter: 'rt.1',
                    value: restrictors
                });

                return client.qEmbed(
                    `From now on if you **DO** have these roles:\n${toRemove.map((r) => {
                        return `**${r}${r.ADDED ? '`[ADDED]`' : '`[REMOVED]`'}**`;
                    })}\nYou will **NOT** be able to get these ones from Reaction Roles:\n${toAdd.map((r) => {
                        return `**${r}${r.ADDED ? '`[ADDED]`' : '`[REMOVED]`'}**`;
                    })}`,
                    interaction ?? message
                );
            }

            case 2: {
                const restrictors = guild.rt[2];

                toAdd.forEach((role) => {
                    toRemove.forEach((r) => {
                        if (!restrictors[role.id] || restrictors[role.id].length === 0) {
                            restrictors[role.id] = [];
                            role.ADDED = true;
                        }

                        if (restrictors[role.id].includes(r.id)) {
                            restrictors[role.id].splice(restrictors[role.id].indexOf(r.id), 1);
                            r.ADDED = false;
                        } else {
                            r.ADDED = true;
                            restrictors[role.id].push(r.id);
                        }

                        if (restrictors[role.id].length === 0) {
                            restrictors[role.id] = [];
                            return (role.ADDED = false);
                        }
                    });
                });

                client.save(guild.id, {
                    alter: 'rt.2',
                    value: restrictors
                });

                return client.qEmbed(
                    `From now on if you **DON'T** have these roles:\n${toAdd.map((r) => {
                        return `**${r}${r.ADDED ? '`[ADDED]`' : '`[REMOVED]`'}**`;
                    })}\nYou will **NOT** be able to get these ones from Reaction Roles:\n${toRemove.map((r) => {
                        return `**${r}${r.ADDED ? '`[ADDED]`' : '`[REMOVED]`'}**`;
                    })}`,
                    interaction ?? message
                );
            }

            case 3: {
                const restrictors = guild.rt[3];

                toAdd.forEach((role) => {
                    toRemove.forEach((r) => {
                        if (!restrictors[role.id] || restrictors[role.id].length === 0) {
                            restrictors[role.id] = [];
                            role.ADDED = true;
                        }

                        if (restrictors[role.id].includes(r.id)) {
                            restrictors[role.id].splice(restrictors[role.id].indexOf(r.id), 1);
                            r.ADDED = false;
                        } else {
                            r.ADDED = true;
                            restrictors[role.id].push(r.id);
                        }

                        if (restrictors[role.id].length === 0) {
                            restrictors[role.id] = [];
                            return (role.ADDED = false);
                        }
                    });
                });

                client.save(guild.id, {
                    alter: 'rt.3',
                    value: restrictors
                });

                return client.qEmbed(
                    `From now on if you **DO** have these roles:\n${toRemove.map((r) => {
                        return `**${r}${r.ADDED ? '`[ADDED]`' : '`[REMOVED]`'}**`;
                    })}\nYou **WILL** be able to get these ones from Reaction Roles:\n${toRemove.map((r) => {
                        return `**${r}${r.ADDED ? '`[ADDED]`' : '`[REMOVED]`'}**`;
                    })}`,
                    interaction ?? message
                );
            }

            case 4: {
                const restrictors = guild.rt[4];

                toAdd.forEach((role) => {
                    toRemove.forEach((r) => {
                        if (!restrictors[role.id] || restrictors[role.id].length === 0) {
                            restrictors[role.id] = [];
                            role.ADDED = true;
                        }

                        if (restrictors[role.id].includes(r.id)) {
                            restrictors[role.id].splice(restrictors[role.id].indexOf(r.id), 1);
                            r.ADDED = false;
                        } else {
                            r.ADDED = true;
                            restrictors[role.id].push(r.id);
                        }

                        if (restrictors[role.id].length === 0) {
                            restrictors[role.id] = [];
                            return (role.ADDED = false);
                        }
                    });
                });

                client.save(guild.id, {
                    alter: 'rt.4',
                    value: restrictors
                });

                return client.qEmbed(
                    `From now on if you **DON'T** have these roles:\n${toRemove.map((r) => {
                        return `**${r}${r.ADDED ? '`[ADDED]`' : '`[REMOVED]`'}**`;
                    })}\nYou **WILL** not be able to get these ones from Reaction Roles:\n${toAdd.map((r) => {
                        return `**${r}${r.ADDED ? '`[ADDED]`' : '`[REMOVED]`'}**`;
                    })}`,
                    interaction ?? message
                );
            }
        }
    }
};
