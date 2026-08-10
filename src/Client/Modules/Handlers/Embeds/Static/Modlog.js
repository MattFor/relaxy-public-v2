'use strict';

import { CDN }    from '../../../../../Assets/CDN.js';
import { config } from '../../../../../Config/Config.js';

const footerImageUrl = CDN.brand;

export default class ModLogEmbed
{
    constructor(options)
    {
        let embed = {
            color: options.color === 'bad'
                       ? 16711680
                       : options.color === 'good'
                    ? 65280
                    : 16738740,
            title: `**Event |** \`${options.event}\``,

            footer:    {
                text:    `Relaxy! v${config.keys.version} • relaxy.xyz • by MattFor`,
                iconURL: footerImageUrl
            },
            timestamp: new Date()
        };

        if (options.thumbnail)
        {
            embed.thumbnail = { url: options.thumbnail };
        }

        if (options.fields)
        {
            embed.fields = options.fields.filter(f => f !== null);
        }

        if (options.description)
        {
            embed.description = options.description;
        }

        if (options.title)
        {
            embed.title = options.title;
        }

        if (options.author)
        {
            embed.author = options.author;
        }

        if (options.image)
        {
            embed.image = options.image;
        }

        return embed;
    }
}
