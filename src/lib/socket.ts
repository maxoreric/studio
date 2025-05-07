
import { io, type Socket } from 'socket.io-client';

let socket: Socket | null = null;

export const getSocket = (): Socket => {
  if (!socket || socket.disconnected) { // Reconnect if disconnected
    // The URL should point to your server. 
    // If Next.js and Socket.IO are on the same host and port, 
    // this will work automatically. Otherwise, specify the URL.
    // e.g. io('http://localhost:9002')
    socket = io({
      // path: '/socket.io', // Default path
      transports: ['websocket'], // Prefer WebSocket
      // autoConnect: false, // Connect manually later if needed
      // reconnectionAttempts: 5, // Example: attempt to reconnect 5 times
    }); 

    socket.on('connect_error', (err) => {
      console.error('Socket connection error:', err.message);
      // Potentially handle UI updates for connection errors
    });

    socket.on('disconnect', (reason) => {
      console.log('Socket disconnected:', reason);
      // if (reason === 'io server disconnect') {
        // The disconnection was initiated by the server, you need to reconnect manually if desired
        // socket.connect(); 
      // }
      // else the socket will automatically try to reconnect
    });
  }
  return socket;
};

export const disconnectSocket = () => {
  if (socket && socket.connected) {
    socket.disconnect();
  }
  socket = null; // Allow re-creation on next getSocket call
};
