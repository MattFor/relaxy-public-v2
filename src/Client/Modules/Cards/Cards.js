'use strict';
import {
    createCanvas,
    loadImage,
    registerFont
} from 'canvas';

import { CDN }             from '../../../Assets/CDN.js';
import { renderOffThread } from './CardPool.js';

const DISPLAY = 'RelaxyDisplay';
const TEXT = 'RelaxyText';
const BRAND = '#FF6974';
const PINK = '#FF69B4';
const PINK_SOFT = '#FFA6D2';
const GOOD = '#43B581';
const BAD = '#ED4245';
const INK = '#0E0F13';
const MUTE = 'rgba(255,255,255,0.62)';

const ordinal = n =>
{
    const num = Number(n);

    if (!Number.isFinite(num))
    {
        return String(n);
    }

    const abs = Math.abs(Math.trunc(num));
    const tens = abs % 100;
    const ones = abs % 10;
    const suffix = (tens >= 11 && tens <= 13)
        ? 'th'
        : ones === 1
            ? 'st'
            : ones === 2
                ? 'nd'
                : ones === 3
                    ? 'rd'
                    : 'th';

    return `${num}${suffix}`;
};
let _fontsRegistered = false;

export function registerCardFonts()
{
    if (_fontsRegistered)
    {
        return true;
    }

    let ok = true;

    try
    {
        registerFont(CDN.fonts.impact, { family: DISPLAY });
    }
    catch
    {
        ok = false;
    }
    try
    {
        registerFont(CDN.fonts.geist, { family: TEXT });
    }
    catch
    {
        ok = false;
    }

    _fontsRegistered = ok;

    return ok;
}

registerCardFonts();
const HEX = /^#?[0-9a-f]{3}(?:[0-9a-f]{3})?$/i;
const colour = (c, fallback) =>
{
    if (typeof c !== 'string' || !HEX.test(c.trim()))
    {
        return fallback;
    }

    const h = c.trim();
    return h.startsWith('#')
        ? h
        : `#${h}`;
};
const alpha = (hex, a) =>
{
    let h = colour(hex, '#000000').slice(1);
    if (h.length === 3)
    {
        h = h.split('').map(x => x + x).join('');
    }
    const n = parseInt(h, 16);
    return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
};
const loadImg = async src =>
{
    if (!src)
    {
        return null;
    }

    try
    {
        if (Buffer.isBuffer(src))
        {
            return await loadImage(src);
        }

        if (/^https?:\/\//i.test(src))
        {
            const res = await fetch(src);
            if (!res.ok)
            {
                return null;
            }
            return await loadImage(Buffer.from(await res.arrayBuffer()));
        }

        return await loadImage(src);
    }
    catch
    {
        return null;
    }
};
const roundRectPath = (ctx, x, y, w, h, r) =>
{
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + w, y, x + w, y + h, rr);
    ctx.arcTo(x + w, y + h, x, y + h, rr);
    ctx.arcTo(x, y + h, x, y, rr);
    ctx.arcTo(x, y, x + w, y, rr);
    ctx.closePath();
};
const drawCover = (ctx, img, x, y, w, h) =>
{
    const scale = Math.max(w / img.width, h / img.height);
    const dw = img.width * scale;
    const dh = img.height * scale;
    ctx.drawImage(img, x + (w - dw) / 2, y + (h - dh) / 2, dw, dh);
};
const fitFont = (ctx, text, family, max, min, maxWidth) =>
{
    for (let size = max; size >= min; size--)
    {
        ctx.font = `${size}px "${family}"`;
        if (ctx.measureText(text).width <= maxWidth)
        {
            return size;
        }
    }
    return min;
};
const ellipsize = (ctx, text, maxWidth) =>
{
    if (ctx.measureText(text).width <= maxWidth)
    {
        return text;
    }

    let t = text;
    while (t.length > 1 && ctx.measureText(`${t}…`).width > maxWidth)
    {
        t = t.slice(0, -1);
    }
    return `${t}…`;
};
const wrap = (ctx, text, maxWidth, maxLines) =>
{
    const words = String(text ?? '').split(/\s+/).filter(Boolean);
    const lines = [];
    let line = '';

    for (const w of words)
    {
        const next = line
            ? `${line} ${w}`
            : w;
        if (ctx.measureText(next).width > maxWidth && line)
        {
            lines.push(line);
            line = w;
            if (lines.length === maxLines - 1)
            {
                break;
            }
        }
        else
        {
            line = next;
        }
    }

    if (line && lines.length < maxLines)
    {
        lines.push(line);
    }
    const used = lines.join(' ');
    if (used.length < String(text ?? '').replace(/\s+/g, ' ').trim().length)
    {
        lines[lines.length - 1] = ellipsize(ctx, `${lines[lines.length - 1]} …`, maxWidth);
    }

    return lines;
};
const drawAvatar = (ctx, img, cx, cy, r, ring) =>
{
    ctx.save();
    ctx.shadowColor = alpha(ring, 0.55);
    ctx.shadowBlur = 26;
    ctx.beginPath();
    ctx.arc(cx, cy, r + 6, 0, Math.PI * 2);
    ctx.fillStyle = alpha(ring, 0.25);
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.closePath();
    ctx.clip();

    if (img)
    {
        drawCover(ctx, img, cx - r, cy - r, r * 2, r * 2);
    }
    else
    {
        ctx.fillStyle = '#2A2C33';
        ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }

    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r + 4, 0, Math.PI * 2);
    ctx.lineWidth = 7;
    ctx.strokeStyle = ring;
    ctx.stroke();
    ctx.restore();
};
const STATUS_COLOUR = {
    online:  '#43B581',
    idle:    '#FAA61A',
    dnd:     '#ED4245',
    offline: '#747F8D'
};

