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

async function handlePacket(packet) {
  if (packet.type === 'error') {
    console.log(`Error: ${packet.message}`);
    return;
  }

  if (packet.type === 'downloadChunk') {
    downloads[packet.transferId] = downloads[packet.transferId] || {
      fileName: packet.fileName,
      chunks: new Array(packet.totalChunks),
    };

    downloads[packet.transferId].chunks[packet.index] = packet.data;
    await finishDownload(packet.transferId);
    return;
  }

  if (packet.action === 'connectMsg') {
    currentRole = packet.role;
    console.log(packet.message);
    console.log(`Role: ${currentRole}`);
    return;
  }

  if (packet.action === 'upload' && packet.stage === 'ready') {
    const upload = uploads[packet.transferId];
    if (!upload) return;

    for (let i = 0; i < upload.chunks.length; i += 1) {
      send({
        type: 'uploadChunk',
        clientId,
        transferId: packet.transferId,
        requestId: upload.requestId,
        index: i,
        data: upload.chunks[i],
      });
    }

    return;
  }

  if (packet.action === 'list') {
    console.log(packet.message);
    packet.data.forEach((item) => console.log(`${item.type === 'dir' ? '[DIR]' : '[FILE]'} ${item.name}`));
    return;
  }

  if (packet.action === 'read') {
    console.log(packet.message);
    console.log(packet.data);
    return;
  }

  if (packet.action === 'search') {
    console.log(packet.message);
    if (!packet.data.length) console.log('No files found.');
    packet.data.forEach((item) => console.log(item));
    return;
  }

  if (packet.action === 'info') {
    console.log(packet.message);
    console.log(`Size: ${packet.data.size} bytes`);
    console.log(`Created: ${packet.data.createdAt}`);
    console.log(`Modified: ${packet.data.modifiedAt}`);
    return;
  }

  if (packet.action === 'exec') {
    console.log(packet.message);
    console.log(`stdout: ${packet.data.stdout || '(empty)'}`);
    console.log(`stderr: ${packet.data.stderr || '(empty)'}`);
    return;
  }

  if (packet.action === 'upload' && packet.bytes != null) {
    console.log(`${packet.message} (${packet.bytes} bytes)`);
    return;
  }

  console.log(packet.message);
}
