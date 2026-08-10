'use strict';

import Relaxy from '../../Relaxy.js';

const DSP = Object.freeze({
    disableVolume: false,

    disableBiquad:     true,
    disableEqualizer:  true,
    disableFilterer:   true,
    disableResampler:  true,
    disableCompressor: true,
    disableReverb:     true,
    disableSeeker:     true
});

export const buildNodeOptions = (client, guild, metadata) => ({
    ...DSP,

    metadata,
    volume:           guild.mo.iv,
    leaveOnEnd:       guild.mo.le,
    leaveOnStop:      guild.mo.ls,
    bufferingTimeout: guild.mo.bt
});

export default buildNodeOptions;
