'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, invite) {
        if (!invite.guild || invite.inviter?.id === client.user.id) {
            return;
        }

        const guild = await client.module.database.Guild(invite.guild.id);

        if (guild.ml.ev?.inviteCreate?.on) {
            if (!client.channels.cache.get(guild.ml.ev.inviteCreate.channel)) {
                return client.save(guild.id, {
                    alter: 'ml.ev.inviteCreate.on',
                    value: false
                });
            }

            let expireTime = null;

            try {
                expireTime = client.imports.time(invite.expiresAt);
            } catch {}

            client.pushModlog(
                invite.guild.id,
                'inviteCreate',
                new client.class.modlog({
                    color: 'good',
                    event: 'Invite created',
                    thumbnail: invite.inviter
                        ? invite.inviter.displayAvatarURL({
                              dynamic: true,
                              size: 4096
                          })
                        : invite.guild.iconURL({
                              dynamic: true,
                              size: 4096
                          }),
                    description: `[Invite URL](${invite.url})\nUser who created the invite:\n${
                        invite.inviter
                            ? `**${invite.inviter} - ${client.utils.tag(invite.inviter)} - \`${invite.inviter.id}\`**`
                            : '**`Unavailable`**'
                    }\nExpiration date: ${
                        expireTime ? `**\`${expireTime}\`**` : "**Doesn't expire.**"
                    }\nMaximum uses: ${invite.maxUses ? `\`${invite.maxUses}\`` : '**`Infinite`**'}\nTemporary: ${
                        invite.temporary ? '**Yes.**' : '**No.**'
                    }\nInvite channel: ${invite.channel ? `${invite.channel}` : '**`Unavailable`**'}`
                }),
                invite.inviter ?? null
            );
        }
    }
};
