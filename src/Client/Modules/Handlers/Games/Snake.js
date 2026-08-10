'use strict';

import Discord from 'discord.js';
import Relaxy  from '../../../Relaxy.js';

export default class Snake
{
    static WIDTH = 15;

    static HEIGHT = 10;

    static IDLE_MS = 3 * 60 * 1000;

    static TILE = '🟦';

    static BODY = '🟩';

    static FOOD = '🍎';

    static DIRECTIONS = {
        up:    {
            x: 0,
            y: -1
        },
        down:  {
            x: 0,
            y: 1
        },
        left:  {
            x: -1,
            y: 0
        },
        right: {
            x: 1,
            y: 0
        }
    };

    constructor(client, message, guild)
    {
        this.client = client;
        this.message = message;
        this.guild = guild;

        this.snake = [
            {
                x: Math.floor(Snake.WIDTH / 2),
                y: Math.floor(Snake.HEIGHT / 2)
            }
        ];
        this.snakeLength = 1;
        this.apple = {
            x: 0,
            y: 0
        };
        this.score = 0;
        this.ended = false;

        this.boardMessage = null;
        this.collector = null;

        this.start();
    }

    isInSnake(pos)
    {
        return this.snake.some(part => part.x === pos.x && part.y === pos.y);
    }

    newApple()
    {
        do
        {
            this.apple = {
                x: Math.floor(Math.random() * Snake.WIDTH),
                y: Math.floor(Math.random() * Snake.HEIGHT)
            };
        }
        while (this.isInSnake(this.apple));
    }

    boardString()
    {
        let str = '';

        for (let y = 0; y < Snake.HEIGHT; y++)
        {
            for (let x = 0; x < Snake.WIDTH; x++)
            {
                if (x === this.apple.x && y === this.apple.y)
                {
                    str += Snake.FOOD;
                }
                else if (this.isInSnake({
                    x,
                    y
                }))
                {
                    str += Snake.BODY;
                }
                else
                {
                    str += Snake.TILE;
                }
            }

            str += '\n';
        }

        return str;
    }

    embed(title = null)
    {
        return new Discord.EmbedBuilder()
            .setColor(this.client.data.embedColor)
            .setTitle(title ?? `Snake - Score: ${this.score}`)
            .setDescription(this.boardString());
    }

    controls(over = false)
    {
        const pad = key => new Discord.ButtonBuilder()
            .setCustomId(`snakeui_pad_${key}`)
            .setLabel('\u200b')
            .setStyle(Discord.ButtonStyle.Secondary)
            .setDisabled(true);

        const dir = (key, emoji) => new Discord.ButtonBuilder()
            .setCustomId(`snakeui_${key}`)
            .setEmoji(emoji)
            .setStyle(Discord.ButtonStyle.Primary)
            .setDisabled(over);

        return [
            new Discord.ActionRowBuilder().addComponents(pad(0), dir('up', '⬆️'), pad(1)),
            new Discord.ActionRowBuilder().addComponents(dir('left', '⬅️'), new Discord.ButtonBuilder()
                .setCustomId('snakeui_stop')
                .setEmoji('⏹️')
                .setStyle(Discord.ButtonStyle.Danger)
                .setDisabled(over), dir('right', '➡️')),
            new Discord.ActionRowBuilder().addComponents(pad(2), dir('down', '⬇️'), pad(3))
        ];
    }

    async start()
    {
        const channelIds = this.client.data.snakeGameChannelIds;

        if (channelIds.includes(this.message.channel.id))
        {
            return this.client.send(this.message.channel, null, [
                {
                    color:       this.client.data.embedColor,
                    description: `A snake game is already running in ${this.message.channel}.`
                }
            ]);
        }

        channelIds.push(this.message.channel.id);

        this.newApple();

        this.boardMessage = await this.client.send(this.message.channel, null, [this.embed()], [], [], this.controls()).catch(() => null);

        if (!this.boardMessage)
        {
            this.cleanup();

            return this.client.qEmbed('Could not start the game here.', this.message);
        }

        this.collector = this.boardMessage.createMessageComponentCollector({
            componentType: Discord.ComponentType.Button,
            idle:          Snake.IDLE_MS,
            filter:        pressed => pressed.user.id === this.message.author.id
        });

        this.collector.on('collect', pressed => this.onPress(pressed));
        this.collector.on('end', (_collected, reason) => this.onEnd(reason));
    }

