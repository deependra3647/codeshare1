const express = require('express');
const app = express();
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const { MongoClient } = require('mongodb');
const ACTIONS = require('./src/Actions');

app.use(express.json());

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: process.env.FRONTEND_URL || '*',
    methods: ['GET', 'POST'],
  },
});

const MONGO_URI = process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/codeshare';
const MONGO_DB_NAME = process.env.MONGO_DB_NAME || 'codeshare';
let downloadsCollection;

const userSocketMap = {};
const roomAdminMap = {};
const roomCodeMap = {};
const roomWritePermissions = {};
const roomPendingRequests = {}; // { roomId: [{ socketId, username }] }

function getAllConnectedClients(roomId) {
  return Array.from(io.sockets.adapter.rooms.get(roomId) || []).map((socketId) => {
    const isAdmin = roomAdminMap[roomId] === socketId;
    const canWrite = isAdmin || (roomWritePermissions[roomId] && roomWritePermissions[roomId][socketId] === true);
    return { socketId, username: userSocketMap[socketId], isAdmin, canWrite: canWrite !== false };
  });
}

function admitUser(roomId, socketId, username) {
  const sock = io.sockets.sockets.get(socketId);
  if (!sock) return;

  sock.join(roomId);
  if (!roomWritePermissions[roomId]) roomWritePermissions[roomId] = {};
  roomWritePermissions[roomId][socketId] = false; // non-admin starts with no write

  const clients = getAllConnectedClients(roomId);
  const currentCode = roomCodeMap[roomId] || null;

  clients.forEach(({ socketId: sid }) => {
    const isClientAdmin = roomAdminMap[roomId] === sid;
    const clientCanWrite = isClientAdmin || (roomWritePermissions[roomId][sid] === true);
    io.to(sid).emit(ACTIONS.JOINED, {
      clients,
      username,
      socketId,
      isAdmin: isClientAdmin,
      canWrite: clientCanWrite,
      code: sid === socketId ? currentCode : null,
    });
  });

  if (currentCode) {
    setTimeout(() => sock.emit(ACTIONS.CODE_CHANGE, { code: currentCode }), 100);
  }
}

app.post('/api/downloads', async (req, res) => {
  if (!downloadsCollection) return res.status(503).json({ message: 'Database not ready' });
  const { roomId, username, code } = req.body || {};
  if (!roomId) return res.status(400).json({ message: 'roomId is required' });
  try {
    const result = await downloadsCollection.insertOne({
      roomId, username: username || 'unknown', code: code || '', downloadedAt: new Date(),
    });
    res.status(201).json({ id: result.insertedId });
  } catch (err) {
    console.error('Failed to save download record', err);
    res.status(500).json({ message: 'Failed to save download' });
  }
});

app.use(express.static('build'));
app.use((_req, res) => res.sendFile(path.join(__dirname, 'build', 'index.html')));

