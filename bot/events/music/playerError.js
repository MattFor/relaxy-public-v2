'use strict';

import Relaxy from '../../../src/Client/Relaxy.js';
import { Player } from '../../../src/Client/Modules/MusicPlayer/Player.js';

export default (client, queue, error) => {
    client.log('ERROR', error);

    const raw = String(error?.message ?? error);
    const lower = raw.toLowerCase();

    let userView;
    if (
        lower.includes('410') ||
        lower.includes('confirm your age') ||
        lower.includes('age-restricted') ||
        lower.includes('inappropriate')
    ) {
        userView = 'That video is age-restricted - an admin needs to configure a YouTube cookie to play these, sorry!';
    } else if (lower.includes('private video')) {
        userView = "That video is private, so it can't be played.";
    } else if (lower.includes('members-only') || lower.includes('join this channel')) {
        userView = "That video is members-only and can't be played.";
    } else if (lower.includes('unavailable') || lower.includes('removed') || lower.includes('taken down')) {
        userView = 'That video is unavailable (removed, region-locked, or taken down).';
    } else if (lower.includes('requested format is not available') || lower.includes('no video formats')) {
        userView = 'No playable audio was found for that track.';
    } else if (lower.includes('sign in')) {
        userView = 'YouTube wants the bot to sign in for that video; a YouTube cookie may be required.';
    }

    return client.respond(userView ?? raw, queue.metadata?.channel, null);
};