    async onPress(pressed)
    {
        if (pressed.customId === 'snakeui_stop')
        {
            return this.endGame(pressed);
        }

        const direction = Snake.DIRECTIONS[pressed.customId.split('_')[1]];

        if (!direction)
        {
            return pressed.deferUpdate().catch(this.client.swallow('Snake: deferUpdate'));
        }

        const head = this.snake[0];
        const next = {
            x: (head.x + direction.x + Snake.WIDTH) % Snake.WIDTH,
            y: (head.y + direction.y + Snake.HEIGHT) % Snake.HEIGHT
        };

        if (this.snake.length > 1 && this.snake[1].x === next.x && this.snake[1].y === next.y)
        {
            return pressed.deferUpdate().catch(this.client.swallow('Snake: deferUpdate'));
        }

        if (this.isInSnake(next))
        {
            return this.endGame(pressed);
        }

        this.snake.unshift(next);

        if (next.x === this.apple.x && next.y === this.apple.y)
        {
            this.score++;
            this.snakeLength++;
            this.newApple();
        }

        if (this.snake.length > this.snakeLength)
        {
            this.snake.pop();
        }

        return pressed.update({
            embeds:     [this.embed()],
            components: this.controls()
        }).catch(this.client.swallow('Snake: update'));
    }

    onEnd(reason)
    {
        if (this.ended || reason === 'ended')
        {
            return;
        }

        return this.endGame(null);
    }

    async endGame(pressed)
    {
        if (this.ended)
        {
            return pressed?.deferUpdate?.().catch(this.client.swallow('Snake: deferUpdate'));
        }

        this.ended = true;
        this.cleanup();

        const exp = Math.floor(Math.random() * 12 * this.score);
        const money = Math.floor(Math.random() * 17.5 * this.score);

        await this.award(exp, money);

        const overEmbed = this.embed(`Game over! Score: ${this.score} - earned ${exp} xp and ${money} money.`)
                              .setImage(this.client.cdn.snake);

        if (pressed)
        {
            await pressed.update({
                embeds:     [overEmbed],
                components: this.controls(true)
            }).catch(this.client.swallow('Snake: update'));
        }
        else if (this.boardMessage)
        {
            await this.client.edit(this.boardMessage, null, [overEmbed], [], this.controls(true)).catch(this.client.swallow('Snake: edit'));
        }

        if (this.collector && !this.collector.ended)
        {
            this.collector.stop('ended');
        }
    }

    async award(exp, money)
    {
        if (exp <= 0 && money <= 0)
        {
            return;
        }

        const profile = await this.client.module.database.User(this.message.author.id).catch(() => null);

        if (profile)
        {
            this.client.saveProfile(profile.id, {
                alter: 'xp',
                value: (profile.xp ?? 0) + exp
            }, {
                alter: 'm',
                value: (profile.m ?? 0) + money
            });
        }

        if (this.guild.lv?.on)
        {
            const member = await this.client.module.database.Member(this.message.author.id, this.message.guild.id).catch(() => null);

            if (member)
            {
                this.client.saveMember(this.message.guild.id, this.message.author.id, {
                    alter: 'xp',
                    value: (member.xp ?? 0) + exp
                });
            }
        }
    }

    cleanup()
    {
        const channelIds = this.client.data.snakeGameChannelIds;
        const index = channelIds.indexOf(this.message.channel.id);

        if (index !== -1)
        {
            channelIds.splice(index, 1);
        }
    }
}
