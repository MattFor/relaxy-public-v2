'use strict';

const isUrl = string =>
{
    try
    {
        return [
            'http:',
            'https:'
        ].includes(new URL(string).protocol);
    }
    catch
    {
        return false;
    }
};
import wordsListPath  from 'word-list';
import fs             from 'fs';
import { readImages } from '../../../src/Client/Modules/Moderation/ScamOcr.js';

const MAX_IMAGES = 4;

const resolveImages = async (client, message) =>
{

    const pick = source => [...(source?.attachments?.values?.() ?? [])]
        .filter(attachment => client.utils.isImageAttachment(attachment))
        .slice(0, MAX_IMAGES);

    const own = pick(message);

    if (own.length)
    {
        return own;
    }

    const replyId = message?.reference?.messageId;

    if (!replyId)
    {
        return [];
    }

    const replied = await message.channel.messages.fetch(replyId).catch(() => null);

    return pick(replied);
};

const words = new Set(fs.readFileSync(wordsListPath, 'utf8').split('\n'));

const countOccurrences = (text, pattern) =>
{
    if (!text || !pattern || typeof text !== 'string')
    {
        return 0;
    }

    try
    {

        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const regex = new RegExp(escapedPattern, 'g');

        const matches = text.match(regex);

        return matches
            ? matches.length
            : 0;
    }
    catch (e)
    {
        console.error(`Error counting occurrences for pattern "${pattern}":`, e);
        return 0;
    }
};

const LONGEST_WORD = (() =>
{
    let longest = 0;

    for (const word of words)
    {
        if (word.length > longest)
        {
            longest = word.length;
        }
    }

    return longest;
})();

const getEnglishWords = input =>
{
    const result = new Set();

    for (let i = 0; i < input.length; i++)
    {
        const end = Math.min(input.length, i + LONGEST_WORD);

        for (let j = i + 1; j < end; j++)
        {
            const substring = input.slice(i, j + 1);

            if (words.has(substring) && substring.length > 3)
            {
                result.add(substring);
            }
        }
    }

    return result;
};
const countUrls = (text) =>
{
    if (!text || typeof text !== 'string')
    {
        return 0;
    }

    const urlRegex = /(https?:\/\/[^\s)]+)/g;
    return (text.match(urlRegex) || []).length;
};

const countMentions = (text) =>
{
    if (!text || typeof text !== 'string')
    {
        return 0;
    }

    const mentionRegex = /((<@!?\d+>)|(<@&\d+>)|(@everyone)|(@here))/g;
    return (text.match(mentionRegex) || []).length;
};

const countEmojis = (text) =>
{
    if (!text || typeof text !== 'string')
    {
        return 0;
    }

    const emojiRegex = /<a?:\w+:\d+>|:\w+:/g;
    return (text.match(emojiRegex) || []).length;
};

