'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const triggerTypeNames = {
    [Discord.AutoModerationRuleTriggerType.Keyword]:       'Keyword',
    [Discord.AutoModerationRuleTriggerType.Spam]:          'Spam',
    [Discord.AutoModerationRuleTriggerType.KeywordPreset]: 'Keyword Preset',
    [Discord.AutoModerationRuleTriggerType.MentionSpam]:   'Mention Spam',
    [Discord.AutoModerationRuleTriggerType.MemberProfile]: 'Member Profile'
};

const actionTypeNames = {
    [Discord.AutoModerationActionType.BlockMessage]:            'Block message',
    [Discord.AutoModerationActionType.SendAlertMessage]:        'Send alert message',
    [Discord.AutoModerationActionType.Timeout]:                 'Timeout member',
    [Discord.AutoModerationActionType.BlockMemberInteractions]: 'Block member interactions'
};

export default {
    async run(client, rule)
    {
        const guild = await client.module.database.Guild(rule.guild.id);

        if (!guild.ml.ev?.autoModerationRuleDelete?.on)
        {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.autoModerationRuleDelete.channel))
        {
            return client.save(guild.id, {
                alter: 'ml.ev.autoModerationRuleDelete.on',
                value: false
            });
        }

        const actions = rule.actions.map(a => actionTypeNames[a.type] ?? `Type ${a.type}`).join(', ') || 'None';

        return client.pushModlog(rule.guild.id, 'autoModerationRuleDelete', new client.class.modlog({
            color:     'bad',
            event:     'AutoMod rule deleted',
            thumbnail: rule.guild.iconURL({
                dynamic: true,
                size:    4096
            }),
            fields:    [
                {
                    name:   'Rule name:',
                    value:  `**${rule.name}**`,
                    inline: true
                },
                {
                    name:   'Rule ID:',
                    value:  `\`${rule.id}\``,
                    inline: true
                },
                {
                    name:   'Was enabled:',
                    value:  rule.enabled
                                ? 'Yes.'
                                : 'No.',
                    inline: true
                },
                {
                    name:   'Trigger type:',
                    value:  triggerTypeNames[rule.triggerType] ?? `${rule.triggerType}`,
                    inline: true
                },
                {
                    name:   'Actions:',
                    value:  actions,
                    inline: true
                }
            ]
        }), null);
    }
};