export class Rank
{
    constructor()
    {
        this.data = {
            avatar:        null,
            displayName:   '',
            username:      'Unknown',
            discriminator: '',
            currentXP:     0,
            requiredXP:    1,
            level:         1,
            rank:          null,
            levelColour:   BRAND,
            rankColour:    BRAND,
            barColour:     BRAND,
            statusColour:  null,
            status:        null,
            background:    null
        };
    }

    setAvatar(v)
    {
        this.data.avatar = v;
        return this;
    }

    setDisplayName(v)
    {
        this.data.displayName = v
            ? String(v)
            : '';
        return this;
    }

    setUsername(v)
    {
        this.data.username = String(v ?? 'Unknown');
        return this;
    }

    setDiscriminator(v)
    {
        this.data.discriminator = v
            ? String(v)
            : '';
        return this;
    }

    setCurrentXP(v)
    {
        this.data.currentXP = Number(v) || 0;
        return this;
    }

    setRequiredXP(v)
    {
        this.data.requiredXP = Number(v) || 1;
        return this;
    }

    setLevel(v)
    {
        this.data.level = Number(v) || 1;
        return this;
    }

    setRank(v)
    {
        this.data.rank = (v === null || v === undefined)
            ? null
            : (Number(v) || 0);
        return this;
    }

    setLevelColor(v)
    {
        this.data.levelColour = colour(v, BRAND);
        return this;
    }

    setRankColor(v)
    {
        this.data.rankColour = colour(v, BRAND);
        return this;
    }

    setProgressBar(v)
    {
        this.data.barColour = colour(v, BRAND);
        return this;
    }

    setCustomStatusColor(v)
    {
        this.data.statusColour = colour(v, BRAND);
        return this;
    }

    setStatus(v)
    {
        this.data.status = v ?? null;
        return this;
    }

    setBackground(type, value)
    {
        this.data.background = {
            type,
            value
        };
        return this;
    }

    async build()
    {
        return renderCard('rank', this.data);
    }

