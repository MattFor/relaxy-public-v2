'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

const CENSOR_EXEMPT = [
    'censor',
    'censortest',
    'ban',
    'tempban',
    'kick',
    'mute',
    'warning',
    'warnings',
    'toolkit'
];

const failSafe = async (client, interaction, content) =>
{
    if (!interaction || typeof interaction.isRepliable !== 'function' || !interaction.isRepliable())
    {
        return;
    }

    const payload = {
        content,
        flags: Discord.MessageFlags.Ephemeral
    };

    try
    {
        if (interaction.deferred && !interaction.replied)
        {
            return await interaction.editReply({ content });
        }

        if (interaction.replied)
        {
            return await interaction.followUp(payload);
        }

        return await interaction.reply(payload);
    }
    catch (error)
    {
        client.log('DEBUG', `[interaction] could not deliver the fallback reply for "${interaction.commandName ?? interaction.customId}": ${error?.code ?? '?'} ${error?.message ?? error}`);
    }
};

const handle = async (client, interaction) =>
{
    const exception = interaction?.customId?.includes('ticketsystem');

    if (!interaction?.guild?.id && !exception)
    {
        return;
    }

    if (client.utils.blacklisted(interaction.user?.id) > 0 || client.utils.blacklisted(interaction.guildId) > 1)
    {
        return;
    }

    const Guild = await client.module.database.Guild(interaction.guildId);

    if (interaction.isMessageComponent() || interaction.isModalSubmit() || interaction.isAnySelectMenu())
    {
        const name = interaction.customId.split('_')[0];
        const cmd = client.collections.commands.get(name);

        if (!cmd)
        {
            return;
        }

        const message = Object.assign({
            deletable:   true,
            attachments: new client.imports.discord.Collection(),
            member:      interaction.member,
            id:          interaction.id,
            guild:       exception
                             ? null
                             : await client.guilds.fetch(interaction.guild.id),
            channel:     exception
                             ? null
                             : await client.channels.fetch(interaction.channelId),
            author:      interaction.user,
            interaction: interaction
        }, interaction.message);

        const execStart = Date.now();

        const kind = interaction.isModalSubmit()
            ? 'modal'
            : interaction.isAnySelectMenu()
                ? 'select'
                : 'button';

        const trace = `[${kind}] ${interaction.customId} | ${interaction.user.id} -> ${interaction.guildId
            ? `${client.utils.shortGuildName(interaction.guild?.name)} ${interaction.guildId}/${interaction.channelId}`
            : `DM ${interaction.channelId}`}`;

        client.log('DATA', trace);
        client.module?.stats?.count('command.component');

        let command = null;

        try
        {
            command = await cmd.run(client, message, [], Guild, interaction);
        }
        catch (e)
        {

            client.data.errors++;
            client.module?.stats?.count('command.component.error');
            client.log('ERROR', `Component "${interaction.customId}" (${name}) threw:`, e);
            client.log('DATA', `${trace} ${client.imports.time(Date.now() - execStart)} - threw`);

            client.collections.modalInteractionData.delete(interaction.user.id);

            return failSafe(client, interaction, 'That did not work. This has been logged.');
        }

        client.collections.modalInteractionData.delete(interaction.user.id);

        client.log('DATA', `${trace} ${client.imports.time(Date.now() - execStart)}`);

        if (command === 0b01100101_01110010_01110010_01101111_01110010)
        {
            return interaction?.reply({
                embeds: [
                    {
                        color: 16711680,
                        title: 'You cannot interact with this command.'
                    }
                ],
                flags:  Discord.MessageFlags.Ephemeral
            }).then(m => setTimeout(async () =>
            {
                await client.delete(m);
            }, 10 * 1000));
        }

        if (command === undefined)
        {
            return;
        }
        else if (command)
        {
            return await client.respond(command, interaction).catch(error =>
            {
                client.data.errors++;
                client.module?.stats?.count('command.component.error');
                client.log('ERROR', `Replying to component "${interaction.customId}" (${name}) failed:`, error);

                return failSafe(client, interaction, 'That did not work. This has been logged.');
            });
        }
        else
        {
            client.data.errors++;
            client.log('ERROR', `Component "${interaction.customId}" (${name}) returned ${command} without replying.`);

            return failSafe(client, interaction, 'That did not work. This has been logged.');
        }
    }

    const fallBack = !(interaction.guild.members.me.permissions.has(Discord.PermissionFlagsBits.EmbedLinks) || interaction.channel.permissionsFor(interaction.guild.members.me).serialize()['EmbedLinks']);

    if (fallBack)
    {
        return interaction.reply({
            content: 'Cannot initiate / commands without the `embedLinks` permission!',
            flags:   Discord.MessageFlags.Ephemeral
        });
    }

    if (interaction.isCommand())
    {
        const execStart = Date.now();

        if (Guild.cmd.dis.includes(interaction.commandName.toLowerCase()))
        {
            return interaction?.reply({
                embeds: [client.qEmbed(`${interaction.commandName} has been disabled on this server!`, 1)],
                flags:  Discord.MessageFlags.Ephemeral
            });
        }

        const cmd = client.collections.interactionCommands.get(interaction.commandName);

        if (!cmd)
        {
            client.data.errors++;
            client.log('ERROR', `Slash command "${interaction.commandName}" is registered with Discord but not loaded on this cluster - reload it, or re-register the slash commands.`);

            return failSafe(client, interaction, 'That command is not available right now. Please try again in a moment.');
        }

        const args = interaction.options.data.map(obj =>
        {
            return obj.value;
        });
        const message = {
            deletable:   true,
            attachments: new client.imports.discord.Collection(),
            member:      interaction.member,
            id:          interaction.id,
            guild:       interaction.guild,
            channel:     interaction.channel,
            author:      interaction.member.user,
            interaction: interaction,

            content: args.filter(value => typeof value === 'string').join(' ')
        };

        const trace = `/${cmd.name} | ${message.author.id} -> ${client.utils.shortGuildName(interaction.guild?.name)} ${interaction.guildId}/${interaction.channelId}`;

        client.log('DATA', trace);

        if (!message.guild.members.me)
        {
            await message.guild.members.fetchMe().catch(client.swallow('interactionCreate: fetchMe'));
        }

        const allowed = client.utils.isAllowedUser(Guild, message);
        if (allowed === 0 && allowed !== -1)
        {
            return client.respond('Cannot use Relaxy.', interaction, { hidden: true });
        }

        const exempt = client.utils.isExempt(Guild, message);
        const granted = client.utils.isGranted(Guild, message, cmd.name);
        if (client.utils.isRestricted(Guild, message.channel.id) && !exempt)
        {
            return client.respond('This channel is restricted.', interaction, { hidden: true });
        }

        if (!exempt && !CENSOR_EXEMPT.includes(cmd.name) && await client.censored(args, Guild, message))
        {
            return client.respond('That trips this server\'s censor.', interaction, { hidden: true });
        }

        if (!client.collections.cooldowns.has(cmd.name))
        {
            client.collections.cooldowns.set(cmd.name, new Discord.Collection());
        }

        const timestamps = client.collections.cooldowns.get(cmd.name);
        const cooldownAmount = (cmd.cooldown || 3) * 1000;
        if ((timestamps.has(message.author.id) && !exempt) && (Date.now() < timestamps.get(message.author.id) + cooldownAmount) && !client.isOwner(message.author.id))
        {
            return client.respond(`${message.member}, Please wait **${client.imports.time(client.collections.cooldowns.get(cmd.name).get(message.author.id)
                ? cooldownAmount - (new Date() - client.collections.cooldowns.get(cmd.name).get(message.author.id))
                : 0)}** before using \`${cmd.name}\` again!`, interaction, { hidden: true });
        }

        timestamps.set(message.author.id, Date.now());
        setTimeout(async () => timestamps.delete(message.author.id), cooldownAmount);

        const permissionsFlag = client.permissions(message, {
            permissionsUser:          Guild.cmd.cp?.[cmd.name]?.length > 0
                                          ? Guild.cmd.cp[cmd.name]
                                          : cmd.permissionsUser,
            suggestedPermissionsUser: cmd.suggestedPermissionsUser,
            permissionsBot:           cmd.permissionsBot,
            suggestedPermissionsBot:  cmd.suggestedPermissionsBot
        }, {
            textChannel:  message.channel,
            voiceChannel: message.member?.voice?.channel ?? null
        }, {
            userExempt: exempt || granted,
            interaction
        });

        if (Array.isArray(permissionsFlag) && (permissionsFlag[1]?.bot || (!exempt && !granted && permissionsFlag[1]?.user)))
        {
            const msg = await permissionsFlag[0];
            msg.content = null;
            return client.respond(msg, interaction, {
                hidden:             true,
                interactionSpecial: true
            });
        }

        if (cmd?.nsfw && !client.channels.cache.get(interaction.channelId)?.nsfw && !exempt)
        {
            return client.respond(`${message.member}, the **${interaction.commandName}** command can only be used in nsfw on channels!`, interaction, { hidden: true });
        }

        await client.countCommandUse(Guild, interaction.guildId, message.author.id, cmd.name, { countUser: true });

        if (cmd.dir === 'music' || cmd.defer)
        {
            await interaction.deferReply().catch(client.swallow('interactionCreate: deferReply'));
        }

        let command;

        client.module?.stats?.count('command.run');
        client.module?.stats?.count('command.slash');
        client.module?.stats?.count(`command.name.${cmd.name}`);

        try
        {
            command = await cmd.run(client, message, args, Guild, interaction);
        }
        catch (error)
        {
            client.module?.stats?.count('command.error');
            client.module?.stats?.count(`command.error.${cmd.name}`);

            client.data.errors++;
            client.log('ERROR', `Slash command "${interaction.commandName}" threw:`, error);
            client.log('DATA', `${trace} ${client.imports.time(Date.now() - execStart)} - threw`);

            return failSafe(client, interaction, 'Something went wrong running that command.');
        }

        client.log('DATA', `${trace} ${client.imports.time(Date.now() - execStart)}`);

        if (interaction.replied || command === Infinity)
        {
            return;
        }

        if (command)
        {
            await client.respond(command, interaction).catch(error =>
            {
                client.data.errors++;
                client.log('ERROR', `Replying to "${interaction.commandName}" failed:`, error);
            });
        }
        else
        {
            client.data.errors++;
            client.log('ERROR', `Slash command "${interaction.commandName}" returned ${command} without replying.`);

            return failSafe(client, interaction, 'That command did not return anything. This has been logged.');
        }
    }
};

export default {
    async run(client, interaction)
    {
        try
        {
            return await handle(client, interaction);
        }
        catch (error)
        {
            client.data.errors++;
            client.log('ERROR', `interactionCreate threw for "${interaction?.commandName ?? interaction?.customId ?? 'unknown'}":`, error);

            return failSafe(client, interaction, 'Something went wrong handling that. This has been logged.');
        }
    }
};