export default {
    name:        'censortest',
    aliases:     [
        'censorcheck',
        'cc'
    ],
    usage:       '=censortest <word|image>',
    description: 'Check whether the given word would be flagged by this server\'s censor system.\n\n**Images are read too.** Attach one - or reply to a message that has one - and Relaxy runs the same OCR the scam scanner uses on a posted screenshot, then tests the text it read. Words and an image can be given together; both are checked.\n\nFun fact: former bot owner only command.',

    permissionsUser: [
        'SEND_MESSAGES',
        'MANAGE_GUILD'
    ],
    permissionsBot:  [
        'SEND_MESSAGES',
        'EMBED_LINKS'
    ],

    async run(client, message, args, guild, interaction)
    {
        const images = await resolveImages(client, message).catch(() => []);

        let reads = [];
        let readText = '';

        if (images.length)
        {
            const waiting = await client.send(message.channel, null, [
                {
                    color:     client.data.embedColor,
                    title:     `Reading ${images.length === 1
                        ? 'the image'
                        : `all ${images.length} images`}...`,
                    thumbnail: { url: client.cdn.loading }
                }
            ]).catch(() => null);
            reads = await readImages(images.map(image => image.url), {
                log:         (level, ...items) => client.log(level, ...items),
                max:         MAX_IMAGES,
                concurrency: MAX_IMAGES
            }).catch(error =>
            {
                client.log('WARN', `censortest: OCR failed - ${error?.message ?? error}`);

                return [];
            });

            if (waiting)
            {
                client.delete(waiting);
            }

            readText = reads
                .map(read => read.text)
                .filter(Boolean)
                .join(' ')
                .replace(/\s+/g, ' ')
                .trim()
                .toLowerCase();

            if (readText)
            {
                args = [
                    ...args,
                    ...readText.split(/\s+/).filter(Boolean)
                ];
            }
        }

        if (!args.length)
        {
            return client.qEmbed(images.length
                ? `No readable text came out of ${images.length === 1
                    ? 'that image'
                    : `any of those ${images.length} images`}.\n*(If OCR is unavailable on this host nothing ever will - check that \`tesseract-ocr\` is installed.)*`
                : 'Give me a word to test, or attach an image (or reply to one) to read it.', interaction ?? message);
        }

        try
        {
            if (readText)
            {

                const fields = reads.map((read, index) =>
                {
                    const body = read.text.replace(/\n{2,}/g, '\n').trim();

                    return {
                        name:  `Image ${index + 1}${read.text
                            ? ''
                            : ' - nothing read'}`,
                        value: body
                                   ? `\`\`\`\n${body.slice(0, 1000)}\n\`\`\``
                                   : '*No text came out of this one.*'
                    };
                });

                await client.send(message.channel, null, [
                    {
                        color:       client.data.embedColor,
                        title:       `Text read from ${reads.length === 1
                            ? 'the image'
                            : `${reads.length} images`}`,
                        description: `Every read below is tested **together**, as one message - which is how the live scanner sees a dump.`,
                        fields,
                        footer:      client.data.footer
                    }
                ]).catch(client.swallow('censortest: ocr report'));
            }

            client.send(message.channel, `Censor check according to current server settings:  - ${await client.utils.censorCheck(args, guild, null, true, false)}`);
            let scamLevel = 0;
            let checkCopy = '';
            let wordsInside = null;
            let check = client.utils.norm(args.join('')
                                              .replaceAll('4', 'a').replaceAll('1', 'i').replaceAll('!', 'i')
                                              .replaceAll(/[$&+,:;=?@#|"<>.^*()%/[\]\\-]/g, '')
                                              .replaceAll(/g{2,}/g, 'gg').replaceAll(/i+/g, 'i')).toLowerCase();

            let checks = check.match(/[^iIgG]+/g);

            const spam = guild.cn.li.includes('spam');
            const links = guild.cn.li.includes('links');
            const scams = guild.cn.li.includes('scams');
            const invites = guild.cn.li.includes('invites');

            const bigJoinedArgs = args.join(' ');
            const smallJoinedArgs = args.join('');
            const embedData = (await client.stringifyJSON(message?.embeds ?? { 'test': 'w' })).toLowerCase();

            if (checks)
            {
                for (const c of checks)
                {
                    if (c.length > 1)
                    {
                        let bucket = new Set(c);
                        for (const z of bucket.keys())
                        {
                            for (const m of check.match(new RegExp(`${z}+`, 'g')))
                            {
                                check = check.replaceAll(m, z);
                            }
                        }
                    }
                }
            }

            for (let i = 0; i < guild.cn.li.length; i++)
            {
                let word = guild.cn.li[i];

                word = (word[0] === word[word.length - 1] === '*'
                    ? word.slice(1, word.length - 2).replaceAll('-', ' ')
                    : word).toLowerCase();

                const requirement = check.includes(word) || bigJoinedArgs.includes(word) || embedData.includes(word);
                if (![
                    'spam',
                    'scams',
                    'links',
                    'invites'
                ].includes(word) && requirement)
                {
                    if (!wordsInside && (false || ['ngger'].includes(word)))
                    {
                        wordsInside = Array.from(getEnglishWords(bigJoinedArgs)).sort((a, b) =>
                        {
                            return b.length - a.length;
                        }).filter(w => w !== 'undefined');

                        checkCopy += check;

                        for (const w of wordsInside)
                        {
                            if (checkCopy.includes(w))
                            {
                                checkCopy = checkCopy.replace(w, '');
                            }

                            if (checkCopy === '')
                            {
                                return client.send(message.channel, 'No match');
                            }
                        }
                    }

                    if (checkCopy === '' || (!checkCopy.includes(word) && scams
                        ? !this._scams.find(a => word.includes(a))
                        : true))
                    {
                        return client.send(message.channel, `Match found - ${word} | word checking`);
                    }
                }
            }

            for (const word of args)
            {
                if (client.utils.isValidEmoji(word).length === 0 && isUrl(word))
                {
                    return client.send(message.channel, `${args.join(' ')} - link`);
                }
            }

            for (const word of args)
            {
                if (word.match(/(https?:\/\/|http?:\/\/)?(www.)?(discord.(gg|io|me|li)|discordapp.com\/invite|discord.com\/invite)\/[^\s\/]+?(?=\b)/))
                {
                    return client.send(message.channel, `${args.join(' ')} - discord invite`);
                }
            }
            let complexityScore = 2;

            const messageContent = message?.content || '';
            const textToSearch = `${messageContent} ${embedData}`;

            const contentLength = messageContent.length;
            const numUrls = countUrls(textToSearch);
            const numMentions = countMentions(messageContent);
            const numEmojis = countEmojis(messageContent);
            const hasEmbeds = message?.embeds?.length > 0;
            complexityScore += (contentLength > 80
                ? 2
                : 0);
            complexityScore += (contentLength > 250
                ? 3
                : 0);

            complexityScore += numUrls * 2;

            complexityScore += numMentions * 1.5;

            complexityScore += (numEmojis > 6
                ? 1
                : 0);

            complexityScore += (hasEmbeds
                ? 2
                : 0);
            complexityScore = Math.round(complexityScore);
            complexityScore = Math.min(complexityScore, 10);
            complexityScore = Math.max(complexityScore, 2);
            let scamSuspicion = complexityScore;

            if (scams)
            {
                const detected = [];

                const _scams = (await client.cdnText('scams.txt')).split('\n').map(a => a.trim());

                let hasLink = false;

                for (const arg of args)
                {

                    if (typeof arg !== 'string' || arg.length === 0)
                    {
                        continue;
                    }

                    for (const link of client.utils.extractLinks(arg))
                    {
                        hasLink = true;

                        scamLevel++;
                        scamSuspicion--;

                        detected.push(link);
                    }
                }

                if (!hasLink)
                {
                    scamSuspicion += 30;
                }

                let scamCounts = {};

                for (const arg of args)
                {
                    const word = arg.toLowerCase();
                    for (const scam of _scams)
                    {
                        const embedCount = countOccurrences(embedData, scam);
                        const contentCount = countOccurrences(message?.content.toLowerCase(), scam);
                        const wordCount = countOccurrences(word, scam);

                        const currentScamPatternTotalCount = embedCount + contentCount + wordCount;

                        if (currentScamPatternTotalCount > 0)
                        {

                            scamLevel += currentScamPatternTotalCount;

                            if (scamCounts[scam])
                            {
                                scamCounts[scam] += currentScamPatternTotalCount;
                            }
                            else
                            {
                                scamCounts[scam] = currentScamPatternTotalCount;
                            }

                            if (scamLevel > scamSuspicion)
                            {
                                for (const key of Object.keys(scamCounts))
                                {
                                    if (scamCounts[key] > 5 && !hasLink)
                                    {
                                        return client.send(message.channel, `No match | 2 | [Suspicion: ${scamLevel}/${scamSuspicion}]`);
                                    }
                                }

                                const detectedList = Object.entries(scamCounts).map(([s, count]) =>
                                {

                                    return `- \`${s}${count > 1
                                        ? ' X' + count
                                        : ''}\``;
                                }).join('\n');

                                return client.send(message.channel,
                                    `Multiple detections [Suspicion: ${scamLevel}/${scamSuspicion}]:\n${detected.join('\n')}${detected.length > 0 && detectedList.length > 0
                                        ? '\n'
                                        : ''}${detectedList}`);
                            }

                        }
                    }
                }
            }

            return client.send(message.channel, `No match | 3 | [Suspicion: ${scamLevel}/${scamSuspicion}]`);
        }
        catch (e)
        {
            client.log(e);
        }
    }
};
