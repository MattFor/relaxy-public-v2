'use strict';
import { workerData, parentPort } from 'worker_threads';
import fs from 'fs';
import net from 'net';
import path from 'path';

const logDir = workerData.logDir;
const strippedLog = path.join(logDir, 'output.log');
const colorLog = path.join(logDir, 'output_color.log');
const sockPath = path.join(logDir, 'cmd.sock');

fs.mkdirSync(logDir, { recursive: true });
const strippedFd = fs.openSync(strippedLog, 'w');
const colorFd = fs.openSync(colorLog, 'w');
parentPort.on('message', (msg) => {
    if (msg.type !== 'write') {
        return;
    }
    try {
        if (msg.stripped) {
            fs.writeSync(strippedFd, msg.stripped);
        }
        if (msg.color) {
            fs.writeSync(colorFd, msg.color);
        }
    } catch {}
});
try {
    fs.unlinkSync(sockPath);
} catch {}
const server = net.createServer((socket) => {
    let buf = '';

    socket.setEncoding('utf8');

    socket.on('data', (data) => {
        buf += data;
        const lines = buf.split('\n');
        buf = lines.pop();

        for (const line of lines) {
            const cmd = line.trim();
            if (cmd) {
                parentPort.postMessage({
                    type: 'cmd',
                    cmd
                });
            }
        }
    });

    socket.on('error', () => {});
});

server.on('error', (err) =>
    parentPort.postMessage({
        type: 'err',
        msg: String(err)
    })
);
server.listen(sockPath);
