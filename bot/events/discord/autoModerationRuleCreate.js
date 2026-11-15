'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const triggerTypeNames = {
    [Discord.AutoModerationRuleTriggerType.Keyword]: 'Keyword',
    [Discord.AutoModerationRuleTriggerType.Spam]: 'Spam',
    [Discord.AutoModerationRuleTriggerType.KeywordPreset]: 'Keyword Preset',
    [Discord.AutoModerationRuleTriggerType.MentionSpam]: 'Mention Spam',
    [Discord.AutoModerationRuleTriggerType.MemberProfile]: 'Member Profile'
};

const actionTypeNames = {
    [Discord.AutoModerationActionType.BlockMessage]: 'Block message',
    [Discord.AutoModerationActionType.SendAlertMessage]: 'Send alert message',
    [Discord.AutoModerationActionType.Timeout]: 'Timeout member',
    [Discord.AutoModerationActionType.BlockMemberInteractions]: 'Block member interactions'
};

export default {
    async run(client, rule) {
        const guild = await client.module.database.Guild(rule.guild.id);

        if (!guild.ml.ev?.autoModerationRuleCreate?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.autoModerationRuleCreate.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.autoModerationRuleCreate.on',
                value: false
            });
        }

        const creator = rule.creatorId ? await client.users.fetch(rule.creatorId).catch(() => null) : null;
        const actions = rule.actions.map((a) => actionTypeNames[a.type] ?? `Type ${a.type}`).join(', ') || 'None';

        const exemptRoles = rule.exemptRoles?.size > 0 ? rule.exemptRoles.map((r) => `<@&${r.id}>`).join(' ') : 'None';
        const exemptChannels =
            rule.exemptChannels?.size > 0 ? rule.exemptChannels.map((c) => `${c}`).join(' ') : 'None';

        const keywordFilter = rule.triggerMetadata?.keywordFilter?.slice(0, 10).join(', ') || null;

        return client.pushModlog(
            rule.guild.id,
            'autoModerationRuleCreate',
            new client.class.modlog({
                color: 'good',
                event: 'AutoMod rule created',
                thumbnail: rule.guild.iconURL({
                    dynamic: true,
                    size: 4096
                }),
                fields: [
                    {
                        name: 'Rule name:',
                        value: `**${rule.name}**`,
                        inline: true
                    },
                    {
                        name: 'Rule ID:',
                        value: `\`${rule.id}\``,
                        inline: true
                    },
                    {
                        name: 'Enabled:',
                        value: rule.enabled ? 'Yes.' : 'No.',
                        inline: true
                    },
                    {
                        name: 'Trigger type:',
                        value: triggerTypeNames[rule.triggerType] ?? `${rule.triggerType}`,
                        inline: true
                    },
                    {
                        name: 'Actions:',
                        value: actions,
                        inline: true
                    },
                    keywordFilter
                        ? {
                              name: `Keywords (first ${Math.min(10, rule.triggerMetadata.keywordFilter.length)}):`,
                              value: `\`${keywordFilter}\``
                          }
                        : null,
                    exemptRoles !== 'None'
                        ? {
                              name: 'Exempt roles:',
                              value: exemptRoles.slice(0, 1024)
                          }
                        : null,
                    exemptChannels !== 'None'
                        ? {
                              name: 'Exempt channels:',
                              value: exemptChannels.slice(0, 1024)
                          }
                        : null,
                    creator
                        ? {
                              name: 'Created by:',
                              value: `${creator} - ${creator.username} - **\`${creator.id}\`**`
                          }
                        : null
                ]
            }),
            null
        );
    }
};
