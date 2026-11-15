'use strict';

let sharp = null;

import os from 'os';
import path from 'path';
import axios from 'axios';
import Discord from 'discord.js';
import ffmpegPath from 'ffmpeg-static';
import { spawn } from 'child_process';
import { writeFile, readFile, unlink } from 'fs/promises';
import { createCanvas, loadImage, registerFont } from 'canvas';

let _fontRegistered = false;

const registerCaptionFont = (fontPath) => {
    if (_fontRegistered) {
        return;
    }

    registerFont(fontPath, {
        family: 'impact',
        style: 'Regular'
    });

    _fontRegistered = true;
};

const loadImageDiff = async (url) => {
    if (url.endsWith('.webp') || url.endsWith('.svg')) {
        const response = await axios.get(url, { responseType: 'arraybuffer' });

        return await sharp(response.data).png().toBuffer();
    }

    return url;
};

const calculateFontSize = (imageWidth, lines, context) => {
    let fontSize = Math.floor(imageWidth * 0.2 * 0.85);
    context.font = `${fontSize}px impact`;

    let maxLineWidth = Math.max(...lines.map((line) => context.measureText(line).width));

    while (maxLineWidth > imageWidth && fontSize > 9) {
        fontSize--;
        context.font = `${fontSize}px impact`;
        maxLineWidth = Math.max(...lines.map((line) => context.measureText(line).width));
    }

    return fontSize;
};

const splitAndFlattenText = (text, chunkSize = 20) => {
    let result = [];
    let lines = text.split('\n');

    for (let line of lines) {
        let startIndex = 0;

        while (startIndex < line.length) {
            let endIndex = startIndex + chunkSize;

            if (endIndex < line.length && !/\s/.test(line[endIndex])) {
                endIndex = line.lastIndexOf(' ', endIndex);

                if (endIndex === -1) {
                    endIndex = startIndex + chunkSize;
                }
            }

            result.push(line.slice(startIndex, endIndex));
            startIndex = endIndex;
        }
    }

    return result;
};

const transformText = (text, maxWidth, context) => {
    let resultLines = [];
    let lines = splitAndFlattenText(text);
    let wordsOfLines = lines.map((line) => line.split(' '));

    for (let words of wordsOfLines) {
        let currentLine = words[0];

        for (let i = 1; i < words.length; i++) {
            let word = words[i];
            let width = context.measureText(`${currentLine} ${word}`).width;

            if (width < maxWidth) {
                currentLine += ' ' + word;
            } else {
                resultLines.push(currentLine);
                currentLine = word;
            }
        }

        resultLines.push(currentLine);
    }

    return resultLines;
};

