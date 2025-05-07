'use client';

import { useState, useRef, useEffect, type FormEvent } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SendHorizonal, User, Mic, StopCircle, Trash2 } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import AudioPlayer from './AudioPlayer'; // New component for playing audio

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
    // Cleanup object URLs
    return () => {
      messages.forEach(msg => {
        if (msg.type === 'audio' && msg.audioUrl && msg.audioUrl.startsWith('blob:')) {
          URL.revokeObjectURL(msg.audioUrl);
        }
      });
      if (recordedAudioUrl && recordedAudioUrl.startsWith('blob:')) {
        URL.revokeObjectURL(recordedAudioUrl);
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
      avatar: 'https://picsum.photos/seed/user1/40/40', // Placeholder avatar
      type: 'text',
    };
    setMessages((prevMessages) => [...prevMessages, message]);
    setNewMessage('');
  };

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
      setAudioChunks([]); // Reset chunks

      mediaRecorderRef.current.ondataavailable = (event) => {
        setAudioChunks((prev) => [...prev, event.data]);
      };

      mediaRecorderRef.current.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); // Stop microphone access
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
        description: "Could not access microphone. Please check permissions.",
        variant: "destructive",
      });
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
      // The actual blob processing is moved to useEffect on audioChunks changing after stop
    }
  };

  useEffect(() => {
    if (!isRecording && audioChunks.length > 0) {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm; codecs=opus' });
      const audioUrl = URL.createObjectURL(audioBlob);
      setRecordedAudioUrl(audioUrl);
      setAudioChunks([]); // Clear chunks after processing
      toast({ title: "Recording stopped", description: "Preview or send your voice message." });
    }
  }, [isRecording, audioChunks]);


  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      setRecordedAudioUrl(null); // Clear any previous recording
      startRecording();
    }
  };

  const handleSendAudioMessage = () => {
    if (!recordedAudioUrl) return;

    const message: Message = {
      id: Date.now().toString(),
      user: currentUser,
      timestamp: new Date(),
      avatar: 'https://picsum.photos/seed/userAudio/40/40',
      type: 'audio',
      audioUrl: recordedAudioUrl,
      audioMimeType: 'audio/webm',
    };
    setMessages((prevMessages) => [...prevMessages, message]);
    setRecordedAudioUrl(null); // Reset preview
    setRecordingDuration(0);
  };

  const handleDiscardAudio = () => {
    if (recordedAudioUrl) {
      URL.revokeObjectURL(recordedAudioUrl);
    }
    setRecordedAudioUrl(null);
    setAudioChunks([]);
    setIsRecording(false); // Ensure recording is stopped
    setRecordingDuration(0);
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    toast({ title: "Recording discarded" });
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
          <AudioPlayer src={recordedAudioUrl} mimeType="audio/webm" />
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
        <Button type="submit" size="icon" variant="ghost" aria-label="Send message" disabled={isRecording || !!recordedAudioUrl}>
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
      <CardHeader>
        <CardTitle className="text-xl">Chat</CardTitle>
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
                  {msg.type === 'text' && <p className="text-sm">{msg.text}</p>}
                  {msg.type === 'audio' && msg.audioUrl && (
                    <AudioPlayer src={msg.audioUrl} mimeType={msg.audioMimeType} />
                  )}
                  <p className={`text-xs mt-1 ${msg.user === currentUser ? 'text-primary-foreground/70' : 'text-muted-foreground/70'}`}>
                    {msg.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
