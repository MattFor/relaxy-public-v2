import path from 'path';
import { fileURLToPath } from 'url';
import Relaxy from '../../../../Relaxy.js';
import { Worker } from 'worker_threads';
import { messageType } from '../../../../../Core/DataTable.js';
import { isNetworkError, NetworkErrorThrottle } from '../../../../../Utils/NetworkErrors.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const networkErrorThrottle = new NetworkErrorThrottle();

export default class FileSystemHandler {
    constructor(client) {
        this.client = client;

        this.worker = null;

        this.messageCallbacks = new Map();

        this.nextMessageId = 0;

        this.isWorkerReady = false;

        this.startingWorker = false;

        this.handlerId = `FileHandler-${process.pid}`;

        this.startWorker().catch((e) => this.client.log('ERROR', e));
    }

    async startWorker() {
        if (this.startingWorker || this.worker) {
            return;
        }

        this.startingWorker = true;
        const workerPath = path.resolve(__dirname, '../../../Workers/FileWorker.js');

        this.worker = new Worker(workerPath, {
            workerData: {
                ownerProcessId: this.handlerId
            }
        });

        this.worker.on('online', () => {
            this.client.log('DEBUG', `[${this.handlerId}] File system worker is online.`);
        });

        this.worker.on('message', (message) => {
            const { messageId, result, error, type } = message;

            if (type === 'ready') {
                this.isWorkerReady = true;
                this.startingWorker = false;
                this.client.log('DEBUG', `[${this.handlerId}] File system worker is ready.`);
                return;
            }

            if (type === 'workerLog') {
                const isBad = ['ERROR', 'WARN'].includes(message.level);
                if (this.client.flags.logs.file_operations || isBad) {
                    const strError = [
                        message.message,
                        ...(message.args ?? []).map((a) =>
                            typeof a === 'string' ? a : (a?.stack ?? a?.message ?? String(a))
                        )
                    ].join(' ');

                    if (isNetworkError(strError)) {
                        const { print, suppressed } = networkErrorThrottle.consider(strError);
                        const count = ++this.client.data.net_issues;

                        if (print) {
                            this.client.log(
                                'ERROR',
                                `Network issue count: ${count}${NetworkErrorThrottle.note(suppressed)}`,
                                message.message ?? 'Undefined unhandled rejection',
                                ...message.args
                            );
                        }

                        this.client.cluster.send({
                            _type: messageType.CLIENT_REQUEST,
                            variant: 'ni'
                        });
                    } else if (isBad) {
                        this.client.log(
                            'ERROR',
                            `Error count: ${++this.client.data.errors}`,
                            message.message ?? 'Undefined unhandled rejection',
                            ...message.args
                        );
                    } else {
                        return this.client.log(message.level, message.message, ...message.args);
                    }
                }
            }

            if (this.messageCallbacks.has(messageId)) {
                const { resolve, reject } = this.messageCallbacks.get(messageId);

                this.messageCallbacks.delete(messageId);

                if (error) {
                    reject(new Error(error.message, { cause: error.stack }));
                } else {
                    resolve(result);
                }
            }
        });

        this.worker.on('error', (err) => {
            this.client.log('ERROR', `[${this.handlerId}] File system worker error:`, err);
            this.isWorkerReady = false;
            this.startingWorker = false;
            this.worker = null;

            this.messageCallbacks.forEach(({ reject }, msgId) => {
                reject(new Error(`File system worker crashed: ${err.message}`));
                this.messageCallbacks.delete(msgId);
            });
        });

        this.worker.on('exit', (code) => {
            this.client.log('ERROR', `[${this.handlerId}] File system worker exited with code ${code}`);
            this.isWorkerReady = false;
            this.startingWorker = false;
            this.worker = null;

            this.messageCallbacks.forEach(({ reject }, msgId) => {
                reject(new Error(`File system worker exited with code ${code}`));
                this.messageCallbacks.delete(msgId);
            });
        });

        return new Promise((resolve, reject) => {
            const checkReadyInterval = setInterval(() => {
                if (this.isWorkerReady) {
                    clearInterval(checkReadyInterval);
                    resolve();
                } else if (!this.startingWorker && !this.worker) {
                    clearInterval(checkReadyInterval);
                    reject(new Error(`File system worker failed to start.`));
                }
            }, 100);
        });
    }

