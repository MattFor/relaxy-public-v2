'use strict';

import fs      from 'fs-extra';
import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'files',
    usage:       '=files [server] [delete <index|a - b> | rename <index> <newName>]',
    description: 'List and manage the files you saved with `=save`.\n\n**List** - `=files` shows your files, their sizes and how much of your quota is used.\n**Delete** - `=files delete <index>` (or a range like `=files delete 2 - 5`) removes files.\n**Rename** - `=files rename <index> <newName>` renames a file (the extension is kept).\n\nAdd `server` as the first word (e.g. `=files server`, `=files server delete 1`) to manage the **server\'s** shared files - this needs the `ManageGuild` permission.\n\nStorage limits: **20 MB per user**, **50 MB per server**.',

    permissionsUser:          ['SEND_MESSAGES'],
    permissionsBot:           [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],
    suggestedPermissionsUser: ['MANAGE_GUILD'],

    async run(client, message, args, guild, interaction)
    {
        const fallBackGuild = !message.member.permissions.has(Discord.PermissionFlagsBits.ManageGuild);

        let isServer = false;

        if ((args[0] ?? '').toLowerCase() === 'server')
        {
            isServer = true;
            args = args.slice(1);
        }

        if (isServer && fallBackGuild)
        {
            return client.qEmbed('You are missing the `ManageGuild` permission to manage the server\'s files!', interaction ?? message);
        }

        const filePath = isServer
            ? `./storage/guilds/${message.guild.id}`
            : `./storage/users/${message.author.id}`;
        const limitBytes = isServer
            ? 50 * 1024 * 1024
            : 20 * 1024 * 1024;
        const owner = isServer
            ? 'The server'
            : 'You';
        const noneMsg = `${isServer
            ? 'The server doesn\'t have'
            : 'You don\'t have'} any files saved!`;

        const names = (await client.pathExists(filePath))
            ? await client.readDir(filePath)
            : [];
        const action = (args[0] ?? '').toLowerCase();
        if (action === 'delete' || action === 'remove')
        {
            if (names.length === 0)
            {
                return client.qEmbed(noneMsg, interaction ?? message);
            }

            const spec = args.slice(1).join(' ').replace(/\s+/g, '');

            if (!spec)
            {
                return client.qEmbed(`Provide an index (or a range) to delete, e.g. \`=files ${isServer
                    ? 'server '
                    : ''}delete 2\` or \`delete 2-5\`.`, interaction ?? message);
            }

            let start;
            let end;

            if (spec.includes('-'))
            {
                [
                    start,
                    end
                ] = spec.split('-').map(n => Number(n));
            }
            else
            {
                start = end = Number(spec);
            }

            if (!Number.isInteger(start) || !Number.isInteger(end) || start < 1 || end > names.length || start > end)
            {
                return client.qEmbed(`Invalid index/range! Pick between \`1\` and \`${names.length}\`.`, interaction ?? message);
            }

            const removed = names.slice(start - 1, end);

            for (const file of removed)
            {
                try
                {
                    await fs.remove(`${filePath}/${file}`);
                }
                catch
                {
                }
            }

            return client.qEmbed(`Deleted \`${removed.length}\` file${removed.length > 1
                ? 's'
                : ''}: ${removed.map(f => `**${f}**`).join(', ')}.`, interaction ?? message);
        }
        if (action === 'rename')
        {
            if (names.length === 0)
            {
                return client.qEmbed(noneMsg, interaction ?? message);
            }

            const index = Number(client.utils.nums(args[1]));

            if (!Number.isInteger(index) || index < 1 || index > names.length)
            {
                return client.qEmbed(`Invalid index! Pick between \`1\` and \`${names.length}\`.`, interaction ?? message);
            }

            const base = (args.slice(2).join(' ') || '')
                .replace(/[\\/:*?"<>|]/g, '')
                .replace(/^server-/, '')
                .slice(0, 40);

            if (!base)
            {
                return client.qEmbed('Provide a new name, e.g. `=files rename 1 newname`.', interaction ?? message);
            }

            const oldName = names[index - 1];
            const ext = oldName.includes('.')
                ? oldName.slice(oldName.lastIndexOf('.'))
                : '';
            const newName = base.includes('.')
                ? base
                : `${base}${ext}`;

            if (newName === oldName)
            {
                return client.qEmbed('That is already the file\'s name.', interaction ?? message);
            }

            if (names.includes(newName))
            {
                return client.qEmbed(`A file named **${newName}** already exists.`, interaction ?? message);
            }

            try
            {
                await fs.move(`${filePath}/${oldName}`, `${filePath}/${newName}`);
            }
            catch
            {
                return client.qEmbed('Rename failed.', interaction ?? message);
            }

            return client.qEmbed(`Renamed **${oldName}** → **${newName}**.`, interaction ?? message);
        }
        if (names.length === 0)
        {
            return client.qEmbed(noneMsg, interaction ?? message);
        }

        let used = 0;
        const lines = [];
        let count = 0;

        for (const file of names)
        {
            let size = 0;

            try
            {
                size = (await fs.stat(`${filePath}/${file}`)).size;
            }
            catch
            {
            }

            used += size;
            lines.push(`\`${++count}.\` **${file}** - ${(size / 1024).toFixed(1)} KB`);
        }

        return client.send(message.channel, null, [
            {
                color:       client.data.embedColor,
                title:       `${owner} ${isServer
                    ? 'has'
                    : 'have'} \`${count}\` file${count > 1
                    ? 's'
                    : ''}!`,
                description: lines.join('\n'),
                thumbnail:   {
                    url: isServer
                             ? client.utils.guildIcon(message.guild)
                             : message.author.displayAvatarURL({
                            dynamic: true,
                            size:    4096
                        })
                },
                fields:      [
                                 {
                                     name:  'Storage used',
                                     value: `**${(used / 1048576).toFixed(2)} / ${(limitBytes / 1048576).toFixed(0)} MB**`
                                 },
                                 {
                                     name:  'Manage',
                                     value: `\`=files ${isServer
                                         ? 'server '
                                         : ''}delete <index>\` · \`=files ${isServer
                                         ? 'server '
                                         : ''}rename <index> <newName>\``
                                 },
                                 isServer
                                     ? {
                                         name:  'Use in an embed',
                                         value: `Reference a server image by filename, e.g. with ${guild.px[0]}embed:\n\`\`\`json\nthumbnail: { url: "FILENAME_HERE" }\n\`\`\`\n(works for a **thumbnail** / **image**, not an author/footer icon).`
                                     }
                                     : null
                             ].filter(Boolean),
                footer:      client.data.footer
            }
        ]);
    }
};
