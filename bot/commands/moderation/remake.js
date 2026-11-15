'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const UNSUPPORTED = {
    [Discord.ChannelType.GuildVoice]: 'a voice channel has no message history to clear',
    [Discord.ChannelType.GuildStageVoice]: 'a stage channel has no message history to clear',
    [Discord.ChannelType.GuildAnnouncement]:
        'an announcement channel carries follower subscriptions that a copy cannot inherit',
    [Discord.ChannelType.GuildDirectory]: 'a directory channel is managed by Discord',
    [Discord.ChannelType.GuildForum]: 'remaking a forum would delete every post in it - delete the threads instead',
    [Discord.ChannelType.GuildMedia]: 'remaking a media channel would delete every post in it',
    [Discord.ChannelType.PublicThread]: 'a thread cannot be copied - delete it and start a new one',
    [Discord.ChannelType.PrivateThread]: 'a thread cannot be copied - delete it and start a new one',
    [Discord.ChannelType.AnnouncementThread]: 'a thread cannot be copied - delete it and start a new one'
};
const CONFIRM_TTL = 30 * 1000;

export default {
    name: 'remake',
    aliases: ['nuke', 'clearchannel'],
    usage: '=remake [channel] [fresh] [yes]',
    description:
        "Replace a channel with a clean, empty copy of itself - same name, same permissions, same topic, same position, **no messages**.\n\nThis is irreversible: the messages are not archived anywhere, and Discord has no way to get them back. So it **asks first**, unless you add **yes**.\n\n**Relaxy's settings move with it.** A remade channel is a NEW channel with a new id, so everything pointing at the old one - the modlog it was, the heartboard, its clearing interval, the welcome channel - used to be quietly dropped the moment the original was deleted. They are now carried across, and the reply lists what moved. Add **fresh** if you want the opposite: a copy with none of Relaxy's configuration attached.\n\nRun with no channel to remake the one you are in.",
    slashDescription: 'Replace a channel with a clean, empty copy of itself.',

    slash: new Discord.SlashCommandBuilder()
        .addChannelOption((option) =>
            option.setName('channel').setDescription('Channel to remake. Defaults to this one.').setRequired(false)
        )
        .addBooleanOption((option) =>
            option
                .setName('fresh')
                .setDescription("Do NOT carry Relaxy's settings over to the new channel.")
                .setRequired(false)
        )
        .addBooleanOption((option) =>
            option.setName('yes').setDescription('Skip the confirmation. This cannot be undone.').setRequired(false)
        ),

    defer: true,
    cooldown: 20,

    permissionsUser: ['SEND_MESSAGES', 'MANAGE_CHANNELS'],
    permissionsBot: ['SEND_MESSAGES', 'MANAGE_CHANNELS'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const flag = (word, option) =>
            args.some((a) => new RegExp(`^-{0,2}${word}$`, 'i').test(String(a))) ||
            interaction?.options?.getBoolean?.(option) === true;

        const fresh = flag('fresh', 'fresh');
        const confirmed = flag('yes', 'yes') || flag('force', 'yes');

        const targetArgs = args.filter((a) => !/^-{0,2}(fresh|yes|force)$/i.test(String(a)));

        const channel =
            interaction?.options?.getChannel?.('channel') ??
            (await client.utils.channel(message, targetArgs, 0)) ??
            message.channel;

        if (!channel) {
            return client.qEmbed('I could not find that channel.', interaction ?? message);
        }

        if (UNSUPPORTED[channel.type]) {
            return client.qEmbed(
                `**${channel.name ?? 'That channel'}** cannot be remade - ${UNSUPPORTED[channel.type]}.`,
                interaction ?? message
            );
        }

        if (typeof channel.clone !== 'function') {
            return client.qEmbed('That kind of channel cannot be copied.', interaction ?? message);
        }

        if (
            client.utils.isRestricted(guild, channel.id) &&
            !message.member.permissions.has(Discord.PermissionFlagsBits.Administrator) &&
            !client.utils.isExempt(guild, message)
        ) {
            return client.qEmbed('You are not allowed to alter reactions within this channel!', interaction ?? message);
        }

        const mine = channel.permissionsFor(message.guild.members.me);

        if (!mine?.has(Discord.PermissionFlagsBits.ManageChannels)) {
            return client.qEmbed(
                `I cannot manage **${channel.name}** - its permissions deny me \`Manage Channels\`, whatever I have server-wide.`,
                interaction ?? message
            );
        }

        const references =
            client.garbageCollector?.collectChannelIds?.(guild)?.filter((entry) => entry.id === channel.id) ?? [];

        const keyed = [
            guild.fo?.cs?.includes(channel.id) ? 'its forum settings' : null,
            guild.hb?.cs?.includes(channel.id) ? 'its heartboard posts' : null,

            guild.tk?.sy?.[channel.id]?.length ? 'its ticket system' : null
        ].filter(Boolean);

        if (!confirmed) {
            const settled = await client.utils.confirm({
                client,
                message,
                interaction,
                title: `Remake #${channel.name}?`,
                body: [
                    `Every message in ${channel} is **deleted permanently**. Relaxy does not archive them and Discord cannot restore them.`,
                    '',
                    `The new channel keeps the name, topic, permissions, slowmode and position${
                        fresh
                            ? ''
                            : `, and Relaxy's settings move with it${
                                  references.length ? ` (**${references.length}** to move)` : ''
                              }`
                    }.`,
                    keyed.length ? `\n⚠️ **${keyed.join('** and **')}** cannot move and will be lost.` : ''
                ]
                    .filter((part) => part !== null)
                    .join('\n'),
                confirmLabel: 'Remake it',
                ttl: CONFIRM_TTL
            });

            if (!settled) {
                return client.qEmbed('Left alone.', interaction ?? message);
            }
        }

        const channelClone = await channel.clone().catch((error) => ({ error }));

        if (!channelClone || channelClone.error) {
            return client.qEmbed(
                `I could not copy **${channel.name}**: ${channelClone?.error?.message ?? 'Discord refused'}. Nothing was deleted.`,
                interaction ?? message
            );
        }

        if (typeof channelClone.setPosition === 'function') {
            await channelClone.setPosition(channel.position).catch(client.swallow('remake: position'));
        }

        let moved = [];

        if (!fresh && client.garbageCollector?.retargetChannel) {
            moved = await client.garbageCollector
                .retargetChannel(message.guild.id, guild, channel.id, channelClone.id)
                .catch((error) => {
                    client.log(
                        'WARN',
                        `[remake] Could not move ${channel.id}'s settings to ${channelClone.id}: ${error?.message ?? error}`
                    );

                    return [];
                });
        }

        const removed = await client
            .delete(channel)
            .then(() => true)
            .catch(() => false);

        const lines = [
            removed
                ? `Remade ${channelClone}.`
                : `Made ${channelClone}, but **could not delete the original** ${channel} - remove it by hand.`
        ];

        if (moved.length) {
            lines.push(`Moved **${moved.length}** of Relaxy's settings across: \`${moved.join('`, `')}\`.`);
        } else if (!fresh && references.length) {
            lines.push("None of Relaxy's settings needed moving.");
        }

        if (fresh && references.length) {
            lines.push(
                `Left **${references.length}** of Relaxy's settings behind, as asked - they pointed at the old channel and are now cleared.`
            );
        }

        if (keyed.length) {
            lines.push(`⚠️ **${keyed.join('** and **')}** belonged to the old channel and could not be carried over.`);
        }

        return client.send(interaction ? 1 : message.channel, null, [
            {
                color: client.data.embedColor,
                description: lines.join('\n'),
                footer: client.data.footer,
                timestamp: new Date()
            }
        ]);
    }
};
