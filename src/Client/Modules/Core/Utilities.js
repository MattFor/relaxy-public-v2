'use strict';

import fs from 'fs-extra';

import { CDN, cdnText } from '../../../Assets/CDN.js';
import { excused } from '../Moderation/CensorExceptions.js';
import { appealInvite } from '../Guilds/GuildLink.js';
import { voteSites } from '../../../Core/DataTable.js';
import wordsListPath from 'word-list';

const words = new Set(fs.readFileSync(wordsListPath, 'utf8').replaceAll('\r', '').split('\n'));

words.add('a');

const whitelistLinks = ['medal.tv', 'youtube.com'];

const BARE_TLDS = [
    'com',
    'net',
    'org',
    'io',
    'co',
    'gg',
    'tv',
    'me',
    'cc',
    'xyz',
    'info',
    'biz',
    'online',
    'site',
    'store',
    'shop',
    'live',
    'link',
    'click',
    'top',
    'win',
    'vip',
    'club',
    'space',
    'website',
    'host',
    'press',
    'icu',
    'monster',
    'quest',
    'cyou',
    'app',
    'dev',
    'ru',
    'su',
    'cn',
    'tk',
    'ml',
    'ga',
    'cf',
    'pw',
    'uk',
    'de',
    'fr',
    'nl',
    'pl',
    'eu',
    'br',
    'ir',
    'gift',
    'cash'
];

