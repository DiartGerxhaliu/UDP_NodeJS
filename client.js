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

function getArg(flag, fallback) {
  const index = args.indexOf(flag);
  return index >= 0 && args[index + 1] ? args[index + 1] : fallback;
}

function send(packet) {
  socket.send(Buffer.from(JSON.stringify(packet)), serverPort, serverHost);
}

function newId() {
  return crypto.randomUUID();
}

function connectMsg() {
  send({
    type: 'connectMsg',
    clientId,
    name: clientName,
    wantAdmin,
    token,
  });
}

function sendText(text) {
  send({
    type: 'text',
    clientId,
    requestId: newId(),
    text,
  });
}
