'use strict';

import Discord           from 'discord.js';
import Canvas            from 'canvas';
import GIFEncoder        from 'gifencoder';
import { createRequire } from 'module';
import Relaxy            from '../../../src/Client/Relaxy.js';

const require = createRequire(import.meta.url);

const TRIGGERED_OVERLAY = require.resolve('discord-image-generation/src/assets/triggered.png');

const WIDTH = 256;
const HEIGHT = 310;
const BANNER_HEIGHT = 54;
const FRAMES = 9;
const FRAME_DELAY = 15;
const AVATAR_SHAKE = 20;
const BANNER_SHAKE = 10;

const renderTriggered = async avatarUrl =>
{
    const [avatar, banner] = await Promise.all([
        Canvas.loadImage(avatarUrl),
        Canvas.loadImage(TRIGGERED_OVERLAY)
    ]);

    const encoder = new GIFEncoder(WIDTH, HEIGHT);

    encoder.start();
    encoder.setRepeat(0);
    encoder.setDelay(FRAME_DELAY);

    const canvas = Canvas.createCanvas(WIDTH, HEIGHT);
    const ctx = canvas.getContext('2d');

    const jitter = range => Math.floor(Math.random() * range) - range;

    for (let frame = 0; frame < FRAMES; frame++)
    {

        ctx.drawImage(avatar, jitter(AVATAR_SHAKE), jitter(AVATAR_SHAKE), WIDTH + AVATAR_SHAKE, HEIGHT - BANNER_HEIGHT + AVATAR_SHAKE);

        ctx.fillStyle = '#FF000033';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);

        ctx.drawImage(banner, jitter(BANNER_SHAKE), HEIGHT - BANNER_HEIGHT + jitter(BANNER_SHAKE), WIDTH + BANNER_SHAKE, BANNER_HEIGHT + BANNER_SHAKE);

        encoder.addFrame(ctx);
    }

    encoder.finish();

    return encoder.out.getData();
};

export default {
    name:        'triggered',
    aliases:     ['trigger'],
    usage:       '=triggered [user]',
    description: 'Place your or the specified user\'s avatar onto the "triggered" meme template.',

    cooldown: 5,

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot:  [
        'SEND_MESSAGES',
        'ATTACH_FILES'
    ],

    async run(client, message, args, guild, interaction)
    {
        const member = await client.utils.member(message, args, 0) ?? message.member;

        const avatarUrl = member.displayAvatarURL({
            extension:   'png',
            forceStatic: true,
            size:        512
        });

        return client.send(interaction ?? message.channel, null, null, [
            new Discord.AttachmentBuilder(await renderTriggered(avatarUrl), { name: 'triggered.gif' })
        ]);
    }
};
