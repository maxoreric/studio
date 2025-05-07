
'use client';

import { useState, useEffect, use, useRef } from 'react';
import type { Socket } from 'socket.io-client';
import { getSocket, disconnectSocket } from '@/lib/socket';
import { VideoPlayerWrapper, type VideoPlayerHandle } from '@/components/video/VideoPlayerWrapper';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { VideoUpload } from '@/components/upload/VideoUpload';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LayoutGrid, Users, Crown, Loader2, LogOut } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useRouter } from 'next/navigation';

interface RoomPageProps {
  params: { roomId: string };
}

interface User {
  id?: string; 
  username: string;
}

export default function RoomPage({ params }: RoomPageProps) {
  const resolvedParams = use(params);
  const { roomId: encodedRoomId } = resolvedParams;
  const roomId = decodeURIComponent(encodedRoomId);

  const [socket, setSocket] = useState<Socket | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);
  const [usersInRoom, setUsersInRoom] = useState<User[]>([]);
  const [roomJoined, setRoomJoined] = useState(false);
  const [isLoading, setIsLoading] = useState(true); // True initially until session check or join attempt
  const [joinError, setJoinError] = useState<string | null>(null);
  const [passwordAttempt, setPasswordAttempt] = useState('');
  const [username, setUsername] = useState('');
  const videoPlayerRef = useRef<VideoPlayerHandle>(null);

  const { toast } = useToast();
  const router = useRouter();

  useEffect(() => {
    const storedPassword = sessionStorage.getItem('roomPasswordSyncStream');
    const storedUsername = sessionStorage.getItem('roomUsernameSyncStream') || `User_${Math.random().toString(36).substring(2, 7)}`;
    
    setUsername(storedUsername); // Set username regardless

    const newSocket = getSocket(); // Get or create socket instance
    setSocket(newSocket);

    const handleRoomJoined = (data: { roomId: string; isHost: boolean; users: User[]; currentVideoUrl?: string; currentVideoFileName?: string }) => {
      toast({ title: "Joined Room", description: `Successfully joined ${data.roomId}. You are ${data.isHost ? 'the host' : 'a guest'}.` });
      setRoomJoined(true);
      setIsHost(data.isHost);
      setUsersInRoom(data.users || []);
      if (data.currentVideoUrl) {
        // If it's a blob URL AND I'm not the host, I can't play it.
        // VideoPlayerWrapper will handle this.
        setVideoUrl(data.currentVideoUrl);
        setVideoFileName(data.currentVideoFileName || 'Shared Video');
      }
      setIsLoading(false);
      setJoinError(null);
      if (storedPassword) sessionStorage.removeItem('roomPasswordSyncStream'); // Clear password after successful use
    };

    const handleJoinError = (errorMsg: string) => {
      toast({ title: "Join Error", description: errorMsg, variant: "destructive" });
      setJoinError(errorMsg);
      setIsLoading(false);
      setRoomJoined(false);
      // If password was from session and failed, clear it so user is prompted
      if (storedPassword) sessionStorage.removeItem('roomPasswordSyncStream');
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
      if (data.hostSocketId !== newSocket?.id) { 
        toast({ title: "New Host", description: `${data.hostUsername} is now the host.` });
      }
    };

    const handleVideoSelected = ({ videoUrl: newVideoUrl, fileName: newFileName }: { videoUrl: string, fileName: string}) => {
      setVideoUrl(newVideoUrl);
      setVideoFileName(newFileName);
      toast({ title: "Video Changed", description: `Now playing: ${newFileName}` });
      if (!isHost && videoPlayerRef.current) {
          // If it's a blob URL from host, non-host can't play. PlayerWrapper handles this.
          // If it's a public URL, non-host player will load it.
          // We might want to force seek to 0 and play/pause based on host's current state.
          // For simplicity, let video player handle loading. User can request resync.
          // videoPlayerRef.current.seekTo(0, 'seconds');
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
        if (isHost && videoPlayerRef.current && newSocket) {
            const currentState = videoPlayerRef.current.getCurrentState();
            newSocket.emit("host_sync_state_update", { 
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

    if (newSocket) {
        newSocket.on("room_joined", handleRoomJoined);
        newSocket.on("join_error", handleJoinError);
        newSocket.on("user_joined", handleUserJoined);
        newSocket.on("user_left", handleUserLeft);
        newSocket.on("promoted_to_host", handlePromotedToHost);
        newSocket.on("new_host", handleNewHost);
        newSocket.on("video_selected", handleVideoSelected);
        newSocket.on("video_controlled", handleVideoControlled);
        newSocket.on("host_provide_sync_state", handleHostProvideSyncState);
        newSocket.on("apply_host_sync_state", handleApplyHostSyncState);
        newSocket.on("error_event", handleErrorEvent);

        if (storedPassword && roomId && storedUsername) {
          if (newSocket.connected) {
            newSocket.emit("join_room", { roomId, password: storedPassword, username: storedUsername });
          } else {
            newSocket.once('connect', () => { // Wait for connection if not already connected
                newSocket.emit("join_room", { roomId, password: storedPassword, username: storedUsername });
            });
          }
        } else if (roomId && storedUsername) {
          setIsLoading(false); // No password in session, show password prompt
        }
    }

    return () => {
      if (newSocket) {
        newSocket.off("room_joined", handleRoomJoined);
        newSocket.off("join_error", handleJoinError);
        newSocket.off("user_joined", handleUserJoined);
        newSocket.off("user_left", handleUserLeft);
        newSocket.off("promoted_to_host", handlePromotedToHost);
        newSocket.off("new_host", handleNewHost);
        newSocket.off("video_selected", handleVideoSelected);
        newSocket.off("video_controlled", handleVideoControlled);
        newSocket.off("host_provide_sync_state", handleHostProvideSyncState);
        newSocket.off("apply_host_sync_state", handleApplyHostSyncState);
        newSocket.off("error_event", handleErrorEvent);
        // Don't call disconnectSocket() here as it nullifies the shared instance.
        // The server handles user leaving the room on socket disconnect.
        if (newSocket.connected) {
          // newSocket.emit("leave_room", { roomId }); // Server handles this on disconnect event
        }
      }
    };
  }, [roomId, toast, router, isHost]); // Added isHost due to its use in handleVideoSelected

  const handlePasswordSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!passwordAttempt.trim()) {
      toast({ title: "Password Required", description: "Please enter the room password.", variant: "destructive"});
      return;
    }
    setIsLoading(true);
    setJoinError(null);
    if(socket && username) {
      if (socket.connected) {
        socket.emit("join_room", { roomId, password: passwordAttempt, username });
      } else {
        socket.once('connect', () => {
            socket.emit("join_room", { roomId, password: passwordAttempt, username });
        });
        socket.connect(); // Attempt to connect if not already
      }
    } else {
        toast({ title: "Connection Error", description: "Cannot connect to server. Please refresh.", variant: "destructive"});
        setIsLoading(false);
    }
  };

  const handleVideoSelectByHost = (url: string, fileName: string) => {
    if (isHost && socket && roomJoined) {
      // For local Blob URLs, they are not transferable directly for playback by others.
      // The server is notified of the filename, and this host's player will use the blob URL.
      // Other clients will see "Host is playing X" but cannot play the blob. VideoPlayerWrapper handles this.
      // If 'url' was a public URL, it would be playable by all.
      setVideoUrl(url); 
      setVideoFileName(fileName);
      socket.emit("video_select", { roomId, videoUrl: url, fileName }); // Send blob URL and filename
      toast({title: "Broadcasting Video", description: `You started playing ${fileName}.`});
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
        socket.disconnect(); // This will trigger 'disconnect' on server, cleaning up the room
    }
    sessionStorage.removeItem('roomPasswordSyncStream');
    sessionStorage.removeItem('roomUsernameSyncStream'); // Optionally clear username too
    router.push('/');
  };

  if (isLoading && !joinError) { // Show loading only if not already in an error state that requires user input
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
              {joinError ? joinError : "Enter the password for this room."}
            </CardDescription>
          </CardHeader>
          <form onSubmit={handlePasswordSubmit}>
            <CardContent className="space-y-4">
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
                {joinError && <p id="password-error" className="text-sm text-destructive mt-1">{joinError}</p>}
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
