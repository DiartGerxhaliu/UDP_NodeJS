const dgram = require('dgram');
const readline = require('readline');

const HOST = 'localhost';
const PORT = 4444;

const client = dgram.createSocket('udp4');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function send(msg) {
  const buf = Buffer.from(msg);
  client.send(buf, 0, buf.length, PORT, HOST, (err) => {
    if (err) console.log('[Error]', err.message);
  });
}

client.on('message', (msg) => {
  try {
    const parsed = JSON.parse(msg.toString());
    console.log(JSON.stringify(parsed, null, 2));
  } catch {
    console.log(msg.toString());
  }
  prompt();
});

function prompt() {
  rl.question('> ', (input) => {
    if (input === '/exit') {
      client.close();
      rl.close();
      process.exit(0);
    }
    send(input);
  });
}

console.log('Connected to', HOST, ':', PORT);
console.log('Commands: /list /read /info /search /delete /upload /download');
console.log('Type /exit to quit\n');

send('HELLO');
prompt();
