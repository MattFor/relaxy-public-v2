'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../../Relaxy.js';
import { emojiCollections } from '../../../../../Core/DataTable.js';

export default class Poll {
    constructor(client, message) {
        this.client = client;
        this.message = message;
        this.creationTime = Date.now();

        this.data = {
            time: 30 * 60 * 1000,
            title: 'Do You like pancakes?',
            channel: message.channel,
            options: ['Yes', 'No'],
            forceEmoji: '\ud83d\uded1',
            emojis: emojiCollections.numbers.slice(0, 2)
        };

        this.ended = false;
        this.changed = false;
        this.timeModified = false;
        this.titleModified = false;
        this.emojisModified = false;
        this.channelModified = false;
        this.optionsModified = false;

        this.voterInfo = new Discord.Collection();

        this.panel = null;
        this.pollMessage = null;

        this.ready = !(
            this.data.emojis.length !== this.data.options.length &&
            this.data.title.length === 0 &&
            this.data.channel === null &&
            this.data.options.length === 0
        );
    }

    set title(title) {
        this.changed = true;
        this.data.title = title;
        this.titleModified = true;
    }

    set options(options) {
        this.changed = true;
        this.data.options = options;
        this.optionsModified = true;
    }

    set emojis(emojis) {
        this.changed = true;
        this.data.emojis = emojis;
        this.emojisModified = true;
    }

    set time(time) {
        this.changed = true;
        this.data.time = time;
        this.timeModified = true;
    }

    set channel(channel) {
        this.changed = true;
        this.data.channel = channel;
        this.channelModified = true;
    }

    generateButtonPanel(done) {
        const pollTitle = new Discord.ButtonBuilder()
            .setCustomId('poll_title')
            .setLabel('Set Title')
            .setStyle(!this.titleModified ? Discord.ButtonStyle.Primary : Discord.ButtonStyle.Success);

        const pollOptions = new Discord.ButtonBuilder()
            .setCustomId('poll_options')
            .setLabel('Set Options')
            .setStyle(!this.optionsModified ? Discord.ButtonStyle.Primary : Discord.ButtonStyle.Success);

        const pollTime = new Discord.ButtonBuilder()
            .setCustomId('poll_time')
            .setLabel('Set time')
            .setStyle(!this.timeModified ? Discord.ButtonStyle.Primary : Discord.ButtonStyle.Success);

        const pollReactions = new Discord.ButtonBuilder()
            .setCustomId('poll_reactions')
            .setLabel('Set Custom Reactions')
            .setStyle(
                this.data.emojis.length !== this.data.options.length
                    ? Discord.ButtonStyle.Danger
                    : !this.emojisModified
                      ? Discord.ButtonStyle.Primary
                      : Discord.ButtonStyle.Success
            );

        const pollChannel = new Discord.ButtonBuilder()
            .setCustomId('poll_channel')
            .setLabel('Set Channel')
            .setStyle(!this.channelModified ? Discord.ButtonStyle.Secondary : Discord.ButtonStyle.Success);

        const pollComplete = new Discord.ButtonBuilder()
            .setCustomId('poll_complete')
            .setLabel('Post Poll')
            .setStyle(!this.ready ? Discord.ButtonStyle.Danger : Discord.ButtonStyle.Success);

        const takedownPoll = new Discord.ButtonBuilder()
            .setCustomId('poll_end')
            .setLabel('End Poll')
            .setStyle(Discord.ButtonStyle.Danger);

        return (this.buttonPanel = done
            ? [new Discord.ActionRowBuilder().addComponents(takedownPoll)]
            : [
                  new Discord.ActionRowBuilder().addComponents(
                      pollTitle,
                      pollOptions,
                      pollChannel,
                      pollTime,
                      pollReactions
                  ),
                  new Discord.ActionRowBuilder().addComponents(pollComplete)
              ]);
    }

