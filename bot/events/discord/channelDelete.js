'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const channelTypeNames = {
    [Discord.ChannelType.GuildText]:          'Text',
    [Discord.ChannelType.GuildVoice]:         'Voice',
    [Discord.ChannelType.GuildCategory]:      'Category',
    [Discord.ChannelType.GuildAnnouncement]:  'Announcement',
    [Discord.ChannelType.AnnouncementThread]: 'Announcement Thread',
    [Discord.ChannelType.PublicThread]:       'Public Thread',
    [Discord.ChannelType.PrivateThread]:      'Private Thread',
    [Discord.ChannelType.GuildStageVoice]:    'Stage Voice',
    [Discord.ChannelType.GuildForum]:         'Forum',
    [Discord.ChannelType.GuildMedia]:         'Media'
};

export default {
    async run(client, channel)
    {
        if (!channel)
        {
            return;
        }

        const guild = await client.module.database.Guild(channel.guild.id);

        for (let i = 0; i < guild.ch.v.pv.length; i++)
        {
            if (guild.ch.v.pv[i].id === channel.id)
            {
                guild.ch.v.pv = guild.ch.v.pv.filter(c => c.id !== channel.id);
                client.save(guild.id, {
                    alter: 'ch.v.pv',
                    value: guild.ch.v.pv
                });
                delete client.data.serverCache[guild.id][channel.id];
            }
        }

        if (channel.type === client.imports.discord.ChannelType.DM || channel.type === client.imports.discord.ChannelType.GroupDM)
        {
            return;
        }

        if (!guild.ml.ev?.channelDelete?.on)
        {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.channelDelete.channel))
        {
            return client.save(guild.id, {
                alter: 'ml.ev.channelDelete.on',
                value: false
            });
        }

        const auditUser = await client.utils.auditLog(channel.guild, 'ChannelDelete', {
            rawAuthor: true,
            target:    channel
        }).catch(() => null);

        return client.pushModlog(channel.guild.id, 'channelDelete', new client.class.modlog({
            color:     'bad',
            event:     'Channel deleted',
            thumbnail: channel.guild.iconURL({
                dynamic: true,
                size:    4096
            }),
            fields:    [
                {
                    name:  'Channel:',
                    value: `**${channel}** - **${channel.name}**`
                },
                {
                    name:  'ID:',
                    value: `**${channel.id}**`
                },
                {
                    name:  'Type:',
                    value: `**${channelTypeNames[channel.type] ?? channel.type}**`
                },
                {
                    name:  'Category:',
                    value: `${channel.parent
                        ? channel.parent
                        : 'None'}`
                },
                {
                    name:  'NSFW:',
                    value: `**${channel.nsfw
                        ? 'YES'
                        : 'NO'}**`
                },
                channel.topic
                    ? {
                        name:  'Description:',
                        value: channel.topic.slice(0, 1024)
                    }
                    : null,
                channel.permissionOverwrites?.cache?.size > 0
                    ? {
                        name:  'Permission overwrites:',
                        value: `\`${channel.permissionOverwrites.cache.size}\` overwrite(s) were set.`
                    }
                    : null,
                (channel.type === Discord.ChannelType.GuildVoice || channel.type === Discord.ChannelType.GuildStageVoice) && channel.userLimit
                    ? {
                        name:  'User limit:',
                        value: `\`${channel.userLimit}\``
                    }
                    : null,
                (channel.type === Discord.ChannelType.GuildVoice || channel.type === Discord.ChannelType.GuildStageVoice)
                    ? {
                        name:  'Bitrate:',
                        value: `\`${channel.bitrate / 1000}kbps\``
                    }
                    : null,
                auditUser
                    ? {
                        name:  'Deleted by:',
                        value: `${auditUser} - ${auditUser.username} - **\`${auditUser.id}\`**`
                    }
                    : null
            ]
        }), auditUser);
    }
};
