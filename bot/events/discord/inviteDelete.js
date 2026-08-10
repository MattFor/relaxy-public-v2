'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    async run(client, invite)
    {
        if (!invite.guild || invite.inviter?.id === client.user.id)
        {
            return;
        }

        const guild = await client.module.database.Guild(invite.guild.id);

        if (!guild.ml.ev?.inviteDelete?.on)
        {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.inviteDelete.channel))
        {
            return client.save(guild.id, {
                alter: 'ml.ev.inviteDelete.on',
                value: false
            });
        }

        let expiresAt = null;

        try
        {
            expiresAt = client.imports.time(invite.expiresAt);
        }
        catch
        {
        }

        client.pushModlog(invite.guild.id, 'inviteDelete', new client.class.modlog({
            color:       'bad',
            event:       'Invite deleted',
            thumbnail:   invite.inviter
                             ? invite.inviter.displayAvatarURL({
                    dynamic: true,
                    size:    4096
                })
                             : invite.guild.iconURL({
                    dynamic: true,
                    size:    4096
                }),
            description: `User who created the invite:\n${invite.inviter
                ? `**${invite.inviter} - ${client.utils.tag(invite.inviter)} - \`${invite.inviter.id}\`**`
                : '**`Unavailable`**'}\nExpiration date: ${expiresAt
                ? `**\`${expiresAt}\`**`
                : '**Doesn\'t expire.**'}\nMaximum uses: ${invite.maxUses
                ? `\`${invite.maxUses}\``
                : '**`Infinite`**'}\nTemporary: ${invite.temporary
                ? '**Yes.**'
                : '**No.**'}\nInvite channel: ${invite.channel
                ? `${invite.channel}`
                : '**`Unavailable`**'}`
        }), null);
    }
};
