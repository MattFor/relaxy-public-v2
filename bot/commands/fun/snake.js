'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../src/Client/Relaxy.js';

export default {
    name: 'snake',
    aliases: ['snek'],
    usage: '=snake',
    description:
        'Get to play a game of snake.\nPlease do not spam the reactions. `(refresh time once per 0.5 seconds)`\nEnds when:\n- You drive the snake into itself,\n- Are idle for some time.',

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ADD_REACTIONS', 'MANAGE_MESSAGES'],

    async run(client, message, args, guild, interaction) {
        new client.class.snake(client, message, guild);
    }
};
