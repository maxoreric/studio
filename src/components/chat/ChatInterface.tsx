'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SendHorizonal, User, Mic, StopCircle, Trash2, Download } from 'lucide-react'; // Added Download
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import AudioPlayer from './AudioPlayer';

interface Message {
  id: string;
  user: string;
  timestamp: Date;
  avatar?: string;
  type: 'text' | 'audio';
  text?: string;
  audioUrl?: string;
  audioMimeType?: string;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);
  const { toast } = useToast();

  // Audio recording state
  const [isRecording, setIsRecording] = useState(false);
  const [audioChunks, setAudioChunks] = useState<Blob[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const [recordedAudioUrl, setRecordedAudioUrl] = useState<string | null>(null);
  const [recordingStartTime, setRecordingStartTime] = useState<number | null>(null);
  const [recordingDuration, setRecordingDuration] = useState(0); // in seconds
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);


  // Mock user for demo
  const currentUser = "You";

  const formatDuration = (seconds: number): string => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);
    return `${minutes}:${remainingSeconds < 10 ? '0' : ''}${remainingSeconds}`;
  };

  useEffect(() => {
    // Auto-scroll to bottom
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
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
        timerIntervalRef.current = null;
      }
    }
    return () => {
      if (timerIntervalRef.current) {
        clearInterval(timerIntervalRef.current);
      }
    };
  }, [isRecording, recordingStartTime]);

  useEffect(() => {
    // Cleanup object URLs for messages
    // This is important to prevent memory leaks from blob URLs
    // This effect attempts to revoke URLs for messages that might be removed or when the component unmounts.
    // A more robust strategy might involve tracking active blob URLs and revoking them when they are no longer needed.

    // Collect all current blob URLs from messages
    const currentMessageBlobUrls = messages
      .filter(msg => msg.type === 'audio' && msg.audioUrl && msg.audioUrl.startsWith('blob:'))
      .map(msg => msg.audioUrl!);

    return () => {
      // On unmount, revoke all blob URLs associated with messages
      currentMessageBlobUrls.forEach(url => URL.revokeObjectURL(url));
      
      // Also, handle the transient recordedAudioUrl if it hasn't been sent and is a blob URL
      if (recordedAudioUrl && recordedAudioUrl.startsWith('blob:')) {
        const isRecordedUrlInMessages = messages.some(msg => msg.audioUrl === recordedAudioUrl);
        if (!isRecordedUrlInMessages) {
          URL.revokeObjectURL(recordedAudioUrl);
        }
      }
    };
  }, [messages, recordedAudioUrl]); 


  const handleSendTextMessage = (e: FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '') return;

    const message: Message = {
      id: Date.now().toString(),
      user: currentUser,
      text: newMessage,
      timestamp: new Date(),
      avatar: 'https://picsum.photos/seed/user1/40/40', 
      type: 'text',
    };
    setMessages((prevMessages) => [...prevMessages, message]);
    setNewMessage('');
  };

  const startRecording = async () => {
    // Revoke previous recording URL if it exists and wasn't sent
    if (recordedAudioUrl) {
        const isSent = messages.some(msg => msg.audioUrl === recordedAudioUrl);
        if (!isSent && recordedAudioUrl.startsWith('blob:')) { // Ensure it's a blob URL before revoking
            URL.revokeObjectURL(recordedAudioUrl);
        }
        setRecordedAudioUrl(null);
    }
    setAudioChunks([]); // Reset chunks for new recording

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Attempt to use 'audio/webm; codecs=opus' for better quality and compression, fallback if not supported.
      const mimeType = MediaRecorder.isTypeSupported('audio/webm; codecs=opus') 
                         ? 'audio/webm; codecs=opus' 
                         : MediaRecorder.isTypeSupported('audio/webm') 
                           ? 'audio/webm'
                           : 'audio/ogg; codecs=opus'; // Add more fallbacks if needed

      if (!MediaRecorder.isTypeSupported(mimeType) && mimeType === 'audio/ogg; codecs=opus' && !MediaRecorder.isTypeSupported('audio/ogg')) {
         // Final fallback if even basic ogg isn't supported or opus within ogg.
         // Depending on browser, 'audio/wav' might be a very safe but large fallback.
         // For simplicity, this example will proceed and let the browser decide or error out if no suitable mimeType is found.
         console.warn("Preferred MIME types not supported, using browser default or potentially failing.");
      }


      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) { 
          setAudioChunks((prev) => [...prev, event.data]);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); 
      };
      
      mediaRecorderRef.current.start();
      setIsRecording(true);
      setRecordingStartTime(Date.now());
      setRecordingDuration(0);
      toast({ title: "Recording started", description: "Speak into your microphone." });
    } catch (err) {
      console.error("Error accessing microphone:", err);
      toast({
        title: "Microphone Error",
        description: `Could not access microphone. Please check permissions. Error: ${(err as Error).message}`,
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
      const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'; // Default or detected mimeType
      const audioBlob = new Blob(audioChunks, { type: mimeType });
      const newAudioUrl = URL.createObjectURL(audioBlob);
      setRecordedAudioUrl(newAudioUrl);
      toast({ title: "Recording stopped", description: "Preview or send your voice message." });
    }
  }, [isRecording, audioChunks, toast]);


  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      startRecording();
    }
  };

  const handleSendAudioMessage = () => {
    if (!recordedAudioUrl || audioChunks.length === 0) {
        if (recordedAudioUrl && audioChunks.length === 0){
             console.warn("Attempting to send audio with no new chunks, using existing recordedAudioUrl if valid.");
        } else {
            toast({ title: "Cannot send audio", description: "No audio recorded or an error occurred.", variant: "destructive" });
            return;
        }
    }
    
    const mimeType = mediaRecorderRef.current?.mimeType || 'audio/webm'; // Use the mimeType from the recorder
    const message: Message = {
      id: Date.now().toString(),
      user: currentUser,
      timestamp: new Date(),
      avatar: 'https://picsum.photos/seed/userAudio/40/40',
      type: 'audio',
      audioUrl: recordedAudioUrl, 
      audioMimeType: mimeType,
    };
    setMessages((prevMessages) => [...prevMessages, message]);
    
    setRecordedAudioUrl(null); 
    setAudioChunks([]); 
    setRecordingDuration(0);
  };

  const handleDiscardAudio = () => {
    if (recordedAudioUrl) {
      const isSent = messages.some(msg => msg.audioUrl === recordedAudioUrl);
      if (!isSent && recordedAudioUrl.startsWith('blob:')) { 
          URL.revokeObjectURL(recordedAudioUrl);
      }
    }
    setRecordedAudioUrl(null);
    setAudioChunks([]); 
    if (isRecording) { 
        mediaRecorderRef.current?.stop(); 
        setIsRecording(false);
    }
    setRecordingDuration(0);
    // Ensure any active media stream tracks are stopped
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
       mediaRecorderRef.current.stream.getTracks().forEach(track => {
        if (track.readyState === 'live') {
          track.stop();
        }
      });
    }
    toast({ title: "Recording discarded" });
  };

  const handleDownloadChatHistory = () => {
    if (messages.length === 0) {
      toast({ title: "No messages", description: "There are no messages to export." });
      return;
    }
    const serializableMessages = messages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.toISOString(),
      // For audio messages, we'll keep the blob URL. User needs to be informed that blobs are session-specific.
      // Or, ideally, audio would be uploaded to a server and a permanent URL would be stored.
    }));

    const chatData = JSON.stringify(serializableMessages, null, 2);
    const blob = new Blob([chatData], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'chat-history.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast({ 
        title: "Chat History Exported", 
        description: "Downloaded as chat-history.json. Audio messages contain local Blob URLs which may not be valid long-term or across sessions." 
    });
  };

  const handleDownloadAudio = (audioUrl: string, fileName: string) => {
    if (!audioUrl || !audioUrl.startsWith('blob:')) { // Only allow downloading blob URLs for safety
        toast({ title: "Download Error", description: "Invalid audio source for download.", variant: "destructive"});
        return;
    }
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // Do not revoke here, the AudioPlayer might still be using it.
    // It will be revoked when the message is removed or component unmounts by the main useEffect.
    toast({ title: "Audio Downloaded", description: `${fileName} saved.` });
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
            <Button onClick={handleSendAudioMessage} size="sm" aria-label="Send voice message">
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
          disabled={isRecording || !!recordedAudioUrl}
        />
        <Button type="submit" size="icon" variant="ghost" aria-label="Send message" disabled={isRecording || !!recordedAudioUrl || newMessage.trim() === ''}>
          <SendHorizonal className="h-5 w-5 text-primary" />
        </Button>
        <Button type="button" onClick={handleToggleRecording} size="icon" variant="ghost" aria-label="Start recording" disabled={!!recordedAudioUrl}>
          <Mic className="h-5 w-5 text-primary" />
        </Button>
      </form>
    );
  };

  return (
    <Card className="w-full h-full flex flex-col shadow-lg">
      <CardHeader className="flex flex-row items-center justify-between p-4 border-b">
        <CardTitle className="text-xl">Chat</CardTitle>
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
                  msg.user === currentUser ? 'justify-end' : ''
                }`}
              >
                {msg.user !== currentUser && (
                  <Avatar className="h-8 w-8">
                    <AvatarImage src={msg.avatar} alt={msg.user} data-ai-hint="profile avatar" />
                    <AvatarFallback>{msg.user.substring(0, 1).toUpperCase()}</AvatarFallback>
                  </Avatar>
                )}
                <div
                  className={`max-w-[70%] p-3 rounded-lg shadow-sm ${
                    msg.user === currentUser
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {msg.type === 'text' && <p className="text-sm break-words">{msg.text}</p>}
                  {msg.type === 'audio' && msg.audioUrl && (
                    <div className="flex flex-col items-start gap-1">
                      <AudioPlayer src={msg.audioUrl} mimeType={msg.audioMimeType} />
                      <Button
                        variant="link" 
                        size="sm"
                        className={`p-1 h-auto self-start text-xs ${
                          msg.user === currentUser ? 'text-primary-foreground/80 hover:text-primary-foreground focus:text-primary-foreground' : 'text-muted-foreground/80 hover:text-muted-foreground focus:text-foreground'
                        }`}
                        onClick={() => handleDownloadAudio(msg.audioUrl!, `voice-message-${msg.id}.${msg.audioMimeType?.split('/')[1]?.split(';')[0] || 'webm'}`)}
                        aria-label="Download audio message"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Save audio
                      </Button>
                    </div>
                  )}
                  <p className={`text-xs mt-1 ${msg.user === currentUser ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}`}>
                    {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                {msg.user === currentUser && (
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
                <p>No messages yet. Start the conversation or send a voice note!</p>
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
