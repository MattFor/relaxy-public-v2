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
        if (!channel || !channel.guild || channel.type === client.imports.discord.ChannelType.DM)
        {
            return;
        }

        const guild = await client.module.database.Guild(channel.guild.id);

        if (guild.d.mut.id !== '')
        {
            const muteRole = await channel.guild.roles.fetch(guild.d.mut.id);

            await channel.permissionOverwrites.create(muteRole, {
                'SendMessages':          false,
                'AddReactions':          false,
                'CreatePublicThreads':   false,
                'CreatePrivateThreads':  false,
                'SendMessagesInThreads': false,
                'CreateInstantInvite':   false,
                'SendTTSMessages':       false,
                'SendVoiceMessages':     false,
                'UseSoundboard':         false,
                'Speak':                 false,
                'Connect':               false,
                'Stream':                false
            }).catch(client.swallow('channelCreate: operation'));
        }

        if (guild.ml.ev?.channelCreate?.on)
        {
            if (!client.channels.cache.get(guild.ml.ev.channelCreate.channel))
            {
                return client.save(guild.id, {
                    alter: 'ml.ev.channelCreate.on',
                    value: false
                });
            }

            const auditUser = await client.utils.auditLog(channel.guild, 'ChannelCreate', {
                rawAuthor: true,
                target:    channel
            }).catch(() => null);

            return client.pushModlog(channel.guild.id, 'channelCreate', new client.class.modlog({
                color:     'good',
                event:     'Channel created',
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
                        value: `${channel.parent ?? 'None'}`
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
                            value: `\`${channel.permissionOverwrites.cache.size}\` overwrite(s) set.`
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
                            name:  'Created by:',
                            value: `${auditUser} - ${auditUser.username} - **\`${auditUser.id}\`**`
                        }
                        : null
                ]
            }), auditUser);
        }
    }
};
