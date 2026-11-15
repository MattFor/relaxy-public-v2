'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const verificationLevels = [
    'None',
    'Low (verified email)',
    'Medium (registered 5+ min)',
    'High (member 10+ min)',
    'Very High (verified phone)'
];

const explicitContentFilters = ['Disabled', 'Members without roles', 'All members'];

const mfaLevels = ['None', 'Elevated (2FA required for mods)'];

const nsfwLevels = ['Default', 'Explicit', 'Safe', 'Age Restricted'];

const defaultMessageNotifications = ['All messages', 'Only @mentions'];

export default {
    async run(client, oldGuild, newGuild) {
        const guild = await client.module.database.Guild(newGuild.id);

        if (!guild.ml.ev?.guildUpdate?.on) {
            return;
        }

        if (!client.channels.cache.get(guild.ml.ev.guildUpdate.channel)) {
            return client.save(guild.id, {
                alter: 'ml.ev.guildUpdate.on',
                value: false
            });
        }

        const fields = [
            oldGuild.name !== newGuild.name
                ? {
                      name: 'Name changed:',
                      value: `\`${oldGuild.name}\` → \`${newGuild.name}\``
                  }
                : null,
            oldGuild.description !== newGuild.description
                ? {
                      name: 'Description changed:',
                      value: `Old: ${oldGuild.description || 'None'}\nNew: ${newGuild.description || 'None'}`
                  }
                : null,
            oldGuild.icon !== newGuild.icon
                ? {
                      name: 'Icon changed:',
                      value: newGuild.icon
                          ? `[New icon](${newGuild.iconURL({
                                dynamic: true,
                                size: 4096
                            })})`
                          : 'Icon removed.'
                  }
                : null,
            oldGuild.banner !== newGuild.banner
                ? {
                      name: 'Banner changed:',
                      value: newGuild.banner ? `[New banner](${newGuild.bannerURL({ size: 4096 })})` : 'Banner removed.'
                  }
                : null,
            oldGuild.splash !== newGuild.splash
                ? {
                      name: 'Invite splash changed:',
                      value: newGuild.splash ? `[New splash](${newGuild.splashURL({ size: 4096 })})` : 'Splash removed.'
                  }
                : null,
            oldGuild.vanityURLCode !== newGuild.vanityURLCode
                ? {
                      name: 'Vanity URL changed:',
                      value: `\`${oldGuild.vanityURLCode || 'None'}\` → \`${newGuild.vanityURLCode || 'None'}\``
                  }
                : null,
            oldGuild.verificationLevel !== newGuild.verificationLevel
                ? {
                      name: 'Verification level changed:',
                      value: `\`${verificationLevels[oldGuild.verificationLevel] ?? oldGuild.verificationLevel}\` → \`${verificationLevels[newGuild.verificationLevel] ?? newGuild.verificationLevel}\``
                  }
                : null,
            oldGuild.explicitContentFilter !== newGuild.explicitContentFilter
                ? {
                      name: 'Explicit content filter changed:',
                      value: `\`${explicitContentFilters[oldGuild.explicitContentFilter] ?? oldGuild.explicitContentFilter}\` → \`${explicitContentFilters[newGuild.explicitContentFilter] ?? newGuild.explicitContentFilter}\``
                  }
                : null,
            oldGuild.mfaLevel !== newGuild.mfaLevel
                ? {
                      name: 'MFA level changed:',
                      value: `\`${mfaLevels[oldGuild.mfaLevel] ?? oldGuild.mfaLevel}\` → \`${mfaLevels[newGuild.mfaLevel] ?? newGuild.mfaLevel}\``
                  }
                : null,
            oldGuild.nsfwLevel !== newGuild.nsfwLevel
                ? {
                      name: 'NSFW level changed:',
                      value: `\`${nsfwLevels[oldGuild.nsfwLevel] ?? oldGuild.nsfwLevel}\` → \`${nsfwLevels[newGuild.nsfwLevel] ?? newGuild.nsfwLevel}\``
                  }
                : null,
            oldGuild.defaultMessageNotifications !== newGuild.defaultMessageNotifications
                ? {
                      name: 'Default notifications changed:',
                      value: `\`${defaultMessageNotifications[oldGuild.defaultMessageNotifications] ?? oldGuild.defaultMessageNotifications}\` → \`${defaultMessageNotifications[newGuild.defaultMessageNotifications] ?? newGuild.defaultMessageNotifications}\``
                  }
                : null,
            oldGuild.afkChannelId !== newGuild.afkChannelId
                ? {
                      name: 'AFK channel changed:',
                      value: `${oldGuild.afkChannel ?? 'None'} → ${newGuild.afkChannel ?? 'None'}`
                  }
                : null,
            oldGuild.afkTimeout !== newGuild.afkTimeout
                ? {
                      name: 'AFK timeout changed:',
                      value: `\`${oldGuild.afkTimeout}s\` → \`${newGuild.afkTimeout}s\``
                  }
                : null,
            oldGuild.systemChannelId !== newGuild.systemChannelId
                ? {
                      name: 'System channel changed:',
                      value: `${oldGuild.systemChannel ?? 'None'} → ${newGuild.systemChannel ?? 'None'}`
                  }
                : null,
            oldGuild.rulesChannelId !== newGuild.rulesChannelId
                ? {
                      name: 'Rules channel changed:',
                      value: `${oldGuild.rulesChannel ?? 'None'} → ${newGuild.rulesChannel ?? 'None'}`
                  }
                : null,
            oldGuild.publicUpdatesChannelId !== newGuild.publicUpdatesChannelId
                ? {
                      name: 'Community updates channel changed:',
                      value: `${oldGuild.publicUpdatesChannel ?? 'None'} → ${newGuild.publicUpdatesChannel ?? 'None'}`
                  }
                : null,
            oldGuild.premiumProgressBarEnabled !== newGuild.premiumProgressBarEnabled
                ? {
                      name: 'Boost progress bar:',
                      value: newGuild.premiumProgressBarEnabled ? 'Enabled.' : 'Disabled.'
                  }
                : null,
            oldGuild.preferredLocale !== newGuild.preferredLocale
                ? {
                      name: 'Locale changed:',
                      value: `\`${oldGuild.preferredLocale}\` → \`${newGuild.preferredLocale}\``
                  }
                : null
        ].filter((f) => f !== null);

        if (fields.length === 0) {
            return;
        }

        return client.pushModlog(
            newGuild.id,
            'guildUpdate',
            new client.class.modlog({
                event: 'Server updated',
                thumbnail: newGuild.iconURL({
                    dynamic: true,
                    size: 4096
                }),
                fields,
                description: `**${newGuild.name}** \`${newGuild.id}\``
            }),
            null
        );
    }
};
