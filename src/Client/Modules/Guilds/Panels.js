'use strict';
import Discord from 'discord.js';

const BUTTON_STYLES = {
    red:   Discord.ButtonStyle.Danger,
    blue:  Discord.ButtonStyle.Primary,
    green: Discord.ButtonStyle.Success
};

const NAME_MODES = [
    'usernames',
    'display names',
    'nicknames'
];

export default class Panels
{
    constructor(client)
    {
        this.client = client;
    }

    generateCustomButtonPanel(ticketSys)
    {
        const rows = {};
        const sortedButtons = Object.entries(ticketSys.bt ?? {})
                                    .map(([key, value]) => ({
                                        key, ...value
                                    }))
                                    .sort((a, b) => a.y - b.y || a.x - b.x);

        for (const databaseButton of sortedButtons)
        {
            if (!rows[databaseButton.y])
            {
                rows[databaseButton.y] = new Discord.ActionRowBuilder();
            }

            const button = new Discord.ButtonBuilder();

            button.setStyle(BUTTON_STYLES[databaseButton.color] ?? Discord.ButtonStyle.Secondary);
            button.setLabel(databaseButton.title);
            button.setCustomId(`ticketsystem_real_${databaseButton.key}`);

            if (databaseButton.emoji)
            {
                button.setEmoji(databaseButton.emoji);
            }

            rows[databaseButton.y].addComponents(button);
        }

        const final = [];

        for (const key of Object.keys(rows))
        {
            final.push(rows[key]);
        }

        return final;
    }

    async repaintTicketPanel(ticketSys)
    {
        try
        {
            const channel = await this.client.channels.fetch(ticketSys.c).catch(() => null);

            if (!channel)
            {
                return 'the panel channel no longer exists or is not visible';
            }

            const message = await channel.messages.fetch(ticketSys.mid).catch(() => null);

            if (!message)
            {
                return 'the panel message no longer exists';
            }

            await this.client.edit(message,
                message.content,
                message.embeds[0]
                    ? [message.embeds[0].data]
                    : null,
                message.attachments,
                this.generateCustomButtonPanel(ticketSys));

            return 'ok';
        }
        catch (error)
        {
            this.client.log('ERROR', '[Panels] Failed to repaint ticket panel:', error);

            return `could not repaint the panel: ${String(error?.message ?? error)}`;
        }
    }

    generateHeartBoardPanel()
    {
        const button = (id, label, style) => new Discord.ButtonBuilder()
            .setCustomId(`heartboard_${id}`)
            .setLabel(label)
            .setStyle(style);

        return [
            new Discord.ActionRowBuilder().addComponents(button('colour', 'Set Colour', Discord.ButtonStyle.Primary), button('emojis', 'Set Emojis', Discord.ButtonStyle.Primary), button('name', 'Set Name Display Mode', Discord.ButtonStyle.Primary), button('requirement', 'Set Heartboard Requirement', Discord.ButtonStyle.Secondary)),
            new Discord.ActionRowBuilder().addComponents(button('delete', 'Delete Heartboard Functionality', Discord.ButtonStyle.Danger))
        ];
    }

    heartBoardPanelEmbed(board, channel, enabled)
    {

        const tiers = [
            board.rq,
            board.rq * 2,
            board.rq * 3,
            Math.ceil(board.rq * 5.7),
            board.rq * 10
        ];

        return {
            color:       board.co,
            description: `## ${channel ?? 'Unavailable'} - ${channel?.name ?? 'Unavailable'} - \`${channel?.id ?? 'Unavailable'}\`\n\n` + `Functionality toggled: ${enabled
                ? '**`ON`**'
                : '**`OFF`**'}\n` + `Reaction requirement: \`${board.rq}\`\n` + `Embed colour: ${'#' + board.co.toString(16).padStart(6, '0')}\n` + `Name display mode: \`${NAME_MODES[board.nm]}\`\n` + `## Emojis\n${(board.em ?? []).map((emoji, i) => `**${i + 1}.** ${emoji} - \`${tiers[i]}\` reactions required.`).join('\n')}`
        };
    }

    async repaintHeartBoardPanel(board)
    {
        try
        {
            if (!board?.pm || !board?.pc)
            {
                return 'ok';
            }

            const panelChannel = await this.client.channels.fetch(board.pc).catch(() => null);

            if (!panelChannel)
            {
                return 'the settings panel channel no longer exists or is not visible';
            }

            const message = await panelChannel.messages.fetch(board.pm).catch(() => null);

            if (!message)
            {
                return 'the settings panel message no longer exists';
            }

            const boardChannel = await this.client.channels.fetch(board.id).catch(() => null);
            const guild = await this.client.module.database.getGuild(board.g);
            const embed = this.heartBoardPanelEmbed(board, boardChannel, Boolean(guild?.hb?.on));

            const thumbnail = message.embeds[0]?.data?.thumbnail;

            await this.client.edit(message, null, [
                thumbnail
                    ? {
                        ...embed,
                        thumbnail
                    }
                    : embed
            ], null, this.generateHeartBoardPanel(), { override: true });

            return 'ok';
        }
        catch (error)
        {
            this.client.log('ERROR', '[Panels] Failed to repaint heartboard panel:', error);

            return `could not repaint the settings panel: ${String(error?.message ?? error)}`;
        }
    }
}
