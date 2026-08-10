'use strict';

import Relaxy     from '../../../src/Client/Relaxy.js';
import { Player } from '../../../src/Client/Modules/MusicPlayer/Player.js';

export default (client, queue) =>
{
    client.prefetcher?.onQueueEnd(queue);

    client.log('ERROR', `Queue deleted in ${queue.metadata.guild.name}`);
};