const transformTextGif = (inputText) => {
    let words = inputText.replace(/\n/g, ' ').split(' ');
    let numLines = Math.ceil(Math.sqrt(words.length));
    let wordsPerLine = Math.ceil(words.length / numLines);

    let lines = [];
    let currentLine = words[0];

    for (let i = 1; i < words.length; i++) {
        let word = words[i];
        let currentWords = currentLine.split(' ').length;

        if (currentWords < wordsPerLine) {
            currentLine += ' ' + word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }

    lines.push(currentLine);
    return lines;
};

export default {
    name: 'caption',
    usage: '=caption <text>',
    description:
        'Add a white bar with a caption to a gif/png/jpg. Reply to a message that has an attachment to caption that image instead.',

    args: true,

    defer: true,

    permissionsUser: ['SEND_MESSAGES'],
    permissionsBot: ['SEND_MESSAGES', 'EMBED_LINKS', 'ATTACH_FILES'],

    async run(client, message, args, guild, interaction) {
        if (!sharp) {
            sharp = await import('sharp');
        }

        if (await client.censored(args, guild, message)) {
            return;
        }

        const reply = message?.reference?.messageId
            ? await message.channel.messages
                  .fetch(message?.reference?.messageId)
                  .catch(client.swallow('caption: fetch'))
            : (null ?? null);

        const specialCase = reply
            ? reply?.embeds?.[0]?.data?.type?.includes('gif')
            : message?.embeds?.[0]?.data?.type?.includes('gif');

        const attachment =
            (reply
                ? specialCase
                    ? {
                          height: reply?.embeds?.[0]?.data?.thumbnail.height,
                          width: reply?.embeds?.[0]?.data?.thumbnail.width,
                          url: reply?.embeds?.[0]?.data?.url,
                          contentType: 'gif',
                          size: 1
                      }
                    : reply.attachments.first()
                : specialCase
                  ? {
                        height: reply?.embeds?.[0]?.data?.thumbnail.height,
                        width: reply?.embeds?.[0]?.data?.thumbnail.width,
                        url: reply?.embeds?.[0]?.data?.url,
                        contentType: 'gif',
                        size: 1
                    }
                  : message.attachments.first()) ?? null;

        if (specialCase) {
            return client.qEmbed('Links cannot be converted!', interaction ?? message);
        }

        if (!attachment) {
            return client.qEmbed('No attachment provided!', interaction ?? message);
        }

        if (!attachment.contentType.includes('gif') && !attachment.contentType.includes('image')) {
            return client.qEmbed('Unsupported attachment type!', interaction ?? message);
        }

        if (attachment.size / 1000000 > 5 && attachment.contentType.includes('gif')) {
            return client.qEmbed('Gif too big! (max 5mb)', interaction ?? message);
        }

        const waiting = await client.send(message.channel, null, [
            {
                color: client.data.embedColor,
                title: 'Generating caption...',
                thumbnail: { url: client.cdn.loading }
            }
        ]);

        registerCaptionFont(client.cdn.fonts.impact);

        const joinedArgs = args.join(' ');
        const attachmentType = attachment.contentType.includes('gif') ? 'gif' : 'png';

        switch (attachmentType) {
            case 'gif': {
                const stamp = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
                const inputFile = path.join(os.tmpdir(), `relaxy-caption-${stamp}.gif`);
                const barFile = path.join(os.tmpdir(), `relaxy-caption-${stamp}-bar.png`);
                const outputFile = path.join(os.tmpdir(), `relaxy-caption-${stamp}-out.gif`);

                const cleanup = () => Promise.allSettled([inputFile, barFile, outputFile].map((f) => unlink(f)));

                try {
                    const response = await axios.get(attachment.url, {
                        responseType: 'arraybuffer',
                        maxContentLength: 25 * 1024 * 1024,
                        maxBodyLength: 25 * 1024 * 1024
                    });
                    await writeFile(inputFile, Buffer.from(response.data));

                    const firstFrame = await loadImage(inputFile);
                    const width = firstFrame.width;
                    const barHeight = Math.round(firstFrame.height * 0.2);

                    const words = transformTextGif(joinedArgs);
                    const layoutContext = createCanvas(width, barHeight).getContext('2d');
                    layoutContext.textAlign = 'center';

                    const wrapLines = (fontSize) => {
                        layoutContext.font = `${fontSize}px impact`;
                        const maxWidth = Math.floor(width * 0.95);
                        const lines = [];
                        let currentLine = words[0];

                        for (let i = 1; i < words.length; i++) {
                            const candidate = `${currentLine} ${words[i]}`;

                            if (layoutContext.measureText(candidate).width < maxWidth) {
                                currentLine = candidate;
                            } else {
                                lines.push(currentLine);
                                currentLine = words[i];
                            }
                        }

                        lines.push(currentLine);
                        return lines;
                    };

                    let fontSize = Math.ceil(barHeight * 0.85);
                    let lineHeight = fontSize;
                    let lines = wrapLines(fontSize);

                    while (lines.length * lineHeight > barHeight && fontSize > 9) {
                        fontSize -= 2;
                        lineHeight = fontSize;
                        lines = wrapLines(fontSize);
                    }

                    if (lines.length * lineHeight > barHeight) {
                        await cleanup();

                        return client.edit(waiting, null, [
                            {
                                color: client.data.embedColor,
                                description: "**This text won't fit on the gif!**"
                            }
                        ]);
                    }

                    const barCanvas = createCanvas(width, barHeight);
                    const barContext = barCanvas.getContext('2d');
                    barContext.fillStyle = '#FFFFFF';
                    barContext.fillRect(0, 0, width, barHeight);
                    barContext.fillStyle = '#000000';
                    barContext.textAlign = 'center';
                    barContext.font = `${fontSize}px impact`;

                    const textTop = (barHeight - lines.length * lineHeight) / 2 + fontSize;

                    for (let i = 0; i < lines.length; i++) {
                        barContext.fillText(lines[i], width / 2, textTop + i * lineHeight);
                    }

                    await writeFile(barFile, barCanvas.toBuffer('image/png'));

                    await new Promise((resolve, reject) => {
                        const proc = spawn(ffmpegPath, [
                            '-y',
                            '-i',
                            inputFile,
                            '-i',
                            barFile,
                            '-filter_complex',
                            `[0:v]pad=iw:ih+${barHeight}:0:${barHeight}:color=white[bg];[bg][1:v]overlay=0:0[c];[c]split[s0][s1];[s0]palettegen=stats_mode=diff[p];[s1][p]paletteuse=dither=sierra2_4a[o]`,
                            '-map',
                            '[o]',
                            outputFile
                        ]);

                        const timeout = setTimeout(
                            () => {
                                proc.kill('SIGKILL');
                                reject(new Error('TOOK_TOO_LONG'));
                            },
                            3 * 60 * 1000
                        );

                        let stderr = '';
                        proc.stderr.on('data', (chunk) => (stderr += chunk.toString()));
                        proc.on('error', (e) => {
                            clearTimeout(timeout);
                            reject(e);
                        });
                        proc.on('close', (code) => {
                            clearTimeout(timeout);

                            return code === 0
                                ? resolve()
                                : reject(
                                      new Error(
                                          `ffmpeg exited with code ${code}: ${stderr.split('\n').slice(-3).join(' ')}`
                                      )
                                  );
                        });
                    });

                    const out = await readFile(outputFile);
                    await cleanup();

                    if (out.length > 8 * 1024 * 1024) {
                        return client.edit(waiting, null, [
                            {
                                color: client.data.embedColor,
                                description: '**The captioned gif is too large to upload!** Try a smaller source.'
                            }
                        ]);
                    }

                    return client.edit(waiting, null, null, [
                        new Discord.AttachmentBuilder(out, { name: `${attachment.name}-with-text.gif` })
                    ]);
                } catch (e) {
                    await cleanup();
                    client.log('ERROR', 'caption gif failed:', e);

                    return client.edit(waiting, null, [
                        {
                            color: client.data.embedColor,
                            description:
                                e?.message === 'TOOK_TOO_LONG'
                                    ? '**The operation took too long!**'
                                    : '**Something went wrong!**'
                        }
                    ]);
                }
            }
            case 'png': {
                const contentToLoad = await loadImageDiff(attachment.url);
                const image = await loadImage(contentToLoad);
                let text = args.join(' ');

                let fontSize = 60;
                let canvas = createCanvas(image.width, image.height);
                let context = canvas.getContext('2d');
                context.font = `${fontSize}px impact`;

                let lines = transformText(text, image.width, context);
                fontSize = calculateFontSize(image.width, lines, context);

                let lineHeight = Math.floor(fontSize * 1.2);
                let barHeight = lines.length * lineHeight;

                canvas.height = image.height + barHeight;
                context = canvas.getContext('2d');

                context.drawImage(image, 0, barHeight);
                context.fillStyle = '#FFFFFF';
                context.fillRect(0, 0, canvas.width, barHeight);

                context.font = `${fontSize}px impact`;
                context.fillStyle = '#000000';
                context.textAlign = 'center';

                let textHeight = lines.length * lineHeight;
                let textTop = (barHeight - textHeight) / 2 + fontSize;

                for (let i = 0; i < lines.length; i++) {
                    context.fillText(lines[i], canvas.width / 2, textTop + i * lineHeight);
                }

                let resultBuffer = null;

                try {
                    resultBuffer = canvas.toBuffer();
                } catch {
                    return client.edit(waiting, null, [
                        {
                            color: client.data.embedColor,
                            description: '**Too much text for this image!**'
                        }
                    ]);
                }

                return client.edit(waiting, null, null, [
                    new Discord.AttachmentBuilder(resultBuffer, { name: `${attachment.name}-with-text.png` })
                ]);
            }
            default:
                return client.qEmbed(
                    "How'd you even get this error?\nReport what you have done to mattfor.",
                    interaction ?? message
                );
        }
    }
};