io.on('connection', (socket) => {
  console.log('socket connected:', socket.id);

  socket.on(ACTIONS.JOIN, ({ roomId, username }) => {
    userSocketMap[socket.id] = username;

    // First user in room becomes admin and joins immediately
    if (!roomAdminMap[roomId]) {
      roomAdminMap[roomId] = socket.id;
      roomWritePermissions[roomId] = { [socket.id]: true };
      socket.join(roomId);

      const clients = getAllConnectedClients(roomId);
      io.to(socket.id).emit(ACTIONS.JOINED, {
        clients, username, socketId: socket.id, isAdmin: true, canWrite: true, code: roomCodeMap[roomId] || null,
      });
      return;
    }

    // Room exists — hold user in pending, notify admin
    if (!roomPendingRequests[roomId]) roomPendingRequests[roomId] = [];
    roomPendingRequests[roomId].push({ socketId: socket.id, username });

    io.to(roomAdminMap[roomId]).emit(ACTIONS.JOIN_REQUEST, { socketId: socket.id, username });
  });

  socket.on(ACTIONS.APPROVE_JOIN, ({ roomId, targetSocketId }) => {
    if (roomAdminMap[roomId] !== socket.id) return;
    if (roomPendingRequests[roomId]) {
      roomPendingRequests[roomId] = roomPendingRequests[roomId].filter(r => r.socketId !== targetSocketId);
    }
    const username = userSocketMap[targetSocketId];
    const targetSock = io.sockets.sockets.get(targetSocketId);
    if (!targetSock) return;
    targetSock.emit(ACTIONS.JOIN_APPROVED);
    admitUser(roomId, targetSocketId, username);
  });

  socket.on(ACTIONS.REJECT_JOIN, ({ roomId, targetSocketId }) => {
    if (roomAdminMap[roomId] !== socket.id) return;
    if (roomPendingRequests[roomId]) {
      roomPendingRequests[roomId] = roomPendingRequests[roomId].filter(r => r.socketId !== targetSocketId);
    }
    const targetSock = io.sockets.sockets.get(targetSocketId);
    if (targetSock) targetSock.emit(ACTIONS.JOIN_REJECTED, { message: 'Your request to join was denied by the admin.' });
  });

  socket.on(ACTIONS.CODE_CHANGE, ({ roomId, code }) => {
    const isAdmin = roomAdminMap[roomId] === socket.id;
    const canWrite = isAdmin || (roomWritePermissions[roomId] && roomWritePermissions[roomId][socket.id] === true);
    if (!canWrite) {
      socket.emit(ACTIONS.PERMISSION_DENIED, { message: 'You do not have permission to write.' });
      return;
    }
    if (code !== null && code !== undefined) roomCodeMap[roomId] = code;
    socket.in(roomId).emit(ACTIONS.CODE_CHANGE, { code });
  });

  socket.on(ACTIONS.SYNC_CODE, ({ socketId, code }) => {
    if (code !== null && code !== undefined) {
      const rooms = [...socket.rooms];
      const roomId = rooms.find(r => r !== socket.id);
      if (roomId) roomCodeMap[roomId] = code;
      io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code });
    } else {
      const rooms = [...socket.rooms];
      const roomId = rooms.find(r => r !== socket.id);
      if (roomId && roomCodeMap[roomId]) io.to(socketId).emit(ACTIONS.CODE_CHANGE, { code: roomCodeMap[roomId] });
    }
  });

  socket.on(ACTIONS.TOGGLE_WRITE, ({ roomId, targetSocketId }) => {
    if (roomAdminMap[roomId] !== socket.id) return;
    if (!roomWritePermissions[roomId]) roomWritePermissions[roomId] = {};
    roomWritePermissions[roomId][targetSocketId] = !roomWritePermissions[roomId][targetSocketId];
    const targetSock = io.sockets.sockets.get(targetSocketId);
    if (targetSock && targetSock.rooms.has(roomId)) {
      targetSock.emit(ACTIONS.PERMISSION_UPDATED, { canWrite: roomWritePermissions[roomId][targetSocketId] });
    }
    io.to(roomId).emit(ACTIONS.CLIENTS_UPDATED, { clients: getAllConnectedClients(roomId) });
  });

  socket.on(ACTIONS.KICK_USER, ({ roomId, targetSocketId }) => {
    if (roomAdminMap[roomId] !== socket.id) return;
    const targetSock = io.sockets.sockets.get(targetSocketId);
    if (targetSock && targetSock.rooms.has(roomId)) {
      const kickedUsername = userSocketMap[targetSocketId] || 'Unknown';
      targetSock.leave(roomId);
      targetSock.emit(ACTIONS.USER_KICKED, { message: 'You have been kicked from the room by the admin.' });
      delete userSocketMap[targetSocketId];
      if (roomWritePermissions[roomId]) delete roomWritePermissions[roomId][targetSocketId];
      io.to(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: targetSocketId, username: kickedUsername, clients: getAllConnectedClients(roomId),
      });
    }
  });

  socket.on('disconnecting', () => {
    const rooms = [...socket.rooms];
    rooms.forEach((roomId) => {
      // Remove from pending if they disconnect while waiting
      if (roomPendingRequests[roomId]) {
        roomPendingRequests[roomId] = roomPendingRequests[roomId].filter(r => r.socketId !== socket.id);
      }

      const wasAdmin = roomAdminMap[roomId] === socket.id;
      if (wasAdmin) {
        const remaining = getAllConnectedClients(roomId).filter(c => c.socketId !== socket.id);
        if (remaining.length > 0) {
          roomAdminMap[roomId] = remaining[0].socketId;
          if (roomWritePermissions[roomId]) roomWritePermissions[roomId][remaining[0].socketId] = true;
        } else {
          delete roomAdminMap[roomId];
          delete roomCodeMap[roomId];
          delete roomWritePermissions[roomId];
          delete roomPendingRequests[roomId];
        }
      }

      const updatedClients = getAllConnectedClients(roomId).filter(c => c.socketId !== socket.id);
      socket.to(roomId).emit(ACTIONS.DISCONNECTED, {
        socketId: socket.id, username: userSocketMap[socket.id], clients: updatedClients,
      });

      if (wasAdmin && updatedClients.length > 0) {
        io.to(updatedClients[0].socketId).emit(ACTIONS.JOINED, {
          clients: updatedClients,
          username: userSocketMap[updatedClients[0].socketId],
          socketId: updatedClients[0].socketId,
          isAdmin: true,
        });
      }
    });
    delete userSocketMap[socket.id];
  });
});

async function connectToMongo() {
  const client = new MongoClient(MONGO_URI);
  await client.connect();
  const db = client.db(MONGO_DB_NAME);
  downloadsCollection = db.collection('downloads');
  console.log(`Connected to MongoDB database "${MONGO_DB_NAME}"`);
}

const PORT = process.env.PORT || 5000;
connectToMongo()
  .catch((err) => console.error('Failed to connect to MongoDB. Download logging will be unavailable.', err))
  .finally(() => server.listen(PORT, () => console.log(`Server running on port ${PORT}`)));