    generateEmbed() {
        return (this.embed = [
            {
                color: this.client.data.embedColor,
                title: this.titleModified ? this.data.title : null,

                thumbnail: {
                    url: `https://www.youtube.com/results?search_query=${this.message.author.id}`
                },

                fields: [
                    {
                        name: this.titleModified ? 'Title [CUSTOM]' : 'Title [NOT SET]',
                        value: this.titleModified
                            ? `**${this.data.title}**`
                            : "Default: 'Do you like pancakes?'\nTitle of the poll."
                    },
                    {
                        name: this.optionsModified ? 'Options [CUSTOM]' : 'Options [NOT SET]',
                        value: this.optionsModified
                            ? this.data.options
                                  .map((o) => {
                                      return o;
                                  })
                                  .join('\n')
                            : "Default: 'Yes, No'\nOptions for the poll."
                    },
                    {
                        name: this.channelModified ? 'Channel [CUSTOM]' : 'Channel [NOT SET]',
                        value: this.channelModified
                            ? `${this.data.channel}`
                            : `Default: ${this.data.channel}\nChannel in which the poll will be set to.`
                    },
                    {
                        name: this.timeModified ? 'Time [CUSTOM]' : 'Time [NOT SET]',
                        value: this.timeModified
                            ? `\`${this.client.imports.time(this.data.time)}\``
                            : 'Default: **\`30 minutes\`**'
                    },
                    {
                        name: this.emojisModified ? 'Emojis [CUSTOM]' : 'Emojis [NOT SET]',
                        value: this.emojisModified ? this.data.emojis.join(' ') : 'Default: 1️⃣ 2️⃣.'
                    }
                ]
            }
        ]);
    }

    createReactionCollector() {
        this.reactionCollector = this.pollMessage.createReactionCollector({
            filter: async (reaction, user) => this.data.emojis.includes(reaction.emoji.name) && !user.bot,
            time: this.data.time,
            dispose: true
        });

        this.reactionCollector.on('end', (c, r) => this.end(r));
        this.reactionCollector.on('remove', (reaction, user) => this.onRemove(reaction, user));
        this.reactionCollector.on('collect', (reaction, user) => this.onCollect(reaction, user));
    }

    onCollect(reaction, user) {
        if (this.data.emojis.includes(reaction.emoji.name)) {
            if (
                !this.client.utils
                    .flattenArray(
                        Array.from(this.voterInfo.entries())
                            .map((e) => {
                                if (e[0] !== reaction.emoji.name) {
                                    return e[1];
                                }
                            })
                            .filter((i) => i !== undefined)
                    )
                    .includes(user.id)
            ) {
                this.voterInfo.set(reaction.emoji.name, this.voterInfo.get(reaction.emoji.name).concat([user.id]));
            } else {
                reaction.message.reactions.cache
                    .get(reaction.emoji.name)
                    .users.remove(user.id)
                    .catch(this.client.swallow('Poll: remove'));
            }
        }
    }

    onRemove(reaction, user) {
        if (this.data.emojis.includes(reaction.emoji.name)) {
            const voters = this.voterInfo.get(reaction.emoji.name) ?? [];
            const index = voters.indexOf(user.id);

            if (index !== -1) {
                voters.splice(index, 1);
            }

            this.voterInfo.set(reaction.emoji.name, voters);
        }
    }

    async construct() {
        this.pollEmbed = [
            {
                color: this.client.data.embedColor,
                description: this.data.options
                    .map((o, i) => {
                        return `**${this.data.emojis[i]} ${o}**`;
                    })
                    .join('\n')
            }
        ];

        this.pollMessage = await this.client.send(
            this.data.channel,
            `**📊 ${this.data.title} \`(${this.client.imports.time(this.data.time)})\`**`,
            this.pollEmbed
        );

        for (const emoji of this.data.emojis) {
            this.voterInfo.set(emoji, []);
        }

        await this.client.react(this.pollMessage, Array.from(this.data.emojis));

        await this.client.edit(
            this.panel,
            null,
            [
                {
                    color: this.client.data.embedColor,
                    title: 'Click the button to end the poll.'
                }
            ],
            null,
            this.generateButtonPanel(true)
        );

        this.createReactionCollector();

        this.ready = true;
    }

    async end(member) {
        if (this.ended) {
            return;
        }

        this.client.collections.polls.delete(this.panel.id);

        this.ended = true;
        this.ready = false;

        this.client.delete(this.panel);

        await this.client.send(
            this.pollMessage.channel,
            `**📊 ${this.data.title}** \`(Lasted: ${this.client.imports.time(Date.now() - this.creationTime)})\` ${
                member
                    ? typeof member === 'string'
                        ? ' [Closed by poll message deletion]'
                        : ` [Closed by: ${member}]`
                    : ''
            }`,
            [
                {
                    color: this.client.data.embedColor,
                    title: 'Here are the results!',
                    description: Array.from(this.voterInfo.entries())
                        .sort((a, b) => {
                            return b[1].length - a[1].length;
                        })
                        .map((e) => {
                            const optionIndex = this.data.emojis.indexOf(e[0]);
                            return `**${this.data.options[optionIndex]} - \`${e[1].length}\`**`;
                        })
                        .join('\n')
                }
            ]
        );

        this.reactionCollector.stop();
        this.client.delete(this.pollMessage);
    }
}
