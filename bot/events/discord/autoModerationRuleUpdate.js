'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const actionTypeNames = {
    [Discord.AutoModerationActionType.BlockMessage]:            'Block message',
    [Discord.AutoModerationActionType.SendAlertMessage]:        'Send alert message',
    [Discord.AutoModerationActionType.Timeout]:                 'Timeout member',
    [Discord.AutoModerationActionType.BlockMemberInteractions]: 'Block member interactions'
};

export default {
    async run(client, oldRule, newRule)
    {
        const guild = await client.module.database.Guild(newRule.guild.id);

        if (!guild.ml.ev?.autoModerationRuleUpdate?.on)
        {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.autoModerationRuleUpdate.channel))
        {
            return client.save(guild.id, {
                alter: 'ml.ev.autoModerationRuleUpdate.on',
                value: false
            });
        }

        const oldActions = oldRule.actions.map(a => actionTypeNames[a.type] ?? `Type ${a.type}`).join(', ') || 'None';
        const newActions = newRule.actions.map(a => actionTypeNames[a.type] ?? `Type ${a.type}`).join(', ') || 'None';

        const oldExemptRoles = oldRule.exemptRoles?.map(r => r.id).sort().join(',') ?? '';
        const newExemptRoles = newRule.exemptRoles?.map(r => r.id).sort().join(',') ?? '';
        const oldExemptChannels = oldRule.exemptChannels?.map(c => c.id).sort().join(',') ?? '';
        const newExemptChannels = newRule.exemptChannels?.map(c => c.id).sort().join(',') ?? '';

        const fields = [
            oldRule.name !== newRule.name
                ? {
                    name:  'Name changed:',
                    value: `\`${oldRule.name}\` → \`${newRule.name}\``
                }
                : null,
            oldRule.enabled !== newRule.enabled
                ? {
                    name:  'Enabled status changed:',
                    value: newRule.enabled
                               ? 'Rule **enabled**.'
                               : 'Rule **disabled**.'
                }
                : null,
            oldActions !== newActions
                ? {
                    name:  'Actions changed:',
                    value: `Old: \`${oldActions}\`\nNew: \`${newActions}\``
                }
                : null,
            oldExemptRoles !== newExemptRoles
                ? {
                    name:  'Exempt roles changed:',
                    value: `Old: ${oldRule.exemptRoles?.size > 0
                        ? oldRule.exemptRoles.map(r => `<@&${r.id}>`).join(' ')
                        : 'None'}\nNew: ${newRule.exemptRoles?.size > 0
                        ? newRule.exemptRoles.map(r => `<@&${r.id}>`).join(' ')
                        : 'None'}`.slice(0, 1024)
                }
                : null,
            oldExemptChannels !== newExemptChannels
                ? {
                    name:  'Exempt channels changed:',
                    value: `Old: ${oldRule.exemptChannels?.size > 0
                        ? oldRule.exemptChannels.map(c => `${c}`).join(' ')
                        : 'None'}\nNew: ${newRule.exemptChannels?.size > 0
                        ? newRule.exemptChannels.map(c => `${c}`).join(' ')
                        : 'None'}`.slice(0, 1024)
                }
                : null
        ].filter(f => f !== null);

        if (fields.length === 0)
        {
            return;
        }

        return client.pushModlog(newRule.guild.id, 'autoModerationRuleUpdate', new client.class.modlog({
            event:       'AutoMod rule updated',
            thumbnail:   newRule.guild.iconURL({
                dynamic: true,
                size:    4096
            }),
            fields,
            description: `Rule: **${newRule.name}** \`${newRule.id}\``
        }), null);
    }
};
