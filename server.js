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

