const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*" } // Ważne przy wrzucaniu na itch.io
});

app.use(express.static(__dirname));

const rooms = {};

io.on('connection', (socket) => {
    const sendList = () => {
        const list = Object.values(rooms)
            .filter(r => !r.isPrivate)
            .map(r => ({ id: r.id, count: Object.keys(r.players).length }));
        io.emit('list-update', list);
    };
    sendList();

    socket.on('create-room', (isPrivate) => {
        const id = "RUN-" + Math.random().toString(36).substring(2, 7).toUpperCase();
        const lockerCount = 12;
        const keyLockerIndex = Math.floor(Math.random() * lockerCount);
        rooms[id] = { id, isPrivate, players: {}, level: 1, keyLockerIndex, keyPicked: false, lockerCount };
        socket.join(id);
        socket.emit('joined', { id, isHost: true, keyLocker: keyLockerIndex, lockerCount });
        sendList();
    });

    socket.on('join-room', (id) => {
        const rId = id.toUpperCase();
        if (rooms[rId]) {
            socket.join(rId);
            rooms[rId].players[socket.id] = { pos: [0, 1.6, 0] };
            socket.emit('joined', { id: rId, isHost: false, keyLocker: rooms[rId].keyLockerIndex, lockerCount: rooms[rId].lockerCount });
            sendList();
        }
    });

    socket.on('locker-opened', (data) => {
        if (rooms[data.roomId]) {
            io.to(data.roomId).emit('locker-state', { index: data.index });
            if (data.index === rooms[data.roomId].keyLockerIndex) {
                rooms[data.roomId].keyPicked = true;
                io.to(data.roomId).emit('key-found');
            }
        }
    });

    socket.on('move', (data) => {
        if (rooms[data.roomId]) {
            socket.to(data.roomId).emit('p-moved', { id: socket.id, pos: data.pos, rot: data.rot });
        }
    });

    socket.on('win', (roomId) => {
        if (rooms[roomId] && rooms[roomId].keyPicked) {
            rooms[roomId].level++;
            rooms[roomId].keyPicked = false;
            rooms[roomId].lockerCount = 10 + (rooms[roomId].level * 2);
            rooms[roomId].keyLockerIndex = Math.floor(Math.random() * rooms[roomId].lockerCount);
            io.to(roomId).emit('next-lvl', { 
                level: rooms[roomId].level, 
                keyLocker: rooms[roomId].keyLockerIndex,
                lockerCount: rooms[roomId].lockerCount 
            });
        }
    });

    socket.on('disconnect', () => {
        for (const rId in rooms) {
            if (rooms[rId].players[socket.id]) {
                delete rooms[rId].players[socket.id];
                io.to(rId).emit('p-left', socket.id);
                if (Object.keys(rooms[rId].players).length === 0) delete rooms[rId];
            }
        }
        sendList();
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log('Serwer działa na porcie ' + PORT));