const extractLinks = (text) => {
    if (!text || typeof text !== 'string') {
        return [];
    }

    const pattern = new RegExp(
        `(?:https?:\\/\\/)?(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\\.)+(?:${BARE_TLDS.join('|')})\\b(?:\\/[^\\s]*)?`,
        'gi'
    );

    return (text.match(pattern) ?? [])

        .map((link) => link.toLowerCase().replace(/[,.;:!?"')\]]+$/, ''))
        .filter((link) => link && !whitelistLinks.some((l) => link.includes(l)));
};

const NAME_HISTORY_LIMIT = 30;

const BAN_CASES = ['ban', 'tempban', 'warn-ban', 'censor-ban'];

const AUDIT_SNAPSHOT_TTL = 5_000;

const AUDIT_INTERVAL = 3_000;
const AUDIT_PATIENCE = 5;

const AUDIT_SNAPSHOT_FRESH = 1_000;

const AUDIT_SNAPSHOT_LIMIT = 50;

const countOccurrences = (text, pattern) => {
    if (!text || !pattern || typeof text !== 'string') {
        return 0;
    }
    try {
        const escapedPattern = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

        const regex = new RegExp(escapedPattern, 'g');

        const matches = text.match(regex);

        return matches ? matches.length : 0;
    } catch (e) {
        console.error(`Error counting occurrences for pattern "${pattern}":`, e);
        return 0;
    }
};
const splitStringOnCaseChange = (inputString) => {
    if (typeof inputString !== 'string' || inputString.length === 0) {
        return [];
    }

    const result = [];
    let currentSegment = '';
    const isUpperCaseLetter = (char) => {
        return char >= 'A' && char <= 'Z';
    };

    const isLowerCaseLetter = (char) => {
        return char >= 'a' && char <= 'z';
    };

    for (let i = 0; i < inputString.length; i++) {
        const currentChar = inputString[i];

        if (i === 0) {
            currentSegment += currentChar;
            continue;
        }

        const previousChar = inputString[i - 1];

        const isCurrentCharUpper = isUpperCaseLetter(currentChar);
        const isCurrentCharLower = isLowerCaseLetter(currentChar);
        const isPreviousCharUpper = isUpperCaseLetter(previousChar);
        const isPreviousCharLower = isLowerCaseLetter(previousChar);

        let shouldSplit = false;

        if (isPreviousCharLower && isCurrentCharUpper) {
            shouldSplit = true;
        } else if (isPreviousCharUpper && isCurrentCharLower) {
            shouldSplit = true;
        }

        if (shouldSplit) {
            result.push(currentSegment);
            currentSegment = currentChar;
        } else {
            currentSegment += currentChar;
        }
    }

    if (currentSegment.length > 0) {
        result.push(currentSegment);
    }

    return result;
};

const keepLongestWords = (words) => {
    const longestWords = new Map();

    words.forEach((word) => {
        for (let [baseWord, storedWord] of longestWords.entries()) {
            if (word.startsWith(baseWord)) {
                if (word.length > storedWord.length) {
                    longestWords.set(baseWord, word);
                }

                return;
            }

            if (baseWord.startsWith(word)) {
                if (storedWord.length < word.length) {
                    longestWords.set(word, word);
                    longestWords.delete(baseWord);
                }
                return;
            }
        }

        longestWords.set(word, word);
    });

    return Array.from(longestWords.values());
};

const LONGEST_WORD = (() => {
    let longest = 0;

    for (const word of words) {
        if (word.length > longest) {
            longest = word.length;
        }
    }

    return longest;
})();

const getEnglishWords = (input) => {
    const result = new Set();

    for (let i = 0; i < input.length; i++) {
        const end = Math.min(input.length, i + LONGEST_WORD);

        for (let j = i + 1; j < end; j++) {
            const substring = input.slice(i, j + 1);

            if (words.has(substring)) {
                result.add(substring);
            }
        }
    }

    return result;
};

import Mongoose from 'mongoose';
import Relaxy from '../../Relaxy.js';
import Discord from 'discord.js';

const isUrl = (string) => {
    try {
        return ['http:', 'https:'].includes(new URL(string).protocol);
    } catch {
        return false;
    }
};
import natural from 'natural';
import stopword from 'stopword';
import www from 'weird-to-normal-chars';
import ftc from 'replace-special-characters';

import { emojiList } from '../../../Core/DataTable.js';

const reverseObject = (obj) => {
    let reversedObj = {};

    for (let key in obj) {
        reversedObj[obj[key]] = key;
    }

    return reversedObj;
};

const emojiListConverted = reverseObject(emojiList);

const TfIdf = natural.TfIdf;
const tfidf = new TfIdf();

const mainChars =
    '[\\u265F\\u203C\\u2049\\u2122\\u2139\\u2194-\\u2199\\u21A9\\u21AA\\u231A\\u231B\\u2328\\u23CF\\u23E9-\\u23F3\\u23F8-\\u23FA\\u24C2\\u25AA\\u25AB\\u25B6\\u25C0\\u25FB-\\u25FE\\u2600-\\u2604\\u260E\\u2611\\u2614\\u2615\\u2618\\u261D\\u2620\\u2622\\u2623\\u2626\\u262A\\u262E\\u262F\\u2638-\\u263A\\u2648-\\u2653\\u2660\\u2663\\u2665\\u2666\\u2668\\u267B\\u267E\\u267F\\u2692-\\u2697\\u2699\\u269B\\u269C\\u26A0\\u26A1\\u26AA\\u26AB\\u26B0\\u26B1\\u26BD\\u26BE\\u26C4\\u26C5\\u26C8\\u26CE\\u26CF\\u26D1\\u26D3\\u26D4\\u26E9\\u26EA\\u26F0-\\u26F5\\u26F7-\\u26FA\\u26FD\\u2640\\u2642\\u2702\\u2705\\u2708-\\u270D\\u270F\\u2712\\u2714\\u2716\\u271D\\u2721\\u2728\\u2733\\u2734\\u2744\\u2747\\u274C\\u274E\\u2753-\\u2755\\u2757\\u2763\\u2764\\u2795-\\u2797\\u27A1\\u27B0\\u27BF\\u2934\\u2935\\u2B05-\\u2B07\\u2B1B\\u2B1C\\u2B50\\u2B55\\u3030\\u303d\\u3297\\u3299]';
const contChars =
    '\\u2695\\uFE0F|\\uD83C\\uDF93|\\uD83C\\uDFEB|\\u2696\\uFE0F|\\uD83C\\uDF3E|\\uD83C\\uDF73|\\uD83D\\uDD27|\\uD83C\\uDFED|\\uD83D\\uDCBC|\\uD83D\\uDD2C|\\uD83D\\uDCBB|\\uD83C\\uDFA4|\\uD83C\\uDFA8|\\u2708\\uFE0F|\\uD83D\\uDE80|\\uD83D\\uDC8B|\\uD83D\\uDE92|\\u2764\\uFE0F|\\uD83D\\uDC66|\\uD83D\\uDC67|\\uD83D\\uDC68|\\uD83D\\uDC69|\\uD83D\\uDC6A|\\uD83D\\uDC91|\\u2620\\uFE0F|\\u2640|\\u2642';
const flagSuppl =
    '(?:\\uDB40\\uDC67\\uDB40\\uDC62\\uDB40[\\uDC65-\\uDC77]\\uDB40[\\uDC63-\\uDC6F]\\uDB40[\\uDC67-\\uDC74]\\uDB40\\uDC7F)?';
const EMOJIS = RegExp(
    '(\\uD83C[\\uDDE6-\\uDDFF])?(\\u00a9|\\u00ae|' +
        mainChars.replace(/\]^/, '\\u265F]') +
        '|\\ud83c[\\ud000-\\udfff]|\\ud83d[\\ud000-\\udfff]|\\ud83e[\\ud000-\\udfff]|[#*0-9]\\uFE0F\\u20E3)\\uFE0F?(\\ud83c[\\udffb-\\udfff])?(\\u200d(\\u00a9|\\u00ae|' +
        contChars +
        '|\\ud83c[\\ud000-\\udfff]|\\ud83d[\\ud000-\\udfff]|\\ud83e[\\ud000-\\udfff]|[#*0-9]\\uFE0F\\u20E3)\\uFE0F?)*' +
        flagSuppl,
    'g'
);

const timeTable = [
    'm',
    'min',
    'mins',
    'minute',
    'minutes',
    'h',
    'hr',
    'hour',
    'hours',
    'd',
    'day',
    'days',
    'w',
    'week',
    'weeks',
    'mon',
    'month',
    'months',
    'y',
    'year',
    'years'
];

const numberToLetter = {
    0: 'o',
    1: 'i',
    2: 'z',
    3: 'e',
    4: 'a',
    5: 's',
    6: '',
    7: 't',
    8: 'b',
    9: 'p'
};
export const SYNC_TOKEN = /(?:-{0,2}sync|--?(?:all|everywhere))/;
export const NO_APPEAL_TOKEN = /(?:-{0,2}(?:noappeal|nodm)|--?silent)/;
export const wholeToken = (token) => new RegExp(`^${token.source}$`, 'i');
const inLine = (token) => new RegExp(`(?:^|\\s)${token.source}(?=\\s|$)`, 'i');

const MENTION_PATTERN = /<(?:@[!&]?|#)\d{15,25}>/;
const MENTION_SPLIT = /(<(?:@[!&]?|#)\d{15,25}>)/g;

export const inlineText = (text, { limit = 0, fallback = 'No reason given.', singleLine = true } = {}) => {
    let value = typeof text === 'string' ? text : text === null || text === undefined ? '' : String(text);

    if (singleLine) {
        value = value.replaceAll('\n', ' ');
    }

    value = value.trim();

    if (!value) {
        return fallback ? `\`${fallback}\`` : '';
    }

    if (limit > 0 && value.length > limit) {
        value = `${value
            .slice(0, limit)
            .replace(/<[@#][!&]?\d*$/, '')
            .trimEnd()}…`;
    }

    if (!MENTION_PATTERN.test(value)) {
        return `\`${value.replaceAll('`', 'ˋ')}\``;
    }

    return value
        .split(MENTION_SPLIT)
        .map((part, index) => (index % 2 ? part : Discord.escapeMarkdown(part)))
        .join('');
};

const LINKABLE_STICKER_FORMATS = new Set([
    Discord.StickerFormatType.PNG,
    Discord.StickerFormatType.APNG,
    Discord.StickerFormatType.GIF
]);

const SYSTEM_MESSAGE_TEXT = {
    [Discord.MessageType.GuildBoost]: 'Boosted the server.',
    [Discord.MessageType.GuildBoostTier1]: 'Boosted the server to level 1.',
    [Discord.MessageType.GuildBoostTier2]: 'Boosted the server to level 2.',
    [Discord.MessageType.GuildBoostTier3]: 'Boosted the server to level 3.',
    [Discord.MessageType.ChannelPinnedMessage]: 'Pinned a message.',
    [Discord.MessageType.ChannelFollowAdd]: 'Followed an announcement channel.',
    [Discord.MessageType.UserJoin]: 'Joined the server.',
    [Discord.MessageType.ThreadCreated]: 'Started a thread.',
    [Discord.MessageType.ThreadStarterMessage]: 'The message a thread was started from.',
    [Discord.MessageType.Call]: 'Started a call.',
    [Discord.MessageType.PollResult]: 'A poll closed.',
    [Discord.MessageType.RecipientAdd]: 'Added somebody to the group.',
    [Discord.MessageType.RecipientRemove]: 'Removed somebody from the group.',
    [Discord.MessageType.ChannelNameChange]: 'Renamed the channel.',
    [Discord.MessageType.ChannelIconChange]: 'Changed the channel icon.',
    [Discord.MessageType.GuildInviteReminder]: 'Invite reminder.',
    [Discord.MessageType.AutoModerationAction]: 'AutoMod acted on a message.',
    [Discord.MessageType.StageStart]: 'Started a stage.',
    [Discord.MessageType.StageEnd]: 'Ended a stage.',
    [Discord.MessageType.StageSpeaker]: 'Became a stage speaker.',
    [Discord.MessageType.StageTopic]: 'Changed the stage topic.'
};

const FORWARD_DEPTH = 2;
const humanSize = (bytes) => {
    if (!Number.isFinite(bytes) || bytes <= 0) {
        return null;
    }

    return bytes >= 1024 * 1024
        ? `${(bytes / (1024 * 1024)).toFixed(1)} MB`
        : `${Math.max(1, Math.round(bytes / 1024))} KB`;
};

export const describeMessage = (
    message,
    { limit = 4096, content: withContent = true, embeds: withEmbeds = true, media = true, depth = FORWARD_DEPTH } = {}
) => {
    if (!message) {
        return null;
    }

    const parts = [];

    const content = withContent && typeof message.content === 'string' ? message.content.trim() : '';

    if (content) {
        parts.push(content);
    }

    for (const snapshot of message.messageSnapshots?.values?.() ?? []) {
        const inner =
            depth > 0
                ? describeMessage(snapshot, {
                      limit: 0,
                      depth: depth - 1
                  })
                : null;

        parts.push(inner ? `**Forwarded:**\n${inner}` : '**Forwarded a message.**');
    }

    if (message.poll) {
        const poll = message.poll;
        const answers = [...(poll.answers?.values?.() ?? [])].map((answer) => {
            const emoji = answer.emoji ? `${answer.emoji} ` : '';

            const votes = Number.isFinite(answer.voteCount) ? ` — **${answer.voteCount}**` : '';

            return `• ${emoji}${answer.text ?? 'Unnamed answer'}${votes}`;
        });

        const state = poll.resultsFinalized ? 'closed' : 'poll';

        parts.push([`**Poll (${state}):** ${poll.question?.text ?? 'Untitled'}`, ...answers].join('\n'));
    }
    for (const embed of withEmbeds ? (message.embeds ?? []) : []) {
        const data = embed?.data ?? embed;

        if (!data) {
            continue;
        }

        const head = data.title ? (data.url ? `**[${data.title}](${data.url})**` : `**${data.title}**`) : null;

        const body = [head, data.description ?? null].filter(Boolean).join('\n');

        if (body) {
            parts.push(body);

            continue;
        }
        if (media && (data.image?.url || data.thumbnail?.url || data.url)) {
            parts.push(`**[Embed](${data.image?.url ?? data.thumbnail?.url ?? data.url})**`);
        }
    }

    const displays = [];

    const walk = (components, left) => {
        if (!Array.isArray(components) || left <= 0) {
            return;
        }

        for (const component of components) {
            const type = component?.type ?? component?.data?.type;

            if (type === Discord.ComponentType.TextDisplay) {
                const text = (component.content ?? component.data?.content ?? '').trim();

                if (text) {
                    displays.push(text);
                }

                continue;
            }

            walk(component?.components ?? component?.data?.components, left - 1);
        }
    };

    walk(message.components, 8);

    if (displays.length) {
        parts.push(displays.join('\n'));
    }

    if (media) {
        for (const sticker of message.stickers?.values?.() ?? []) {
            parts.push(
                LINKABLE_STICKER_FORMATS.has(sticker.format)
                    ? `**[Sticker: ${sticker.name}](${sticker.url})**`
                    : `**Sticker: ${sticker.name}**`
            );
        }

        const attachments = [...(message.attachments?.values?.() ?? [])].map((attachment) => {
            const size = humanSize(attachment.size);

            return `**[${attachment.name ?? 'attachment'}${size ? ` (${size})` : ''}](${attachment.url})**`;
        });

        if (attachments.length) {
            parts.push(attachments.join('\n'));
        }
    }

    if (!parts.length) {
        const systemText = SYSTEM_MESSAGE_TEXT[message.type];

        if (systemText) {
            parts.push(systemText);
        }
    }

    if (!parts.length) {
        return null;
    }

    const described = parts.join('\n\n');

    return limit > 0 && described.length > limit ? `${described.slice(0, Math.max(1, limit - 1))}…` : described;
};

export default class Utilities {
    constructor(client) {
        this.client = client;

        setTimeout(() => this.setScams().catch((e) => this.client.log('ERROR', 'Failed to load scams.txt!', e)), 1000);
    }

    voteButtons() {
        const Discord = this.client.imports.discord;

        return voteSites.map((site) =>
            new Discord.ButtonBuilder()
                .setLabel(`Vote on ${site.short ?? site.name}`)
                .setEmoji(site.emoji)
                .setStyle(Discord.ButtonStyle.Link)
                .setURL(site.url)
        );
    }

    voteLinks(separator = ' • ') {
        return voteSites.map((site) => `**[${site.name}](${site.url})**`).join(separator);
    }

    shortGuildName(name) {
        return (
            String(name ?? '')
                .split(/\s+/g)
                .filter(Boolean)
                .map(
                    (word) =>
                        word[0].toUpperCase() +
                        (word[1] ? word[1].toLowerCase() : '') +
                        (word[2] ? word[2].toLowerCase() : '')
                )
                .join('') || 'Unknown'
        );
    }

    guildIcon(guild) {
        return (
            guild?.iconURL({
                dynamic: true,
                size: 4096
            }) || CDN.serverIcon
        );
    }

    trackThumbnail(track) {
        if (!track || track.thumbnail === '') {
            return CDN.musicPlaceholder;
        }

        if (track.__metadata?.thumbnail?.url) {
            return track.raw?.thumbnail?.url ?? track.__metadata.thumbnail.url;
        }

        if (track.thumbnail?.url) {
            return track.thumbnail.url;
        }

        return track.thumbnail || CDN.musicPlaceholder;
    }

    async setScams() {
        const scams = await cdnText('scams.txt', (e) => this.client.log('WARN', 'scams.txt served from cache:', e));

        this._scams = [
            ...new Set(
                scams
                    .split('\n')
                    .map((a) => a.trim().toLowerCase())
                    .filter((a) => a && !a.startsWith('#'))
            )
        ];
    }

    extractLinks(text) {
        return extractLinks(text);
    }

    scamTermsIn(text) {
        if (!text || typeof text !== 'string') {
            return [];
        }

        const haystack = text.toLowerCase().replace(/\s+/g, ' ');

        return (this._scams ?? []).filter((term) => haystack.includes(term));
    }

    getAcceptableCPUUsage() {
        return 5;
    }

    test() {
        return this.client.log('Test successful.');
    }

    shuffleString(str) {
        const array = str.split('');

        for (let i = array.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [array[i], array[j]] = [array[j], array[i]];
        }

        return array.join('');
    }

    randomString(x, y) {
        let result = '';
        const length = Math.floor(Math.random() * (y - x + 1)) + x;
        const characters = this.client.utils.shuffleString(
            'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*()_+-=[]{}|;:\'",.<>?/~`'
        );

        for (let i = 0; i < length; i++) {
            const randomIndex = Math.floor(Math.random() * characters.length);
            result += characters[randomIndex];
        }

        return result;
    }

    randomCutout(str) {
        if (str.length === 0) {
            return '';
        }
        const start = Math.floor(Math.random() * str.length);
        const end = Math.floor(Math.random() * (str.length - start)) + start + 1;
        return str.slice(start, end);
    }

    randErr() {
        const x = Math.floor(Math.random() * 257);
        const y = Math.floor(Math.random() * 257);
        const errorMessage = 'Critical FATAL unknown error! Omnissiah core dumped at 0x202ZAWESR51325X124';
        const cutout = this.randomCutout(errorMessage);
        const randomStr = this.randomString(x, y);
        const placeAtStart = Math.random() < 0.5;
        const insertionIndex = placeAtStart ? 0 : Math.floor(randomStr.length / 2);
        const result = randomStr.slice(0, insertionIndex) + cutout + randomStr.slice(insertionIndex);

        return result;
    }

    async makeList(list, cache, userMember, additional) {
        let result = '';

        for (const item of list) {
            const user =
                userMember === 0
                    ? await this.client.getUser(item).catch(this.client.swallow('Utilities: getUser'))
                    : await this.client.getMember(userMember, item).catch(this.client.swallow('Utilities: getMember'));
            const toAdd = `${user ?? cache.get(item) ?? ''}, `;
            if (toAdd.length > 3) {
                result += toAdd;
            }
        }

        return result.length > 3
            ? `${result.slice(0, result.length - 2)}.`.slice(0, 6000)
            : additional
              ? additional
              : 'None.';
    }

    smallify(str) {
        let result = '';
        for (let i = 0; i < str.length; i++) {
            result += (numberToLetter[str[i]] ?? str[i]).replace(/regional_indicator_/, '');
        }

        return this.norm(
            result
                .replaceAll('!', 'i')
                .replace(/[$&+,:=?@#|'<>.^*()%/[\]\\-]/g, '')
                .replace(/g{2,}/g, 'gg')
                .replace(/i+/g, 'i')
        )
            .replace(/[^a-zA-Z0-9]/g, '')
            .toLowerCase();
    }

    capList(items, separator = ', ', empty = 'None.', limit = 1024) {
        if (!items?.length) {
            return empty;
        }

        const kept = [];
        let length = 0;

        for (const item of items) {
            if (length + item.length + separator.length > limit - 24) {
                break;
            }

            kept.push(item);
            length += item.length + separator.length;
        }

        const remaining = items.length - kept.length;

        if (!remaining) {
            return kept.join(separator);
        }

        return `${kept.join(separator)}${separator}*+${remaining} more*`;
    }

    moderationEmbed({
        verb,
        emoji = '',
        user,
        member = null,
        moderator = null,
        reason = '',
        caseNumber = null,
        extra = [],
        note = '',
        sync = ''
    }) {
        const subject = user?.user ?? user;
        const avatarSource = member ?? subject;

        const moderatorId = typeof moderator === 'string' ? moderator : (moderator?.id ?? moderator?.user?.id ?? null);

        const fields = [
            {
                name: 'Reason',
                value: inlineText(reason, {
                    limit: 1000,
                    fallback: 'No reason given.'
                })
            },
            {
                name: 'Moderator',
                value: moderatorId ? `<@${moderatorId}>` : '`Unknown`',
                inline: true
            },

            caseNumber
                ? {
                      name: 'Case',
                      value: `**#${caseNumber}**`,
                      inline: true
                  }
                : null,
            ...extra.filter(Boolean)
        ].filter(Boolean);

        if (sync) {
            fields.push({
                name: 'Synced',
                value: sync.replace(/^\n/, '').slice(0, 1024)
            });
        }

        return {
            color: this.client.data.embedColor,
            title: `${emoji} ${verb} ${subject?.username ?? 'someone'}`.trim(),
            description: `${
                subject ? `<@${subject.id}>` : ''
            } **${this.tag(subject)}** \`${subject?.id ?? 'unknown'}\`${note ? `\n-# ${note}` : ''}`,
            fields: fields.slice(0, 25),
            thumbnail:
                typeof avatarSource?.displayAvatarURL === 'function'
                    ? {
                          url: avatarSource.displayAvatarURL({
                              dynamic: true,
                              size: 4096
                          })
                      }
                    : undefined,
            footer: this.client.data.footer,
            timestamp: new Date()
        };
    }

    async confirm({
        client,
        message,
        interaction,
        title,
        body,
        confirmLabel = 'Yes, do it',
        cancelLabel = 'Cancel',
        ttl = 30 * 1000
    }) {
        const Discord = this.client.imports.discord;
        const nonce = `${Date.now().toString(36)}${Math.floor(Math.random() * 1e6).toString(36)}`;

        const row = new Discord.ActionRowBuilder().addComponents(
            new Discord.ButtonBuilder()
                .setCustomId(`confirmation-${nonce}-yes`)
                .setLabel(confirmLabel)
                .setStyle(Discord.ButtonStyle.Danger),
            new Discord.ButtonBuilder()
                .setCustomId(`confirmation-${nonce}-no`)
                .setLabel(cancelLabel)
                .setStyle(Discord.ButtonStyle.Secondary)
        );

        const embed = {
            color: (client ?? this.client).data.embedColor,
            title,
            description: body,
            footer: { text: `This asks once, and gives up after ${Math.round(ttl / 1000)} seconds.` }
        };

        let prompt = null;

        if (interaction) {
            await interaction
                .editReply({
                    embeds: [embed],
                    components: [row]
                })
                .catch(this.client.swallow('confirm: editReply'));

            prompt = await interaction.fetchReply().catch(() => null);
        } else {
            prompt = await this.client.send(message.channel, null, [embed], null, null, [row]);
        }

        if (!prompt?.createMessageComponentCollector) {
            return false;
        }

        const asker = message?.author?.id ?? interaction?.user?.id ?? null;

        const pressed = await prompt
            .awaitMessageComponent({
                filter: (press) => press.customId.startsWith(`confirmation-${nonce}-`) && press.user.id === asker,
                time: ttl
            })
            .catch(() => null);

        const answered = pressed?.customId === `confirmation-${nonce}-yes`;

        if (pressed) {
            await pressed
                .update({
                    embeds: [
                        {
                            ...embed,
                            description: answered ? `${body}\n\n**Confirmed.**` : `${body}\n\n**Cancelled.**`,
                            footer: undefined
                        }
                    ],
                    components: []
                })
                .catch(this.client.swallow('confirm: update'));
        } else if (interaction) {
            await interaction
                .editReply({
                    embeds: [
                        {
                            ...embed,
                            description: `${body}\n\n**Timed out.**`,
                            footer: undefined
                        }
                    ],
                    components: []
                })
                .catch(this.client.swallow('confirm: expire'));
        } else {
            await this.client.delete(prompt).catch(this.client.swallow('confirm: expire'));
        }

        return answered;
    }

    inlineText(text, options) {
        return inlineText(text, options);
    }

    describeMessage(message, options) {
        return describeMessage(message, options);
    }

    firstLetterUp(string) {
        try {
            return `${string.charAt(0).toUpperCase()}${string.slice(1)}`;
        } catch {
            return string;
        }
    }

    editDistance(a, b, budget = Infinity) {
        if (a === b) {
            return 0;
        }

        if (Math.abs(a.length - b.length) > budget) {
            return budget + 1;
        }

        let previous = Array.from({ length: b.length + 1 }, (_, i) => i);

        for (let i = 1; i <= a.length; i++) {
            const current = [i];

            let rowBest = i;

            for (let j = 1; j <= b.length; j++) {
                const cost = a[i - 1] === b[j - 1] ? 0 : 1;

                current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);

                rowBest = Math.min(rowBest, current[j]);
            }

            if (rowBest > budget) {
                return budget + 1;
            }

            previous = current;
        }

        return previous[b.length];
    }

    suggestCommand(input, isOwner = false) {
        const typed = String(input ?? '').toLowerCase();
        if (typed.length < 3) {
            return null;
        }

        const budget = Math.max(2, Math.floor(typed.length / 2));

        let best = null;
        let bestScore = Infinity;

        const consider = (candidate, command, isPrimary) => {
            if (!command || (command.owner && !isOwner)) {
                return;
            }

            const distance = this.editDistance(typed, candidate, budget);

            if (distance > budget) {
                return;
            }

            let shared = 0;

            while (shared < typed.length && shared < candidate.length && typed[shared] === candidate[shared]) {
                shared++;
            }

            const score = distance * 100 - shared * 10 + (isPrimary ? 0 : 1);

            if (score < bestScore) {
                bestScore = score;
                best = command;
            }
        };

        for (const [name, command] of this.client.collections.commands) {
            consider(name, command, true);
        }

        for (const [alias, command] of this.client.collections.aliases) {
            consider(alias, command, false);
        }

        return best;
    }

    norm(string) {
        if (Array.isArray(string)) {
            return ftc(www.weirdToNormalChars(string.join(' ')));
        }

        if (typeof string === 'string') {
            return ftc(www.weirdToNormalChars(string));
        }

        return null;
    }

    getImages(message) {
        return [...(message?.attachments?.values?.() ?? [])]
            .filter((attachment) => this.isImageAttachment(attachment))
            .map((attachment) => attachment.proxyURL ?? attachment.url)
            .filter(Boolean);
    }

    isImageAttachment(attachment) {
        if ((attachment?.contentType ?? '').startsWith('image/')) {
            return true;
        }
        const path = (attachment?.proxyURL ?? attachment?.url ?? '').split('?')[0];

        return /\.(gif|jpe?g|png|webp|bmp|avif|tiff?)$/i.test(path);
    }

    nums(string) {
        try {
            return string.match(/\d+/g)[0];
        } catch {
            return null;
        }
    }

    cstr(str) {
        const escapedChars = ['~', '|', '_', '*', '`'];

        return str ? str.replace(new RegExp(`[${escapedChars.join('\\')}]`, 'g'), '\\$&') : undefined;
    }

    formatDate(date) {
        return date.toISOString().split('.')[0].replaceAll('-', '/').replace('T', '-');
    }

    async getServerCount() {
        const req = await this.client.cluster.fetchClientValues('guilds.cache.size');

        return req.reduce((acc, guildCount) => acc + guildCount, 0);
    }

    async getUserCount() {
        return (
            await this.client.cluster.broadcastEval((c) => {
                return c.guilds.cache
                    .map((g) => {
                        return g.memberCount ?? 0;
                    })
                    .reduce((acc, count) => {
                        return acc + count;
                    }, 0);
            })
        ).reduce((acc, userCount) => acc + userCount, 0);
    }

    async calculateGlobalRank(message, user) {
        const userId = String(user?.id ?? message?.author?.id ?? '');
        const level = Number(user?.lvl) || 0;
        const experience = Number(user?.xp) || 0;

        const ahead = await this.client.module.database
            .aggregateModelData('Profile', [
                {
                    $project: {
                        id: 1,
                        lvl: {
                            $ifNull: ['$lvl', 0]
                        },
                        xp: {
                            $ifNull: ['$xp', 0]
                        }
                    }
                },
                {
                    $match: {
                        $or: [
                            { lvl: { $gt: level } },
                            {
                                lvl: level,
                                xp: { $gt: experience }
                            },
                            {
                                lvl: level,
                                xp: experience,
                                id: { $lt: userId }
                            }
                        ]
                    }
                },
                { $count: 'ahead' }
            ])
            .catch(() => []);

        return (ahead?.[0]?.ahead ?? 0) + 1;
    }

    async fileCount(directory) {
        const files = await this.client.readDir(directory).catch(() => null);

        return files?.length ?? 0;
    }

    nextLevel(level) {
        return Math.floor(74 * Math.pow(1.3, level + 1) * 0.85);
    }

    levelUp(experience, level) {
        let xp = Number.isFinite(experience) ? Math.max(0, experience) : 0;

        let current = Number.isFinite(level) ? Math.max(0, Math.floor(level)) : 0;

        const started = current;

        let cap = this.nextLevel(current);

        while (xp >= cap) {
            xp -= cap;
            current += 1;
            cap = this.nextLevel(current);
        }

        return {
            xp,
            level: current,
            gained: current - started
        };
    }

    symDiff(arr1, arr2) {
        if (arr1.length !== arr2.length) {
            throw new Error('Array length mismatch');
        }

        const final = [];
        const added = [];
        const removed = [];

        for (let i = 0; i < arr1.length; i++) {
            if (arr1.includes(arr2[i])) {
                removed.push(arr2[i]);
                continue;
            }

            added.push(arr2[i]);
            final.push(arr1[i]);
        }

        return added.length > 0 || removed.length > 0 ? [final, added, removed] : null;
    }

    rankedBy(rows, key, tieKey = null) {
        const value = (row, field) => Number(row?.[field]) || 0;

        return [...(rows ?? [])].sort(
            (a, b) =>
                value(b, key) - value(a, key) ||
                (tieKey ? value(b, tieKey) - value(a, tieKey) : 0) ||
                String(a?.id ?? '').localeCompare(String(b?.id ?? ''))
        );
    }

    _updateFileUrl(obj, propertyName, key, serverFiles, serverPath) {
        if (!obj?.[propertyName] || serverFiles.length === 0) {
            return null;
        }

        let file = null;
        switch (typeof obj[propertyName]) {
            case 'string':
                file = serverFiles.find((f) => f.startsWith(obj[propertyName]));
                if (file) {
                    obj[propertyName] = { [key]: `attachment://${file}` };
                } else {
                    return `${propertyName}-${key}-${obj[propertyName]}`;
                }
                break;
            case 'object':
                if (!obj[propertyName][key]) {
                    break;
                }
                file = serverFiles.find((f) => f.startsWith(obj[propertyName][key]));
                if (file) {
                    obj[propertyName][key] = `attachment://${file}`;
                }
                break;
            default:
                break;
        }

        return file
            ? {
                  attachment: `${serverPath}/${file}`,
                  name: file
              }
            : null;
    }

    async generateCustomMessageParts(message, text, embed) {
        const serverPath = `./storage/guilds/${message.guild.id}`;
        const serverExists = await this.client.pathExists(serverPath);
        const serverFiles = serverExists ? await this.client.readDir(`./storage/guilds/${message.guild.id}`) : [];

        const files = [];

        files.push(this._updateFileUrl(embed, 'image', 'url', serverFiles, serverPath));
        files.push(this._updateFileUrl(embed, 'thumbnail', 'url', serverFiles, serverPath));
        files.push(this._updateFileUrl(embed, 'author', 'icon_url', serverFiles, serverPath));
        files.push(this._updateFileUrl(embed, 'footer', 'icon_url', serverFiles, serverPath));

        const attachmentsWithinText = text.match(/\battachment:\/\/\S+\b/g) ?? [];
        for (let i = 0; i < attachmentsWithinText.length; i++) {
            const _fileName = attachmentsWithinText[i].split('://')?.[1] ?? '';
            const fileName = serverFiles.find((f) => f.startsWith(_fileName)) ?? '';

            if (!serverFiles.includes(fileName) || files.find((f) => !!f && f.name === fileName)) {
                continue;
            }

            text = text.replace(attachmentsWithinText[i], '');
            files.push({
                attachment: `${serverPath}/${fileName}`,
                name: fileName
            });
        }

        const error = files.find((f) => typeof f === 'string') ?? null;
        if (error) {
            const errorParts = error.split('-');

            this.client.qEmbed(
                `Error: File name *"${errorParts[2]}"* not found.\nThus property: \`"${errorParts[0]}"\` must be formatted to:\nObject: "${errorParts[2]}" -> { ${errorParts[1]}: "${errorParts[2]}" }`,
                message
            );
            return null;
        }

        const finalText = text.length === 0 ? null : text.trim();
        const finalEmbeds = embed ? [embed] : null;
        const finalFiles = files.filter((f) => f !== null && f !== undefined);

        return finalFiles.length === 0 && !finalText && !finalEmbeds
            ? null
            : [finalText, finalEmbeds, finalFiles.length === 0 ? null : finalFiles];
    }

    isValidEmoji(string, nitroTest) {
        const emojis = this.cleanup(string.split(' '));

        const hasInvalidEmoji = emojis.some((emoji) => {
            if (emoji.match(/^(:[^:\s]+:|<:[^:\s]+:[0-9]+>|<a:[^:\s]+:[0-9]+>)+$/)) {
                return !this.client.emojis.cache.has(emoji.split(':')[2].replace('>', ''));
            } else if (nitroTest) {
                return false;
            }
            return !emoji.match(EMOJIS);
        });

        return hasInvalidEmoji ? [] : emojis;
    }

    checkArrays(arr1, arr2, overwrite) {
        if (arr1.length !== arr2.length && !overwrite) {
            return false;
        }

        for (let i = 0; i < arr1.length; i++) {
            if (typeof arr1[i] !== 'string' || typeof arr2[i] !== 'string') {
                return false;
            }

            if (!arr1[i].toLowerCase().includes(arr2[i].toLowerCase())) {
                return false;
            }
        }

        return true;
    }

    modlogChannels(guild) {
        let channels = [];

        const entries = Object.entries(guild.ml.ev);
        for (const [key, value] of entries) {
            if (!guild.ml.ev[key]) {
                this.client.save(guild.id, {
                    alter: `ml.ev.${key}`,
                    value: {
                        on: false,
                        channel: ''
                    }
                });
            }

            if (value.channel !== '') {
                channels.push(value.channel);
            }
        }

        return [...new Set(channels)].filter((i) => i !== '');
    }

    compareArrays(arr1, arr2) {
        if (!Array.isArray(arr1) || !Array.isArray(arr2)) {
            throw new Error('Both input parameters must be arrays.');
        }

        let added = this.client.imports.lodash.difference(arr2, arr1);
        let removed = this.client.imports.lodash.difference(arr1, arr2);

        return [added.length ? added : null, removed.length ? removed : null];
    }

    cutObjectDataFromArgs(args, obj) {
        if (!args || !Array.isArray(args)) {
            return [];
        }

        if (!obj) {
            return args;
        }

        if (obj instanceof Discord.GuildMember) {
            args = args.slice(
                args[0] === obj.id || args[0] === obj.toString()
                    ? 1
                    : obj?.nickname
                      ? obj.nickname.split(' ').length
                      : obj.user.username.split(' ').length
            );
        }

        if (obj instanceof Discord.User) {
            args = args.slice(args[0] === obj.id || args[0] === obj.toString() ? 1 : obj.username.split(' ').length);
        }

        if (obj instanceof Discord.BaseChannel || obj instanceof Discord.Role) {
            args = args.slice(args[0] === obj.id || args[0] === obj.toString() ? 1 : obj.name.split(' ').length);
        }

        return args;
    }

    flattenArray(inputArray) {
        let result = [];

        inputArray.forEach((item) => {
            if (Array.isArray(item)) {
                result = result.concat(this.flattenArray(item));
            } else {
                result.push(item);
            }
        });

        return result;
    }

    cleanup(array) {
        return array.filter((item) => item !== '');
    }

    removeIndices(arr, indices) {
        return arr.filter((_, index) => !indices.includes(index));
    }

    isSpam(str) {
        if (typeof str !== 'string') {
            throw new TypeError('Input should be a string.');
        }

        const THRESHOLDS = {
            WORD_COUNT: 5,
            MESSAGE_LENGTH: 15,
            WORD_REPETITION: 0.25,
            CHAR_REPETITION: 0.25,
            NEWLINE_REPETITION: 0.15,
            EMOJI_REPETITION: 0.07,
            DISCORD_ID_REPETITION: 0.2,
            SPECIAL_SPAM_RATIO: 2.5
        };

        if (str.length <= THRESHOLDS.MESSAGE_LENGTH || str.split(' ').length <= THRESHOLDS.WORD_COUNT) {
            return false;
        }

        const tokens = natural.PorterStemmer.tokenizeAndStem(str.toLowerCase());
        const tokensWithoutStopwords = stopword.removeStopwords(tokens);

        let specialSpamCount = 0;
        tfidf.addDocument(tokensWithoutStopwords);
        tfidf.listTerms(0).forEach((item) => {
            if (item.tfidf / 2 > THRESHOLDS.WORD_REPETITION) {
                specialSpamCount++;
            }
        });

        const getFrequencyDetails = (array) => {
            const frequencies = this.client.imports.lodash.countBy(array);
            const maxValue = Math.max(...Object.values(frequencies));
            const uniqueCount = Object.keys(frequencies).length;
            return {
                maxValue,
                uniqueCount
            };
        };

        const checkRepetition = (maxValue, uniqueCount, threshold) => maxValue / uniqueCount > threshold;

        const { maxValue: maxWordFreq, uniqueCount: uniqueWords } = getFrequencyDetails(tokens);
        const wordRepetition = checkRepetition(maxWordFreq, uniqueWords, THRESHOLDS.WORD_REPETITION);

        const { maxValue: maxCharFreq, uniqueCount: uniqueChars } = getFrequencyDetails(str);
        const charRepetition = checkRepetition(maxCharFreq, uniqueChars, THRESHOLDS.CHAR_REPETITION);

        const newlineCount = (str.match(/\n/g) || []).length;
        const newlineRepetition = newlineCount / str.length > THRESHOLDS.NEWLINE_REPETITION;

        const emojis = [...str.matchAll(EMOJIS)].map((e) => e[0]);
        const { maxValue: maxEmojiFreq, uniqueCount: uniqueEmojis } = getFrequencyDetails(emojis);
        const emojiRepetition =
            uniqueEmojis > 0 && checkRepetition(maxEmojiFreq, uniqueEmojis, THRESHOLDS.EMOJI_REPETITION);

        const discordIDs = [...str.matchAll(/(?:<@&|<@!|<@|<#)?\b\d{17,21}\b>?/g)].map((e) => e[0]);
        const { maxValue: maxDiscordIDFreq, uniqueCount: uniqueDiscordIDs } = getFrequencyDetails(discordIDs);
        let discordIDRepetitionThreshold = THRESHOLDS.DISCORD_ID_REPETITION;

        if (uniqueDiscordIDs === tokens.length) {
            discordIDRepetitionThreshold += 0.055;
        }
        const discordIDRepetition =
            uniqueDiscordIDs > 3 && checkRepetition(maxDiscordIDFreq, uniqueDiscordIDs, discordIDRepetitionThreshold);

        const conditionsMet = [wordRepetition, charRepetition, newlineRepetition, emojiRepetition, discordIDRepetition];
        const totalConditions = conditionsMet.filter(Boolean).length;

        return totalConditions > 1 || specialSpamCount > tokens.length / THRESHOLDS.SPECIAL_SPAM_RATIO;
    }

    checkPattern(sentence, word) {
        let appearances = 0;

        for (let i = 0; i < word.length; i++) {
            if (sentence.includes(word.slice(0, i) + ' ' + word.slice(i))) {
                appearances++;
            }
        }

        let modifiedWord = '';
        for (let i = 0; i < word.length; i++) {
            modifiedWord = word.slice(0, i) + ' ' + word.slice(i);
            if (sentence.includes(modifiedWord)) {
                appearances++;
            }
        }

        return appearances === 1 || appearances === 2;
    }

    async censorCheck(args, guild, Guild, showWord, test, offender, message) {
        if (!guild.cn.on && !test) {
            return false;
        }

        for (const arg of args) {
            if (arg === undefined || arg === null) {
                return false;
            }
        }

        const spam = guild.cn.li.includes('spam');
        const links = guild.cn.li.includes('links');
        const scams = guild.cn.li.includes('scams');
        const invites = guild.cn.li.includes('invites');

        const replacements = {
            έ: 'e',
            '🇳​​': 'n',
            '🇮​​': 'i',
            '❕': 'i',
            ℹ️: 'i',
            '🇬': 'g',
            '🇪​​': 'e',
            '🇸': 's'
        };

        let bigJoinedArgs = args.join(' ');
        const imageExtRegex = /\.(gif|jpe?g|png|webp|bmp|tiff?|svg|heic|avif|ico)\b/i;

        let smallJoinedArgs = args
            .map((word) => {
                if (isUrl(word) && imageExtRegex.test(word)) {
                    return word.replace(imageExtRegex, '');
                }

                return word;
            })
            .join('');

        const caseSplit = splitStringOnCaseChange(bigJoinedArgs);
        const caseSplitSmall = caseSplit.map((w) => w.toLowerCase());

        for (const [char, replacement] of Object.entries(replacements)) {
            bigJoinedArgs = bigJoinedArgs.replaceAll(char, replacement);
            smallJoinedArgs = smallJoinedArgs.replaceAll(char, replacement);
        }

        bigJoinedArgs = bigJoinedArgs.toLowerCase();
        smallJoinedArgs = smallJoinedArgs.toLowerCase();

        const embedData = (await this.client.stringifyJSON(message?.embeds ?? { test: 'w' })).toLowerCase();

        let result = '';
        for (let i = 0; i < bigJoinedArgs.length; i++) {
            result += numberToLetter[bigJoinedArgs[i]] ?? bigJoinedArgs[i];
        }
        let check = this.smallify(smallJoinedArgs);
        const checks = check.match(/[^iIgG]+/g);
        if (checks) {
            for (const c of checks) {
                if (c.length > 1) {
                    const bucket = new Set(c);

                    for (const z of bucket.keys()) {
                        try {
                            for (const m of check.match(new RegExp(`${z}+`, 'g'))) {
                                check = check.replaceAll(m, z);
                            }
                        } catch {}
                    }
                }
            }
        }

        let checkCopy = '';
        let wordsInside = null;

        let scamLevel = 0;
        const countUrls = (text) => {
            if (!text || typeof text !== 'string') {
                return 0;
            }

            const urlRegex = /(https?:\/\/[^\s)]+)/g;
            return (text.match(urlRegex) || []).length;
        };

        const countMentions = (text) => {
            if (!text || typeof text !== 'string') {
                return 0;
            }

            const mentionRegex = /((<@!?\d+>)|(<@&\d+>)|(@everyone)|(@here))/g;
            return (text.match(mentionRegex) || []).length;
        };

        const countEmojis = (text) => {
            if (!text || typeof text !== 'string') {
                return 0;
            }

            const emojiRegex = /<a?:\w+:\d+>|:\w+:/g;
            return (text.match(emojiRegex) || []).length;
        };

        let complexityScore = 2;

        const messageContent = message?.content || '';
        const textToSearch = `${messageContent} ${embedData}`;

        const contentLength = messageContent.length;
        const numUrls = countUrls(textToSearch);
        const numMentions = countMentions(messageContent);
        const numEmojis = countEmojis(messageContent);
        const hasEmbeds = message?.embeds?.length > 0;
        complexityScore += contentLength > 80 ? 2 : 0;
        complexityScore += contentLength > 250 ? 3 : 0;

        complexityScore += numUrls * 2;

        complexityScore += numMentions * 1.5;

        complexityScore += numEmojis > 6 ? 1 : 0;

        complexityScore += hasEmbeds ? 2 : 0;
        complexityScore = Math.round(complexityScore);
        complexityScore = Math.min(complexityScore, 10);
        complexityScore = Math.max(complexityScore, 2);
        let scamSuspicion = complexityScore;
        for (let i = 0; i < guild.cn.li.length; i++) {
            let word = guild.cn.li[i];

            word = (
                (word[0] === word[word.length - 1]) === '*' ? word.slice(1, word.length - 2).replaceAll('-', ' ') : word
            ).toLowerCase();

            const requirement =
                check.includes(word) ||
                bigJoinedArgs.includes(word) ||
                embedData.includes(word) ||
                caseSplit.includes(word) ||
                caseSplitSmall.includes(word);

            if (!['spam', 'scams', 'links', 'invites'].includes(word) && requirement) {
                if (!wordsInside) {
                    wordsInside = Array.from(getEnglishWords(bigJoinedArgs))
                        .sort((a, b) => {
                            return b.length - a.length;
                        })
                        .filter(
                            (w) =>
                                !['snigger', 'sniggers', 'undefined'].includes(w) &&
                                (w.length < 4 ? ['a', 'in', 'of', 'the'].includes(w) : !word.length < 4) &&
                                !guild.cn.li.includes(w)
                        );

                    checkCopy += check;

                    let guard = bigJoinedArgs;
                    for (const w of wordsInside) {
                        if (guard.includes(w)) {
                            guard = guard.replace(w, '').trim();
                        }

                        if (['', 'a'].includes(guard)) {
                            return false;
                        }
                    }

                    for (const w of wordsInside) {
                        if (checkCopy.includes(w)) {
                            checkCopy = checkCopy.replace(w, '').trim();
                        }

                        if (
                            checkCopy === '' ||
                            (!checkCopy.includes(word) && scams ? !this._scams.find((a) => word.includes(a)) : false)
                        ) {
                            return false;
                        }
                    }
                }
                if (await excused(this.client, guild, word, bigJoinedArgs, message)) {
                    continue;
                }

                return showWord ? word : true;
            }
        }
        if (links) {
            for (let i = 0; i < args.length; i++) {
                const word = args[i];

                if (
                    this.isValidEmoji(word).length === 0 &&
                    isUrl(word) &&
                    (invites
                        ? !['invite', 'invites'].includes(word) &&
                          word.match(
                              /(https?:\/\/|http?:\/\/)?(www.)?(discord.(gg|io|me|li)|discordapp.com\/invite|discord.com\/invite)\/[^\s\/]+?(?=\b)/
                          )
                        : true)
                ) {
                    if (await excused(this.client, guild, 'links', word, message)) {
                        continue;
                    }

                    return showWord ? word : true;
                }
            }
        }

        if (invites) {
            for (let i = 0; i < args.length; i++) {
                const word = args[i];

                if (
                    !['invite', 'invites'].includes(word) &&
                    (word.match(
                        /(https?:\/\/|http?:\/\/)?(www.)?(discord.(gg|io|me|li)|discordapp.com\/invite|discord.com\/invite)\/[^\s\/]+?(?=\b)/
                    ) ||
                        word.match(/(?:https?:\/\/)?(?:www\.)?mee6\.xyz\/([A-Za-z]{1,3})\/i\/(.+)$/))
                ) {
                    if (await excused(this.client, guild, 'invites', word, message)) {
                        continue;
                    }

                    return showWord ? word : true;
                }
            }
        }

        if (spam) {
            if (this.isSpam(bigJoinedArgs) && !(await excused(this.client, guild, 'spam', bigJoinedArgs, message))) {
                return showWord ? 'spam' : true;
            }
        }

        if (scams) {
            let hasLink = false;
            const detected = [];

            for (const arg of args) {
                if (typeof arg !== 'string' || arg.length === 0) {
                    continue;
                }

                for (const link of extractLinks(arg)) {
                    hasLink = true;

                    scamLevel++;
                    scamSuspicion--;

                    detected.push(link);
                }
            }

            if (!hasLink || (hasLink && args.length < 3)) {
                scamSuspicion += 30;
            }

            let scamCounts = {};

            for (const arg of args) {
                const word = arg.toLowerCase();
                for (const scam of this._scams) {
                    const embedCount = countOccurrences(embedData, scam);

                    const contentCount = countOccurrences(message?.content?.toLowerCase(), scam);
                    const wordCount = countOccurrences(word, scam);

                    const currentScamPatternTotalCount = embedCount + contentCount + wordCount;

                    if (currentScamPatternTotalCount > 0) {
                        scamLevel += currentScamPatternTotalCount;

                        if (scamCounts[scam]) {
                            scamCounts[scam] += currentScamPatternTotalCount;
                        } else {
                            scamCounts[scam] = currentScamPatternTotalCount;
                        }

                        if (scamLevel > scamSuspicion) {
                            for (const key of Object.keys(scamCounts)) {
                                if (scamCounts[key] > 5 && !hasLink) {
                                    return false;
                                }
                            }

                            const detectedList = Object.entries(scamCounts)
                                .map(([s, count]) => {
                                    return `- \`${s}${count > 1 ? ' X' + count : ''}\``;
                                })
                                .join('\n');

                            if (await excused(this.client, guild, 'scams', bigJoinedArgs, message)) {
                                return false;
                            }

                            return showWord
                                ? `Multiple detections [Suspicion: ${scamLevel}/${scamSuspicion}]:\n${detected.join('\n')}${
                                      detected.length > 0 && detectedList.length > 0 ? '\n' : ''
                                  }${detectedList}`
                                : true;
                        }
                    }
                }
            }
        }

        return false;
    }

    async isSuspiciousUser(guild, message) {
        if (!guild?.rd?.tr) {
            return false;
        }

        const store = this.client.data.raidPrevention?.[guild.id];
        const suspects = Array.isArray(store?.suspects) ? store.suspects : [];

        if (!suspects.includes(message.author.id)) {
            return false;
        }

        await this.client.delete(message).catch(this.client.swallow('isSuspiciousUser: delete'));

        return true;
    }

    async isBlacklisted(id) {
        return this.blacklisted(id);
    }

    blacklisted(id) {
        if (!id) {
            return 0;
        }

        const blacklist = this.client.data.blacklist;

        if (!blacklist?.loaded) {
            return 0;
        }

        const key = String(id);

        if (this.client.isOwner(key)) {
            return 0;
        }

        if (blacklist.enforced.has(key)) {
            return 2;
        }

        return blacklist.grace.has(key) ? 1 : 0;
    }

    blacklistEntry(id) {
        return this.client.data.blacklist?.entries?.find((entry) => entry.id === String(id)) ?? null;
    }

    isExempt(guild, message, member) {
        if (!message?.member && !member) {
            return false;
        }

        if (guild.mbr.ex.includes(message ? message.author.id : member.user.id)) {
            return true;
        }

        return member
            ? guild.mbr.ex.some((roleID) => member.roles.cache.has(roleID))
            : guild.mbr.ex.some((roleID) => message.member.roles.cache.has(roleID));
    }

    isGranted(guild, message, commandName) {
        const list = guild?.cmd?.gr?.[commandName];

        if (!Array.isArray(list) || list.length === 0) {
            return false;
        }

        const userId = message?.author?.id ?? message?.member?.user?.id;

        if (userId && list.includes(userId)) {
            return true;
        }

        const member = message?.member;

        return member ? list.some((id) => member.roles.cache.has(id)) : false;
    }

    tag(user) {
        const account = user?.user ?? user;

        if (!account?.username) {
            return 'Unknown user';
        }

        const discriminator = account.discriminator;

        return discriminator && discriminator !== '0' ? `${account.username}#${discriminator}` : account.username;
    }

    async recordMemberNames(member) {
        const client = this.client;

        if (!member?.user || member.user.bot || !member.guild) {
            return;
        }

        const doc = await client.module.database.Member(member.user.id, member.guild.id);
        const history = Array.isArray(doc?.nh) ? doc.nh : [];

        const known = new Set(history.map((entry) => `${entry.k}\0${entry.n}`));

        const now = Date.now();
        const additions = [];

        for (const [kind, name] of [
            ['u', member.user.username],
            ['d', member.user.globalName],
            ['n', member.nickname]
        ]) {
            if (!name || known.has(`${kind}\0${name}`)) {
                continue;
            }

            known.add(`${kind}\0${name}`);
            additions.push({
                n: String(name),
                k: kind,
                t: now
            });
        }

        if (!additions.length) {
            return;
        }

        await client.saveMember(member.guild.id, member.user.id, {
            alter: 'nh',
            value: [...history, ...additions].slice(-NAME_HISTORY_LIMIT)
        });
    }

    async memberNameIndex(guildId, names) {
        const wanted = new Set(
            (names ?? [])
                .map((name) =>
                    String(name ?? '')
                        .trim()
                        .toLowerCase()
                )
                .filter(Boolean)
        );
        const index = new Map();

        if (!wanted.size) {
            return index;
        }

        const members = await this.client.module.database.findMembersByName(guildId, [...wanted]).catch(() => []);

        for (const doc of members ?? []) {
            for (const entry of doc.nh ?? []) {
                if (!entry?.n) {
                    continue;
                }

                const key = String(entry.n).toLowerCase();
                if (!wanted.has(key)) {
                    continue;
                }

                const hits = index.get(key) ?? [];
                if (!hits.some((hit) => hit.id === doc.id)) {
                    hits.push({
                        id: doc.id,
                        matched: entry.n,
                        kind: entry.k,
                        t: entry.t
                    });
                }

                index.set(key, hits);
            }
        }

        return index;
    }

    async resolveMemberByName(guildId, query) {
        const raw = String(query ?? '').trim();

        if (!raw) {
            return null;
        }
        const id = raw.match(/\b\d{17,20}\b/)?.[0];
        if (id) {
            return {
                id,
                matched: null,
                kind: null,
                consumed: 1,
                ambiguous: []
            };
        }

        const hits = (await this.memberNameIndex(guildId, [raw])).get(raw.toLowerCase());

        if (!hits?.length) {
            return null;
        }
        if (hits.length > 1) {
            return {
                id: null,
                matched: raw,
                kind: null,
                consumed: 1,
                ambiguous: hits
            };
        }

        return {
            ...hits[0],
            consumed: 1,
            ambiguous: []
        };
    }

    async resolveTargetFromArgs(guildId, args) {
        const id = String(args?.[0] ?? '').match(/\b\d{17,20}\b/)?.[0];

        if (id) {
            return {
                id,
                matched: null,
                kind: null,
                consumed: 1,
                ambiguous: []
            };
        }

        if (!args?.length) {
            return null;
        }
        const candidates = [];

        for (let length = Math.min(args.length, 6); length >= 1; length--) {
            candidates.push({
                name: args.slice(0, length).join(' '),
                length
            });
        }

        const index = await this.memberNameIndex(
            guildId,
            candidates.map((candidate) => candidate.name)
        );
        for (const { name, length } of candidates) {
            const hits = index.get(name.toLowerCase());

            if (!hits?.length) {
                continue;
            }

            if (hits.length > 1) {
                return {
                    id: null,
                    matched: name,
                    kind: null,
                    consumed: length,
                    ambiguous: hits
                };
            }

            return {
                ...hits[0],
                consumed: length,
                ambiguous: []
            };
        }

        return null;
    }

    async banCase(guildId, userId) {
        if (!guildId || !userId) {
            return null;
        }

        const cases = await this.client.module.database.casesOf(guildId, userId).catch(() => []);

        return cases.find((record) => BAN_CASES.includes(record.ty)) ?? null;
    }

    async muteCase(guildId, userId) {
        if (!guildId || !userId) {
            return null;
        }

        const cases = await this.client.module.database.casesOf(guildId, userId).catch(() => []);

        return cases.find((record) => record.ty === 'mute') ?? null;
    }

    isAllowedUser(guild, message) {
        if (guild.mbr.el.includes(message.author.id)) {
            return 1;
        }

        for (let i = 0; i < guild.mbr.el.length; i++) {
            if (message?.member?.roles?.cache.has(guild.mbr.el[i])) {
                return 1;
            }
        }

        if (guild.mbr.el.length === 0) {
            return -1;
        }

        return 0;
    }

    isNormalChannel(string) {
        if (['<id:guide>', '<id:customize>', '<id:browse>'].includes(string)) {
            return false;
        }

        return true;
    }

    isRestricted(guild, channelId) {
        return guild.ch.t.rs.includes(channelId);
    }

    _getTimeRecursive(str, number, format, LIMIT = 1) {
        if (LIMIT >= 50) {
            this.client.log(`_getTimeRecursive LIMIT [${LIMIT}] reached!`, str, number, format);

            return false;
        }

        if (!number) {
            return false;
        }

        str = str.substring(str.indexOf(number) + number.toString().length);

        const match = str.match(/\d+/g) ?? null;

        if ((str.includes(format) || str.length < 2) && !match?.[0]) {
            return number;
        }

        if (str.indexOf(format) < str.indexOf(match?.[0])) {
            return false;
        }

        return this._getTimeRecursive(str, match?.[0], format, ++LIMIT);
    }

    getTime(arr, getIndices = false) {
        if (!arr || arr.length === 0) {
            return null;
        }

        arr = arr.map((w) => w.toLowerCase());
        const stringJoined = arr.join('');
        if (getIndices) {
            let indices = [];
            let timeGotten = false;

            for (let i = 0; i < arr.length; i++) {
                if (/\d+/.test(arr[i]) && !timeGotten) {
                    indices.push(i);
                    timeGotten = true;
                }

                if (timeTable.includes(arr[i].replace(/\d+/g, ''))) {
                    indices.push(i);
                }
            }

            return indices.length ? Array.from(new Set(indices)) : [];
        }
        let time = Number(stringJoined.match(/\d+/)?.[0]) ?? 0;

        const condition1 =
            stringJoined.includes('day') ||
            stringJoined.includes('year') ||
            stringJoined.includes('hour') ||
            stringJoined.includes('month') ||
            stringJoined.includes('minute') ||
            stringJoined.includes('second');

        const condition2 =
            stringJoined.includes('days') ||
            stringJoined.includes('years') ||
            stringJoined.includes('hours') ||
            stringJoined.includes('months') ||
            stringJoined.includes('minutes') ||
            stringJoined.includes('seconds');

        if (isNaN(time) || time === 0) {
            if (condition1) {
                time = 1;
            } else if (condition2) {
                return undefined;
            }
        }

        let timeFormat = '';

        const stringJoinedWithSpaces = arr.join(' ').replace(/[\n|\t|\r]/g, '');
        for (let i = 0; i < timeTable.length; i++) {
            if (stringJoined.includes(timeTable[i])) {
                const prayer = this._getTimeRecursive(stringJoinedWithSpaces, time, timeTable[i]);

                if (prayer !== false) {
                    time = prayer;
                }

                for (const word of arr) {
                    if (word.replace(/\d+/g, '') === timeTable[i]) {
                        timeFormat = timeTable[i];
                        break;
                    }
                }
            }
        }
        if (timeFormat) {
            switch (timeFormat) {
                case 'm':
                case 'min':
                case 'mins':
                case 'minute':
                case 'minutes':
                    time *= 60;
                    break;
                case 'h':
                case 'hr':
                case 'hour':
                case 'hours':
                    time *= 60 * 60;
                    break;
                case 'd':
                case 'day':
                case 'days':
                    time *= 60 * 60 * 24;
                    break;
                case 'w':
                case 'week':
                case 'weeks':
                    time *= 60 * 60 * 24 * 7;
                    break;
                case 'mon':
                case 'month':
                case 'months':
                    time *= 60 * 60 * 24 * 30;
                    break;
                case 'y':
                case 'year':
                case 'years':
                    time *= 60 * 60 * 24 * 365;
                    break;
                default:
                    break;
            }
        }

        return time * 1000;
    }

    async sleep(ms) {
        await new Promise((resolve) => setTimeout(resolve, ms));
    }

    createDescription(text, embed, limit = 4500, nullFields) {
        text = text.slice(0, limit);
        embed.description = text.slice(0, 2048);

        if (!embed.fields) {
            embed.fields = [];
        }

        if (text.length > 2048) {
            let i = 0;
            while (true) {
                const start = 2048 + i * 1024;

                if (start >= text.length || embed.fields.length > 6) {
                    break;
                }

                embed.fields.push({
                    name: `Continuation #${i + 1}`,
                    value: text.slice(start, start + 1024)
                });
                i++;
            }
        }

        if (nullFields && embed.fields.length === 0) {
            embed.fields = null;
        }

        if (embed.description.length < 3) {
            embed.description = 'None.';
        }

        return embed;
    }

    interactionReplySpecial(message, interaction, override, overwrites, doNotDelete, followUp) {
        const deliver = (payload) => {
            if (followUp || interaction.replied) {
                return interaction.followUp(payload);
            }

            if (interaction.deferred) {
                const { flags, ...rest } = payload;

                return interaction.editReply(rest);
            }

            return interaction.reply(payload);
        };

        if (typeof message === 'object') {
            return deliver(message)
                .then((m) => {
                    setTimeout(() => {
                        if (!doNotDelete) {
                            this.client.delete(m);
                        }
                    }, 30 * 1000);

                    return m;
                })
                .catch((e) => this.client.log(e));
        }

        let returnObject = Object.assign(this.client.qEmbed(message, interaction), {
            flags: Discord.MessageFlags.Ephemeral
        });

        if (overwrites) {
            returnObject = Object.assign(returnObject, overwrites);
        }

        if (override) {
            return returnObject;
        }

        return deliver(returnObject)
            .then((m) => {
                setTimeout(() => {
                    if (!doNotDelete) {
                        this.client.delete(m);
                    }
                }, 30 * 1000);

                return m;
            })
            .catch((e) => this.client.log(e));
    }

    reverseObject(obj) {
        let reversedObj = {};

        for (let key in obj) {
            reversedObj[obj[key]] = key;
        }

        return reversedObj;
    }

    _id(input) {
        if (input === null || input === undefined) {
            return null;
        }

        return String(input).match(/\d{16,22}/)?.[0] ?? null;
    }

    _cut(args, index, obj) {
        if (
            !Array.isArray(args) ||
            !obj ||
            index === null ||
            index === undefined ||
            index < 0 ||
            index >= args.length
        ) {
            return args;
        }

        const token = args[index];
        const byRef =
            token === obj.id ||
            (typeof obj.toString === 'function' && token === obj.toString()) ||
            this._id(token) === obj.id;

        let count = 1;

        if (!byRef) {
            const name =
                obj instanceof Discord.GuildMember
                    ? (obj.nickname ?? obj.user?.username ?? '')
                    : obj instanceof Discord.User
                      ? (obj.username ?? '')
                      : (obj.name ?? '');

            count = name ? name.split(' ').length : 1;
        }

        args.splice(index, count);
        return args;
    }

    _afterResolve(result, args, index, options) {
        if (result && options?.cut) {
            this._cut(args, index, result);
        }

        return result;
    }

    async member(message, args, index = 0, options = {}) {
        return this._afterResolve(await this._resolveMember(message, args, index), args, index, options);
    }

    async _resolveMember(message, args, index = 0) {
        if (!message?.guild || !args?.length) {
            return null;
        }

        index = index ?? 0;
        if (message.interaction) {
            return this.client.getMember(message.guild, this._id(args[index]) ?? args[index]);
        }
        const id = this._id(args[index]);
        if (id) {
            const byId = await this.client.getMember(message.guild, id);
            if (byId) {
                return byId;
            }
        }
        const mentioned = message.mentions?.members?.at(index) ?? message.mentions?.members?.first();
        if (mentioned) {
            return mentioned;
        }
        for (const raw of [args[index], args.slice(index).join(' ')]) {
            const query = raw
                ?.replace(/@/g, '')
                .replace(/#\d{1,4}$/g, '')
                .trim();
            if (!query) {
                continue;
            }

            const results = await message.guild.members
                .search({
                    query,
                    limit: 20,
                    cache: true
                })
                .catch(() => null);

            if (!results?.size) {
                continue;
            }

            if (results.size === 1) {
                return results.first();
            }

            const match = results.find(
                (m) =>
                    (m.nickname && this.checkArrays(m.nickname.split(' '), args, true)) ||
                    (m.user?.globalName && this.checkArrays(m.user.globalName.split(' '), args, true)) ||
                    (m.user?.username && this.checkArrays([m.user.username], args, true))
            );

            if (match) {
                return match;
            }
        }

        return null;
    }

    async auditSnapshot(guild, { force = false } = {}) {
        this._auditSnapshots ??= new Map();

        const cached = this._auditSnapshots.get(guild.id);

        if (!force && cached && Date.now() - cached.at < AUDIT_SNAPSHOT_TTL) {
            return {
                at: cached.at,
                entries: await cached.promise
            };
        }

        const route = `servers/guild:${guild.id}/auditLog`;

        const promise = new Promise((resolve) => {
            const promiseFunc = () =>
                guild.fetchAuditLogs({
                    cache: true,
                    limit: AUDIT_SNAPSHOT_LIMIT
                });

            const eventId = this.client.module.rl.handleEvent(route, promiseFunc, AUDIT_INTERVAL, {
                emptyCountThreshold: 10,
                guildSize: guild?.memberCount ?? 1
            });

            this.client.module.rl
                .getResult(route, eventId, AUDIT_PATIENCE)
                .then((logs) => resolve(logs?.entries ?? null))
                .catch(() => resolve(null));
        });

        const record = {
            at: Date.now(),
            promise
        };

        this._auditSnapshots.set(guild.id, record);

        return {
            at: record.at,
            entries: await promise
        };
    }

    async auditLog(guild, eventName, options = {}) {
        const { maxAge = 15_000 } = options;

        if (!guild?.members?.me?.permissions?.has(Discord.PermissionFlagsBits.ViewAuditLog)) {
            return null;
        }

        const wantedAction = Discord.AuditLogEvent[eventName];

        if (wantedAction === undefined) {
            return null;
        }

        let snapshot = await this.auditSnapshot(guild);
        let auditLogs = snapshot.entries;

        let match = this._findAuditEntry(auditLogs, wantedAction, maxAge, options);

        if (!match && Date.now() - snapshot.at > AUDIT_SNAPSHOT_FRESH) {
            snapshot = await this.auditSnapshot(guild, { force: true });
            auditLogs = snapshot.entries;
            match = this._findAuditEntry(auditLogs, wantedAction, maxAge, options);
        }

        if (options.rawTarget) {
            return match?.target ?? null;
        }

        if (options.rawAuthor) {
            return match?.executor ?? null;
        }

        return match ?? null;
    }

    _findAuditEntry(entries, wantedAction, maxAge, options) {
        if (!entries) {
            return null;
        }

        return (
            entries.find((entry) => {
                if (entry.action !== wantedAction) {
                    return false;
                }

                if (maxAge && Date.now() - entry.createdTimestamp > maxAge) {
                    return false;
                }

                if (options.changes && !(entry.changes?.length > 0)) {
                    return false;
                }

                const targetMatches = options.target ? options.target.id === entry.targetId : null;

                const authorMatches = options.author ? options.author.id === entry.executorId : null;

                if (options.either) {
                    return targetMatches === null && authorMatches === null ? true : !!targetMatches || !!authorMatches;
                }

                return (targetMatches ?? true) && (authorMatches ?? true);
            }) ?? null
        );
    }

    async auditActor(guild, eventName, targetId, options = {}) {
        const { maxAge = 15_000, changed = null } = options;

        if (!guild?.members?.me?.permissions?.has(Discord.PermissionFlagsBits.ViewAuditLog)) {
            return null;
        }

        const wantedAction = Discord.AuditLogEvent[eventName];

        if (wantedAction === undefined) {
            return null;
        }

        const find = (entries) =>
            entries?.find(
                (e) =>
                    e.action === wantedAction &&
                    e.targetId === targetId &&
                    Date.now() - e.createdTimestamp <= maxAge &&
                    (!changed || e.changes?.some((change) => change.key === changed))
            ) ?? null;

        let snapshot = await this.auditSnapshot(guild);
        let entry = find(snapshot.entries);

        if (!entry && Date.now() - snapshot.at > AUDIT_SNAPSHOT_FRESH) {
            snapshot = await this.auditSnapshot(guild, { force: true });
            entry = find(snapshot.entries);
        }

        return entry
            ? {
                  executor: entry.executor ?? null,
                  entry
              }
            : null;
    }

    role(message, args, index = 0, options = {}) {
        return this._afterResolve(this._resolveRole(message, args, index), args, index, options);
    }

    _resolveRole(message, args, index = 0) {
        if (!message?.guild || !args?.length) {
            return null;
        }

        index = index ?? 0;

        const id = this._id(args[index]);
        if (id) {
            const byId = message.guild.roles.cache.get(id);
            if (byId) {
                return byId;
            }
        }

        const mention = message.mentions?.roles?.at(index) ?? message.mentions?.roles?.first();
        if (mention) {
            return mention;
        }

        const name = args.slice(index).join(' ').replace(/^@/, '').trim().toLowerCase();
        if (name) {
            return (
                message.guild.roles.cache.find((r) => r.name.toLowerCase() === name) ??
                message.guild.roles.cache.find((r) => r.name.toLowerCase().includes(name)) ??
                null
            );
        }

        return null;
    }

    async user(message, args, index = 0, options = {}) {
        return this._afterResolve(await this._resolveUser(message, args, index), args, index, options);
    }

    async _resolveUser(message, args, index = 0) {
        index = index ?? 0;
        const id = this._id(args?.[index]);
        if (id) {
            const byId = await this.client.getUser(id);
            if (byId) {
                return byId;
            }
        }
        const member = await this._resolveMember(message, args, index);
        if (member?.user) {
            return member.user;
        }

        return message.mentions?.users?.at(index) ?? message.mentions?.users?.first() ?? null;
    }

    async channel(message, args, index = 0, options = {}) {
        return this._afterResolve(
            await this._resolveChannel(message, args, index, options?.type ?? null),
            args,
            index,
            options
        );
    }

    async _resolveChannel(message, args, index = 0, type = null) {
        if (!message?.guild) {
            return null;
        }

        index = index ?? 0;
        const id = this._id(args?.[index]);
        let result = id ? message.guild.channels.cache.get(id) : null;

        if (!result && id) {
            result = await message.guild.channels.fetch(id).catch(() => null);
        }
        result ??=
            (message.mentions?.channels?.size > 0
                ? (message.mentions.channels.at(index) ?? message.mentions.channels.first())
                : null) ?? null;
        if (!result) {
            const name = args?.[index]?.toLowerCase().replace(/^#/, '');
            result = name ? (message.guild.channels.cache.find((c) => c.name?.toLowerCase() === name) ?? null) : null;
        }
        if (result && type !== null) {
            const types = Array.isArray(type) ? type : [type];
            if (!types.includes(result.type)) {
                return null;
            }
        }

        return result;
    }

    textChannel(message, args, index = 0, options = {}) {
        return this.channel(message, args, index, {
            ...options,
            type: [Discord.ChannelType.GuildText, Discord.ChannelType.GuildAnnouncement]
        });
    }

    voiceChannel(message, args, index = 0, options = {}) {
        return this.channel(message, args, index, {
            ...options,
            type: [Discord.ChannelType.GuildVoice, Discord.ChannelType.GuildStageVoice]
        });
    }

    category(message, args, index = 0, options = {}) {
        return this.channel(message, args, index, {
            ...options,
            type: Discord.ChannelType.GuildCategory
        });
    }

    async emoji(message, args, index = 0, options = {}) {
        return this._afterResolve(await this._resolveEmoji(message, args, index), args, index, options);
    }

    async _resolveEmoji(message, args, index = 0) {
        index = index ?? 0;

        const input = args?.[index];
        if (!input) {
            return null;
        }

        const id = this._id(input);
        if (id) {
            const byId =
                message?.guild?.emojis?.cache.get(id) ??
                this.client.emojis.cache.get(id) ??
                (message?.guild ? await message.guild.emojis.fetch(id).catch(() => null) : null);

            if (byId) {
                return byId;
            }
        }

        const name = String(input)
            .replace(/^<a?:/, '')
            .replace(/:\d+>$/, '')
            .replace(/:/g, '');
        return (
            message?.guild?.emojis?.cache.find((e) => e.name === name) ??
            this.client.emojis.cache.find((e) => e.name === name) ??
            null
        );
    }

    async sticker(message, args, index = 0, options = {}) {
        return this._afterResolve(await this._resolveSticker(message, args, index), args, index, options);
    }

    async _resolveSticker(message, args, index = 0) {
        index = index ?? 0;

        if (message?.stickers?.size) {
            return message.stickers.first();
        }

        if (!message?.guild) {
            return null;
        }

        const id = this._id(args?.[index]);
        if (id) {
            const byId =
                message.guild.stickers.cache.get(id) ?? (await message.guild.stickers.fetch(id).catch(() => null));

            if (byId) {
                return byId;
            }
        }

        const name = args?.[index]?.toLowerCase();
        return name ? (message.guild.stickers.cache.find((s) => s.name.toLowerCase() === name) ?? null) : null;
    }

    guild(message, args, index = 0, options = {}) {
        return this._afterResolve(this._resolveGuild(message, args, index), args, index, options);
    }

    _resolveGuild(message, args, index = 0) {
        index = index ?? 0;

        const id = this._id(args?.[index]);
        if (id) {
            const byId = this.client.guilds.cache.get(id);
            if (byId) {
                return byId;
            }
        }

        const name = args?.slice(index).join(' ').trim().toLowerCase();
        if (!name) {
            return null;
        }

        return (
            this.client.guilds.cache.find((g) => g.name.toLowerCase() === name) ??
            this.client.guilds.cache.find((g) => g.name.toLowerCase().includes(name)) ??
            null
        );
    }

    async message(message, args, index = 0, options = {}) {
        return this._afterResolve(await this._resolveMessage(message, args, index), args, index, options);
    }

    async _resolveMessage(message, args, index = 0) {
        index = index ?? 0;

        const input = args?.[index];
        if (!input) {
            return null;
        }

        const link = String(input).match(/channels\/(?:\d+|@me)\/(\d{16,22})\/(\d{16,22})/);
        if (link) {
            const channel =
                this.client.channels.cache.get(link[1]) ??
                (await this.client.channels.fetch(link[1]).catch(() => null));

            return channel ? this.client.getMessage(channel, link[2]) : null;
        }

        const id = this._id(input);
        return id && message?.channel ? this.client.getMessage(message.channel, id) : null;
    }

    takeNoAppeal(reason = '') {
        const text = String(reason ?? '');
        const pattern = inLine(NO_APPEAL_TOKEN);

        if (!pattern.test(text)) {
            return {
                reason: text,
                silent: false
            };
        }

        return {
            reason: text
                .replace(new RegExp(pattern.source, 'gi'), ' ')
                .replace(/\s{2,}/g, ' ')
                .trim(),
            silent: true
        };
    }

    takeSync(reason = '') {
        const text = String(reason ?? '');
        const pattern = inLine(SYNC_TOKEN);

        if (!pattern.test(text)) {
            return {
                reason: text,
                sync: false
            };
        }

        return {
            reason: text
                .replace(new RegExp(pattern.source, 'gi'), ' ')
                .replace(/\s{2,}/g, ' ')
                .trim(),
            sync: true
        };
    }

    async sendBanNotice(guild, user, { message = null, reason = '', num = null } = {}) {
        const client = this.client;
        const invite = await appealInvite(client, guild).catch(() => null);

        let text = null;
        let embeds = null;
        let files = null;

        if (guild?.bnm?.on && guild.bnm.dt && message) {
            const parts = await new client.class.customEmbed(client)
                .fullRoutine(message, guild.bnm.dt.split(' '), guild, {
                    preset: true,
                    noChannel: true,
                    valuesOnly: true,
                    ignoreEmbed: true
                })
                .catch(() => null);

            const fill = (value) =>
                value
                    .replaceAll('|U|', client.utils.tag(user))
                    .replaceAll('|G|', message.guild.name)
                    .replaceAll('|R|', reason || 'No reason given.')
                    .replaceAll('|CN|', num ? String(num) : '');

            if (parts) {
                text = parts[0] ? fill(parts[0]) : null;
                embeds = parts[1]?.length ? await client.parseJSON(fill(await client.stringifyJSON(parts[1]))) : null;
                files = parts[2] ?? null;
            }
        }

        if (invite) {
            const appeal = {
                color: client.data.embedColor,
                title: 'Appeal this ban',

                description: `You have been banned from **${guild.name ?? message?.guild?.name ?? 'the server'}**.${
                    num ? ` **[Case #${num}]**` : ''
                }\n\nIf you want to argue your case, you can appeal it here:\n${invite}${
                    num ? `\n\nQuote **case #${num}** when you appeal.` : ''
                }`,
                footer: client.data.footer
            };

            embeds = [...(embeds ?? []), appeal];
        }

        if (!text && !embeds?.length) {
            return {
                sent: false,
                appeal: invite
            };
        }

        const sent = await client
            .send(user, text, embeds, files)
            .then(() => true)
            .catch(() => false);

        return {
            sent,
            appeal: invite
        };
    }

    async rankCard(message) {
        this.client.imports.canvacord.RankCardBuilder;
    }

    async welcomerCard(message) {}
}