    async sendMessageToWorker(type, data = {}) {
        if (!this.worker || !this.isWorkerReady) {
            if (!this.startingWorker) {
                await this.startWorker();
            } else {
                await new Promise((resolve, reject) => {
                    let timeoutAttempts = 0;
                    const maxTimeoutAttempts = 50;

                    const waitingToStart = setInterval(() => {
                        if (this.isWorkerReady) {
                            clearInterval(waitingToStart);
                            resolve();
                        } else if (timeoutAttempts >= maxTimeoutAttempts) {
                            clearInterval(waitingToStart);
                            reject(
                                new Error(
                                    'File system worker is unavailable and not attempting to start within timeout.'
                                )
                            );
                        }
                        timeoutAttempts++;
                    }, 750);
                });
            }
        }

        const messageId = this.nextMessageId++;
        return new Promise((resolve, reject) => {
            this.messageCallbacks.set(messageId, {
                resolve,
                reject
            });
            this.worker.postMessage({
                type,
                data,
                messageId
            });

            setTimeout(() => {
                if (this.messageCallbacks.has(messageId)) {
                    this.messageCallbacks.delete(messageId);
                    const errorMessage = `File system worker timed out for message type ${type} with id ${messageId}`;
                    if (this.client.flags.logs.file_operations) {
                        this.client.log(
                            'ERROR',
                            `${errorMessage}${data?.filePath ? `: ${data.filePath}` : ''}${
                                data?.dirPath ? `: ${data.dirPath}` : ''
                            }`
                        );
                    }
                    reject(new Error(errorMessage));
                }
            }, 90 * 1000);

            setTimeout(() => {
                if (this.messageCallbacks.has(messageId) && this.client.flags.logs.file_operations) {
                    this.client.log(
                        'WARN',
                        `File system worker taking longer than usual for message type ${type} with id ${messageId}${
                            data?.filePath ? `: ${data.filePath}` : ''
                        }${data?.dirPath ? `: ${data.dirPath}` : ''}`
                    );
                }
            }, 30 * 1000);

            setTimeout(() => {
                if (this.messageCallbacks.has(messageId) && this.client.flags.logs.file_operations) {
                    this.client.log(
                        'WARN',
                        `File system worker taking A LOT longer than usual for message type ${type} with id ${messageId}${
                            data?.filePath ? `: ${data.filePath}` : ''
                        }${data?.dirPath ? `: ${data.dirPath}` : ''}`
                    );
                }
            }, 60 * 1000);
        });
    }

    async readFile(filePath, options = { encoding: 'utf8' }) {
        return this.sendMessageToWorker('readFile', {
            filePath,
            options
        });
    }

    async pathExists(filePath) {
        return this.sendMessageToWorker('pathExists', { filePath });
    }

    async writeFile(filePath, data, options = { encoding: 'utf8' }) {
        return this.sendMessageToWorker('writeFile', {
            filePath,
            fileData: data,
            options
        });
    }

    async fileStats(filePath) {
        return this.sendMessageToWorker('fileStats', { filePath });
    }

    async readDir(dirPath, options = { encoding: 'utf8' }) {
        return this.sendMessageToWorker('readDir', {
            dirPath,
            options
        });
    }

    async unlink(filePath) {
        return this.sendMessageToWorker('unlink', { filePath });
    }

    async mkdir(dirPath, options) {
        return this.sendMessageToWorker('mkdir', {
            dirPath,
            options
        });
    }

    async downloadFile(url, outputPath) {
        return this.sendMessageToWorker('downloadFile', {
            url,
            outputPath
        });
    }

    async parseJSON(text) {
        return this.sendMessageToWorker('jsonParse', { text });
    }

    async stringifyJSON(obj, space) {
        return this.sendMessageToWorker('jsonStringify', {
            obj,
            space
        });
    }

    async fixerParseJSON(text) {
        return this.sendMessageToWorker('fixerParse', { text });
    }

    async destroy() {
        if (this.worker) {
            await this.worker.terminate();

            if (this.client.flags.logs.file_operations) {
                this.client.log('DEBUG', `[${this.handlerId}] File system worker terminated.`);
            }

            this.isWorkerReady = false;
            this.startingWorker = false;
            this.worker = null;
        }
    }
}
