
const { createServer } = require('http');
const { parse } = require('url');
const next = require('next');
const { Server } = require("socket.io");
const fs = require('fs').promises;
const path = require('path');

const dev = process.env.NODE_ENV !== 'production';
const app = next({ dev });
const handle = app.getRequestHandler();

const ROOMS_DIR = path.join(__dirname, 'server_data', 'rooms');

// In-memory store for rooms, acts as a cache.
// Files are the source of truth for persisted room data.
// rooms: { roomId: { users: Map<socketId, {username: string}>, password: 'pass', currentVideoUrl: null, currentVideoFileName: null, hostSocketId: null } }
const rooms = {};

// Ensure rooms directory exists
async function ensureRoomsDir() {
  try {
    await fs.mkdir(ROOMS_DIR, { recursive: true });
    console.log(`Rooms data directory ensured at: ${ROOMS_DIR}`);
  } catch (error) {
    console.error('Error creating rooms data directory:', error);
    process.exit(1); // Exit if we can't create the data directory
  }
}

async function saveRoomData(roomId, roomData) {
  if (!roomId || !roomData) return;
  const filePath = path.join(ROOMS_DIR, `${roomId}.json`);
  try {
    // Convert Map to a plain object for JSON serialization
    const serializableRoomData = {
      ...roomData,
      users: Array.from(roomData.users.entries()).reduce((obj, [key, value]) => {
        obj[key] = value;
        return obj;
      }, {})
    };
    await fs.writeFile(filePath, JSON.stringify(serializableRoomData, null, 2));
    // console.log(`Room data saved for ${roomId}`);
  } catch (error) {
    console.error(`Error saving room data for ${roomId}:`, error);
  }
}

async function loadRoomData(roomId) {
  if (!roomId) return null;
  const filePath = path.join(ROOMS_DIR, `${roomId}.json`);
  try {
    if ((await fs.stat(filePath)).isFile()) {
      const data = await fs.readFile(filePath, 'utf-8');
      const parsedData = JSON.parse(data);
      // Convert users object back to Map
      parsedData.users = new Map(Object.entries(parsedData.users || {}));
      return parsedData;
    }
  } catch (error) {
    if (error.code !== 'ENOENT') { // ENOENT means file not found, which is fine for new rooms
      console.error(`Error loading room data for ${roomId}:`, error);
    }
  }
  return null;
}

async function deleteRoomData(roomId) {
  if (!roomId) return;
  const filePath = path.join(ROOMS_DIR, `${roomId}.json`);
  try {
    await fs.unlink(filePath);
    console.log(`Room data deleted for ${roomId}`);
  } catch (error) {
    if (error.code !== 'ENOENT') {
      console.error(`Error deleting room data for ${roomId}:`, error);
    }
  }
}


