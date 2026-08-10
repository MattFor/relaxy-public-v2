'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    async run(client, thread, newlyCreated)
    {
        if (newlyCreated || !thread.parent)
        {
            return;
        }

        const guild = await client.module.database.Guild(thread.guild.id);

        if (guild.ml.ev?.threadDelete?.on)
        {
            let channel = await client.channels.fetch(guild.ml.ev.threadDelete.channel).catch(client.swallow('threadDelete: fetch'));

            if (!channel)
            {
                return;
            }

            const auditUser = await client.utils.auditLog(thread.guild, 'ThreadDelete', {
                rawAuthor: true,
                target:    thread
            }).catch(() => null);
            const forum = await client.module.database.findForumChannel(thread.parent.id, thread.guild.id);

            if (forum?.st.sn?.on)
            {
                return;
            }

            const rejection = client.takeForumRejection(thread.guild.id, thread.id);

            const deletedBy = rejection
                ? `${client.user} **\`Auto-rejected by Relaxy\`**`
                : auditUser
                    ? `${auditUser} - ${client.utils.tag(auditUser)} **\`${auditUser.id}\`**`
                    : 'Unavailable.';

            const fields = [
                rejection
                    ? {
                        name:  'Rule that rejected it:',
                        value: rejection.label
                    }
                    : null,
                rejection?.detail
                    ? {
                        name:  'Details:',
                        value: rejection.detail
                    }
                    : null
            ];

            if (guild.fo.cs.includes(thread?.parentId) && guild.ml.ev?.other?.on)
            {
                return client.pushModlog(thread.guild.id, 'other', new client.class.modlog({
                    color:       'bad',
                    event:       rejection
                                     ? 'Forum post auto-rejected'
                                     : 'Forum post HARD denied',
                    description: `**${thread.name}** - **\`${thread.id}\`**\n${rejection
                        ? 'Rejected'
                        : 'Has been denied'} by:\n${deletedBy}`,
                    fields,
                    thumbnail:   thread.guild.iconURL({
                        dynamic: true,
                        size:    4096
                    })
                }), auditUser);
            }

            return client.pushModlog(thread.guild.id, 'threadDelete', new client.class.modlog({
                color:       'bad',
                event:       rejection
                                 ? 'Forum post auto-rejected'
                                 : 'Thread deleted',
                thumbnail:   auditUser?.displayAvatarURL({
                    dynamic: true,
                    size:    4096
                }) ?? thread.guild.iconURL({
                    dynamic: true,
                    size:    4096
                }),
                description: `Channel: **${thread.name}** - **\`${thread.id}\`**\nDeleted by:\n${deletedBy}`,
                fields
            }), auditUser);
        }
    }
};
