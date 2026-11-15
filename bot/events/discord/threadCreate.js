'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, thread, newlyCreated) {
        if (!newlyCreated) {
            return;
        }

        const guild = await client.module.database.Guild(thread.guild.id);

        let message = await client.getMessage(thread, null, true);

        if (!message) {
            message = thread.messages.channel.lastMessage;
        }

        if (guild.ml.ev?.threadCreate?.on) {
            if (
                await client.channels
                    .fetch(guild.ml.ev.threadCreate.channel)
                    .catch(client.swallow('threadCreate: fetch'))
            ) {
                client.pushModlog(
                    thread.guild.id,
                    'threadCreate',
                    new client.class.modlog({
                        color: 'good',
                        event: 'Thread created',
                        thumbnail:
                            message?.member?.displayAvatarURL({
                                dynamic: true,
                                size: 4096
                            }) ??
                            thread.guild.iconURL({
                                dynamic: true,
                                size: 4096
                            }),
                        description: `Channel: **${thread} - ${thread.name} - \`${thread.id}\`**\nCreated by: ${message?.member ?? 'None.'} ${client.utils.tag(message?.member?.user) ?? ''}`
                    }),
                    null
                );
            }
        }

        if (
            !thread.parent ||
            thread.parent.type !== client.imports.discord.ChannelType.GuildForum ||
            (await thread.fetchOwner())?.user?.id === client.user.id
        ) {
            return;
        }

        await client.utils.sleep(2300);

        const [forum, firstMessage] = await Promise.all([
            client.module.database.findForumChannel(thread.parent.id, thread.guild.id),
            client.getMessage(thread, null, true)
        ]);

        if (!guild.fo.on || !forum || forum.length === 0) {
            return;
        }

        if (!firstMessage || !firstMessage.content) {
            if (forum.ck.og) {
                return client.delete(thread, 'Original message deleted');
            } else {
                return;
            }
        }

        if ((await client.utils.isBlacklisted(firstMessage.author.id)) > 0) {
            return client.delete(thread);
        }

        const reject = async ({
            code,
            label,
            detail = '',
            template = '',
            comparison = '',
            target = thread,
            values = {}
        }) => {
            if (template?.length > 0) {
                const filled = template
                    .replaceAll('|U|', firstMessage.author)
                    .replaceAll('|G|', firstMessage.guild.name)
                    .replaceAll('|T|', thread.name)
                    .replaceAll('{overCase/underCase}', comparison)
                    .replaceAll('|L|', String(values.length ?? ''))
                    .replaceAll('|M|', String(values.limit ?? ''))
                    .replaceAll('|D|', String(values.difference ?? ''));

                const spelledOut = /\|[LMD]\|/.test(template);

                client.send(firstMessage.author, detail && !spelledOut ? `${filled}\n\n${detail}` : filled);
            }

            client.noteForumRejection(guild.id, thread.id, {
                code,
                label,
                detail
            });

            return client.delete(target);
        };

        const measure = (what, value, limit, unit) => {
            const max = limit > 0;
            const bound = Math.abs(limit);
            const difference = max ? value - bound : bound - value;

            return {
                detail: `The ${what} is **${value}** ${unit}${value === 1 ? '' : 's'}, which is **${difference}** ${
                    max ? 'over the maximum' : 'under the minimum'
                } of **${bound}**.`,
                comparison: max ? 'over' : 'under',
                values: {
                    length: value,
                    limit: bound,
                    difference
                }
            };
        };

        if (forum.ck.cn && guild.cn.on && (await client.utils.censorCheck(firstMessage.content.split(' '), guild))) {
            return reject({
                code: 'censor',
                label: 'Censored word found within.',
                template: forum.rp.cn
            });
        }

        if (
            forum.ck.ac > 0 ? firstMessage.attachments.size > forum.ck.ac : firstMessage.attachments.size < -forum.ck.ac
        ) {
            const found = measure('post', firstMessage.attachments.size, forum.ck.ac, 'attachment');

            return reject({
                code: 'files',
                label: 'Attachment filter triggered.',
                detail: found.detail,
                comparison: forum.ck.ac > 0 ? 'many' : 'little',
                values: found.values,
                template: forum.rp.at
            });
        }

        if (
            (forum.ck.tl > 0
                ? firstMessage?.channel?.name?.length > forum.ck.tl
                : firstMessage?.channel?.name?.length < -forum.ck.tl) &&
            !(forum.st.ap && firstMessage.attachments.size !== 0)
        ) {
            const found = measure('title', firstMessage.channel.name.length, forum.ck.tl, 'character');

            return reject({
                code: 'titlelen',
                label: 'Title length filter triggered.',
                template: forum.rp.tl,
                ...found
            });
        }

        if (
            (forum.ck.bl > 0
                ? firstMessage.content.length > forum.ck.bl
                : firstMessage.content.length < -forum.ck.bl) &&
            !(forum.st.ap && firstMessage.attachments.size !== 0)
        ) {
            const found = measure('post body', firstMessage.content.length, forum.ck.bl, 'character');

            return reject({
                code: 'bodylen',
                label: 'Content length filter triggered.',
                template: forum.rp.bl,
                ...found
            });
        }

        const body = firstMessage.content.toLowerCase().replaceAll(/[$&+,:;=?@#|'<>.^*()%/[\]]/g, '');
        const title = firstMessage.channel.name.toLowerCase().replaceAll(/[$&+,:;=?@#|'<>.^*()%/[\]\\-]/g, '');

        const bodyAlternate = client.utils.smallify(firstMessage.content);
        const titleAlternate = client.utils.smallify(firstMessage.channel.name);

        if (forum.ck.sp) {
            if ((client.utils.isSpam(title) && title.split(' ').length > 3) || client.utils.isSpam(body)) {
                return reject({
                    code: 'spam',
                    label: 'Marked as spam.',
                    template: forum.rp.sp
                });
            }
        }

        for (let i = 0; i < forum.ck.mt.length; i++) {
            let check = forum.ck.mt[i].replaceAll('-', ' ');
            let alternateCheck = forum.ck.mt[i].replaceAll('-', '');

            const smallCheck = client.utils.smallify(check);
            const alternateSmallCheck = client.utils.smallify(alternateCheck);

            if (
                !body.includes(check) &&
                !title.includes(check) &&
                !body.includes(alternateCheck) &&
                !title.includes(alternateCheck) &&
                !body.includes(smallCheck) &&
                !title.includes(smallCheck) &&
                !body.includes(alternateSmallCheck) &&
                !title.includes(alternateSmallCheck) &&
                !bodyAlternate.includes(check) &&
                !titleAlternate.includes(check) &&
                !bodyAlternate.includes(alternateCheck) &&
                !titleAlternate.includes(alternateCheck) &&
                !bodyAlternate.includes(smallCheck) &&
                !titleAlternate.includes(smallCheck) &&
                !bodyAlternate.includes(alternateSmallCheck) &&
                !titleAlternate.includes(alternateSmallCheck)
            ) {
                continue;
            }

            const phrase = forum.ck.mt[i];
            const rejectPhrase = (target = thread) =>
                reject({
                    code: phrase,
                    label: `Contains a banned phrase: "${phrase}".`,
                    detail: `The post uses **${phrase}**, which this forum does not allow.`,
                    template:
                        forum.rp[phrase] ||
                        `**|T|** has been automatically rejected for containing an invalid phrase: **${phrase}**.`,
                    target
                });

            if (forum.ck.rw) {
                return rejectPhrase(firstMessage.channel);
            }

            const splitCheck = check.split(' ');
            const speedCheckTitle = client.imports.lodash
                .chain(title)
                .split(' ')
                .takeRight(splitCheck.length)
                .reverse()
                .value()
                .join(' ');

            const speedCheckBody = client.imports.lodash
                .chain(body)
                .split(' ')
                .takeRight(splitCheck.length)
                .reverse()
                .value()
                .join(' ');

            const speedCheckTitleAlternate = client.imports.lodash
                .chain(titleAlternate)
                .split(' ')
                .takeRight(splitCheck.length)
                .reverse()
                .value()
                .join(' ');

            const speedCheckBodyAlternate = client.imports.lodash
                .chain(bodyAlternate)
                .split(' ')
                .takeRight(splitCheck.length)
                .reverse()
                .value()
                .join(' ');

            const smallCheckRegExp = new RegExp(`\\b${smallCheck}\\b`);
            const smallCheckAlternateRegExp = new RegExp(`\\b${alternateSmallCheck}\\b`);

            const ogCheckRegExp = new RegExp(`\\b(?:\\[|\\(|{)*${check}(?:\\]|\\)|})*\\b`, 'i');
            const ogAlternateCheckRegExp = new RegExp(`\\b(?:\\[|\\(|{)*${alternateCheck}(?:\\]|\\)|})*\\b`, 'i');

            if (
                speedCheckBody === check ||
                speedCheckTitle === check ||
                speedCheckBody === alternateCheck ||
                speedCheckTitle === alternateCheck ||
                speedCheckBodyAlternate === check ||
                speedCheckTitleAlternate === check ||
                speedCheckBodyAlternate === alternateSmallCheck ||
                speedCheckTitleAlternate === alternateSmallCheck ||
                (((client.utils.smallify(body).match(smallCheckRegExp)?.[0] ?? false) ||
                    (client.utils.smallify(title).match(smallCheckRegExp)?.[0] ?? false)) &&
                    (client.utils.smallify(speedCheckBodyAlternate).indexOf(check) !== -1 ||
                        client.utils.smallify(speedCheckTitleAlternate).indexOf(check) !== -1)) ||
                (((client.utils.smallify(body).match(smallCheckAlternateRegExp)?.[0] ?? false) ||
                    (client.utils.smallify(title).match(smallCheckAlternateRegExp)?.[0] ?? false)) &&
                    (client.utils.smallify(speedCheckBodyAlternate).indexOf(alternateSmallCheck) !== -1 ||
                        client.utils.smallify(speedCheckTitleAlternate).indexOf(alternateSmallCheck) !== -1)) ||
                (body.match(ogCheckRegExp)?.[0] ?? false) ||
                (title.match(ogAlternateCheckRegExp)?.[0] ?? false)
            ) {
                return rejectPhrase();
            }

            const bodySplit = body.split(' ');
            const titleSplit = title.split(' ');

            for (let j = 0; j < bodySplit.length - 1; j++) {
                if (`${bodySplit[j]} ${bodySplit[j + 1]}` === check) {
                    return rejectPhrase();
                }

                if (body.includes(check) || body.includes(alternateCheck)) {
                    let content = body;

                    while (true) {
                        if (!content.includes(check)) {
                            break;
                        }

                        let index = content.indexOf(check);
                        if (index + 1 > content.length) {
                            break;
                        }

                        if (!content[index + check.length] === ' ') {
                            return rejectPhrase();
                        }

                        content = content.slice(0, index);
                    }
                }
            }

            for (let j = 0; j < titleSplit.length - 1; j++) {
                if (`${titleSplit[j]} ${titleSplit[j + 1]}` === check) {
                    return rejectPhrase();
                }

                if (title.includes(check)) {
                    let content = title;

                    while (true) {
                        if (!content.includes(check)) {
                            break;
                        }

                        let index = content.indexOf(check);
                        if (index + 1 > content.length) {
                            break;
                        }

                        if (!content[index + check.length] === ' ') {
                            return rejectPhrase();
                        }

                        content = content.slice(0, index);
                    }
                }
            }
        }

        if (forum.st.sn.on) {
            const channel = firstMessage.guild.channels.cache.get(forum.st.sn.c);

            if (!channel) {
                return client.delete(thread);
            }

            let fields = [];

            let image = null;
            let files = null;

            const path = `./storage/cache/users/${firstMessage.author.id}/${firstMessage.id}`;

            if (await client.pathExists(path)) {
                const attachment = firstMessage.attachments.first();
                const gif = attachment.contentType.includes('gif') ? 'gif' : 'png';

                image = { url: `attachment://${firstMessage.id}.${gif}` };

                files = [
                    {
                        attachment: path,
                        name: `${firstMessage.id}.${gif}`
                    }
                ];

                setTimeout(async () => {
                    if (await client.pathExists(path)) {
                        client.unlink(path);
                    }
                }, 20 * 1000);
            }

            const embed = {
                color: client.data.embedColor,
                title: thread.name,
                author: {
                    name: client.utils.tag(firstMessage.author),
                    icon_url: firstMessage.author.displayAvatarURL({
                        dynamic: true,
                        size: 4096
                    })
                },
                description: firstMessage.content.slice(0, 2048),
                fields: fields,
                image: image
            };

            if (firstMessage.content.length > 2048) {
                embed.description = firstMessage.content.slice(0, 2048);

                let i = 0;
                while (true) {
                    if ((i + 1) * 1024 > firstMessage.content.length || embed.fields.length > 6) {
                        break;
                    }

                    embed.fields.push({
                        name: `Continuation #${i + 1}`,
                        value: firstMessage.content.slice((i + 1) * 1024, (i + 2) * 1024)
                    });
                    i++;
                }
            }

            embed.fields.push({
                name: 'User information:',
                value: `**${(await firstMessage.guild.members.fetch(firstMessage.author.id)) ?? 'Unavailable.'}** - **${client.utils.tag(firstMessage.author)}** - **\`${firstMessage.author.id}\`**`
            });

            await client.send(channel, null, [embed], files);

            return setTimeout(() => client.delete(thread), 1000);
        }

        if (!forum.tg.p || !thread.parent.availableTags.find((tag) => tag.id === forum.tg.p)) {
            await thread.parent.setAvailableTags([
                {
                    name: 'Pending approval',
                    moderated: true,
                    emoji: '🗃️'
                },
                {
                    name: 'Approved',
                    moderated: true,
                    emoji: '✅'
                }
            ]);

            forum.tg.p = thread.parent.availableTags.find((t) => t.name === 'Pending approval').id;
            forum.tg.a = thread.parent.availableTags.find((t) => t.name === 'Approved').id;

            client.saveForum(
                forum.id,
                guild.id,
                {
                    alter: 'tg.p',
                    value: forum.tg.p
                },
                {
                    alter: 'tg.a',
                    value: forum.tg.a
                }
            );
        }

        let tags = thread.appliedTags;
        if (tags.length === 5) {
            tags.pop();
        }

        tags.push(forum.tg.p);

        let promises = [
            client.react(firstMessage, forum.em, '❌'),
            thread.edit({
                type: client.imports.discord.ChannelType.PrivateThread
            }),
            thread.setAppliedTags([...new Set(tags)]),
            firstMessage.pin()
        ];

        let i = 0;
        const interval = setInterval(async () => {
            if (i >= promises.length || !thread) {
                clearInterval(interval);

                setTimeout(async () => {
                    await thread.setArchived(true).catch(async () => {
                        if (forum.ck.og) {
                            client.noteForumRejection(guild.id, thread.id, {
                                code: 'og',
                                label: 'Original message deleted.'
                            });
                            return client.delete(thread);
                        }
                    });
                }, 1000);

                if (forum.st.to !== 0) {
                    return setTimeout(async () => {
                        if (!thread.appliedTags.includes(forum.tg.a)) {
                            return client.delete(thread).catch(async () => {
                                if (forum.ck.og) {
                                    client.noteForumRejection(guild.id, thread.id, {
                                        code: 'og',
                                        label: 'Original message deleted.'
                                    });
                                    return client.delete(thread);
                                }
                            });
                        }
                    }, forum.st.to);
                }

                return;
            }

            await promises[i].catch(async () => {
                if (forum.ck.og) {
                    client.noteForumRejection(guild.id, thread.id, {
                        code: 'og',
                        label: 'Original message deleted.'
                    });
                    return client.delete(thread).catch(() => clearInterval(interval));
                }
            });
            i++;
        }, 2000);
    }
};
