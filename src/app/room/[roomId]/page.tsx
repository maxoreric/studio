
'use client';

import { useState, useEffect, use, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { VideoPlayerWrapper, type VideoPlayerHandle } from '@/components/video/VideoPlayerWrapper';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { VideoUpload } from '@/components/upload/VideoUpload';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LayoutGrid, Users, Crown, Loader2, LogOut, AlertTriangle } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

interface RoomPageProps {
  params: { roomId: string };
}

interface User {
  id?: string; // socket.id from server
  username: string;
}

export default function RoomPage({ params }: RoomPageProps) {
  const resolvedParams = use(params); // Resolve params promise
  const { roomId: encodedRoomId } = resolvedParams;
  const roomId = decodeURIComponent(encodedRoomId);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [usersInRoom, setUsersInRoom] = useState<User[]>([]);
  const [roomJoined, setRoomJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [joinError, setJoinError] = useState<string | null>(null);
  const [passwordAttempt, setPasswordAttempt] = useState('');
  const [username, setUsername] = useState('');
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);

  const { toast } = useToast();
  const router = useRouter();

  // Effect for initializing socket and setting up listeners
  useEffect(() => {
    const storedUsername = sessionStorage.getItem('roomUsernameSyncStream');
    if (storedUsername) {
      setUsername(storedUsername);
    } else {
      // Should not happen if RoomEntryForm sets it, but as a fallback
      const randomUser = `User_${Math.random().toString(36).substring(2, 7)}`;
      setUsername(randomUser);
      sessionStorage.setItem('roomUsernameSyncStream', randomUser);
    }
    
    const newSocket = getSocket();
    setSocket(newSocket);

    // Attempt to join room if password is in session storage
    const storedPassword = sessionStorage.getItem('roomPasswordSyncStream');
    if (storedPassword && roomId && storedUsername) {
      if (newSocket.connected) {
        newSocket.emit("join_room", { roomId, password: storedPassword, username: storedUsername });
      } else {
        newSocket.once('connect', () => {
          newSocket.emit("join_room", { roomId, password: storedPassword, username: storedUsername });
        });
        if (!newSocket.active) newSocket.connect();
      }
    } else {
      setIsLoading(false); // No password, show prompt
    }

    return () => {
      // Clean up socket instance on component unmount, if desired
      // but typically we might want to keep it alive across navigation within the app
      // For this app, leaving the room page means disconnecting.
      // disconnectSocket(); // This nullifies the shared instance. Server handles 'disconnect' event.
      // If socket instance is shared globally, removing listeners specific to this room is enough.
      if (newSocket) {
        newSocket.off("room_joined");
        newSocket.off("join_error");
        newSocket.off("user_joined");
        newSocket.off("user_left");
        newSocket.off("promoted_to_host");
        newSocket.off("new_host");
        newSocket.off("video_selected");
        newSocket.off("video_controlled");
        newSocket.off("host_provide_sync_state");
        newSocket.off("apply_host_sync_state");
        newSocket.off("error_event");
      }
    };
  }, [roomId]); // Only run once on mount for setup, roomId is stable after decode

  // Effect for handling socket events - depends on `socket` and `isHost` state
  useEffect(() => {
    if (!socket) return;

    const handleRoomJoined = (data: { roomId: string; isHost: boolean; users: User[]; currentVideoUrl?: string; currentVideoFileName?: string }) => {
      toast({ title: "Joined Room", description: `Successfully joined ${data.roomId}. You are ${data.isHost ? 'the host' : 'a guest'}.` });
      setRoomJoined(true);
      setIsHost(data.isHost);
      setUsersInRoom(data.users || []);
      if (data.currentVideoUrl) {
        setVideoUrl(data.currentVideoUrl);
        setVideoFileName(data.currentVideoFileName || 'Shared Video');
      }
      setIsLoading(false);
      setJoinError(null);
      sessionStorage.removeItem('roomPasswordSyncStream');
    };

    const handleJoinError = (errorMsg: string) => {
      toast({ title: "Join Error", description: errorMsg, variant: "destructive" });
      setJoinError(errorMsg);
      setIsLoading(false);
      setRoomJoined(false);
      sessionStorage.removeItem('roomPasswordSyncStream'); // Clear failed password attempt
    };

    const handleUserJoined = (data: { userId: string; username: string; users: User[] }) => {
      toast({ title: "User Joined", description: `${data.username} has joined the room.` });
      setUsersInRoom(data.users || []);
    };

    const handleUserLeft = (data: { userId: string; username?: string; users: User[] }) => {
      toast({ title: "User Left", description: `${data.username || 'A user'} has left the room.` });
      setUsersInRoom(data.users || []);
    };
    
    const handlePromotedToHost = () => {
      toast({ title: "You are now the host!" });
      setIsHost(true);
    };

    const handleNewHost = (data: { hostSocketId: string; hostUsername: string; }) => {
      if (data.hostSocketId !== socket?.id) { 
        toast({ title: "New Host", description: `${data.hostUsername} is now the host.` });
      }
      // isHost state will be updated by "promoted_to_host" if this client is the new host
    };

    const handleVideoSelected = ({ videoUrl: newVideoUrl, fileName: newFileName }: { videoUrl: string, fileName: string}) => {
      setVideoUrl(newVideoUrl);
      setVideoFileName(newFileName);
      toast({ title: "Video Changed", description: `Now playing: ${newFileName}` });
      if (!isHost && videoPlayerRef.current) {
        // If non-host, player will load it. Then request sync to ensure correct state.
        // Or, host_sync_state_update might be sent by host immediately after video_select
        socket.emit("request_resync", { roomId }); 
      } else if (isHost && videoPlayerRef.current) {
        // Host selected, may want to immediately broadcast their current state
        // (e.g., if they intend for it to start playing or paused at 0)
         const hostState = videoPlayerRef.current.getCurrentState();
         socket.emit("host_sync_state_update", { roomId, state: { ...hostState, time: 0, playing: hostState.playing} }); // Reset time for new video
      }
    };
    
    const handleVideoControlled = (control: { type: 'play' | 'pause' | 'seek', time?: number }) => {
      if (!isHost && videoPlayerRef.current) { 
        if (control.type === 'play') videoPlayerRef.current.play();
        else if (control.type === 'pause') videoPlayerRef.current.pause();
        else if (control.type === 'seek' && control.time !== undefined) videoPlayerRef.current.seekTo(control.time, 'seconds');
      }
    };

    const handleHostProvideSyncState = ({ requesterSocketId }: {requesterSocketId: string}) => {
      if (isHost && videoPlayerRef.current && socket) {
        const currentState = videoPlayerRef.current.getCurrentState();
        socket.emit("host_sync_state_update", { 
          roomId, 
          state: currentState,
          targetSocketId: requesterSocketId 
        });
      }
    };

    const handleApplyHostSyncState = (state: { time: number; playing: boolean }) => {
      if (!isHost && videoPlayerRef.current) {
        toast({ title: "Syncing with host..."});
        videoPlayerRef.current.applyState(state);
      }
    };
    
    const handleErrorEvent = (errorMessage: string) => {
      toast({ title: "Error", description: errorMessage, variant: "destructive" });
    };

    socket.on("room_joined", handleRoomJoined);
    socket.on("join_error", handleJoinError);
    socket.on("user_joined", handleUserJoined);
    socket.on("user_left", handleUserLeft);
    socket.on("promoted_to_host", handlePromotedToHost);
    socket.on("new_host", handleNewHost);
    socket.on("video_selected", handleVideoSelected);
    socket.on("video_controlled", handleVideoControlled);
    socket.on("host_provide_sync_state", handleHostProvideSyncState);
    socket.on("apply_host_sync_state", handleApplyHostSyncState);
    socket.on("error_event", handleErrorEvent);

    return () => {
      socket.off("room_joined", handleRoomJoined);
      socket.off("join_error", handleJoinError);
      socket.off("user_joined", handleUserJoined);
      socket.off("user_left", handleUserLeft);
      socket.off("promoted_to_host", handlePromotedToHost);
      socket.off("new_host", handleNewHost);
      socket.off("video_selected", handleVideoSelected);
      socket.off("video_controlled", handleVideoControlled);
      socket.off("host_provide_sync_state", handleHostProvideSyncState);
      socket.off("apply_host_sync_state", handleApplyHostSyncState);
      socket.off("error_event", handleErrorEvent);
    };
  }, [socket, toast, router, isHost, roomId]); // Dependencies for re-registering handlers if they change

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordAttempt.trim()) {
      toast({ title: "Password Required", description: "Please enter the room password.", variant: "destructive"});
      return;
    }
    if (!username) {
      toast({ title: "Username Error", description: "Username not set. Please refresh.", variant: "destructive"});
      return;
    }
    setIsLoading(true);
    setJoinError(null);
    if(socket) {
      if (socket.connected) {
        socket.emit("join_room", { roomId, password: passwordAttempt, username });
      } else {
        socket.once('connect', () => {
          socket.emit("join_room", { roomId, password: passwordAttempt, username });
        });
        if(!socket.active) socket.connect();
      }
    } else {
      toast({ title: "Connection Error", description: "Cannot connect to server. Please refresh.", variant: "destructive"});
      setIsLoading(false);
    }
  };

  const handleVideoSelectByHost = (url: string, fileName: string) => {
    if (isHost && socket && roomJoined) {
      setVideoUrl(url); 
      setVideoFileName(fileName);
      // For local blob URLs, this URL itself is not useful to others.
      // For public URLs, it is. Server stores what it's given.
      socket.emit("video_select", { roomId, videoUrl: url, fileName }); 
      toast({title: "Broadcasting Video", description: `You started playing ${fileName}.`});
      // After selecting, host might want to immediately sync its state (e.g. paused at 0)
      if (videoPlayerRef.current) {
        // Give player a moment to potentially load if it's a new URL
        setTimeout(() => {
            if(videoPlayerRef.current) {
                const hostState = videoPlayerRef.current.getCurrentState();
                 // For a new video, typically start at 0, and host decides if playing or paused.
                socket.emit("host_sync_state_update", { roomId, state: { ...hostState, time:0 } });
            }
        }, 200)
      }
    }
  };
  
  const handlePlayerControl = (control: { type: 'play' | 'pause' | 'seek', time?: number }) => {
    if (isHost && socket && roomJoined) {
      socket.emit("video_control", { roomId, control });
    }
  };

  const requestResyncWithHost = () => {
    if (socket && !isHost && roomJoined) {
      socket.emit("request_resync", { roomId });
      toast({ title: "Requesting Sync", description: "Asking host for current video state."});
    }
  };

  const leaveRoom = () => {
    if (socket) {
      socket.disconnect(); 
    }
    // sessionStorage.removeItem('roomPasswordSyncStream'); // Already cleared on join
    // sessionStorage.removeItem('roomUsernameSyncStream'); // Keep username for convenience
    router.push('/');
  };

  if (isLoading && !joinError) {
    return (
      <div className="flex flex-col items-center justify-center h-full min-h-[calc(100vh-10rem)]">
        <Loader2 className="h-12 w-12 animate-spin text-primary mb-4" />
        <p className="text-lg text-muted-foreground">Connecting to room: {roomId}...</p>
      </div>
    );
  }

  if (!roomJoined) {
    return (
      <div className="flex items-center justify-center h-full min-h-[calc(100vh-10rem)]">
        <Card className="w-full max-w-md shadow-xl">
          <CardHeader>
            <CardTitle>Join Room: {roomId}</CardTitle>
            <CardDescription>
              {joinError ? (
                <span className="text-destructive flex items-center gap-1"><AlertTriangle className="h-4 w-4" />{joinError}</span>
              ): "Enter the password for this room."}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handlePasswordSubmit}>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="username-display" className="text-sm text-muted-foreground">Your Username (auto-assigned)</Label>
                <Input 
                  id="username-display" 
                  type="text" 
                  value={username}
                  readOnly
                  className="bg-muted/50"
                />
              </div>
              <div>
                <Label htmlFor="room-password">Password</Label>
                <Input 
                  id="room-password" 
                  type="password" 
                  value={passwordAttempt}
                  onChange={(e) => setPasswordAttempt(e.target.value)}
                  placeholder="Enter room password"
                  required
                  aria-describedby="password-error"
                />
              </div>
              <Button type="submit" className="w-full" disabled={isLoading}>
                {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                Join Room
              </Button>
               <Button variant="outline" className="w-full mt-2" onClick={() => router.push('/')}>
                Back to Home
              </Button>
            </CardContent>
          </form>
        </Card>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-12rem)] max-h-[calc(100vh-12rem)]">
      <div className="lg:flex-[3] flex flex-col gap-4 min-w-0">
        <Card className="shadow-md">
          <CardHeader className="flex flex-row justify-between items-start">
            <div>
              <CardTitle className="text-2xl flex items-center gap-2">
                <LayoutGrid className="w-6 h-6 text-primary" />
                Room: {roomId} {isHost && <Crown className="w-5 h-5 text-yellow-500" title="You are the host" />}
              </CardTitle>
              <CardDescription className="mt-1 flex items-center gap-2">
                <Users className="w-4 h-4" />
                {usersInRoom.map(u => u.username).join(', ') || 'Just you'} ({usersInRoom.length}/2)
              </CardDescription>
            </div>
            <div className="flex gap-2 items-center">
              {!isHost && (
                  <Button onClick={requestResyncWithHost} variant="outline" size="sm">Sync with Host</Button>
              )}
              <Button onClick={leaveRoom} variant="ghost" size="sm" className="text-destructive hover:bg-destructive/10">
                <LogOut className="w-4 h-4 mr-1" /> Leave
              </Button>
            </div>
          </CardHeader>
          {videoFileName && (
            <CardContent className="pb-2 pt-0">
               <p className="text-sm text-muted-foreground">
                 Now Playing: {videoFileName}
                 {!isHost && videoUrl?.startsWith('blob:') && " (Host's local video. Syncing controls.)"}
               </p>
            </CardContent>
          )}
        </Card>
        <div className="flex-grow min-h-0">
         <VideoPlayerWrapper 
            ref={videoPlayerRef}
            videoUrl={videoUrl} 
            isHost={isHost}
            onPlayerControl={handlePlayerControl} 
            socket={socket} 
            roomId={roomId}
          />
        </div>
      </div>

      <div className="lg:flex-[1] flex flex-col gap-6 min-w-0 lg:max-w-md">
        <div className="flex-shrink-0">
          {isHost ? (
            <VideoUpload onVideoSelect={handleVideoSelectByHost} />
          ) : (
            <Card className="shadow-md">
              <CardHeader>
                <CardTitle className="text-xl">Video Selection</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">The host controls the video.</p>
                {videoFileName && <p className="text-sm mt-2">Currently playing: <strong>{videoFileName}</strong></p>}
                 {!videoFileName && <p className="text-sm mt-2 text-muted-foreground">Waiting for host to select a video...</p>}
              </CardContent>
            </Card>
          )}
        </div>
        <Separator className="my-0 lg:my-2" />
        <div className="flex-grow min-h-0">
          {socket && roomJoined && <ChatInterface socket={socket} roomId={roomId} username={username} />}
        </div>
      </div>
    </div>
  );
}
