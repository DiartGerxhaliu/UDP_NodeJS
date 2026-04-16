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



