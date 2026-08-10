'use strict';

import Discord         from 'discord.js';
import Relaxy          from '../../../src/Client/Relaxy.js';
import { messageType } from '../../../src/Core/DataTable.js';

import { nextRequestNumber } from '../../../src/Config/Settings.js';

export default {
    name:        'request',
    usage:       '=request <request>',
    description: 'Request a feature to be added to Relaxy! or report a bug.',

    slash: new Discord.SlashCommandBuilder()
               .addStringOption(option => option.setName('request').setDescription('What you would like to ask the developers for.').setRequired(true)),

    args:     true,
    cooldown: 14400,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const joinedArgs = args.join(' ');

        const id = await nextRequestNumber(client.config.keys.dbtoken, error => client.log('ERROR', `request: could not allocate a request number: ${error?.message ?? error}`));

        if (!id)
        {
            return client.qEmbed('Could not file that right now - the database did not answer. Please try again in a moment.', interaction ?? message);
        }

        const request = {
            createdAt:  Date.now(),
            index:      id,
            clusterId:  client.data.id,
            attachment: message.attachments.size > 0
                            ? message.attachments.first()
                            : '0',
            content:    joinedArgs.slice(0, 1024),
            author:     message.author,
            member:     message.member,
            guild:      message.guild.name,
            valid:      (joinedArgs.length > 0 && joinedArgs.length < 1900 || message.attachments.size > 0) && !await client.censored(args, guild, message)
        };

        if (!request.valid)
        {
            return client.send(message.author, null, [
                {
                    color:       client.data.embedColor,
                    title:       `Hello ${message.author.username}!`,
                    description: 'I have received your request, but something went wrong.\nMy automatic validator deemed your request to be invalid in some sort of way.',
                    fields:      [
                        {
                            name:  'Most common deny reasons:',
                            value: '**- sending a blank message,**\n**- message being too long (limit 1900 characters),**\n**- message containing offensive words.**\n\nThanks for reading, hope you apply again!'
                        }
                    ],
                    footer:      client.data.footer,
                    thumbnail:   {
                        url: client.cdn.profile.mail
                    }
                }
            ]);
        }

        client.cluster.send({
            _type:   messageType.CLIENT_REQUEST,
            variant: 'rr',
            data:    request
        });

        return client.qEmbed(`_ Your request [ID: **\`#${id}\`**] has been sent!\nYou're going to get notified when it's accepted/denied.`, interaction ?? message);
    }
};
