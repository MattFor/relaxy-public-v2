'use strict';

import Discord from 'discord.js';

export default {
    name: 'embed',
    usage: '=embed <embed object>',
    description:
        "## Build it without memorising any of this: **[the Embed Maker on the dashboard](https://dashboard.relaxy.xyz/embeds)**.\nFill in boxes, watch Discord's own preview update as you type, and click the **Literals** button for every escape below - each one is clickable and inserts itself for you. It hands you the text to paste back here.\n\nSend an embed like a bot would, as to how you should format it, please refer to the image below.\nFor more information, use **[this lovely link](https://discordjs.guide/popular-topics/embeds.html#using-an-embed-object)**. Instead of writing `'` in a word like `don't`, please write `|`, f.e `don|t`.\nSame goes for `:`, please replace that with `;;`. (unless using a link) \nReplace `,` with `<>`, when wanting to do `enter`, instead of just pressing enter, please type `~=` instead.\nWhen intending on having spaces in text please use \"\" instead of ''\nWhen writing in a text field surrounded by \"\" please double any brackets f.e ( becomes (( and } becomes }}.\nShould the embed you want to build exceed the discord message size limit, please send a text file instead.\n\n**I know this is hard to get a hold of but it offers full customization of embeds.**\nYes, even more. If you want to edit an existing embed, type '=embed edit [channel] [message id]' you will be prompted to do the rest.\n## Should you have any server files that you want to appear outside of the embed, simply type \"attachment://attachmentName.extension\".",

    permissionsUser: ['SEND_MESSAGES', 'EMBED_LINKS'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS'],
    suggestedPermissionsUser: ['ATTACH_FILES', 'MENTION_EVERYONE'],
    suggestedPermissionsBot: ['ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        if (!message.attachments.first() && !args[0]) {
            return client.qEmbed('No arguments provided!', interaction ?? message);
        }

        if (message.attachments.first() && args[0]) {
            return client.qEmbed('Too many arguments provided!', interaction ?? message);
        }

        const customEmbedMaker = new client.class.customEmbed(client);

        return customEmbedMaker.fullRoutine(message, args, guild);
    }
};
