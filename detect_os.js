'use strict';

import fs from 'fs';
import os from 'os';

const read = path =>
{
    try
    {
        return fs.readFileSync(path, 'utf8');
    }
    catch
    {
        return '';
    }
};

const parseOsRelease = () =>
{
    const out = {};

    for (const line of read('/etc/os-release').split('\n'))
    {
        const match = /^\s*([A-Z_]+)\s*=\s*(.*?)\s*$/.exec(line);

        if (match)
        {
            out[match[1]] = match[2].replace(/^["']|["']$/g, '');
        }
    }

    return out;
};

const osRelease = process.platform === 'linux'
    ? parseOsRelease()
    : {};

export const DISTRO = (() =>
{
    if (process.platform === 'win32')
    {
        return 'windows';
    }

    if (process.platform === 'darwin')
    {
        return 'darwin';
    }

    return osRelease.ID || 'unknown';
})();

export const IS_VOID = DISTRO === 'void';

export default IS_VOID;

export const IS_RASPBERRY_PI = (() =>
{
    if (process.platform !== 'linux')
    {
        return false;
    }

    const model = read('/proc/device-tree/model') || read('/sys/firmware/devicetree/base/model');

    if (model)
    {
        return /raspberry\s*pi/i.test(model.replace(/\0/g, ''));
    }

    const cpuinfo = read('/proc/cpuinfo');

    if (cpuinfo)
    {

        return /^Model\s*:.*raspberry\s*pi/im.test(cpuinfo) || /^Hardware\s*:\s*BCM(27|28)\d\d/im.test(cpuinfo);
    }

    return os.arch() === 'arm' || os.arch() === 'arm64';
})();

export const IS_WINDOWS = process.platform === 'win32';

export const IS_LINUX = process.platform === 'linux';

export const HOST_TYPE = IS_RASPBERRY_PI
    ? `${DISTRO} (raspberry-pi)`
    : DISTRO;
