
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require("socket.io");

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

// In-memory store for rooms
// rooms: { roomId: { users: Map<socketId, {username: string}>, password: 'pass', currentVideoUrl: null, currentVideoFileName: null, hostSocketId: null } }
const rooms = {};

app.prepare().then(() => {
  const httpServer = createServer((req, res) => {
    const parsedUrl = parse(req.url, true);
    handle(req, res, parsedUrl);
  });

  const io = new Server(httpServer, {
    cors: {
      origin: "*", // Be more specific in production
      methods: ["GET", "POST"]
    }
  });

  io.on("connection", (socket) => {
    console.log("User connected:", socket.id);
    let currentRoomId = null; // To track which room this socket is in

    socket.on("join_room", ({ roomId, password, username }) => {
      roomId = decodeURIComponent(roomId);
      currentRoomId = roomId; // Store for disconnect logic
      socket.join(roomId); // Join Socket.IO room

      if (!rooms[roomId]) { // Room doesn't exist, create it
        rooms[roomId] = {
          users: new Map(),
          password: password,
          currentVideoUrl: null,
          currentVideoFileName: null,
          hostSocketId: socket.id,
        };
        rooms[roomId].users.set(socket.id, { username });
        console.log(`Room ${roomId} created by ${username} (${socket.id})`);
        socket.emit("room_joined", { 
          roomId, 
          isHost: true, 
          users: Array.from(rooms[roomId].users.values()),
          currentVideoUrl: rooms[roomId].currentVideoUrl,
          currentVideoFileName: rooms[roomId].currentVideoFileName,
        });
      } else { // Room exists
        if (rooms[roomId].password !== password) {
          socket.emit("join_error", "Invalid password.");
          socket.leave(roomId);
          currentRoomId = null;
          return;
        }
        if (rooms[roomId].users.size >= 2) {
          socket.emit("join_error", "Room is full.");
          socket.leave(roomId);
          currentRoomId = null;
          return;
        }
        rooms[roomId].users.set(socket.id, { username });
        console.log(`${username} (${socket.id}) joined room ${roomId}`);
        socket.emit("room_joined", { 
          roomId, 
          isHost: socket.id === rooms[roomId].hostSocketId,
          currentVideoUrl: rooms[roomId].currentVideoUrl,
          currentVideoFileName: rooms[roomId].currentVideoFileName,
          users: Array.from(rooms[roomId].users.values()),
        });
        // Notify other users in the room
        socket.to(roomId).emit("user_joined", { userId: socket.id, username, users: Array.from(rooms[roomId].users.values()) });
      }
    });

    socket.on("send_message", ({ roomId, messageData }) => {
      roomId = decodeURIComponent(roomId);
      if (rooms[roomId] && rooms[roomId].users.has(socket.id)) {
        // Broadcast to all in room including sender
        io.to(roomId).emit("new_message", messageData);
      }
    });

    socket.on("video_select", ({ roomId, videoUrl, fileName }) => {
      roomId = decodeURIComponent(roomId);
      if (rooms[roomId] && rooms[roomId].hostSocketId === socket.id) {
        // In this simplified version, videoUrl for blobs is host-local.
        // We store fileName for others to see what's playing.
        // If videoUrl was a public URL, this would be the actual shared URL.
        rooms[roomId].currentVideoUrl = videoUrl; // For host's reference, or if it's a public URL
        rooms[roomId].currentVideoFileName = fileName;
        // For non-host clients, they will receive fileName. If videoUrl was a blob on host,
        // they can't play it. If it was a public URL, they could.
        // The client side VideoPlayerWrapper handles this by not attempting to load blob URLs for non-hosts.
        io.to(roomId).emit("video_selected", { videoUrl: videoUrl, fileName }); // Send original URL and filename
        console.log(`Video selected in room ${roomId} by host ${socket.id}: ${fileName}`);
      } else {
        socket.emit("error_event", "Only the host can select a video.");
      }
    });

    socket.on("video_control", ({ roomId, control }) => {
      roomId = decodeURIComponent(roomId);
      if (rooms[roomId] && rooms[roomId].hostSocketId === socket.id) {
         socket.to(roomId).emit("video_controlled", control); 
         // console.log(`Video control in room ${roomId} by host ${socket.id}:`, control);
      } else if (rooms[roomId] && rooms[roomId].users.has(socket.id) && rooms[roomId].hostSocketId !== socket.id) {
        // Non-host sent a control event. For simplicity, we ignore it for global sync.
        // Client-side logic should prevent non-hosts from emitting these.
        // If we allow any user to control and broadcast:
        // socket.to(roomId).emit("video_controlled", control); 
        // But this requires careful handling on client to avoid feedback loops.
        // Sticking to host-only control for sync.
      }
    });
    
    socket.on("request_resync", ({ roomId }) => {
        roomId = decodeURIComponent(roomId);
        if (rooms[roomId] && rooms[roomId].users.has(socket.id) && rooms[roomId].hostSocketId !== socket.id) {
            if (rooms[roomId].hostSocketId) {
                io.to(rooms[roomId].hostSocketId).emit("host_provide_sync_state", { requesterSocketId: socket.id });
            }
        }
    });

    socket.on("host_sync_state_update", ({ roomId, state, targetSocketId }) => {
        roomId = decodeURIComponent(roomId);
        if (rooms[roomId] && rooms[roomId].hostSocketId === socket.id) {
            if (targetSocketId) {
                 io.to(targetSocketId).emit("apply_host_sync_state", state);
            } else { // Broadcast to all non-host users if no specific target
                rooms[roomId].users.forEach((userData, userSocketId) => {
                    if (userSocketId !== socket.id) {
                        io.to(userSocketId).emit("apply_host_sync_state", state);
                    }
                });
            }
        }
    });


    socket.on("disconnect", () => {
      console.log("User disconnected:", socket.id);
      if (currentRoomId && rooms[currentRoomId]) {
        const room = rooms[currentRoomId];
        const disconnectedUser = room.users.get(socket.id);
        room.users.delete(socket.id);

        io.to(currentRoomId).emit("user_left", { userId: socket.id, username: disconnectedUser?.username, users: Array.from(room.users.values()) });

        if (room.users.size === 0) {
          console.log(`Room ${currentRoomId} is empty, deleting.`);
          delete rooms[currentRoomId];
        } else if (socket.id === room.hostSocketId) {
          // Host left, assign a new host
          const newHostEntry = Array.from(room.users.entries())[0]; 
          if (newHostEntry) {
            room.hostSocketId = newHostEntry[0]; 
            const newHostUsername = newHostEntry[1].username; 
            console.log(`Host left room ${currentRoomId}. New host: ${newHostUsername} (${room.hostSocketId})`);
            io.to(room.hostSocketId).emit("promoted_to_host");
            io.to(currentRoomId).emit("new_host", { hostSocketId: room.hostSocketId, hostUsername: newHostUsername });
          }
        }
      }
    });
  });

  const PORT = parseInt(process.env.PORT, 10) || 9002;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
