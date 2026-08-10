'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'jointocreate',
    usage:       '=jointocreate [#channel] [grant-manage]',
    description: 'Creates a channel, which when joined will spawn a Relaxy! Private Channel which each member of can control according to his needs. To delete a Relaxy! Join to Create channel, just do =jointocreate channel.\nIf you want users to automatically get ManageChannel permissions, type anything after the command.',

    leaveout: true,

    permissionsUser: ['SEND_MESSAGES'],

    permissionsBot:          [
        'SEND_MESSAGES',
        'MANAGE_CHANNELS',
        'MOVE_MEMBERS',
        'MANAGE_ROLES'
    ],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction)
    {
        let error = false;

        const target = interaction
            ? interaction.options?.getChannel?.('channel') ?? null
            : await client.utils.channel(message, args, 0);

        const grantManage = interaction
            ? interaction.options?.getBoolean?.('grant-manage') === true
            : !!args[0];

        const channel = target;

        if (!channel)
        {

            let createdChannel;

            try
            {
                ({ channel: createdChannel } = await client.module.creators.createJoinToCreate({
                    guild:    message.guild,
                    guildDoc: guild,
                    upwr:     grantManage,
                    reason:   `=jointocreate by ${client.utils.tag(message.author)}`
                }));
            }
            catch
            {
                return client.qEmbed('Error creating the join to create voice channel!', interaction ?? message);
            }

            return client.qEmbed(`Successfully created ${createdChannel}!`, interaction ?? message);
        }

        try
        {
            let found = false;

            for (let i = 0; i < guild.ch.v.pv.length; i++)
            {
                if (guild.ch.v.pv[i].id === channel.id && guild.ch.v.pv[i].creator)
                {
                    found = true;

                    guild.ch.v.pv.splice(i, 1);
                    client.save(guild.id, {
                        alter: 'ch.v.pv',
                        value: guild.ch.v.pv
                    });
                }
            }

            if (!found)
            {
                return client.qEmbed('This channel is not a Relaxy! Join to Create channel!', interaction ?? message);
            }

            await channel.delete();
        }
        catch
        {
            error = true;
        }

        if (error)
        {
            return client.qEmbed('Error deleting channel!', interaction ?? message);
        }

        return client.qEmbed('The channel has been deleted successfully!', interaction ?? message);
    }
};