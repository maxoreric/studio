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
    const urlsToRevoke = messages
      .filter(msg => msg.type === 'audio' && msg.audioUrl && msg.audioUrl.startsWith('blob:'))
      .map(msg => msg.audioUrl!);

    // Also include recordedAudioUrl if it's a blob URL and not part of any message yet
    if (recordedAudioUrl && recordedAudioUrl.startsWith('blob:') && !messages.some(msg => msg.audioUrl === recordedAudioUrl)) {
      // This case is tricky: recordedAudioUrl is transient. If it's not in messages, it's likely for preview.
      // It will be revoked by handleDiscardAudio or when a new recording starts.
      // The primary cleanup for persistent blobs should be for those in the `messages` array.
    }

    return () => {
      // This cleanup runs when the component unmounts or `messages` array changes in a way that removes items.
      // However, Array.prototype.filter().map() in useEffect dependency array might not work as expected for deep changes.
      // A more robust cleanup for removed messages would involve comparing previous and current messages.
      // For now, this will revoke URLs of messages that *are currently* in the list when component unmounts.
      // When a message is *removed* from the list, its URL should ideally be revoked.
      // The current logic is: when a message is added, its audioUrl is a new blob.
      // Revoking only on unmount means blobs for messages that are *not* removed from the list during session persist.
      // This is generally fine as they are needed.
      // The main concern is blobs that are created and then discarded *before* being added to messages (like `recordedAudioUrl`).

      // This will revoke all current message audio URLs on unmount.
      // urlsToRevoke.forEach(url => URL.revokeObjectURL(url));

      // A better approach for cleaning up `recordedAudioUrl` specifically:
      if (recordedAudioUrl && recordedAudioUrl.startsWith('blob:')) {
        // If recordedAudioUrl is not found in any of the current messages, it means it was a preview
        // that was never sent. It should be revoked when the component unmounts if not already handled.
        // This is more of a safeguard.
        const isRecordedUrlInMessages = messages.some(msg => msg.audioUrl === recordedAudioUrl);
        if (!isRecordedUrlInMessages) {
          // URL.revokeObjectURL(recordedAudioUrl); // This might be too aggressive if it's still being used for preview
        }
      }
    };
  }, [messages, recordedAudioUrl]); // dependencies ensure this runs when these change


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
        if (!isSent) {
            URL.revokeObjectURL(recordedAudioUrl);
        }
        setRecordedAudioUrl(null);
    }
    setAudioChunks([]); // Reset chunks for new recording

    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm; codecs=opus' });
      
      mediaRecorderRef.current.ondataavailable = (event) => {
        if (event.data.size > 0) { // ensure there's data
          setAudioChunks((prev) => [...prev, event.data]);
        }
      };

      mediaRecorderRef.current.onstop = () => {
        stream.getTracks().forEach(track => track.stop()); 
        // Blob creation moved to useEffect on audioChunks changing
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
      // onstop will trigger ondataavailable, then useEffect on audioChunks will process
    }
  };

  useEffect(() => {
    // This effect processes the audio chunks after recording stops
    if (!isRecording && audioChunks.length > 0) {
      const audioBlob = new Blob(audioChunks, { type: 'audio/webm; codecs=opus' });
      const newAudioUrl = URL.createObjectURL(audioBlob);
      setRecordedAudioUrl(newAudioUrl);
      // Don't clear audioChunks here if you might need them for sending the blob later.
      // If handleSendAudioMessage creates a new Blob from these chunks, it's fine.
      // If handleSendAudioMessage relies on recordedAudioUrl which points to this blob, also fine.
      toast({ title: "Recording stopped", description: "Preview or send your voice message." });
    }
  }, [isRecording, audioChunks, toast]);


  const handleToggleRecording = () => {
    if (isRecording) {
      stopRecording();
    } else {
      // No need to explicitly setRecordedAudioUrl(null) here, startRecording handles revoking old preview
      startRecording();
    }
  };

  const handleSendAudioMessage = () => {
    if (!recordedAudioUrl || audioChunks.length === 0) {
        // If recordedAudioUrl exists but chunks are empty, it implies an issue or an old URL.
        // This primarily safeguards against sending an empty/invalid audio.
        if (recordedAudioUrl && audioChunks.length === 0){
             // This might happen if the state updates are not perfectly synced.
             // Try to create blob from recordedAudioUrl if it's a blob url
             console.warn("Attempting to send audio with no new chunks, using existing recordedAudioUrl if valid.");
        } else {
            toast({ title: "Cannot send audio", description: "No audio recorded or an error occurred.", variant: "destructive" });
            return;
        }
    }
    
    // It's crucial that the audioUrl for the message is a *stable* blob URL.
    // recordedAudioUrl is fine as long as it's not revoked prematurely.
    // The useEffect cleanup for messages should handle revoking these URLs when messages are removed or component unmounts.

    const message: Message = {
      id: Date.now().toString(),
      user: currentUser,
      timestamp: new Date(),
      avatar: 'https://picsum.photos/seed/userAudio/40/40',
      type: 'audio',
      audioUrl: recordedAudioUrl, // Assign current blob URL
      audioMimeType: 'audio/webm',
    };
    setMessages((prevMessages) => [...prevMessages, message]);
    
    // Reset for next recording
    setRecordedAudioUrl(null); // The URL is now "owned" by the message in the list
    setAudioChunks([]); // Clear chunks as they've been processed into the blob for the sent message
    setRecordingDuration(0);
  };

  const handleDiscardAudio = () => {
    if (recordedAudioUrl) {
      const isSent = messages.some(msg => msg.audioUrl === recordedAudioUrl);
      if (!isSent) { // Only revoke if it wasn't sent
          URL.revokeObjectURL(recordedAudioUrl);
      }
    }
    setRecordedAudioUrl(null);
    setAudioChunks([]); // Clear chunks
    if (isRecording) { // If discard is called while recording (e.g. by an error or external action)
        mediaRecorderRef.current?.stop(); // Stop recorder
        setIsRecording(false);
    }
    setRecordingDuration(0);
    if (mediaRecorderRef.current && mediaRecorderRef.current.stream && mediaRecorderRef.current.stream.getTracks().some(track => track.readyState === 'live')) {
        mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
    }
    toast({ title: "Recording discarded" });
  };

  const handleDownloadChatHistory = () => {
    if (messages.length === 0) {
      toast({ title: "No messages", description: "There are no messages to export." });
      return;
    }
    // Create a deep copy and convert Date objects to ISO strings for consistent JSON
    const serializableMessages = messages.map(msg => ({
      ...msg,
      timestamp: msg.timestamp.toISOString(),
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
    toast({ title: "Chat History Exported", description: "Downloaded as chat-history.json. Audio file URLs are included but may need individual saving if blobs are no longer valid." });
  };

  const handleDownloadAudio = (audioUrl: string, fileName: string) => {
    if (!audioUrl) return;
    const a = document.createElement('a');
    a.href = audioUrl;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // The audioUrl is a blob URL managed by the `messages` state.
    // It will be revoked by the useEffect cleanup when the message is removed or component unmounts.
    // Do not revoke here as it might still be in use by the AudioPlayer.
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
                    <div className="flex flex-col items-start gap-1"> {/* Added gap-1 */}
                      <AudioPlayer src={msg.audioUrl} mimeType={msg.audioMimeType} />
                      <Button
                        variant="link" 
                        size="sm"
                        className={`p-1 h-auto self-start text-xs ${ // text-xs for smaller text
                          msg.user === currentUser ? 'text-primary-foreground/80 hover:text-primary-foreground focus:text-primary-foreground' : 'text-muted-foreground/80 hover:text-muted-foreground focus:text-foreground'
                        }`}
                        onClick={() => handleDownloadAudio(msg.audioUrl!, `voice-message-${msg.id}.webm`)}
                        aria-label="Download audio message"
                      >
                        <Download className="h-3 w-3 mr-1" /> {/* Smaller icon */}
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
