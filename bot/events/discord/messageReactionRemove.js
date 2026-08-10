'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    async run(client, reaction, user)
    {
        if (reaction.message.channel.type === client.imports.discord.ChannelType.DM || reaction.message.channel.type === client.imports.discord.ChannelType.GroupDM)
        {
            return;
        }

        const guild = await client.module.database.Guild(reaction.message.guild.id);

        client.core.ReactionRemove(reaction, user, guild);
        client.core.HeartBoard(reaction, user, 'messageReactionRemove', guild);
    }
};