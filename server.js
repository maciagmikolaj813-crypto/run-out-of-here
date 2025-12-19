const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(express.static(__dirname));

let rooms = {};

io.on('connection', (socket) => {
    // Wysyłanie listy pokoi przy wejściu
    socket.emit('list-update', Object.values(rooms).filter(r => !r.private).map(r => ({id: r.id, count: r.players.length})));

    socket.on('create-room', (isPrivate) => {
        const roomId = Math.random().toString(36).substring(2, 7).toUpperCase();
        rooms[roomId] = {
            id: roomId,
            players: [],
            private: isPrivate,
            level: 1,
            keyLocker: Math.floor(Math.random() * 10)
        };
        join(roomId);
    });

    socket.on('join-room', (roomId) => {
        if (rooms[roomId]) join(roomId);
    });

    function join(roomId) {
        socket.join(roomId);
        rooms[roomId].players.push(socket.id);
        socket.emit('joined', { id: roomId, keyLocker: rooms[roomId].keyLocker });
        io.emit('list-update', Object.values(rooms).filter(r => !r.private).map(r => ({id: r.id, count: r.players.length})));
    }

    socket.on('move', (data) => {
        socket.to(data.roomId).emit('p-moved', { id: socket.id, pos: data.pos, rot: data.rot });
    });

    socket.on('locker-opened', (data) => {
        const room = rooms[data.roomId];
        if (room) {
            io.to(data.roomId).emit('locker-state', { index: data.index });
            if (data.index === room.keyLocker) {
                io.to(data.roomId).emit('key-found');
            }
        }
    });

    socket.on('win', (roomId) => {
        const room = rooms[roomId];
        if (room) {
            room.level++;
            room.keyLocker = Math.floor(Math.random() * (10 + room.level * 2));
            io.to(roomId).emit('next-lvl', { level: room.level, keyLocker: room.keyLocker });
        }
    });

    socket.on('disconnect', () => {
        for (let r in rooms) {
            rooms[r].players = rooms[r].players.filter(id => id !== socket.id);
            if (rooms[r].players.length === 0) delete rooms[r];
        }
        io.emit('p-left', socket.id);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Serwer działa na porcie ${PORT}`));
