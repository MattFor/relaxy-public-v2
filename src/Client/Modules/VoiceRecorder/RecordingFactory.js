'use strict';

import fs from 'fs-extra';
import Discord from 'discord.js';
import Relaxy from '../../Relaxy.js';
import Recorder from './Recorder.js';
import { CDN } from '../../../Assets/CDN.js';
import { createAudioPlayer, createAudioResource } from '@discordjs/voice';

const path = './storage/';
const recordingStopMp3 = CDN.sounds.recordStop;
const recordingStartMp3 = CDN.sounds.recordStart;

export default class VoiceFactory {
    constructor(client) {
        this.client = client;
        this.files_to_remove = {};

        this.recording = new Set();
        this.recorder = new Recorder(undefined, this.client);
    }

    async Record(message, interaction) {
        if (!message.member.voice.channel || message.member.voice.channel.type !== Discord.ChannelType.GuildVoice) {
            return this.client.qEmbed('Invalid/no vc to connect to!', interaction ?? message);
        }

        const existingQueue = this.client.player.nodes.get(message.guild.id);
        if (existingQueue && existingQueue.isPlaying()) {
            return this.client.qEmbed('ActiveQueue', interaction ?? message);
        }

        if (this.recording.has(message.guild.id)) {
            return this.client.qEmbed('Already recording in this server!', interaction ?? message);
        }

        const queue = this.client.player.nodes.create(message.guild, {
            selfDeaf: false,
            leaveOnEmpty: false,
            leaveOnEnd: false,
            leaveOnStop: false
        });

        try {
            await queue.connect(message.member.voice.channel);
        } catch {
            return this.client.qEmbed("Couldn't connect to your voice channel!", interaction ?? message);
        }

        if (message.guild.members.me?.voice?.serverDeaf) {
            queue.delete();
            return this.client.qEmbed('Cannot record while server deafened!', interaction ?? message);
        }

        this.recording.add(message.guild.id);
        this.client.qEmbed(
            `Now recording in **${message.member.voice.channel}** bound from ${message.channel}!`,
            interaction ?? message
        );
        this.files_to_remove[`${message.guild.id}player`] = createAudioPlayer();

        if (!(await this.client.pathExists(`${path}${message.guild.id}`))) {
            await this.client.mkdir(`${path}${message.guild.id}`);
        }

        await fs.emptyDir(`${path}${message.guild.id}/`);

        queue.connection.subscribe(this.files_to_remove[`${message.guild.id}player`]);
        this.files_to_remove[`${message.guild.id}player`].play(createAudioResource(recordingStartMp3));

        this.recorder.startRecording(queue.connection, message.guild.id);
    }

    async Halt(message, interaction = null, leftChannel = false, fileSizeTooLarge = false, serverDeafened = false) {
        const queue = this.client.player.nodes.get(message.guild.id);

        if (!queue || !this.recording.has(message.guild.id)) {
            return this.client.qEmbed("Nothing's being recorded!", interaction ?? message);
        }

        this.recording.delete(message.guild.id);

        const finalFilePath = `${path}${message.guild.id}/${message.guild.id}.mp3`;
        const successfullyRecorded = await this.recorder.getRecordedVoice(
            fs.createWriteStream(finalFilePath),
            message.guild.id,
            'single',
            5
        );

        this.recorder.stopRecording(queue.connection, message.guild.id);

        if (!successfullyRecorded) {
            try {
                queue.delete();
                delete this.files_to_remove[`${message.guild.id}player`];
            } catch {}

            return this.client.qEmbed('Nothing was recorded! Cannot provide a file.', interaction ?? message);
        }

        const player = this.files_to_remove[`${message.guild.id}player`];
        if (player) {
            queue.connection?.subscribe(player);
            player.play(createAudioResource(recordingStopMp3));
        }

        delete this.files_to_remove[`${message.guild.id}player`];

        let endReason = serverDeafened
            ? "\n(I got server deafened, can't record!)"
            : fileSizeTooLarge
              ? '(The file went over 25mb)'
              : leftChannel
                ? '(All of the users left the channel)'
                : '';

        await this.client
            .send(message.channel, `Here\'s your recording!${endReason}`, null, [
                new Discord.AttachmentBuilder(finalFilePath, { name: 'recording.mp3' })
            ])
            .catch(() => {
                this.client.qEmbed("Cannot send the file! It's too large.", interaction ?? message);
            });

        setTimeout(async () => {
            try {
                queue.delete();
                this.client.unlink(finalFilePath);
            } catch {}
        }, 2000);
    }
}
