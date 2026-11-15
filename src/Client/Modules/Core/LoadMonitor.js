'use strict';

import { monitorEventLoopDelay } from 'perf_hooks';

const RESOLUTION_MS = 20;

const STRUGGLING_P95_MS = 300;
const WINDOW_MS = 30 * 1000;

let histogram = null;
let lastReset = 0;

export const startLoadMonitor = () => {
    if (histogram) {
        return;
    }

    histogram = monitorEventLoopDelay({ resolution: RESOLUTION_MS });
    histogram.enable();
    lastReset = Date.now();
};

export const eventLoopP95 = () => {
    if (!histogram) {
        return 0;
    }

    const p95 = histogram.percentile(95) / 1e6;

    if (Date.now() - lastReset > WINDOW_MS) {
        histogram.reset();
        lastReset = Date.now();
    }

    return p95;
};

export const isStruggling = () => eventLoopP95() > STRUGGLING_P95_MS;

export default startLoadMonitor;
