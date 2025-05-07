
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
const rooms = {}; // This will be populated from files or on room creation

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
    // Check if file exists before attempting to read
    await fs.access(filePath); // Throws error if file doesn't exist
    const data = await fs.readFile(filePath, 'utf-8');
    const parsedData = JSON.parse(data);
    // Convert users object back to Map
    parsedData.users = new Map(Object.entries(parsedData.users || {}));
    return parsedData;
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
    let currentRoomIdForSocket = null; // Track room for this specific socket connection

    socket.on("join_room", async ({ roomId, password, username }) => {
      const decodedRoomId = decodeURIComponent(roomId);
      
      let roomData = rooms[decodedRoomId] || await loadRoomData(decodedRoomId);

      if (!username) {
        socket.emit("join_error", "Username is required.");
        return;
      }

      if (roomData) { // Room exists
        if (!rooms[decodedRoomId]) rooms[decodedRoomId] = roomData; // Cache if loaded from file

        if (roomData.password !== password) {
          socket.emit("join_error", "Invalid password.");
          return;
        }

        // Check if user with same username is already in the room but different socket
        const existingUserWithSameName = Array.from(roomData.users.values()).find(u => u.username === username);
        if (existingUserWithSameName && !roomData.users.has(socket.id)) {
            // This logic could be refined, e.g., allow rejoin if socket ID changes but username is same.
            // For simplicity, if a username conflict occurs with a *different* socket ID, deny entry.
            // If it's the *same* socket ID trying to rejoin (e.g., after a brief disconnect), it might be handled by reconnect logic.
            // Or if it's the same user opening a new tab, we need a strategy.
            // Current approach: if username exists with different socket ID, and room is not full, it is effectively a new user.
            // If username exists with *this* socket ID, it's a reconnect.
        }


        if (roomData.users.size >= 2 && !roomData.users.has(socket.id)) {
          // Check if one of the users is this username trying to reconnect with a new socket ID
          let canRejoin = false;
          let oldSocketIdToReplace = null;
          for (const [id, userObj] of roomData.users.entries()) {
              if (userObj.username === username) {
                  canRejoin = true;
                  oldSocketIdToReplace = id;
                  break;
              }
          }

          if (canRejoin && oldSocketIdToReplace) {
             if (oldSocketIdToReplace !== socket.id) {
                roomData.users.delete(oldSocketIdToReplace);
                if (roomData.hostSocketId === oldSocketIdToReplace) {
                    roomData.hostSocketId = socket.id; // Update host if it was them
                }
             } // else if oldSocketIdToReplace IS socket.id, they are already "in", no need to add again
          } else {
             socket.emit("join_error", "Room is full.");
             return;
          }
        }
        
        // Add user if not already present (covers new joins and rejoins with new socket ID)
        if (!roomData.users.has(socket.id)) {
             roomData.users.set(socket.id, { username });
        }
        currentRoomIdForSocket = decodedRoomId;
        socket.join(decodedRoomId);
        await saveRoomData(decodedRoomId, roomData);

        console.log(`${username} (${socket.id}) joined room ${decodedRoomId}`);
        socket.emit("room_joined", { 
          roomId: decodedRoomId, 
          isHost: socket.id === roomData.hostSocketId,
          currentVideoUrl: roomData.currentVideoUrl,
          currentVideoFileName: roomData.currentVideoFileName,
          users: Array.from(roomData.users.values()),
        });
        socket.to(decodedRoomId).emit("user_joined", { userId: socket.id, username, users: Array.from(roomData.users.values()) });

      } else { // Room doesn't exist, create it
        if (rooms[decodedRoomId]?.users?.size >= 2) { // Should not happen if roomData is null but check anyway
             socket.emit("join_error", "Room is full (cannot create)."); // Or some other error
             return;
        }
        rooms[decodedRoomId] = {
          users: new Map([[socket.id, { username }]]),
          password: password,
          currentVideoUrl: null,
          currentVideoFileName: null,
          hostSocketId: socket.id,
        };
        currentRoomIdForSocket = decodedRoomId;
        socket.join(decodedRoomId);
        await saveRoomData(decodedRoomId, rooms[decodedRoomId]);

        console.log(`Room ${decodedRoomId} created by ${username} (${socket.id})`);
        socket.emit("room_joined", { 
          roomId: decodedRoomId, 
          isHost: true, 
          users: Array.from(rooms[decodedRoomId].users.values()),
          currentVideoUrl: rooms[decodedRoomId].currentVideoUrl,
          currentVideoFileName: rooms[decodedRoomId].currentVideoFileName,
        });
      }
    });

    socket.on("send_message", ({ roomId, messageData }) => {
      const decodedRoomId = decodeURIComponent(roomId);
      if (rooms[decodedRoomId] && rooms[decodedRoomId].users.has(socket.id)) {
        // The messageData already includes the sender's username and socket ID (userId)
        // We just need to broadcast it.
        io.to(decodedRoomId).emit("new_message", messageData);
      }
    });

    socket.on("video_select", async ({ roomId, videoUrl, fileName }) => {
      const decodedRoomId = decodeURIComponent(roomId);
      if (rooms[decodedRoomId] && rooms[decodedRoomId].hostSocketId === socket.id) {
        rooms[decodedRoomId].currentVideoUrl = videoUrl; 
        rooms[decodedRoomId].currentVideoFileName = fileName;
        await saveRoomData(decodedRoomId, rooms[decodedRoomId]);
        io.to(decodedRoomId).emit("video_selected", { videoUrl: videoUrl, fileName });
        console.log(`Video selected in room ${decodedRoomId} by host ${socket.id}: ${fileName}`);
      } else {
        socket.emit("error_event", "Only the host can select a video.");
      }
    });

    socket.on("video_control", ({ roomId, control }) => {
      const decodedRoomId = decodeURIComponent(roomId);
      if (rooms[decodedRoomId] && rooms[decodedRoomId].hostSocketId === socket.id) {
         // Broadcast to others, not back to the host who initiated it
         socket.to(decodedRoomId).emit("video_controlled", control); 
      }
    });
    
    socket.on("request_resync", ({ roomId }) => {
        const decodedRoomId = decodeURIComponent(roomId);
        const room = rooms[decodedRoomId];
        if (room && room.users.has(socket.id) && room.hostSocketId !== socket.id) {
            if (room.hostSocketId) {
                console.log(`Resync requested by ${socket.id} in room ${decodedRoomId}. Notifying host ${room.hostSocketId}`);
                io.to(room.hostSocketId).emit("host_provide_sync_state", { requesterSocketId: socket.id });
            }
        }
    });

    socket.on("host_sync_state_update", ({ roomId, state, targetSocketId }) => {
        const decodedRoomId = decodeURIComponent(roomId);
        const room = rooms[decodedRoomId];
        if (room && room.hostSocketId === socket.id) {
            if (targetSocketId) { // Sync for a specific requester
                 io.to(targetSocketId).emit("apply_host_sync_state", state);
                 console.log(`Host ${socket.id} sent sync state to ${targetSocketId} in room ${decodedRoomId}`);
            } else { // General sync (e.g., after new video selected)
                // Broadcast to all *other* users
                room.users.forEach((userData, userSocketId) => {
                    if (userSocketId !== socket.id) {
                        io.to(userSocketId).emit("apply_host_sync_state", state);
                    }
                });
                console.log(`Host ${socket.id} broadcast sync state to room ${decodedRoomId}`);
            }
        }
    });

    socket.on("disconnect", async () => {
      console.log("User disconnected:", socket.id);
      // currentRoomIdForSocket should be set if the user successfully joined a room
      if (currentRoomIdForSocket && rooms[currentRoomIdForSocket]) {
        const room = rooms[currentRoomIdForSocket];
        const disconnectedUser = room.users.get(socket.id);
        room.users.delete(socket.id);

        io.to(currentRoomIdForSocket).emit("user_left", { 
            userId: socket.id, 
            username: disconnectedUser?.username, 
            users: Array.from(room.users.values()) 
        });

        if (room.users.size === 0) {
          console.log(`Room ${currentRoomIdForSocket} is empty, deleting from memory and file.`);
          delete rooms[currentRoomIdForSocket]; // Remove from in-memory cache
          await deleteRoomData(currentRoomIdForSocket); // Remove from file
        } else {
          if (socket.id === room.hostSocketId) { // If the host disconnected
            // Promote the first user in the list to be the new host
            const newHostEntry = Array.from(room.users.entries())[0]; 
            if (newHostEntry) {
              room.hostSocketId = newHostEntry[0]; 
              const newHostUsername = newHostEntry[1].username; 
              console.log(`Host left room ${currentRoomIdForSocket}. New host: ${newHostUsername} (${room.hostSocketId})`);
              io.to(room.hostSocketId).emit("promoted_to_host"); // Notify the new host they are promoted
              // Notify everyone in the room about the new host
              io.to(currentRoomIdForSocket).emit("new_host", { hostSocketId: room.hostSocketId, hostUsername: newHostUsername });
            }
          }
          // Save updated user list or new host information
          await saveRoomData(currentRoomIdForSocket, room);
        }
      }
      // currentRoomIdForSocket = null; // Clear for this socket instance's scope, though this var is local to `io.on('connection')`
    });
  });

  const PORT = parseInt(process.env.PORT, 10) || 9002;
  httpServer.listen(PORT, (err) => {
    if (err) throw err;
    console.log(`> Ready on http://localhost:${PORT}`);
  });
});
