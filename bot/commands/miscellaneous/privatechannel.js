'use strict';

import Discord, { GuildPremiumTier } from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

const REGIONS = {
    Automatic: null,
    Brazil: 'brazil',
    'Hong Kong': 'hongkong',
    India: 'india',
    Japan: 'japan',
    Rotterdam: 'rotterdam',
    Russia: 'russia',
    Singapore: 'singapore',
    'South Africa': 'southafrica',
    Sydney: 'sydney',
    'US Central': 'us-central',
    'US East': 'us-east',
    'US South': 'us-south',
    'US West': 'us-west'
};

const resolveRegion = (input) => {
    if (!input) {
        return null;
    }

    const wanted = String(input)
        .trim()
        .toLowerCase()
        .replace(/[\s_]+/g, '-');

    for (const [label, id] of Object.entries(REGIONS)) {
        if (label.toLowerCase().replace(/\s+/g, '-') === wanted || (id && id === wanted)) {
            return {
                label,
                id
            };
        }
    }

    return null;
};

const tierToMax = {
    [GuildPremiumTier.None]: 96_000,
    [GuildPremiumTier.Tier1]: 128_000,
    [GuildPremiumTier.Tier2]: 256_000,
    [GuildPremiumTier.Tier3]: 384_000
};

const readOptions = async (client, message, args, interaction) => {
    if (interaction) {
        const options = interaction.options;
        const limit = options?.getInteger?.('limit');
        const kbps = options?.getInteger?.('kbps');
        const name = options?.getString?.('name') ?? null;

        return {
            channel: options?.getChannel?.('channel') ?? null,
            remove: options?.getBoolean?.('delete') === true,
            userLimit: Number.isInteger(limit) ? limit : null,
            kbps: Number.isInteger(kbps) ? kbps * 1000 : null,
            region: resolveRegion(options?.getString?.('region')),
            name,
            words: name ? name.split(/\s+/) : []
        };
    }

    let rest = args.join(' ');
    let name = null;

    const quoted = rest.match(/"([^"]*)"/);

    if (quoted) {
        name = quoted[1];
        rest = rest.replace(quoted[0], ' ');
    }

    let words = rest.split(/\s+/).filter(Boolean);
    const channel = await client.utils.channel(message, words, 0, { cut: true });

    let remove = false;

    if (words[0] && ['delete', 'remove'].includes(words[0].toLowerCase())) {
        remove = true;
        words.shift();
    }

    const limit = client.utils.nums(words[0]);

    if (limit !== null) {
        words.shift();
    }

    const bitrate = client.utils.nums(words[0]);

    if (bitrate !== null) {
        words.shift();
    }

    return {
        channel,
        remove,
        userLimit: limit === null ? null : Number(limit),
        kbps: bitrate === null ? null : Number(bitrate) * 1000,
        region: resolveRegion(words.join(' ')),
        name,
        words: name ? name.split(/\s+/) : []
    };
};

