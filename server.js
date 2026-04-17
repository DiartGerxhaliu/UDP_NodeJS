const dgram = require('dgram');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');

const SERVER_IP = process.env.SERVER_IP || '127.0.0.1';
const UDP_PORT = Number(process.env.UDP_PORT || 41234);
const MAX_CLIENTS = Number(process.env.MAX_CLIENTS || 3);
const CLIENT_TIMEOUT = Number(process.env.CLIENT_TIMEOUT || 30000);
const CHUNK_SIZE = Number(process.env.CHUNK_SIZE || 4096);
const ADMIN_TOKEN = process.env.ADMIN_TOKEN || 'admin-secret';
const STORAGE_DIR = path.join(__dirname, 'server-data');


const server = dgram.createSocket('udp4');
const clients = {};
const uploads = {};



function send(address, port, packet) {
  server.send(Buffer.from(JSON.stringify(packet)), port, address);
}

function sendError(address, port, message, requestId) {
  send(address, port, { type: 'error', message, requestId });
}

function getActiveCount() {
  return Object.values(clients).filter((client) => client.active).length;
}

function getSafePath(relativePath = '.') {
  const fullPath = path.resolve(STORAGE_DIR, relativePath);
  const root = `${STORAGE_DIR}${path.sep}`;

  if (fullPath !== STORAGE_DIR && !fullPath.startsWith(root)) {
    throw new Error('Only files inside server-data are allowed.');
  }

  return fullPath;
}


function splitIntoChunks(buffer) {
  const chunks = [];

  for (let i = 0; i < buffer.length; i += CHUNK_SIZE) {
    chunks.push(buffer.subarray(i, i + CHUNK_SIZE).toString('base64'));
  }

  return chunks.length ? chunks : [''];
}


function checkPermission(client, command) {
  if (client.role === 'admin') return;

  if (['upload', 'delete', 'exec'].includes(command)) {
    throw new Error('This command needs admin privileges.');
  }
}



function connectClient(packet, rinfo) {
  const current = clients[packet.clientId];

  if (!current && getActiveCount() >= MAX_CLIENTS) {
  
    sendError(rinfo.address, rinfo.port, 'Server is full right now.');
    return;
  }

  const now = Date.now();
  const timedOut = current && now - current.lastSeen > CLIENT_TIMEOUT;
  const role = packet.wantAdmin && packet.token === ADMIN_TOKEN ? 'admin' : 'reader';
  const reconnected = current && (!current.active || timedOut);

  clients[packet.clientId] = current || {
    id: packet.clientId,
    name: packet.name || packet.clientId,
    joinedAt: now,
    messageCount: 0,
    commandCount: 0,
  };

  clients[packet.clientId].name = packet.name || clients[packet.clientId].name;
  clients[packet.clientId].address = rinfo.address;
  clients[packet.clientId].port = rinfo.port;
  clients[packet.clientId].role = role;
  clients[packet.clientId].lastSeen = now;
  clients[packet.clientId].active = true;

  send(rinfo.address, rinfo.port, {
    type: 'reply',
    action: 'connectMsg',
    role,
    message: reconnected ? 'Client reconnected.' : 'Client connected.',
  });
}

function updateClientActivity(packet, rinfo) {
  const client = clients[packet.clientId];

  if (!client) {
    sendError(rinfo.address, rinfo.port, 'Send connectMsg first.', packet.requestId);
    return null;
  }

  client.address = rinfo.address;
  client.port = rinfo.port;
  client.lastSeen = Date.now();
  client.active = true;
  return client;
}

server.on('message', async (buffer, rinfo) => {
  try {
    const packet = JSON.parse(buffer.toString());

    if (packet.type === 'connectMsg') return connectClient(packet, rinfo);
    if (packet.type === 'Ping') return updateClientActivity(packet, rinfo);
    if (packet.type === 'text') return handleText(packet, rinfo);
    if (packet.type === 'uploadChunk') return handleUploadChunk(packet, rinfo);
    if (packet.type === 'command') return handleCommand(packet, rinfo);

    sendError(rinfo.address, rinfo.port, 'Unknown packet type.');
  } catch (error) {
    sendError(rinfo.address, rinfo.port, 'Invalid packet received.');
  }
});

async function start() {
  await fsp.mkdir(STORAGE_DIR, { recursive: true });

  const welcomeFile = path.join(STORAGE_DIR, 'welcome.txt');
  if (!fs.existsSync(welcomeFile)) {
    await fsp.writeFile(welcomeFile, 'Welcome to the UDP server folder.');
  }

  server.bind(UDP_PORT, SERVER_IP, () => {
    console.log(`UDP server listening on ${SERVER_IP}:${UDP_PORT}`);
  });

  setInterval(cleanup, 2000).unref();
}

start();