    async _draw()
    {
        const W = 930;
        const H = 280;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');
        const d = this.data;

        const ring = d.statusColour ?? (d.status
            ? STATUS_COLOUR[d.status] ?? BRAND
            : BRAND);

        roundRectPath(ctx, 0, 0, W, H, 34);
        ctx.save();
        ctx.clip();

        const bgImg = d.background?.type === 'IMAGE'
            ? await loadImg(d.background.value)
            : null;

        if (bgImg)
        {
            drawCover(ctx, bgImg, 0, 0, W, H);

            ctx.fillStyle = 'rgba(8,9,13,0.62)';
            ctx.fillRect(0, 0, W, H);
        }
        else if (d.background?.type === 'COLOR')
        {
            ctx.fillStyle = colour(d.background.value, INK);
            ctx.fillRect(0, 0, W, H);
        }
        else
        {
            const g = ctx.createLinearGradient(0, 0, W, H);
            g.addColorStop(0, '#1A1B21');
            g.addColorStop(1, INK);
            ctx.fillStyle = g;
            ctx.fillRect(0, 0, W, H);

            const glow = ctx.createRadialGradient(150, H, 20, 150, H, 520);
            glow.addColorStop(0, alpha(BRAND, 0.28));
            glow.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = glow;
            ctx.fillRect(0, 0, W, H);
        }

        roundRectPath(ctx, 250, 26, W - 290, H - 52, 24);
        ctx.fillStyle = 'rgba(8,9,13,0.42)';
        ctx.fill();

        ctx.restore();

        roundRectPath(ctx, 2, 2, W - 4, H - 4, 32);
        ctx.lineWidth = 3;
        ctx.strokeStyle = alpha(ring, 0.5);
        ctx.stroke();

        const avImg = await loadImg(d.avatar);
        drawAvatar(ctx, avImg, 140, 140, 92, ring);

        if (d.status && STATUS_COLOUR[d.status])
        {
            ctx.beginPath();
            ctx.arc(140 + 66, 140 + 66, 18, 0, Math.PI * 2);
            ctx.fillStyle = INK;
            ctx.fill();
            ctx.beginPath();
            ctx.arc(140 + 66, 140 + 66, 12, 0, Math.PI * 2);
            ctx.fillStyle = d.statusColour ?? STATUS_COLOUR[d.status];
            ctx.fill();
        }

        const x = 275;
        const rightX = W - 42;

        ctx.textBaseline = 'alphabetic';
        ctx.textAlign = 'left';

        const chipY = 92;
        const numFont = `50px "${DISPLAY}"`;
        const labFont = `22px "${TEXT}"`;
        const gap = 34;

        ctx.font = numFont;
        const lvlNum = String(d.level);
        const lvlNumW = ctx.measureText(lvlNum).width;
        ctx.font = labFont;
        const lvlLabW = ctx.measureText('LEVEL').width;
        const levelBlockW = lvlLabW + 8 + lvlNumW;

        let rankTxt = '';
        let rankNumW = 0;
        let rankLabW = 0;
        let rankBlockW = 0;
        if (d.rank !== null)
        {
            rankTxt = `#${d.rank}`;
            ctx.font = numFont;
            rankNumW = ctx.measureText(rankTxt).width;
            ctx.font = labFont;
            rankLabW = ctx.measureText('RANK').width;
            rankBlockW = rankLabW + 8 + rankNumW;
        }

        const chipsW = levelBlockW + (rankBlockW
            ? rankBlockW + gap
            : 0);
        const chipsLeft = rightX - chipsW;

        let cx = chipsLeft;
        if (rankBlockW)
        {
            ctx.font = labFont;
            ctx.fillStyle = MUTE;
            ctx.fillText('RANK', cx, chipY);
            ctx.font = numFont;
            ctx.fillStyle = d.rankColour;
            ctx.fillText(rankTxt, cx + rankLabW + 8, chipY);
            cx += rankBlockW + gap;
        }
        ctx.font = labFont;
        ctx.fillStyle = MUTE;
        ctx.fillText('LEVEL', cx, chipY);
        ctx.font = numFont;
        ctx.fillStyle = d.levelColour;
        ctx.fillText(lvlNum, cx + lvlLabW + 8, chipY);

        const nameMaxW = Math.max(120, chipsLeft - x - 24);

        const displayName = d.displayName || d.username;
        const handle = d.discriminator && ![
            '0',
            '0000'
        ].includes(d.discriminator)
            ? `${d.username}#${d.discriminator}`
            : d.username;
        const showHandle = handle.toLowerCase() !== displayName.toLowerCase();

        const dSize = fitFont(ctx, displayName, TEXT, 46, 24, nameMaxW);
        ctx.font = `${dSize}px "${TEXT}"`;
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(ellipsize(ctx, displayName, nameMaxW),
            x,
            showHandle
                ? 86
                : 100);

        if (showHandle)
        {
            ctx.font = `22px "${TEXT}"`;
            ctx.fillStyle = MUTE;
            ctx.fillText(ellipsize(ctx, `@${handle}`, nameMaxW), x, 116);
        }

        const barX = x;
        const barY = 176;
        const barW = rightX - barX;
        const barH = 34;
        const ratio = Math.max(0, Math.min(1, d.currentXP / (d.requiredXP || 1)));

        roundRectPath(ctx, barX, barY, barW, barH, barH / 2);
        ctx.fillStyle = 'rgba(255,255,255,0.14)';
        ctx.fill();

        if (ratio > 0)
        {
            const fillW = Math.max(barH, barW * ratio);
            roundRectPath(ctx, barX, barY, fillW, barH, barH / 2);
            const g = ctx.createLinearGradient(barX, 0, barX + fillW, 0);
            g.addColorStop(0, alpha(d.barColour, 0.85));
            g.addColorStop(1, d.barColour);
            ctx.save();
            ctx.shadowColor = alpha(d.barColour, 0.6);
            ctx.shadowBlur = 14;
            ctx.fillStyle = g;
            ctx.fill();
            ctx.restore();
        }

        const fmt = n => n >= 1000
            ? `${(n / 1000).toFixed(n >= 10000
                ? 0
                : 1)}k`
            : String(n);
        ctx.font = `20px "${TEXT}"`;
        ctx.fillStyle = '#FFFFFF';
        ctx.textAlign = 'right';
        ctx.fillText(`${fmt(d.currentXP)} / ${fmt(d.requiredXP)} XP`, rightX, barY - 12);
        ctx.textAlign = 'left';

        return canvas.toBuffer('image/png');
    }
}

