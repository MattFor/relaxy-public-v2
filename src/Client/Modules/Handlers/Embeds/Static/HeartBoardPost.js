'use strict';

import Mongoose from 'mongoose';
import Relaxy   from '../../../../Relaxy.js';
import Discord  from 'discord.js';

import { describeMessage } from '../../../Core/Utilities.js';

const DEFAULT_COLOUR = 16738740;
const DEFAULT_NAME_MODE = 1;
const DESCRIPTION_LIMIT = 4000;
const FIELD_LIMIT = 1024;
const IMAGE_STICKER_FORMATS = new Set([
    Discord.StickerFormatType.PNG,
    Discord.StickerFormatType.APNG,
    Discord.StickerFormatType.GIF
]);
const isSpoiler = attachment => typeof attachment?.name === 'string' && attachment.name.startsWith('SPOILER_');

const isImage = attachment => typeof attachment?.contentType === 'string' && attachment.contentType.startsWith('image/');
const humanSize = bytes =>
{
    if (!Number.isFinite(bytes) || bytes <= 0)
    {
        return null;
    }

    return bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export default class HeartBoardPostEmbed
{
    static async from(client, message, heartBoardSettings)
    {
        let resolved = message;

        if (message?.partial)
        {
            resolved = await message.fetch().catch(() => null);

            if (!resolved)
            {
                client.log('WARN', `[HeartBoard] Could not fetch partial message ${message.id}; skipping the post.`);
                return null;
            }
        }

        return new HeartBoardPostEmbed(client, resolved, heartBoardSettings).data;
    }

    constructor(client, message, heartBoardSettings)
    {

        if (message?.partial)
        {
            client.log('WARN', `[HeartBoard] Built from a PARTIAL message (${message.id}) - use HeartBoardPostEmbed.from() instead.`);
            this.data = null;

            return;
        }

        this.data = this.generate(client, message, heartBoardSettings);
    }

    resolveMedia(message)
    {
        const attachments = [...(message.attachments?.values() ?? [])];
        const source = message.embeds?.[0]?.data ?? null;

        const images = [];
        const files = [];

        for (const attachment of attachments)
        {

            if (isSpoiler(attachment) || !isImage(attachment))
            {
                files.push(attachment);
                continue;
            }

            images.push(attachment);
        }

        let image = images[0]?.url ?? null;
        let thumbnail = null;
        let rich = null;

        const links = [];

        if (source)
        {
            const embedImage = source.image?.url ?? null;
            const embedThumb = source.thumbnail?.url ?? null;

            switch (source.type)
            {

                case 'image':
                case 'gifv':
                {
                    image ??= embedImage ?? embedThumb;

                    if (source.type === 'gifv' && source.url)
                    {
                        links.push({
                            label: 'View animated original',
                            url:   source.url
                        });
                    }

                    break;
                }

                case 'video':
                {
                    image ??= embedImage ?? embedThumb;

                    if (source.url)
                    {
                        links.push({
                            label: source.title
                                       ? `Watch: ${source.title}`
                                       : 'Watch',
                            url:   source.url
                        });
                    }

                    break;
                }

                case 'rich':
                {
                    rich = source;
                    image ??= embedImage;
                    thumbnail ??= embedThumb;

                    break;
                }

                default:
                {
                    image ??= embedImage;
                    thumbnail ??= embedThumb;

                    break;
                }
            }
        }

        const sticker = message.stickers?.first?.() ?? null;

        if (!image && sticker && IMAGE_STICKER_FORMATS.has(sticker.format))
        {
            image = sticker.url;
        }

        for (const attachment of [
            ...images.slice(1),
            ...files
        ])
        {
            const size = humanSize(attachment.size);
            const name = attachment.name ?? 'attachment';

            links.push({
                label: `${isSpoiler(attachment)
                    ? '🔒 '
                    : ''}${name}${size
                    ? ` (${size})`
                    : ''}`,
                url:   attachment.url
            });
        }

        return {
            image,
            thumbnail,
            links,
            rich
        };
    }

    generate(client, message, heartBoardSettings)
    {
        try
        {

            const colour = Number.isInteger(heartBoardSettings?.co)
                ? heartBoardSettings.co
                : DEFAULT_COLOUR;

            const names = [
                client.utils.tag(message.author),
                message.member?.displayName ?? message.author.displayName ?? client.utils.tag(message.author),
                message.member?.displayName ?? message.author.displayName ?? client.utils.tag(message.author)
            ];

            const media = this.resolveMedia(message);

            const post = new client.imports.discord.EmbedBuilder()
                .setColor(colour)
                .setAuthor({
                    name:    names[heartBoardSettings?.nm] ?? names[DEFAULT_NAME_MODE],
                    iconURL: (message.member ?? message.author).displayAvatarURL({
                        extension: 'png',
                        size:      4096
                    }),
                    url:     message.url
                })
                .setFooter({
                    text:    `ID: ${message.id}`,
                    iconURL: client.config.text.links.relaxyImage
                })
                .setTimestamp(message.createdAt);

            const body = [];

            const content = typeof message.content === 'string'
                ? message.content.trim()
                : '';
            const contentIsJustItsOwnMedia = content && media.image && (content === media.image || content === message.embeds?.[0]?.data?.url);

            if (content && !contentIsJustItsOwnMedia)
            {
                body.push(content);
            }

            const otherShapes = describeMessage(message, {
                limit:   DESCRIPTION_LIMIT,
                content: false,
                embeds:  false,
                media:   false
            });

            if (otherShapes)
            {
                body.push(otherShapes);
            }

            if (media.rich)
            {
                if (media.rich.title)
                {
                    post.setTitle(String(media.rich.title).slice(0, 256));

                    if (media.rich.url)
                    {
                        post.setURL(media.rich.url);
                    }
                }

                if (media.rich.description)
                {
                    body.push(media.rich.description);
                }

                const fields = (media.rich.fields ?? [])
                    .filter(field => field?.name && field?.value)
                    .slice(0, 25)
                    .map(field => ({
                        name:   String(field.name).slice(0, 256),
                        value:  String(field.value).slice(0, FIELD_LIMIT),
                        inline: Boolean(field.inline)
                    }));

                if (fields.length)
                {
                    post.setFields(fields);
                }
            }

            if (media.links.length)
            {
                body.push(media.links.map(link => `**[${link.label}](${link.url})**`).join('\n'));
            }

            const description = body.join('\n\n').slice(0, DESCRIPTION_LIMIT);

            if (description)
            {
                post.setDescription(description);
            }

            if (typeof media.image === 'string' && media.image)
            {
                post.setImage(media.image);
            }

            if (typeof media.thumbnail === 'string' && media.thumbnail && media.thumbnail !== media.image)
            {
                post.setThumbnail(media.thumbnail);
            }

            return post;
        }
        catch (error)
        {

            client.data.errors++;
            client.log('ERROR', '[HeartBoard] Could not build the post embed:', error);

            return null;
        }
    }
}
