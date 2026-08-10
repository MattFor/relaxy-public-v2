'use strict';

import Relaxy     from '../../../src/Client/Relaxy.js';
import { Player } from '../../../src/Client/Modules/MusicPlayer/Player.js';

export default (client, queue, ...messages) =>
{
    if (client.flags.logs.music_debug || client.flags.logs.debug)
    {
        client.log('DEBUG', ...messages);
    }
}

