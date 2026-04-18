const dgram = require('dgram');
const readline = require('readline');
const crypto = require('crypto');

const DEFAULT_SERVER_IP = '127.0.0.1';
const DEFAULT_UDP_PORT = 41234;

const args = process.argv.slice(2);
const clientName = getArg('--name', `client-${process.pid}`);
const clientId = getArg('--id', crypto.randomUUID());
const wantAdmin = getArg('--role', 'reader') === 'admin';
const token = getArg('--token', '');
const serverHost = getArg('--host', DEFAULT_SERVER_IP);
const serverPort = Number(getArg('--port', String(DEFAULT_UDP_PORT)));

const socket = dgram.createSocket('udp4');

let currentRole = 'reader';
