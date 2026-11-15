'use strict';
import Discord from 'discord.js';

export const REQUIRED_PREFIX = 'req';

export const MAX_FORM_KEY_LENGTH = 10;

export const normalizeFormKey = (raw) => {
    const key = String(raw ?? '').replace(/[_\-\s]+/g, '');
    const required = key.startsWith(REQUIRED_PREFIX);
    const name = required ? key.slice(REQUIRED_PREFIX.length) : key;

    if (!name) {
        return {
            key,
            required,
            name,
            error: required
                ? `"${REQUIRED_PREFIX}" on its own is the required marker, not a name - give the question a name after it.`
                : 'A form needs a key.'
        };
    }

    if (name.length >= MAX_FORM_KEY_LENGTH) {
        return {
            key,
            required,
            name,
            error: `Form keys must be under ${MAX_FORM_KEY_LENGTH} characters${
                required ? ` (not counting "${REQUIRED_PREFIX}")` : ''
            } - "${name}" is ${name.length}.`
        };
    }

    return {
        key,
        required,
        name,
        error: null
    };
};

export default class Tickets {
    constructor(client) {
        this.client = client;
    }

    async createTicketSystem({ guild, guildDoc, channel = null, reason = 'Ticket system' }) {
        const client = this.client;

        if (!guild?.id || guildDoc?.id !== guild.id) {
            throw new Error('createTicketSystem: guildDoc does not belong to the given guild');
        }

        const channels = guildDoc.tk.sy;

        let createdChannel = false;
        let target = channel;

        if (!target) {
            target = await guild.channels.create({
                name: `ticket-system-${Object.keys(channels).length + 1}`,
                type: Discord.ChannelType.GuildText,
                topic: 'Press the button on a message to send a ticket to the moderation team.',
                reason
            });

            createdChannel = true;

            channels[target.id] = [];
        }

        const hadEntry = !createdChannel && Object.prototype.hasOwnProperty.call(channels, target.id);
        const priorEntry = hadEntry ? [...channels[target.id]] : null;

        const restoreConfig = () => {
            if (priorEntry === null) {
                delete channels[target.id];

                return;
            }

            channels[target.id] = priorEntry;
        };

        const title = `Ticket System #${Object.keys(channels).length}`;

        let message = null;

        try {
            message = await client.send(
                target,
                null,
                [
                    {
                        color: client.data.embedColor,
                        title,
                        footer: client.data.footer
                    }
                ],
                null,
                null,
                [
                    new Discord.ActionRowBuilder().addComponents(
                        new Discord.ButtonBuilder()
                            .setCustomId('ticketsystem_real_placeholder')
                            .setLabel('Create Ticket')
                            .setStyle(Discord.ButtonStyle.Primary)
                            .setEmoji('📥')
                    )
                ]
            );
        } catch (error) {
            restoreConfig();

            await this._compensate({
                createdChannel,
                channel: target,
                message: null,
                error
            });

            throw error;
        }

        channels[target.id] = channels[target.id] ?? [];
        channels[target.id].push(message.id);

        let doc;

        try {
            doc = await client.module.database.TicketingSystem(guild.id, target.id, message.id, title);
        } catch (error) {
            restoreConfig();

            await this._compensate({
                createdChannel,
                channel: target,
                message,
                error
            });

            throw error;
        }

        await client.save(guild.id, {
            alter: 'tk',
            value: {
                on: true,
                sy: channels
            }
        });

        return {
            channel: target,
            message,
            doc,
            createdChannel
        };
    }

    async _compensate({ createdChannel, channel, message, error }) {
        try {
            if (message) {
                await message.delete().catch(() => null);
            }

            if (createdChannel && channel) {
                await channel.delete('Ticket system creation failed - removing the channel it created').catch(() => {
                    this.client.log(
                        'ERROR',
                        `Tickets: could not remove orphaned channel [${channel.id}] in [${channel.guild?.id}] after: ${error?.message ?? error}`
                    );
                });
            }
        } catch (cleanupError) {
            this.client.log(
                'ERROR',
                `Tickets: compensation failed after "${error?.message ?? error}": ${cleanupError?.message ?? cleanupError}`
            );
        }
    }
}