export default {
    name: 'privatechannel',
    aliases: ['privatevc'],
    usage: '=privatechannel [limit] [kbps] [region] ["new name"] [#channel]',
    description:
        'Create a voice channel with a (default 2) person limit, or edit one you are already sitting in.\n\n**`/privatechannel`** takes every setting as a named option - `limit`, `kbps`, `region`, `name`, `channel`, `delete` - in any order, and needs no quotes around a name.\n\nThe prefix form is positional: `=privatechannel <limit> <kbps> [region]`. Put a new name in "quotes" anywhere in it, and name a `#channel` to act on one you are not in.\nRelaxy autodetects the channel you are in and edits that if you name none. When everyone leaves it resets to the values you set.\n\n**To delete one:** delete it in Discord, or `=privatechannel #channel delete`. Without `delete` the channel is only removed from Relaxy\'s list and left in place.\n\nREQUIRED PERMISSION TO CREATE CHANNELS: `MANAGE_CHANNELS`',

    slashDescription: 'Create or edit a private voice channel - limit, bitrate, region and name.',
    slash: new Discord.SlashCommandBuilder()
        .addIntegerOption((option) =>
            option
                .setName('limit')
                .setDescription('How many people may join. 0 is unlimited.')
                .setMinValue(0)
                .setMaxValue(99)
                .setRequired(false)
        )
        .addIntegerOption((option) =>
            option
                .setName('kbps')
                .setDescription("Bitrate in kbps. The ceiling depends on the server's boost tier.")
                .setMinValue(1)
                .setMaxValue(384)
                .setRequired(false)
        )
        .addStringOption((option) =>
            option
                .setName('region')
                .setDescription('Voice region. Automatic lets Discord choose.')
                .setRequired(false)
                .addChoices(
                    ...Object.keys(REGIONS).map((label) => ({
                        name: label,
                        value: label
                    }))
                )
        )
        .addStringOption((option) =>
            option
                .setName('name')
                .setDescription('Rename the channel. No quotes needed here.')
                .setMaxLength(100)
                .setRequired(false)
        )
        .addChannelOption((option) =>
            option
                .setName('channel')
                .setDescription('The private channel to edit. Defaults to the one you are sitting in.')
                .addChannelTypes(Discord.ChannelType.GuildVoice)
                .setRequired(false)
        )
        .addBooleanOption((option) =>
            option.setName('delete').setDescription('Delete that channel instead of editing it.').setRequired(false)
        ),

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'MANAGE_CHANNELS'],
    suggestedPermissionsBot: ['EMBED_LINKS'],

    async run(client, message, args, guild, interaction) {
        const options = await readOptions(client, message, args, interaction);

        for (let i = 0; i < guild.ch.v.pv.length; i++) {
            if (
                !options.channel &&
                message.member.voice &&
                message.member.voice.channel &&
                guild.ch.v.pv[i].id === message.member.voice.channel.id
            ) {
                if (guild.ch.v.pv[i].creator) {
                    return client.qEmbed('Cannot edit a join to create channel! Dummy...', interaction ?? message);
                }

                let failure = false;

                const newName = options.name;

                if (newName && (await client.censored(options.words, guild, message))) {
                    return;
                }

                let userLimit = options.userLimit;
                let kbps = options.kbps ?? 0;

                if (userLimit !== null && (userLimit < 0 || userLimit > 99)) {
                    userLimit = 0;
                }

                const tier = message.guild.premiumTier ?? GuildPremiumTier.None;
                const maximumBitrate = tierToMax[tier] ?? 96_000;

                if (kbps !== 0 && (kbps < 1_000 || kbps > maximumBitrate)) {
                    const maxKb = Math.floor(maximumBitrate / 1_000);
                    return client.qEmbed(
                        `The bitrate should be between \`1\` and \`${maxKb}\` kbps (your server is boost Tier ${tier}).`,
                        interaction ?? message
                    );
                }

                const regionOverride = options.region;

                if (regionOverride) {
                    await message.member.voice.channel
                        .setRTCRegion(regionOverride.id)
                        .catch(client.swallow('privatechannel: setRTCRegion'));
                }

                const name = newName ?? message.member.voice.channel.name;
                const bitrate = kbps ? kbps : newName ? message.member.voice.channel.bitrate : guild.ch.v.pv[i].kbps;
                const limit = userLimit
                    ? userLimit
                    : newName
                      ? message.member.voice.channel.userLimit
                      : guild.ch.v.pv[i].userLimit;

                await message.member.voice.channel
                    .edit({
                        name: name,
                        bitrate: bitrate,
                        userLimit: limit
                    })
                    .catch(() => (failure = true))
                    .then(() => {
                        if (failure) {
                            return;
                        }

                        return client.qEmbed(
                            `**Options successfully edited for ${message.member?.voice?.channel ?? 'unavailable'}!**\nBitrate: \`${
                                bitrate > 384 ? bitrate / 1000 : bitrate
                            }\`\nUser limit: \`${
                                ![undefined, null].includes(limit)
                                    ? limit <= 0
                                        ? 'Unlimited'
                                        : limit
                                    : guild.ch.v.pv[i].userLimit
                            }\`\nRegion override: **${regionOverride?.label ?? 'Automatic'}**`,
                            interaction ?? message
                        );
                    });

                return failure ? client.qEmbed('Unable to edit permissions, error!', interaction ?? message) : null;
            }
        }

        if (!message.member.permissions.has(Discord.PermissionFlagsBits['ManageChannels'])) {
            return client.qEmbed('Missing permission to create private channel!', interaction ?? message);
        }

        const channel = options.channel;

        if (
            channel &&
            (options.remove ||
                (options.userLimit === null && options.kbps === null && !options.region && !options.name))
        ) {
            for (let i = 0; i < guild.ch.v.pv.length; i++) {
                if (guild.ch.v.pv[i].id === channel.id) {
                    if (guild.ch.v.pv[i].creator) {
                        return client.qEmbed(
                            `To delete a join to create channel, please use ${guild.px[0]}jointocreate (channel)`,
                            interaction ?? message
                        );
                    }

                    guild.ch.v.pv.splice(i, 1);
                    client.save(guild.id, {
                        alter: 'ch.v.pv',
                        value: guild.ch.v.pv
                    });

                    if (options.remove) {
                        await channel.delete().catch(client.swallow('privatechannel: delete'));
                    }

                    return client.qEmbed(
                        `**${channel} has been removed from Relaxy private channels!**`,
                        interaction ?? message
                    );
                }
            }

            return client.qEmbed(
                'No channel like that found in the Relaxy private channels database!',
                interaction ?? message
            );
        }

        let userLimit = options.userLimit ?? 2;
        let kbps = options.kbps ?? 64000;

        const regionOverride = options.region;

        if (userLimit < 0 || userLimit > 99) {
            userLimit = 0;
        }

        if (channel) {
            for (let i = 0; i < guild.ch.v.pv.length; i++) {
                if (guild.ch.v.pv[i].id === channel.id) {
                    if (guild.ch.v.pv[i].creator) {
                        return client.qEmbed('Cannot edit a join to create channel!', interaction ?? message);
                    }

                    let failure = false;
                    let resultFound = false;

                    guild.ch.v.pv[i] = {
                        id: channel.id,

                        userLimit,

                        kbps,

                        region: regionOverride?.id ?? null
                    };

                    if (regionOverride) {
                        await channel
                            .setRTCRegion(regionOverride.id)
                            .catch(client.swallow('privatechannel: setRTCRegion'));
                    }

                    client.channels.cache
                        .get(channel.id)
                        .edit({
                            userLimit: guild.ch.v.pv[i].userLimit,
                            bitrate: guild.ch.v.pv[i].kbps
                        })
                        .catch(() => {
                            failure = true;
                            return client.qEmbed('Error changing actual channel permissions!', interaction ?? message);
                        })
                        .then(() => {
                            if (failure) {
                                return client.qEmbed(
                                    'No channel like that found in the Relaxy private channels database!',
                                    interaction ?? message
                                );
                            }

                            resultFound = true;
                            client.save(guild.id, {
                                alter: 'ch.v.pv',
                                value: guild.ch.v.pv
                            });

                            return client.qEmbed(
                                `${channel} has successfully been updated!\nBitrate: \`${
                                    kbps ? kbps : guild.ch.v.pv[i].kbps
                                }\`\nUser limit: \`${
                                    userLimit ? (userLimit === 0 ? 'Unlimited' : userLimit) : guild.ch.v.pv[i].userLimit
                                }\`\nRegion override: **${regionOverride?.label ?? 'Automatic'}**`,
                                interaction ?? message
                            );
                        });

                    if (resultFound) {
                        return;
                    }
                }
            }

            return;
        }

        let createdChannel;

        try {
            ({ channel: createdChannel } = await client.module.creators.createPrivateChannel({
                guild: message.guild,
                guildDoc: guild,
                userLimit,
                bitrate: kbps,
                region: regionOverride?.id ?? null,
                reason: `=privatechannel by ${client.utils.tag(message.author)}`
            }));
        } catch (error) {
            return client.qEmbed(
                String(error?.message ?? '')
                    .toLowerCase()
                    .includes('missing')
                    ? 'Missing permissions!!! Error creating channel, aborting!'
                    : 'Error creating channel, aborting!',
                interaction ?? message
            );
        }

        if (regionOverride) {
            await createdChannel.setRTCRegion(regionOverride.id).catch(client.swallow('privatechannel: setRTCRegion'));
        }

        return client.qEmbed(
            `${createdChannel} has been added to Relaxy's private channel list!`,
            interaction ?? message
        );
    }
};
