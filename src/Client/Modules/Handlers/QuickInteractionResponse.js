'use strict';

import Discord from 'discord.js';
import Relaxy from '../../Relaxy.js';
import { isGone } from '../../../Core/DataTable.js';

const stillValid = (e) => e?.message?.toLowerCase?.()?.includes('nonce');

export default class QuickResponseBuilder {
    constructor(client) {
        this.client = client;
    }

    async handle(message, destination, options) {
        const channelPermissions =
            typeof destination?.channel?.permissionsFor === 'function'
                ? destination.channel.permissionsFor(destination?.guild?.members?.me)
                : null;

        const linkPermissionPresent =
            channelPermissions?.serialize()?.['EmbedLinks'] ||
            destination?.guild?.members?.me?.permissions?.has(Discord.PermissionFlagsBits.EmbedLinks);

        let embed = {};
        const basicMessage = typeof message === 'string';

        if (basicMessage) {
            const noBold = message?.startsWith('_ ');
            const noFormatting = message?.includes('*') || message?.includes('[') || message?.includes('(');

            embed.color = options?.good ? 65280 : options?.bad ? 16711680 : this.client.data.embedColor;
            embed.description = `${noFormatting || noBold ? '' : '**'}${noBold ? message.replace('_ ', '') : message}${
                noFormatting || noBold ? '' : '**'
            }`;
        }

        if (options?.embed) {
            embed = options.embed;
        } else {
            if (options?.color) {
                embed.color = options.color;
            }
            if (options?.title) {
                embed.title = options.title;
            }
            if (options?.image) {
                embed.image = options.image;
            }
            if (options?.author) {
                embed.author = options.author;
            }
            if (options?.description) {
                embed.description = options.description;
            }
            if (options?.thumbnail) {
                embed.thumbnail = { url: options.thumbnail };
            }
            if (options?.fields) {
                embed.fields = options.fields.filter((f) => f !== null);
            }
        }

        let response = basicMessage
            ? {
                  embeds: [embed],
                  flags: options?.hidden ? Discord.MessageFlags.Ephemeral : null
              }
            : (() => {
                  const { nonce, ...rest } = message;

                  return options?.interactionSpecial
                      ? {
                            ...rest,
                            flags: options.hidden ? Discord.MessageFlags.Ephemeral : null
                        }
                      : rest;
              })();

        if (options?.raw) {
            return embed;
        }
        if (options?.rawResponse) {
            return response;
        }

        if (destination instanceof Discord.TextChannel || destination instanceof Discord.VoiceChannel) {
            return this.client.send(
                destination,
                linkPermissionPresent ? null : message,
                linkPermissionPresent ? [embed] : []
            );
        }

        if (destination instanceof Discord.Message) {
            return this.client.send(
                destination.channel,
                linkPermissionPresent ? null : message,
                linkPermissionPresent ? [embed] : []
            );
        }

        if (destination instanceof Discord.BaseInteraction) {
            if (!linkPermissionPresent) {
                const flattened = this.client.flattenToText(response);

                response = {
                    ...response,
                    content: flattened ?? response.content ?? null,
                    embeds: []
                };

                if (!response.content && !response.files?.length && !response.components?.length) {
                    response.content =
                        'Relaxy is missing the `Embed Links` permission in this channel, so it cannot show that here.';
                }
            }

            if (options?.channel) {
                return this.client.send(
                    destination.channel,
                    linkPermissionPresent ? null : message,
                    linkPermissionPresent ? [embed] : []
                );
            }

            if (destination.isAnySelectMenu()) {
                return null;
            }

            const deliver = async () => {
                if (destination.deferred) {
                    return options?.followUp ? destination.followUp(response) : destination.editReply(response);
                }

                if (destination.replied || options?.edit) {
                    return destination.editReply(response);
                }

                if (options?.followUp) {
                    return destination.followUp(response);
                }

                return destination.reply(response);
            };

            try {
                return await deliver();
            } catch (error) {
                if (!isGone(error) && !stillValid(error)) {
                    throw error;
                }

                this.client.log(
                    'DEBUG',
                    `[Interaction] The reply to "${destination.commandName ?? destination.customId ?? 'interaction'}" no longer exists (${error?.code}) - most likely cleared by this channel's automatic clearing. Falling back to the channel.`
                );

                if (options?.hidden || !destination.channel) {
                    return null;
                }

                const embeds = response.embeds ?? [embed];

                return this.client.send(destination.channel, response.content ?? null, embeds).catch(() => null);
            }
        }

        this.client.log('ERROR', message, destination);
        throw new Error(
            `Invalid destination type, expected Discord.Message or Discord.BaseInteraction, got ${typeof destination}!`
        );
    }
}
