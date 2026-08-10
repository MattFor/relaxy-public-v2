'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../src/Client/Relaxy.js';

export default {
    name:        'trade',
    usage:       '=trade <user> <your_item_id> <their_item_id|moneyN>',
    description: 'Offer a trade to another user (mention or ID). Item IDs come from `=inventory`; use `moneyN` on either side to trade money instead of an item.\n**=trade MattFor 1 2** - your item #1 for their item #2\n**=trade MattFor 1 money300** - your item #1 for 300 of their money\nThey get **Accept** / **Decline** buttons; the offer expires in 2 minutes.',

    args: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, guild, interaction)
    {
        client.module.profiles.ProcessTrade(message, args);
    }
};