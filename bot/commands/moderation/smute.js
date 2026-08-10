'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

import mute from './mute.js';

export default {
    name:        'smute',
    aliases:     [
        'mutesync',
        'syncmute'
    ],
    usage:       '=smute <user> [time|heat death] [reason]',
    description: 'Mute someone in **this server and every server it is linked to** (`=syncservers`), each with its own case and modlog entry.\n\nExactly the same as `=mute … sync`, so everything `=mute` accepts works here too - the time keywords, **heat death** for a permanent mute, and `muterole`. The duration is the same everywhere; each server records its own case and saves its own list of stripped roles.\n\nOnly servers that have run **`=syncservers moderation on`** are reached: linking servers is one decision, and each of them decides separately whether that also means your moderators may act there. The reply names every server it reached and every one it did not, with the reason.\n\n`=sunmute` lifts it everywhere again.',

    args: true,

    permissionsUser: mute.permissionsUser,
    permissionsBot:  mute.permissionsBot,

    async run(client, message, args, guild, interaction)
    {

        return mute.run(client, message, [
            ...args,
            'sync'
        ], guild, interaction);
    }
};
