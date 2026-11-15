'use strict';

import Discord from 'discord.js';
import Relaxy from '../../../Relaxy.js';

export default class TicTacToe {
    static X = 0;

    static O = 1;

    static MARKS = ['❌', '⭕'];

    static LINES = [
        [0, 1, 2],
        [3, 4, 5],
        [6, 7, 8],
        [0, 3, 6],
        [1, 4, 7],
        [2, 5, 8],
        [0, 4, 8],
        [2, 4, 6]
    ];

    static IDLE_MS = 3 * 60 * 1000;

    constructor(client, message, guild, opponent) {
        this.client = client;
        this.message = message;
        this.guild = guild;

        this.players = [message.member, opponent];

        this.board = new Array(9).fill(null);
        this.turn = TicTacToe.X;

        this.boardMessage = null;

        this.start();
    }

    get current() {
        return this.players[this.turn];
    }

    components(over = false) {
        const rows = [];

        for (let row = 0; row < 3; row++) {
            const actionRow = new Discord.ActionRowBuilder();

            for (let col = 0; col < 3; col++) {
                const i = row * 3 + col;
                const mark = this.board[i];
                const taken = mark !== null;

                actionRow.addComponents(
                    new Discord.ButtonBuilder()
                        .setCustomId(`tttui_${i}`)
                        .setLabel(taken ? TicTacToe.MARKS[mark] : '\u200b')
                        .setStyle(
                            taken
                                ? mark === TicTacToe.X
                                    ? Discord.ButtonStyle.Danger
                                    : Discord.ButtonStyle.Primary
                                : Discord.ButtonStyle.Secondary
                        )
                        .setDisabled(over || taken)
                );
            }

            rows.push(actionRow);
        }

        return rows;
    }

    content(result = null) {
        if (result) {
            return result;
        }

        return (
            `${TicTacToe.MARKS[this.turn]} ${this.current} - your move.\n` +
            `${this.players[TicTacToe.X]} is ❌, ${this.players[TicTacToe.O]} is ⭕.`
        );
    }

    winner() {
        for (const [a, b, c] of TicTacToe.LINES) {
            if (this.board[a] !== null && this.board[a] === this.board[b] && this.board[a] === this.board[c]) {
                return this.board[a];
            }
        }

        return null;
    }

    async start() {
        this.boardMessage = await this.client
            .send(this.message.channel, this.content(), [], [], [], this.components())
            .catch(() => null);

        if (!this.boardMessage) {
            return this.client.qEmbed('Could not start the game here.', this.message);
        }

        const ids = new Set(this.players.map((p) => p.id));

        this.collector = this.boardMessage.createMessageComponentCollector({
            componentType: Discord.ComponentType.Button,
            idle: TicTacToe.IDLE_MS,
            filter: (pressed) => ids.has(pressed.user.id)
        });

        this.collector.on('collect', (pressed) => this.onPress(pressed));
        this.collector.on('end', (_collected, reason) => this.onEnd(reason));
    }

    async onPress(pressed) {
        if (pressed.user.id !== this.current.id) {
            return pressed
                .reply({
                    content: 'It is not your turn.',
                    flags: Discord.MessageFlags.Ephemeral
                })
                .catch(this.client.swallow('TicTacToe: reply'));
        }

        const i = Number(pressed.customId.split('_')[1]);

        if (!Number.isInteger(i) || i < 0 || i > 8 || this.board[i] !== null) {
            return pressed.deferUpdate().catch(this.client.swallow('TicTacToe: deferUpdate'));
        }

        this.board[i] = this.turn;

        const winnerMark = this.winner();
        const full = this.board.every((cell) => cell !== null);

        if (winnerMark !== null || full) {
            this.result = winnerMark;
            this.collector.stop('finished');

            const text =
                winnerMark !== null
                    ? `${TicTacToe.MARKS[winnerMark]} ${this.players[winnerMark]} wins!`
                    : "It's a draw!";

            await pressed
                .update({
                    content: text,
                    components: this.components(true)
                })
                .catch(this.client.swallow('TicTacToe: update'));

            return this.reward(winnerMark);
        }

        this.turn = this.turn === TicTacToe.X ? TicTacToe.O : TicTacToe.X;

        return pressed
            .update({
                content: this.content(),
                components: this.components()
            })
            .catch(this.client.swallow('TicTacToe: update'));
    }

    async reward(winnerMark) {
        if (winnerMark === null) {
            return;
        }

        const winner = this.players[winnerMark];

        if (winner.user.bot) {
            return;
        }

        const xp = Math.floor(Math.random() * 21) + 10;
        const money = Math.floor(Math.random() * 31) + 10;

        const profile = await this.client.module.database.User(winner.id).catch(() => null);

        if (profile) {
            this.client.saveProfile(
                winner.id,
                {
                    alter: 'xp',
                    value: (profile.xp ?? 0) + xp
                },
                {
                    alter: 'm',
                    value: (profile.m ?? 0) + money
                }
            );
        }

        if (this.guild.lv?.on) {
            const member = await this.client.module.database.Member(winner.id, this.message.guild.id).catch(() => null);

            if (member) {
                this.client.saveMember(this.message.guild.id, winner.id, {
                    alter: 'xp',
                    value: (member.xp ?? 0) + xp
                });
            }
        }

        return this.client
            .send(this.message.channel, `${winner} earned **${xp}** xp and **${money}** money.`)
            .catch(this.client.swallow('TicTacToe: reward'));
    }

    onEnd(reason) {
        if (reason === 'finished' || !this.boardMessage) {
            return;
        }

        this.client
            .edit(this.boardMessage, `Game abandoned - ${this.current} took too long.`, [], [], this.components(true))
            .catch(this.client.swallow('TicTacToe: edit'));
    }
}
