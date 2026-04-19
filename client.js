
const fsp = require('fs/promises');
const path = require('path');


const CHUNK_SIZE = 4096;
const DOWNLOAD_DIR = path.join(__dirname, 'client-downloads');


const uploads = {};
const downloads = {};


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
}