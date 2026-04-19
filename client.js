const dgram = require('dgram');
const readline = require('readline');
const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

const DEFAULT_SERVER_IP = '127.0.0.1';
const DEFAULT_UDP_PORT = 41234;
const CHUNK_SIZE = 4096;
const DOWNLOAD_DIR = path.join(__dirname, 'client-downloads');

const args = process.argv.slice(2);
const clientName = getArg('--name', `client-${process.pid}`);
const clientId = getArg('--id', crypto.randomUUID());
const wantAdmin = getArg('--role', 'reader') === 'admin';
const token = getArg('--token', '');
const serverHost = getArg('--host', DEFAULT_SERVER_IP);
const serverPort = Number(getArg('--port', String(DEFAULT_UDP_PORT)));

const socket = dgram.createSocket('udp4');
const uploads = {};
const downloads = {};
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


function splitIntoChunks(buffer) {
  const chunks = [];

  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    chunks.push(buffer.subarray(i, i + CHUNK_SIZE).toString('base64'));
  }

  return chunks.length ? chunks : [''];
}

function sendCommand(command, value = '', extra = {}) {
  send({
    type: 'command',
    clientId,
    requestId: newId(),
    command,
    value,
    ...extra,
  });
}


async function finishDownload(transferId) {
  const item = downloads[transferId];
  if (!item) return;

  if (!item.chunks.every((chunk) => typeof chunk === 'string')) return;

  await fsp.mkdir(DOWNLOAD_DIR, { recursive: true });

  const filePath = path.join(DOWNLOAD_DIR, item.fileName);
  const buffer = Buffer.concat(item.chunks.map((chunk) => Buffer.from(chunk, 'base64')));

  await fsp.writeFile(filePath, buffer);
  delete downloads[transferId];
  console.log(`Downloaded file saved to ${filePath}`);




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

  if (command === '/upload') {
    const filePath = path.resolve(value);
    const buffer = await fsp.readFile(filePath);
    const transferId = newId();

    uploads[transferId] = {
      requestId: newId(),
      chunks: splitIntoChunks(buffer),
    };

    send({
      type: 'command',
      clientId,
      requestId: uploads[transferId].requestId,
      command: 'upload',
      fileName: path.basename(filePath),
      transferId,
      totalChunks: uploads[transferId].chunks.length,
    });
    return;
  }

  console.log('Unknown command. Use /help.');
}

if (command === '/upload') {
    const filePath = path.resolve(value);
    const buffer = await fsp.readFile(filePath);
    const transferId = newId();

    uploads[transferId] = {
      requestId: newId(),
      chunks: splitIntoChunks(buffer),
    };

    send({
      type: 'command',
      clientId,
      requestId: uploads[transferId].requestId,
      command: 'upload',
      fileName: path.basename(filePath),
      transferId,
      totalChunks: uploads[transferId].chunks.length,
    });
    return;
  }
socket.on('message', async (buffer) => {
  try {
    await handlePacket(JSON.parse(buffer.toString()));
  } catch (error) {
    console.log(`Invalid response: ${error.message}`);
  }
});

socket.bind(() => {
  console.log(`Client started: ${clientName}`);
  console.log(`Client ID: ${clientId}`);
  console.log(`Server: ${serverHost}:${serverPort}`);
  showHelp();
  connectMsg();

  setInterval(() => {
    send({ type: 'Ping', clientId });
  }, 10000).unref();
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
  terminal: true,
});

rl.on('line', async (line) => {
  try {
    await runLine(line);
  } catch (error) {
    console.log(`Error: ${error.message}`);
  }
});
