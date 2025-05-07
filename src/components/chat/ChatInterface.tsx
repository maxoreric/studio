
'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import type { Socket } from 'socket.io-client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SendHorizonal, User, Mic, StopCircle, Trash2, Download } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import AudioPlayer from './AudioPlayer';

interface Message {
  id: string;
  user: string; // username
  userId?: string; // socket.id of sender
  timestamp: Date | string; // Can be string from server
  avatar?: string;
  type: 'text' | 'audio';
  text?: string;
  audioUrl?: string; // For audio, can be blob URL (sender only) or actual URL (if uploaded)
  audioMimeType?: string;
}

interface ChatInterfaceProps {
  socket: Socket | null;
  roomId: string;
  username: string; // Current user's username
}

export function ChatInterface({ socket, roomId, username }: ChatInterfaceProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0);
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);

  const currentUserSocketId = socket?.id; 

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  useEffect(() => {
    if (scrollAreaRef.current) {
      const scrollViewport = scrollAreaRef.current.querySelector('div[data-radix-scroll-area-viewport]');
      if (scrollViewport) {
        scrollViewport.scrollTop = scrollViewport.scrollHeight;
      }
    }
  }, [messages]);

  useEffect(() => {
    if (isRecording && recordingStartTime) {
      timerIntervalRef.current = setInterval(() => {
        setRecordingDuration((Date.now() - recordingStartTime) / 1000);
      }, 1000);
    } else {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    }
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    };
  }, [isRecording, recordingStartTime]);

  useEffect(() => {
    const currentMessageBlobUrls = messages
      .filter(msg => msg.type === 'audio' && msg.audioUrl && msg.audioUrl.startsWith('blob:'))
      .map(msg => msg.audioUrl!);

    return () => {
      currentMessageBlobUrls.forEach(url => URL.revokeObjectURL(url));
      if (recordedAudioUrl && recordedAudioUrl.startsWith('blob:')) {
        const isRecordedUrlInMessages = messages.some(msg => msg.audioUrl === recordedAudioUrl);
        if (!isRecordedUrlInMessages) URL.revokeObjectURL(recordedAudioUrl);
      }
    };
  }, [messages, recordedAudioUrl]);

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = (messageData: Message) => {
      const receivedMessage = {
        ...messageData,
        timestamp: new Date(messageData.timestamp), 
      };
      setMessages((prevMessages) => [...prevMessages, receivedMessage]);
    };

    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket]);


  const handleSendTextMessage = (e: FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !socket || !currentUserSocketId) return;

    const messageData: Message = {
      id: currentUserSocketId + Date.now().toString(), 
      user: username,
      userId: currentUserSocketId,
      text: newMessage,
      timestamp: new Date(),
      avatar: `https://picsum.photos/seed/${username}/40/40`, // Use username for seed
      type: 'text',
    };
    
    socket.emit('send_message', { roomId, messageData });
    setNewMessage('');
  };

  const startRecording = async () => {
    if (recordedAudioUrl) {
        const isSent = messages.some(msg => msg.audioUrl === recordedAudioUrl);
        if (!isSent && recordedAudioUrl.startsWith('blob:')) URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl(null);
    }
    setAudioChunks([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm; codecs=opus') 
                         ? 'audio/webm; codecs=opus' 
                         : MediaRecorder.isTypeSupported('audio/webm') 
                           ? 'audio/webm'
                           : 'audio/ogg; codecs=opus'; // Add more fallbacks if needed

      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) setAudioChunks((prev) => [...prev, event.data]);
      };
      mediaRecorderRef.current.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); 
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingStartTime(Date.now());
      setRecordingDuration(0);
      toast({ title: "Recording started" });
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast({
        title: "Microphone Error",
        description: `Could not access microphone. Error: ${(err as Error).message}`,
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false); // This will trigger the useEffect for blob creation
    }
  };

  useEffect(() => { 
    if (!isRecording && audioChunks.length > 0) {
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      const newAudioUrl = URL.createObjectURL(audioBlob);
      setRecordedAudioUrl(newAudioUrl);
      // setAudioChunks([]); // Clear chunks after creating blob, important!
      toast({ title: "Recording stopped", description: "Preview or send your voice message." });
    }
  }, [isRecording, audioChunks, toast]);


  const handleToggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const handleSendAudioMessage = () => {
    if (!recordedAudioUrl || audioChunks.length === 0 || !socket || !currentUserSocketId) {
      toast({ title: "Cannot send audio", description: "No audio recorded or not connected.", variant: "destructive" });
      return;
    }
    
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    // The audioUrl is a local blob URL. Only the sender can play it.
    // Other clients receiving this message would need a real, accessible URL.
    // For this simplified version, we send it and the server broadcasts it.
    // The sender will see their own message with the playable blob.
    // Other clients will see the message but the blob URL won't work for them.
    const messageData: Message = {
      id: currentUserSocketId + Date.now().toString(),
      user: username,
      userId: currentUserSocketId,
      timestamp: new Date(),
      avatar: `https://picsum.photos/seed/${username}-audio/40/40`,
      type: 'audio',
      audioUrl: recordedAudioUrl, 
      audioMimeType: mimeType,
    };
    
    socket.emit('send_message', { roomId, messageData });
    
    // Don't add to local messages directly if server broadcasts back to sender.
    // However, if server does NOT broadcast back to sender (common), sender needs to add it.
    // For this implementation, server broadcasts to all, so sender will receive it.
    // But sender needs the blob to be playable *locally*. So, the `audioUrl` must be the local blob for the sender.
    // This is fine as the server just relays the messageData.

    // Clear after sending
    setRecordedAudioUrl(null); // This will revoke the object URL via the useEffect cleanup if it's not in messages
    setAudioChunks([]); // Crucial to reset for next recording
    setRecordingDuration(0);
  };

  const handleDiscardAudio = () => {
    if (recordedAudioUrl && recordedAudioUrl.startsWith('blob:')) {
        // Check if this specific URL is already in messages (e.g. sent then discarded)
        const isSent = messages.some(msg => msg.audioUrl === recordedAudioUrl);
        if (!isSent) URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setAudioChunks([]); 
    if (isRecording) { 
        mediaRecorderRef.current?.stop(); // This will also set isRecording to false and trigger blob creation effect
        setIsRecording(false); // Explicitly set, though stop() might trigger it.
    }
    setRecordingDuration(0);
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
       mediaRecorderRef.current.stream.getTracks().forEach(track => {
        if (track.readyState === 'live') track.stop();
      });
    }
    toast({ title: "Recording discarded" });
  };

  const handleDownloadChatHistory = () => {
    if (messages.length === 0) {
      toast({ title: "No messages to export." });
      return;
    }
    const serializableMessages = messages.map(msg => ({
      ...msg,
      timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : msg.timestamp.toISOString(),
      // audioUrl will be included, but blob URLs are only useful locally.
    }));

    const chatData = JSON.stringify(serializableMessages, null, 2);
    const blob = new Blob([chatData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `chat-history-${roomId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ 
        title: "Chat History Exported", 
        description: `Downloaded. Local audio Blob URLs may not be valid long-term.` 
    });
  };

  const handleDownloadAudio = (audioUrl: string | undefined, messageId: string) => {
    if (!audioUrl || !audioUrl.startsWith('blob:')) {
        toast({ title: "Download Error", description: "Invalid audio source or not a local recording.", variant: "destructive"});
        return;
    }
    const a = document.createElement('a');
    a.href = audioUrl;
    const msg = messages.find(m => m.id === messageId);
    const fileExtension = msg?.audioMimeType?.split('/')[1]?.split(';')[0] || 'webm';
    a.download = `voice-message-${msg?.user || 'unknown'}-${messageId}.${fileExtension}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    toast({ title: "Audio Downloaded", description: `${a.download} saved.` });
  };

  const renderFooterContent = () => {
    if (isRecording) {
      return (
        <div className="flex w-full items-center space-x-2">
          <Button onClick={handleToggleRecording} variant="destructive" size="icon" aria-label="Stop recording">
            <StopCircle className="h-5 w-5" />
          </Button>
          <div className="flex-grow text-center text-sm text-muted-foreground">
            Recording: {formatDuration(recordingDuration)}
          </div>
        </div>
      );
    }

    if (recordedAudioUrl) {
      return (
        <div className="flex flex-col items-center gap-2 w-full">
          <AudioPlayer src={recordedAudioUrl} mimeType={mediaRecorderRef.current?.mimeType || 'audio/webm'} />
          <div className="flex gap-2">
            <Button onClick={handleSendAudioMessage} size="sm" aria-label="Send voice message" disabled={!socket?.connected}>
              <SendHorizonal className="h-4 w-4 mr-2" /> Send Voice
            </Button>
            <Button onClick={handleDiscardAudio} variant="outline" size="sm" aria-label="Discard recording">
              <Trash2 className="h-4 w-4 mr-2" /> Discard
            </Button>
          </div>
        </div>
      );
    }

    return (
      <form onSubmit={handleSendTextMessage} className="flex w-full items-center space-x-2">
        <Input
          type="text"
          placeholder="Type a message..."
          value={newMessage}
          onChange={(e) => setNewMessage(e.target.value)}
          className="flex-grow"
          aria-label="Chat message input"
          disabled={isRecording || !!recordedAudioUrl || !socket?.connected}
        />
        <Button type="submit" size="icon" variant="ghost" aria-label="Send message" disabled={isRecording || !!recordedAudioUrl || newMessage.trim() === '' || !socket?.connected}>
          <SendHorizonal className="h-5 w-5 text-primary" />
        </Button>
        <Button type="button" onClick={handleToggleRecording} size="icon" variant="ghost" aria-label="Start recording" disabled={!!recordedAudioUrl || !socket?.connected}>
          <Mic className="h-5 w-5 text-primary" />
        </Button>
      </form>
    );
  };

  return (
    <Card className="w-full h-full flex flex-col shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
        <CardTitle className="text-xl">Chat ({username})</CardTitle>
        <Button variant="outline" size="sm" onClick={handleDownloadChatHistory} disabled={messages.length === 0}>
          <Download className="mr-2 h-4 w-4" />
          Export Log
        </Button>
      </CardHeader>
      <CardContent className="flex-grow overflow-hidden p-0">
        <ScrollArea className="h-full p-4" ref={scrollAreaRef}>
          <div className="space-y-4">
            {messages.map((msg) => (
              <div
                key={msg.id}
                className={`flex items-start gap-3 ${
                  msg.userId === currentUserSocketId ? 'justify-end' : ''
                }`}
              >
                {msg.userId !== currentUserSocketId && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={msg.avatar} alt={msg.user} data-ai-hint="profile avatar" />
                    <AvatarFallback>{msg.user.substring(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[70%] p-3 rounded-lg shadow-sm ${
                    msg.userId === currentUserSocketId
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {msg.type === 'text' && <p className="text-sm break-words">{msg.text}</p>}
                  {msg.type === 'audio' && msg.audioUrl && (
                    <div className="flex flex-col items-start gap-1">
                      {/* Only the sender can play their own blob URL audio. Others won't see player for blobs. */}
                      {(msg.userId === currentUserSocketId && msg.audioUrl.startsWith('blob:')) || !msg.audioUrl.startsWith('blob:') ? (
                        <AudioPlayer src={msg.audioUrl} mimeType={msg.audioMimeType} />
                      ) : (
                        <p className="text-xs italic">Voice message (cannot play remote local recording)</p>
                      )}
                      {msg.userId === currentUserSocketId && msg.audioUrl.startsWith('blob:') && (
                        <Button
                          variant="link" 
                          size="sm"
                          className={`p-1 h-auto self-start text-xs ${
                            msg.userId === currentUserSocketId ? 'text-primary-foreground/80 hover:text-primary-foreground focus:text-primary-foreground' : 'text-muted-foreground/80 hover:text-muted-foreground focus:text-foreground'
                          }`}
                          onClick={() => handleDownloadAudio(msg.audioUrl, msg.id)}
                          aria-label="Download audio message"
                        >
                          <Download className="h-3 w-3 mr-1" />
                          Save my audio
                        </Button>
                      )}
                    </div>
                  )}
                   <p className={`text-xs mt-1 ${msg.userId === currentUserSocketId ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}`}>
                    {msg.user} @ {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {msg.userId === currentUserSocketId && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={msg.avatar} alt={msg.user} data-ai-hint="user avatar" />
                    <AvatarFallback>{msg.user.substring(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                )}
              </div>
            ))}
             {messages.length === 0 && (
              <div className="text-center text-muted-foreground py-8">
                <User className="mx-auto h-12 w-12 mb-2" />
                {!socket?.connected && <p className="text-destructive">Disconnected. Trying to reconnect...</p>}
                {socket?.connected && <p>No messages yet. Start the conversation!</p>}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t min-h-[68px]">
        {renderFooterContent()}
      </CardFooter>
    </Card>
  );
}
