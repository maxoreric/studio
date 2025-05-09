// client/src/App.js (Simplified for no rooms, local video)
import React, { useState, useEffect, useRef } from 'react';
import io from 'socket.io-client';
import ReactPlayer from 'react-player'; // 我们现在直接使用 ReactPlayer
import './App.css'; // 稍后创建或修改

const SERVER_URL = "http://101.126.130.155:3001"; // 你的服务器 IP 和端口

function App() {
    const [socket, setSocket] = useState(null);
    const [videoFile, setVideoFile] = useState(null); // Stores the File object
    const [videoSrc, setVideoSrc] = useState(null);   // Stores the object URL for ReactPlayer

    const [videoState, setVideoState] = useState({
        isPlaying: false,
        currentTime: 0,
        sourceActionSocketId: null, // To identify if the update came from self
    });
    const [chatMessages, setChatMessages] = useState([]);
    const [chatInput, setChatInput] = useState('');
    // Danmaku and Voice can be added back similarly if needed

    const playerRef = useRef(null); // Ref for ReactPlayer instance
    const localActionInProgress = useRef(false); // To prevent immediate self-override from server

    // --- Socket Connection ---
    useEffect(() => {
        const newSocket = io(SERVER_URL);
        setSocket(newSocket);

        newSocket.on('connect', () => {
            console.log('Connected to server socket ID:', newSocket.id);
        });

        newSocket.on('disconnect', (reason) => {
            console.log('Disconnected from server:', reason);
        });

        newSocket.on('connect_error', (err) => {
            console.error('Connection Error:', err.message);
        });
        
        return () => {
            newSocket.disconnect();
        };
    }, []);

    // --- Socket Event Listeners ---
    useEffect(() => {
        if (!socket) return;

        const handleInitialVideoState = (initialState) => {
            console.log('Received initial video state:', initialState);
            setVideoState(prev => ({ ...prev, ...initialState, sourceActionSocketId: null }));
        };

        const handleVideoStateUpdate = (newState) => {
            console.log('Received video state update from server:', newState);
            // If the update was initiated by this client, we might ignore it or handle it carefully
            // For now, we'll update, but a more robust solution might check newState.sourceActionSocketId
            if (newState.sourceActionSocketId === socket.id) {
                console.log("Ignoring video state update from self.");
                return; 
            }
            // If an action was just performed locally, wait a bit before accepting server state
            // This helps prevent the player from "jumping" if server state arrives slightly delayed
            if (localActionInProgress.current) {
                console.log("Local action in progress, deferring server state update slightly.");
                // setTimeout(() => {
                //     setVideoState(prev => ({ ...prev, ...newState, sourceActionSocketId: null }));
                //     if (playerRef.current && Math.abs(playerRef.current.getCurrentTime() - newState.currentTime) > 1.5) {
                //         playerRef.current.seekTo(newState.currentTime, 'seconds');
                //     }
                // }, 500); // Delay for 500ms
                // return;
            }

            setVideoState(prev => ({ ...prev, ...newState, sourceActionSocketId: null }));
            // Force sync player if significant desync, especially on seek from others
            if (playerRef.current && Math.abs(playerRef.current.getCurrentTime() - newState.currentTime) > 1.5) { // Threshold for desync
                console.log(`Significant desync detected. Seeking player to server time: ${newState.currentTime}`);
                playerRef.current.seekTo(newState.currentTime, 'seconds');
            }
        };

        const handleNewChatMessage = (msg) => {
            setChatMessages(prev => [...prev, msg]);
        };

        socket.on('initialVideoState', handleInitialVideoState);
        socket.on('videoStateUpdate', handleVideoStateUpdate);
        socket.on('newChatMessage', handleNewChatMessage);
        // Add listeners for Danmaku and Voice if re-enabled

        return () => {
            socket.off('initialVideoState', handleInitialVideoState);
            socket.off('videoStateUpdate', handleVideoStateUpdate);
            socket.off('newChatMessage', handleNewChatMessage);
        };
    }, [socket]);

    const handleFileChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            setVideoFile(file);
            const objectURL = URL.createObjectURL(file);
            setVideoSrc(objectURL);
            // When a new video is loaded, reset server's idea of state via this client
            // (or have a dedicated "loadVideo" event)
            // For simplicity, let's assume the first play/seek will sync everyone
            setVideoState({ isPlaying: false, currentTime: 0, sourceActionSocketId: null });
            if (socket) {
                // Inform server that this client has loaded a new video (and reset state for others)
                // This requires a new server-side event, e.g., 'clientLoadedNewVideo'
                // For now, let's rely on the first play/seek to establish sync.
                // A "master" client concept could also be introduced.
            }
        } else {
            setVideoFile(null);
            setVideoSrc(null);
        }
    };

    // --- Video Player Callbacks ---
    const setLocalActionFlag = () => {
        localActionInProgress.current = true;
        setTimeout(() => {
            localActionInProgress.current = false;
        }, 1000); // Reset flag after 1 second
    };

    const handlePlay = () => {
        if (socket && videoSrc) {
            setLocalActionFlag();
            const currentTime = playerRef.current ? playerRef.current.getCurrentTime() : 0;
            socket.emit('videoControl', { action: 'play', value: currentTime });
            setVideoState(prev => ({ ...prev, isPlaying: true })); // Optimistic update
        }
    };

    const handlePause = () => {
        if (socket && videoSrc) {
            setLocalActionFlag();
            const currentTime = playerRef.current ? playerRef.current.getCurrentTime() : 0;
            socket.emit('videoControl', { action: 'pause', value: currentTime });
            setVideoState(prev => ({ ...prev, isPlaying: false })); // Optimistic update
        }
    };

    const handleSeek = (time) => { // time is in seconds from ReactPlayer
        if (socket && videoSrc) {
            setLocalActionFlag();
            socket.emit('videoControl', { action: 'seek', value: time });
            // Optimistic update for currentTime, isPlaying state depends on current
            // setVideoState(prev => ({ ...prev, currentTime: time }));
        }
    };

    const handleProgress = (state) => { // state: { played: 0-1, playedSeconds, loaded, loadedSeconds }
        // For local display or very infrequent sync. Avoid sending this frequently.
        // If not playing due to server state, but player is trying to play, update local state
        if (!videoState.isPlaying && playerRef.current && playerRef.current.props.playing) {
             // This can happen if server says pause but player was programmatically set to play
             // setVideoState(prev => ({ ...prev, currentTime: state.playedSeconds }));
        } else {
             setVideoState(prev => ({ ...prev, currentTime: state.playedSeconds }));
        }
    };

    const handleSendChatMessage = (e) => {
        e.preventDefault();
        if (chatInput.trim() && socket) {
            const sender = socket.id ? socket.id.substring(0, 6) : 'User';
            socket.emit('chatMessage', { message: chatInput, sender });
            setChatInput('');
        }
    };

    return (
        <div className="App">
            <header className="App-header">
                <h1>QuickSyncPlay (Local Video Sync)</h1>
                {!socket || !socket.connected ? <p style={{color: 'red'}}>Connecting to server...</p> : <p style={{color: 'green'}}>Connected!</p>}
            </header>

            <div className="controls">
                <input type="file" accept="video/*" onChange={handleFileChange} />
            </div>

            <div className="main-content">
                <div className="video-section">
                    {videoSrc ? (
                        <ReactPlayer
                            ref={playerRef}
                            url={videoSrc}
                            playing={videoState.isPlaying}
                            controls={true} // Show native controls
                            width="100%"
                            height="100%"
                            onPlay={handlePlay}
                            onPause={handlePause}
                            onSeek={handleSeek} // Called when user seeks using player's controls
                            onProgress={handleProgress} // Updates currentTime locally
                            // progressInterval={500} // How often onProgress is called
                            config={{ file: { forceVideo: true } }} // Helps ensure it's treated as video
                        />
                    ) : (
                        <div className="no-video-selected">
                            <p>Please select a local video file to play.</p>
                        </div>
                    )}
                    {/* Danmaku Overlay would go here if re-enabled */}
                </div>

                <div className="chat-section">
                    <h3>Chat</h3>
                    <div className="messages-list">
                        {chatMessages.map((msg, index) => (
                            <div key={index} className={`message ${msg.id === socket?.id ? 'my-message' : ''}`}>
                                <strong>{msg.sender}: </strong>{msg.message}
                                <span className="timestamp">{new Date(msg.timestamp).toLocaleTimeString()}</span>
                            </div>
                        ))}
                    </div>
                    <form onSubmit={handleSendChatMessage} className="message-input-form">
                        <input
                            type="text"
                            value={chatInput}
                            onChange={(e) => setChatInput(e.target.value)}
                            placeholder="Type a message..."
                        />
                        <button type="submit">Send</button>
                    </form>
                </div>
            </div>
            {/* Voice Recorder would go here if re-enabled */}
        </div>
    );
}

export default App;