class Greeting
{
    constructor(kind)
    {
        this.kind = kind;
        this.data = {
            avatar:        null,
            username:      'Unknown',
            discriminator: '',
            guildName:     '',
            memberCount:   null,

            colour:      kind === 'welcome'
                             ? PINK
                             : BAD,
            titleColour: null,
            title:       kind === 'welcome'
                             ? 'Welcome!'
                             : 'Goodbye!',
            message:     ''
        };
    }

    setAvatar(v)
    {
        this.data.avatar = v;
        return this;
    }

    setUsername(v)
    {
        this.data.username = String(v ?? 'Unknown');
        return this;
    }

    setDiscriminator(v)
    {
        this.data.discriminator = v
            ? String(v)
            : '';
        return this;
    }

    setGuildName(v)
    {
        this.data.guildName = String(v ?? '');
        return this;
    }

    setMemberCount(v)
    {
        this.data.memberCount = (v === null || v === undefined)
            ? null
            : Number(v);
        return this;
    }

    setColor()
    {
        return this;
    }

    set colorTitle(_v)
    { }

    get colorTitle()
    {
        return this.data.colour;
    }

    set textTitle(v)
    {
        this.data.title = v == null
            ? this.data.title
            : String(v);
    }

    get textTitle()
    {
        return this.data.title;
    }

    set textMessage(v)
    {
        this.data.message = v == null
            ? ''
            : String(v);
    }

    get textMessage()
    {
        return this.data.message;
    }

    async build()
    {
        return renderCard(this.kind, this.data);
    }

    async _draw()
    {
        const W = 930;
        const H = 300;
        const canvas = createCanvas(W, H);
        const ctx = canvas.getContext('2d');
        const d = this.data;
        const accent = d.colour;

        roundRectPath(ctx, 0, 0, W, H, 34);
        ctx.save();
        ctx.clip();

        const welcome = this.kind === 'welcome';

        const g = ctx.createLinearGradient(0, 0, W, H);
        g.addColorStop(0,
            alpha(accent,
                welcome
                    ? 0.30
                    : 0.22));
        g.addColorStop(0.5,
            welcome
                ? '#1B1218'
                : '#15161B');
        g.addColorStop(1, INK);
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, W, H);

