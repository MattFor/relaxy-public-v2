'use strict';

import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    async run(client, packet)
    {
        client.module?.stats?.count('gateway.packet');

        if (packet.t === 'VOICE_CHANNEL_STATUS_UPDATE')
        {
            return client.core?.CensorVoiceStatus?.(packet.d);
        }

        if (![
            'MESSAGE_REACTION_ADD',
            'MESSAGE_REACTION_REMOVE'
        ].includes(packet.t))
        {
            return;
        }

        if (client.flags.logs.raw_events)
        {
            client.log('DATA', packet);
        }

        const channel = client.channels.cache.get(packet.d.channel_id);

        if (!channel || channel.messages.cache.has(packet.d.message_id))
        {
            return;
        }

        const emoji = packet.d.emoji.id
            ? `${packet.d.emoji.name}:${packet.d.emoji.id}`
            : packet.d.emoji.name;

        const User = await client.getUser(packet.d.user_id);
        const message = await channel.messages.fetch(packet.d.message_id);
        const reaction = message.reactions.cache.get(emoji);

        if (!reaction)
        {
            return;
        }

        reaction.users.cache.set(packet.d.user_id, User);

        switch (packet.t)
        {
            case 'MESSAGE_REACTION_ADD':
                return client.emit('messageReactionAdd', reaction, User);
            case 'MESSAGE_REACTION_REMOVE':
                return client.emit('messageReactionRemove', reaction, User);
            case 'MESSAGE_DELETE':
                return client.emit('messageDelete', message);
        }
    }
};
