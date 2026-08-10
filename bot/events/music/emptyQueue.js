'use strict';

import Relaxy     from '../../../src/Client/Relaxy.js';
import { Player } from '../../../src/Client/Modules/MusicPlayer/Player.js';

export default async (client, queue) =>
{
    if (client.data.serverCache[queue.metadata.guild.id])
    {
        if (client.data.serverCache?.[queue.metadata.guild.id]?.['musicmessage'])
        {
            return;
        }
        else
        {
            client.data.serverCache[queue.metadata.guild.id]['musicmessage'] = true;

            setTimeout(() =>
            {
                client.data.serverCache[queue.metadata.guild.id]['musicmessage'] = false;
            }, 10 * 1000);
        }
    }

    void client.respond('Music stopped, queue ended!', queue.metadata.channel);
}
