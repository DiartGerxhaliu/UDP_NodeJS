"# UDP Socket Server

A simple UDP socket server with file management and HTTP monitoring.

## Setup

Just run the server:
```bash
node server.js
```

In another terminal, run a client:
```bash
node client.js
```

That's it. The server creates a `shared/` folder for files.

## Commands

### Admin (first client)
- `/list` - show files
- `/read filename` - read file
- `/info filename` - file info
- `/search keyword` - find files
- `/delete filename` - delete file
- `/upload filename` - upload file
- `/download filename` - download file

### Regular Users
- `/list` - show files
- `/read filename` - read file
- `/info filename` - file info
- `/search keyword` - find files

Only admin can delete, upload, download.

## HTTP Stats

Check what's connected:
```bash
curl http://localhost:8080/stats
```

Returns JSON with:
- how many clients connected
- max clients (10)
- which clients and if they're admin

## How it works

1. Server listens on port 4444 (UDP)
2. First client that connects becomes admin
3. Other clients are read-only
4. All file stuff happens in the `shared/` folder
5. HTTP server on 8080 shows stats

## Requirements Met

✓ Server listens on port 4444
✓ Max 10 clients, refuses more
✓ Can handle multiple clients
✓ Reads messages from clients
✓ Admin client with full access
✓ Users get read-only access
✓ File operations: list, read, delete, search, info
✓ HTTP monitoring on port 8080
✓ Shows stats in JSON
✓ Socket connection works properly
✓ Sends/receives messages correctly

## Files

- `server.js` - the UDP server
- `client.js` - the client
- `shared/` - where files go
- `README.md` - this file" 
