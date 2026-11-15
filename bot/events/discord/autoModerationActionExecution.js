'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const actionTypeNames = {
    [Discord.AutoModerationActionType.BlockMessage]: 'Message blocked',
    [Discord.AutoModerationActionType.SendAlertMessage]: 'Alert message sent',
    [Discord.AutoModerationActionType.Timeout]: 'Member timed out',
    [Discord.AutoModerationActionType.BlockMemberInteractions]: 'Member interactions blocked'
};

const triggerTypeNames = {
    [Discord.AutoModerationRuleTriggerType.Keyword]: 'Keyword',
    [Discord.AutoModerationRuleTriggerType.Spam]: 'Spam',
    [Discord.AutoModerationRuleTriggerType.KeywordPreset]: 'Keyword Preset',
    [Discord.AutoModerationRuleTriggerType.MentionSpam]: 'Mention Spam',
    [Discord.AutoModerationRuleTriggerType.MemberProfile]: 'Member Profile'
};

export default {
    async run(client, execution) {
        if (!execution.guild) {
            return;
        }

        const guild = await client.module.database.Guild(execution.guild.id);

        if (!guild.ml.ev?.autoModerationActionExecution?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.autoModerationActionExecution.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.autoModerationActionExecution.on',
                value: false
            });
        }

        const member = execution.member ?? (await execution.guild.members.fetch(execution.userId).catch(() => null));
        const channel = execution.channelId ? client.channels.cache.get(execution.channelId) : null;

        return client.pushModlog(
            execution.guild.id,
            'autoModerationActionExecution',
            new client.class.modlog({
                color: 'bad',
                event: 'AutoMod action fired',
                thumbnail:
                    member?.displayAvatarURL({
                        dynamic: true,
                        size: 4096
                    }) ??
                    execution.guild.iconURL({
                        dynamic: true,
                        size: 4096
                    }),
                fields: [
                    {
                        name: 'Action:',
                        value: actionTypeNames[execution.action.type] ?? `Type ${execution.action.type}`,
                        inline: true
                    },
                    {
                        name: 'Trigger:',
                        value: triggerTypeNames[execution.ruleTriggerType] ?? `Type ${execution.ruleTriggerType}`,
                        inline: true
                    },
                    {
                        name: 'User:',
                        value: member
                            ? `${member} - ${member.user.username} - **\`${execution.userId}\`**`
                            : `**\`${execution.userId}\`**`,
                        inline: true
                    },
                    channel
                        ? {
                              name: 'Channel:',
                              value: `${channel} - \`${execution.channelId}\``,
                              inline: true
                          }
                        : null,
                    execution.matchedKeyword
                        ? {
                              name: 'Matched keyword:',
                              value: `\`${execution.matchedKeyword}\``,
                              inline: true
                          }
                        : null,
                    execution.content
                        ? {
                              name: 'Offending content:',
                              value: `\`\`\`\n${execution.content.slice(0, 1000)}\n\`\`\``
                          }
                        : null,
                    {
                        name: 'Rule ID:',
                        value: `\`${execution.ruleId}\``,
                        inline: true
                    }
                ]
            }),
            null
        );
    }
};
