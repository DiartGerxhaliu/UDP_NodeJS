const dgram = require('dgram');
const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const { execFile } = require('child_process');

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

async function getAllFiles(folder, base = '') {
  const entries = await fsp.readdir(folder, { withFileTypes: true });
  const result = [];

  for (const entry of entries) {
    const nextBase = path.join(base, entry.name);
    const nextPath = path.join(folder, entry.name);

    if (entry.isDirectory()) {
      result.push(...await getAllFiles(nextPath, nextBase));
    } else {
      result.push(nextBase);
    }
  }

  return result;
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

async function handleText(packet, rinfo) {
  const client = updateClientActivity(packet, rinfo);
  if (!client) return;

  send(rinfo.address, rinfo.port, {
    type: 'reply',
    action: 'text',
    message: 'Message saved on server.',
    requestId: packet.requestId,
  });
}

server.on('message', async (buffer, rinfo) => {
  try {
    const packet = JSON.parse(buffer.toString());

    if (packet.type === 'connectMsg') return connectClient(packet, rinfo);
    if (packet.type === 'Ping') return updateClientActivity(packet, rinfo);
    if (packet.type === 'text') return handleText(packet, rinfo);

    sendError(rinfo.address, rinfo.port, 'Unknown packet type.');
  } catch (error) {
    sendError(rinfo.address, rinfo.port, 'Invalid packet received.');
  }
});


async function handleUploadChunk(packet, rinfo) {
  const client = updateClientActivity(packet, rinfo);
  if (!client) return;

  const upload = uploads[packet.transferId];
  if (!upload || upload.clientId !== client.id) {
    sendError(rinfo.address, rinfo.port, 'Upload session not found.', packet.requestId);
    return;
  }

  upload.chunks[packet.index] = packet.data || '';

  if (!upload.chunks.every((chunk) => typeof chunk === 'string')) return;

  const buffer = Buffer.concat(upload.chunks.map((chunk) => Buffer.from(chunk, 'base64')));
  const filePath = getSafePath(upload.fileName);

  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, buffer);
  delete uploads[packet.transferId];

  saveLog(`${client.id}: uploaded ${upload.fileName}`);

  send(rinfo.address, rinfo.port, {
    type: 'reply',
    action: 'upload',
    message: `Uploaded ${upload.fileName}.`,
    bytes: buffer.length,
    requestId: upload.requestId,
  });
}


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

async function runCommand(client, packet, rinfo) {
  const command = packet.command;
  const value = packet.value || '';

  checkPermission(client, command);

  if (command === 'list') {
    const entries = await fsp.readdir(getSafePath(value || '.'), { withFileTypes: true });
    return {
      type: 'reply',
      action: 'list',
      message: 'Directory listed successfully.',
      data: entries.map((entry) => ({
        name: entry.name,
        type: entry.isDirectory() ? 'dir' : 'file',
      })),
      requestId: packet.requestId,
    };
  }

  if (command === 'read') {
    const content = await fsp.readFile(getSafePath(value), 'utf8');
    return {
      type: 'reply',
      action: 'read',
      message: 'File read successfully.',
      data: content,
      requestId: packet.requestId,
    };
  }

  if (command === 'upload') {
    uploads[packet.transferId] = {
      clientId: client.id,
      fileName: packet.fileName,
      requestId: packet.requestId,
      chunks: new Array(packet.totalChunks),
      startedAt: Date.now(),
    };

    return {
      type: 'reply',
      action: 'upload',
      stage: 'ready',
      message: `Ready to receive ${packet.fileName}.`,
      transferId: packet.transferId,
      requestId: packet.requestId,
    };
  }

  if (command === 'download') {
    const fileName = path.basename(value);
    const buffer = await fsp.readFile(getSafePath(value));
    const chunks = splitIntoChunks(buffer);
    const transferId = `${Date.now()}-${Math.random()}`;

    for (let i = 0; i < chunks.length; i += 1) {
      send(rinfo.address, rinfo.port, {
        type: 'downloadChunk',
        transferId,
        fileName,
        index: i,
        totalChunks: chunks.length,
        data: chunks[i],
      });
    }

    return {
      type: 'reply',
      action: 'download',
      message: `Download for ${value} sent.`,
      requestId: packet.requestId,
    };
  }

  if (command === 'delete') {
    await fsp.unlink(getSafePath(value));
    return {
      type: 'reply',
      action: 'delete',
      message: `Deleted ${value}.`,
      requestId: packet.requestId,
    };
  }

  if (command === 'search') {
    const files = await getAllFiles(STORAGE_DIR);
    const matches = files.filter((file) => file.toLowerCase().includes(value.toLowerCase()));
    return {
      type: 'reply',
      action: 'search',
      message: 'Search finished.',
      data: matches,
      requestId: packet.requestId,
    };
  }

  if (command === 'info') {
    const stats = await fsp.stat(getSafePath(value));
    return {
      type: 'reply',
      action: 'info',
      message: 'File info loaded.',
      data: {
        size: stats.size,
        createdAt: stats.birthtime,
        modifiedAt: stats.mtime,
      },
      requestId: packet.requestId,
    };
  }

  if (command === 'exec') {
    const filePath = getSafePath(value);
    const ext = path.extname(filePath).toLowerCase();
    let runFile;
    let args;

    if (ext === '.js') {
      runFile = process.execPath;
      args = [filePath];
    } else if (ext === '.py') {
      runFile = 'python';
      args = [filePath];
    } else {
      throw new Error('Only .js and .py files can be executed.');
    }

    const result = await new Promise((resolve, reject) => {
      execFile(runFile, args, { timeout: 5000 }, (error, stdout, stderr) => {
        if (error) reject(error);
        else resolve({ stdout, stderr });
      });
    });

    return {
      type: 'reply',
      action: 'exec',
      message: `Executed ${value}.`,
      data: result,
      requestId: packet.requestId,
    };
  }

  throw new Error('Unknown command.');
}

start();

