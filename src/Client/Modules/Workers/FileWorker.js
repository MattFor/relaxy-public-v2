'use strict';

import fs               from 'fs/promises';
import fixer            from 'dirty-json';
import { fetch }        from 'undici';
import * as fsConstants from 'fs';
import { pipeline }     from 'stream/promises';
import {
    parentPort,
    workerData
}                       from 'worker_threads';

const ownerProcessId = workerData.ownerProcessId;

const logFromWorker = (level, message, ...args) =>
{
    parentPort.postMessage({
        type:      'workerLog',
        handlerId: ownerProcessId,
        level:     level,
        message:   message,
        args:      args
    });
};
parentPort.on('message', async message =>
{
    const {
        type,
        data,
        messageId
    } = message;

    let result = null;
    let error = null;

    try
    {
        switch (type)
        {
            case 'readFile':
            {
                const {
                    filePath,
                    options
                } = data;
                const fileContent = await fs.readFile(filePath, options);
                result = fileContent;
            }
                break;

            case 'pathExists':
            {
                const { filePath } = data;
                try
                {
                    await fs.access(filePath, fsConstants.constants.F_OK);
                    result = true;
                }
                catch (err)
                {
                    if (err.code === 'ENOENT')
                    {
                        result = false;
                    }
                    else
                    {
                        throw err;
                    }
                }
            }
                break;

            case 'writeFile':
            {
                const {
                    filePath,
                    fileData,
                    options
                } = data;
                await fs.writeFile(filePath, fileData, options);
                result = true;
            }
                break;

            case 'fileStats':
            {
                const { filePath } = data;
                const stats = await fs.stat(filePath);
                result = stats;
            }
                break;

            case 'readDir':
            {
                const {
                    dirPath,
                    options
                } = data;
                const entries = await fs.readdir(dirPath, options);
                result = entries;
            }
                break;

            case 'unlink':
            {
                const { filePath } = data;
                await fs.unlink(filePath);
                result = true;
            }
                break;

            case 'mkdir':
            {
                const {
                    dirPath,
                    options
                } = data;
                const createdPath = await fs.mkdir(dirPath, options);
                result = createdPath;
            }
                break;

            case 'downloadFile':
            {
                const {
                    url,
                    outputPath
                } = data;
                try
                {
                    const response = await fetch(url);
                    if (!response.ok)
                    {
                        throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
                    }

                    await pipeline(response.body, fsConstants.createWriteStream(outputPath));
                    result = {
                        success: true,
                        outputPath
                    };
                }
                catch (err)
                {
                    error = {
                        message: err.message,
                        stack:   err.stack
                    };
                    logFromWorker('ERROR', `[fsWorker-${ownerProcessId.replace('fsHandler-', '')}] Error downloading file from ${url}:`, err.message);
                }
            }
                break;

            case 'jsonParse':
            {
                try
                {
                    result = JSON.parse(data.text);
                }
                catch (err)
                {
                    error = {
                        message: err.message,
                        stack:   err.stack
                    };
                }
            }
                break;

            case 'jsonStringify':
            {
                try
                {
                    result = JSON.stringify(data.obj, null, data.space);
                }
                catch (err)
                {
                    error = {
                        message: err.message,
                        stack:   err.stack
                    };
                }
            }
                break;

            case 'fixerParse':
            {
                try
                {
                    result = fixer.parse(data.text);
                }
                catch (err)
                {
                    error = {
                        message: err.message,
                        stack:   err.stack
                    };
                }
            }
                break;

            default:
            {
                throw new Error(`Unknown message type: ${type}`);
            }
        }
    }
    catch (err)
    {
        error = {
            message: err.message,
            stack:   err.stack
        };
        logFromWorker('ERROR', `[fsWorker-${ownerProcessId.replace('fsHandler-', '')}] Error handling message type ${type}:`, err.message);
    }
    finally
    {
        parentPort.postMessage({
            messageId,
            result,
            error
        });
    }
});

process.on('uncaughtException', err =>
{
    logFromWorker('ERROR', `[fsWorker-${ownerProcessId.replace('fsHandler-', '')}] Uncaught Exception:`, err.message);
});

process.on('unhandledRejection', (reason, promise) =>
{
    logFromWorker('ERROR', `[fsWorker-${ownerProcessId.replace('fsHandler-', '')}] Unhandled Rejection:`, reason);
});

parentPort.postMessage({ type: 'ready' });