app.prepare().then(async () => {
  await ensureRoomsDir();

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
    let currentRoomId = null; 

    socket.on("join_room", async ({ roomId, password, username }) => {
      roomId = decodeURIComponent(roomId);
      currentRoomId = roomId; 
      
      let roomData = rooms[roomId] || await loadRoomData(roomId);

      if (roomData) { // Room exists (either in memory or loaded from file)
        if (!rooms[roomId]) rooms[roomId] = roomData; // Cache if loaded from file

        if (roomData.password !== password) {
          socket.emit("join_error", "Invalid password.");
          currentRoomId = null; // Reset currentRoomId as join failed
          return;
        }

        // Check if user is already in the room (e.g. reconnecting with same socket ID or different tab)
        let existingUser = false;
        for (const [id, userObj] of roomData.users.entries()) {
            if (id === socket.id || userObj.username === username) {
                existingUser = true;
                // If socket.id is different but username matches, it's a new connection for same logical user.
                // We might want to update socket.id or handle this as a "rejoin".
                // For simplicity, if username matches, we'll update socket.id if it's different.
                if (id !== socket.id && userObj.username === username) {
                    roomData.users.delete(id); // Remove old entry
                    roomData.users.set(socket.id, { username }); // Add new entry
                    if (roomData.hostSocketId === id) roomData.hostSocketId = socket.id; // Update host if it was them
                }
                break;
            }
        }
        
        if (!existingUser && roomData.users.size >= 2) {
          socket.emit("join_error", "Room is full.");
          currentRoomId = null;
          return;
        }

        if (!existingUser) {
             roomData.users.set(socket.id, { username });
        }
       
        console.log(`${username} (${socket.id}) joined room ${roomId}`);
        socket.join(roomId); // Join Socket.IO room
        await saveRoomData(roomId, roomData);

        socket.emit("room_joined", { 
          roomId, 
          isHost: socket.id === roomData.hostSocketId,
          currentVideoUrl: roomData.currentVideoUrl,
          currentVideoFileName: roomData.currentVideoFileName,
          users: Array.from(roomData.users.values()),
        });
        // Notify other users in the room, only if this is a new user joining (not a re-join scenario handled above)
        if (!existingUser) {
            socket.to(roomId).emit("user_joined", { userId: socket.id, username, users: Array.from(roomData.users.values()) });
        }

      } else { // Room doesn't exist, create it
        rooms[roomId] = {
          users: new Map([[socket.id, { username }]]),
          password: password,
          currentVideoUrl: null,
          currentVideoFileName: null,
          hostSocketId: socket.id,
        };
        console.log(`Room ${roomId} created by ${username} (${socket.id})`);
        socket.join(roomId);
        await saveRoomData(roomId, rooms[roomId]);

        socket.emit("room_joined", { 
          roomId, 
          isHost: true, 
          users: Array.from(rooms[roomId].users.values()),
          currentVideoUrl: rooms[roomId].currentVideoUrl,
          currentVideoFileName: rooms[roomId].currentVideoFileName,
        });
      }
    });

    socket.on("send_message", ({ roomId, messageData }) => {
      roomId = decodeURIComponent(roomId);
      if (rooms[roomId] && rooms[roomId].users.has(socket.id)) {
        io.to(roomId).emit("new_message", messageData);
      }
    });

    socket.on("video_select", async ({ roomId, videoUrl, fileName }) => {
      roomId = decodeURIComponent(roomId);
      if (rooms[roomId] && rooms[roomId].hostSocketId === socket.id) {
        rooms[roomId].currentVideoUrl = videoUrl; 
        rooms[roomId].currentVideoFileName = fileName;
        await saveRoomData(roomId, rooms[roomId]);
        io.to(roomId).emit("video_selected", { videoUrl: videoUrl, fileName });
        console.log(`Video selected in room ${roomId} by host ${socket.id}: ${fileName}`);
      } else {
        socket.emit("error_event", "Only the host can select a video.");
      }
    });

    socket.on("video_control", ({ roomId, control }) => {
      roomId = decodeURIComponent(roomId);
      if (rooms[roomId] && rooms[roomId].hostSocketId === socket.id) {
         socket.to(roomId).emit("video_controlled", control); 
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
            } else { 
                rooms[roomId].users.forEach((userData, userSocketId) => {
                    if (userSocketId !== socket.id) {
                        io.to(userSocketId).emit("apply_host_sync_state", state);
                    }
                });
            }
        }
    });

    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.id);
      if (currentRoomId && rooms[currentRoomId]) {
        const room = rooms[currentRoomId];
        const disconnectedUser = room.users.get(socket.id);
        room.users.delete(socket.id);

        io.to(currentRoomId).emit("user_left", { userId: socket.id, username: disconnectedUser?.username, users: Array.from(room.users.values()) });

        if (room.users.size === 0) {
          console.log(`Room ${currentRoomId} is empty, deleting from memory and file.`);
          delete rooms[currentRoomId];
          await deleteRoomData(currentRoomId);
        } else {
          if (socket.id === room.hostSocketId) {
            const newHostEntry = Array.from(room.users.entries())[0]; 
            if (newHostEntry) {
              room.hostSocketId = newHostEntry[0]; 
              const newHostUsername = newHostEntry[1].username; 
              console.log(`Host left room ${currentRoomId}. New host: ${newHostUsername} (${room.hostSocketId})`);
              io.to(room.hostSocketId).emit("promoted_to_host");
              io.to(currentRoomId).emit("new_host", { hostSocketId: room.hostSocketId, hostUsername: newHostUsername });
            }
          }
          // Save updated user list or new host
          await saveRoomData(currentRoomId, room);
        }
      }
      currentRoomId = null; // Clear for this socket instance
    });
  });

  const PORT = parseInt(process.env.PORT, 10) || 9002;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
