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
  audioUrl?: string; // Local blob URL for playback (created by sender or receiver)
  audioDataUri?: string; // Base64 data URI for transport over WebSocket (temporary)
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
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null); // This is a preview blob URL for sender
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

    // Cleanup for the preview recorder's blob URL
    const currentRecordedAudioUrl = recordedAudioUrl;

    return () => {
      currentMessageBlobUrls.forEach(url => URL.revokeObjectURL(url));
      if (currentRecordedAudioUrl && currentRecordedAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(currentRecordedAudioUrl);
      }
    };
  }, [messages, recordedAudioUrl]); // recordedAudioUrl added

  useEffect(() => {
    if (!socket) return;

    const handleNewMessage = async (messageData: Message) => {
      let processedMessage = { ...messageData, timestamp: new Date(messageData.timestamp) };

      if (processedMessage.type === 'audio' && processedMessage.audioDataUri) {
        try {
          const blob = await (await fetch(processedMessage.audioDataUri)).blob();
          const localAudioUrl = URL.createObjectURL(blob);
          processedMessage.audioUrl = localAudioUrl;
          delete processedMessage.audioDataUri; // No longer needed after conversion
        } catch (error) {
          console.error("Error processing audio data URI:", error);
          toast({ title: "Audio Error", description: "Could not process received voice message.", variant: "destructive" });
          // Fallback: message will be added without a playable audioUrl if conversion fails
          processedMessage.audioUrl = undefined; 
        }
      }
      setMessages((prevMessages) => [...prevMessages, processedMessage]);
    };

    socket.on('new_message', handleNewMessage);

    return () => {
      socket.off('new_message', handleNewMessage);
    };
  }, [socket, toast]);


  const handleSendTextMessage = (e: FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '' || !socket || !currentUserSocketId) return;

    const messageData: Message = {
      id: currentUserSocketId + Date.now().toString(), 
      user: username,
      userId: currentUserSocketId,
      text: newMessage,
      timestamp: new Date(),
      avatar: `https://picsum.photos/seed/${username}/40/40`,
      type: 'text',
    };
    
    socket.emit('send_message', { roomId, messageData });
    setNewMessage('');
  };

  const startRecording = async () => {
    if (recordedAudioUrl) { // Clean up previous preview URL if any
        URL.revokeObjectURL(recordedAudioUrl);
        setRecordedAudioUrl(null);
    }
    setAudioChunks([]);

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mimeType = MediaRecorder.isTypeSupported('audio/webm; codecs=opus') 
                         ? 'audio/webm; codecs=opus' 
                         : MediaRecorder.isTypeSupported('audio/mp4') // iOS Safari prefers mp4
                           ? 'audio/mp4' 
                           : MediaRecorder.isTypeSupported('audio/webm') 
                             ? 'audio/webm'
                             : 'audio/ogg; codecs=opus';

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
      setIsRecording(false); 
    }
  };

  useEffect(() => { 
    if (!isRecording && audioChunks.length > 0) {
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      const newAudioUrl = URL.createObjectURL(audioBlob);
      setRecordedAudioUrl(newAudioUrl); // This URL is for the preview player
      toast({ title: "Recording stopped", description: "Preview or send your voice message." });
    }
  }, [isRecording, audioChunks, toast]);


  const handleToggleRecording = () => {
    if (isRecording) stopRecording();
    else startRecording();
  };

  const handleSendAudioMessage = async () => {
    if (!recordedAudioUrl || audioChunks.length === 0 || !socket || !currentUserSocketId) {
      toast({ title: "Cannot send audio", description: "No audio recorded or not connected.", variant: "destructive" });
      return;
    }
    
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm';
    const audioBlob = new Blob(audioChunks, { type: mimeType });

    // Convert blob to data URI for sending
    const reader = new FileReader();
    reader.readAsDataURL(audioBlob);
    reader.onloadend = () => {
      const base64AudioData = reader.result as string;
      
      const messageData: Message = {
        id: currentUserSocketId + Date.now().toString(),
        user: username,
        userId: currentUserSocketId,
        timestamp: new Date(),
        avatar: `https://picsum.photos/seed/${username}-audio/40/40`,
        type: 'audio',
        audioDataUri: base64AudioData, // Send data URI
        audioMimeType: mimeType,
        // audioUrl will be set by receiver (including sender) after processing audioDataUri
      };
      
      socket.emit('send_message', { roomId, messageData });
      
      // Clear after sending
      if (recordedAudioUrl && recordedAudioUrl.startsWith('blob:')) {
         URL.revokeObjectURL(recordedAudioUrl); // Clean up the preview blob URL
      }
      setRecordedAudioUrl(null);
      setAudioChunks([]); 
      setRecordingDuration(0);
      toast({title: "Voice message sent!"});
    };
    reader.onerror = (error) => {
        console.error("Error converting audio blob to data URI:", error);
        toast({title: "Error Sending Audio", description: "Could not process audio for sending.", variant: "destructive"});
    }
  };

  const handleDiscardAudio = () => {
    if (recordedAudioUrl && recordedAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setAudioChunks([]); 
    if (isRecording) { 
        mediaRecorderRef.current?.stop(); 
        setIsRecording(false);
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
    // For export, audioDataUri would be more portable if we were storing it long-term,
    // but since we only use it for transport and convert to blob URLs for playback,
    // exported audioUrl will be blob URLs which are only valid in the current session.
    // For a real export, audio should be uploaded/stored and permanent URLs used.
    const serializableMessages = messages.map(msg => ({
      user: msg.user,
      userId: msg.userId,
      timestamp: typeof msg.timestamp === 'string' ? msg.timestamp : msg.timestamp.toISOString(),
      type: msg.type,
      text: msg.text,
      audioMimeType: msg.type === 'audio' ? msg.audioMimeType : undefined,
      // Note: audioUrl here will be a blob URL, not useful outside the session.
      // For true export, audioDataUri or a permanent link would be needed.
      audioPresent: msg.type === 'audio' && !!msg.audioUrl 
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
        description: `Downloaded. Voice messages are referenced by temporary IDs.` 
    });
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

    if (recordedAudioUrl) { // This is the preview player for the sender before sending
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
                  {msg.type === 'audio' && (
                    <div className="flex flex-col items-start gap-1">
                      {msg.audioUrl && msg.audioUrl.startsWith('blob:') ? (
                        <AudioPlayer src={msg.audioUrl} mimeType={msg.audioMimeType} />
                      ) : (
                        <p className="text-xs italic">Voice message (processing or error)</p>
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
