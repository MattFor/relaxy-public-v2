'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../../Relaxy.js';

export default class Picker {
    constructor(client) {
        this.client = client;
    }

    async run({ message, interaction, id, placeholder, choices, render, empty = null, idle = 2 * 60 * 1000 }) {
        const client = this.client;

        if (!choices?.length) {
            return client.send(interaction ? 1 : message.channel, null, empty ? [empty] : null);
        }

        const single = choices.length === 1;

        const shown = choices.slice(0, 25);

        const menu = () =>
            new Discord.StringSelectMenuBuilder()
                .setCustomId(`${id}_pick`)
                .setPlaceholder(placeholder)
                .addOptions(
                    shown.map((choice) => ({
                        label: String(choice.label).slice(0, 100),
                        description: choice.description ? String(choice.description).slice(0, 100) : undefined,
                        emoji: choice.emoji ?? undefined,
                        value: String(choice.value)
                    }))
                );

        const view = async (value) => {
            const rendered = await render(value);

            return {
                content: rendered.content ?? null,
                embeds: rendered.embeds ?? [],

                components: [
                    ...(rendered.components ?? []),
                    ...(single ? [] : [new Discord.ActionRowBuilder().addComponents(menu())])
                ]
            };
        };

        const initial = single
            ? await view(shown[0].value)
            : {
                  content: null,
                  embeds: empty ? [empty] : [],
                  components: [new Discord.ActionRowBuilder().addComponents(menu())]
              };

        let uiMessage;

        if (interaction) {
            uiMessage =
                interaction.deferred || interaction.replied
                    ? await interaction.editReply(initial).catch(client.swallow('Picker: editReply'))
                    : await interaction
                          .reply({
                              ...initial,
                              withResponse: true
                          })
                          .then(() => interaction.fetchReply())
                          .catch(client.swallow('Picker: reply'));
        } else {
            uiMessage = await message.channel.send(initial).catch(client.swallow('Picker: send'));
        }

        if (!uiMessage || single) {
            return uiMessage ?? null;
        }

        const collector = uiMessage.createMessageComponentCollector({
            componentType: Discord.ComponentType.StringSelect,

            filter: (pressed) => pressed.user.id === message.author.id && pressed.customId === `${id}_pick`,
            idle
        });

        collector.on('collect', async (pressed) => {
            try {
                await pressed.update(await view(pressed.values[0]));
            } catch (error) {
                client.data.errors++;
                client.log('ERROR', `Picker "${id}" failed to render:`, error);

                await pressed
                    .reply({
                        content: 'Could not show that one.',
                        flags: Discord.MessageFlags.Ephemeral
                    })
                    .catch(client.swallow('Picker: render failure'));
            }
        });

        collector.on('end', () => {
            const expired = new Discord.ActionRowBuilder().addComponents(
                menu().setDisabled(true).setPlaceholder('Selection expired - run the command again')
            );

            uiMessage.edit({ components: [expired] }).catch(client.swallow('Picker: expire'));
        });

        return uiMessage;
    }
}
