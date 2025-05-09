// server/server.js (Simplified for no rooms, local video)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
// const path = require('path'); // No longer needed for serving videos
// const fs = require('fs'); // No longer needed for uploads dir
// const multer = require('multer'); // No longer needed

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    cors: {
        origin: "*", // 允许所有来源，开发时方便
        methods: ["GET", "POST"]
    }
});

const PORT = process.env.PORT || 3001;

// Middleware
app.use(cors());
app.use(express.json());

// --- Global Video State (In-memory for MVP) ---
// This will hold the state of the "currently controlled" video
let globalVideoState = {
    // No URL needed from server side
    isPlaying: false,
    currentTime: 0,
    lastUpdate: Date.now(),
    sourceActionSocketId: null // ID of the socket that initiated the last action
};

// --- Socket.IO Logic ---
io.on('connection', (socket) => {
    console.log('A user connected:', socket.id);

    // Send the current global video state to the newly connected user
    socket.emit('initialVideoState', globalVideoState);

    socket.on('videoControl', (controlData) => {
        // controlData = { action: 'play'/'pause'/'seek', value: (currentTime for seek/play/pause) }
        console.log(`Video control from ${socket.id}:`, controlData);

        const { action, value } = controlData;
        let changed = false;

        switch (action) {
            case 'play':
                if (!globalVideoState.isPlaying) {
                    globalVideoState.isPlaying = true;
                    if (typeof value === 'number') globalVideoState.currentTime = value;
                    changed = true;
                }
                break;
            case 'pause':
                if (globalVideoState.isPlaying) {
                    globalVideoState.isPlaying = false;
                    if (typeof value === 'number') globalVideoState.currentTime = value;
                    changed = true;
                }
                break;
            case 'seek':
                if (typeof value === 'number') {
                    globalVideoState.currentTime = value;
                    // If seeking, usually implies intent to play from that point if it was paused,
                    // or continue playing if it was playing.
                    // For simplicity, we'll let the client manage its play/pause state after seek.
                    // Or, we could add an 'isPlayingAfterSeek' flag from client.
                    changed = true;
                }
                break;
        }

        if (changed) {
            globalVideoState.lastUpdate = Date.now();
            globalVideoState.sourceActionSocketId = socket.id; // Track who made the change
            // Broadcast the updated state to all *other* clients
            socket.broadcast.emit('videoStateUpdate', globalVideoState);
            console.log('Updated globalVideoState:', globalVideoState);
        }
    });

    socket.on('chatMessage', ({ message, sender }) => {
        if (message && sender) {
            // Broadcast to all clients, including sender for simplicity here
            // or use socket.broadcast.emit if sender handles their own message display
            io.emit('newChatMessage', { message, sender, timestamp: Date.now(), id: socket.id });
            console.log(`Global Chat from ${sender} (${socket.id}): ${message}`);
        }
    });

    // Danmaku and Voice Messages can be handled similarly if still needed
    // For simplicity, I'll comment them out for now. Add back if required.
    /*
    socket.on('danmakuMessage', ({ text }) => {
        if (text) {
            io.emit('newDanmaku', { text, timestamp: Date.now(), id: socket.id });
        }
    });

    socket.on('voiceMessage', ({ audioBlob }) => {
        if (audioBlob) {
            socket.broadcast.emit('newVoiceMessage', { senderId: socket.id, audioBlob });
        }
    });
    */

    socket.on('disconnect', () => {
        console.log('User disconnected:', socket.id);
    });
});

server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
    console.log(`Accessible externally (if firewall configured) on port ${PORT}`);
});