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

function showHelp() {
  console.log('');
  console.log('/list [folder]');
  console.log('/read <filename>');
  console.log('/upload <localPath>');
  console.log('/download <filename>');
  console.log('/delete <filename>');
  console.log('/search <keyword>');
  console.log('/info <filename>');
  console.log('/exec <filename>');
  console.log('/reconnect');
  console.log('/quit');
  console.log('Any other text is sent as a normal message.');
  console.log('');
}

async function runLine(line) {
  const text = line.trim();
  if (!text) return;

  if (!text.startsWith('/')) {
    sendText(text);
    return;
  }

  const parts = text.split(' ');
  const command = parts[0];
  const value = parts.slice(1).join(' ');

  if (command === '/list') return sendCommand('list', value || '.');
  if (command === '/read') return sendCommand('read', value);
  if (command === '/download') return sendCommand('download', value);
  if (command === '/delete') return sendCommand('delete', value);
  if (command === '/search') return sendCommand('search', value);
  if (command === '/info') return sendCommand('info', value);
  if (command === '/exec') return sendCommand('exec', value);
  if (command === '/reconnect') return connectMsg();
  if (command === '/help') return showHelp();
  if (command === '/quit') return process.exit(0);

  console.log('Unknown command. Use /help.');
}