        const glow = ctx.createRadialGradient(W - 120, 0, 20, W - 120, 0, 620);
        glow.addColorStop(0,
            alpha(welcome
                    ? accent
                    : BRAND,
                welcome
                    ? 0.30
                    : 0.22));
        glow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = glow;
        ctx.fillRect(0, 0, W, H);

        if (welcome)
        {
            const corner = ctx.createRadialGradient(60, H, 10, 60, H, 460);
            corner.addColorStop(0, alpha(PINK_SOFT, 0.20));
            corner.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = corner;
            ctx.fillRect(0, 0, W, H);
        }

        ctx.font = `150px "${DISPLAY}"`;
        ctx.fillStyle = alpha(accent, 0.08);
        ctx.textAlign = 'right';
        ctx.fillText(this.kind === 'welcome'
            ? 'WELCOME'
            : 'GOODBYE', W - 24, H - 26);
        ctx.textAlign = 'left';

        ctx.restore();

        roundRectPath(ctx, 2, 2, W - 4, H - 4, 32);
        ctx.lineWidth = 3;
        ctx.strokeStyle = alpha(accent, 0.55);
        ctx.stroke();

        const avImg = await loadImg(d.avatar);
        drawAvatar(ctx, avImg, 150, H / 2, 96, accent);

        const x = 300;
        const maxW = W - x - 40;

        const titleSize = fitFont(ctx, d.title, DISPLAY, 58, 30, maxW);
        ctx.font = `${titleSize}px "${DISPLAY}"`;
        ctx.fillStyle = d.titleColour ?? accent;
        ctx.textBaseline = 'alphabetic';
        ctx.fillText(ellipsize(ctx, d.title, maxW), x, 96);

        const uSize = fitFont(ctx, d.username, TEXT, 44, 24, maxW);
        ctx.font = `${uSize}px "${TEXT}"`;
        ctx.fillStyle = '#FFFFFF';
        let uName = d.username;
        if (d.discriminator && ![
            '0',
            '0000'
        ].includes(d.discriminator))
        {
            uName = `${uName}#${d.discriminator}`;
        }
        ctx.fillText(ellipsize(ctx, uName, maxW), x, 150);

        if (d.message)
        {
            ctx.font = `26px "${TEXT}"`;
            ctx.fillStyle = MUTE;
            const lines = wrap(ctx, d.message, maxW, 2);
            lines.forEach((ln, i) => ctx.fillText(ln, x, 192 + i * 32));
        }

        const footerBits = [];
        if (d.guildName)
        {
            footerBits.push(d.guildName);
        }
        if (d.memberCount !== null && !Number.isNaN(d.memberCount))
        {
            footerBits.push(this.kind === 'welcome'
                ? `${ordinal(d.memberCount)} member`
                : `${d.memberCount} members left`);
        }

        if (footerBits.length)
        {
            ctx.font = `22px "${TEXT}"`;
            ctx.fillStyle = alpha(accent, 0.95);
            ctx.fillText(ellipsize(ctx, footerBits.join('  •  '), maxW), x, H - 34);
        }

        return canvas.toBuffer('image/png');
    }
}

export class Welcomer extends Greeting
{
    constructor()
    {
        super('welcome');
    }
}

export class Leaver extends Greeting
{
    constructor()
    {
        super('leave');
    }
}

export async function renderCardData(kind, data)
{

    registerCardFonts();

    if (kind === 'rank')
    {
        const card = new Rank();
        card.data = data;

        return card._draw();
    }

    const card = new Greeting(kind === 'leave'
        ? 'leave'
        : 'welcome');
    card.data = data;

    return card._draw();
}

const renderCard = async (kind, data) =>
{
    const offloaded = await renderOffThread(kind, data);

    return offloaded ?? renderCardData(kind, data);
};

export default {
    Rank,
    Welcomer,
    Leaver,
    registerCardFonts
};
