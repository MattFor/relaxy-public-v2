'use strict';

import Relaxy from '../../../src/Client/Relaxy.js';
import { Player } from '../../../src/Client/Modules/MusicPlayer/Player.js';

export default (client, queue) => void client.log(`Queue created in ${queue.metadata.guild.name}`);
