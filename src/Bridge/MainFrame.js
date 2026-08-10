'use strict';
import { config } from '../Config/Config.js';
import { Bridge } from 'discord-cross-hosting';

const {
    port,
    token,
    authToken,
    totalMachines
} = config.keys.bridge;

const {
    shardCount,
    shardsPerCluster
} = config.keys.manager;
if (!authToken)
{
    throw new Error('BRIDGE_AUTH_TOKEN is not set. The cross-hosting bridge authenticates every machine that joins the fleet with this shared secret, and a bridge client can run code on every shard - it must not be left empty. Generate one (`openssl rand -hex 32`), put it in .env on the bridge AND on every machine.');
}

const server = new Bridge({
    port,
    token,
    authToken,
    totalMachines,

    totalShards: shardCount,
    shardsPerCluster
});

server.on('debug', message => console.log(`[Bridge] ${message}`));
server.on('error', error => console.error(`[Bridge] ${error?.stack ?? error}`));

server.on('ready', url =>
{
    console.log(`[Bridge] Listening on ${url} - expecting ${totalMachines} machine(s), ${shardCount} shard(s) total.`);
});

void server.start();

export default server;
