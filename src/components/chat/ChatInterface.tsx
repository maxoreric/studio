'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { SendHorizonal, User } from 'lucide-react';
import { Card, CardContent, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';

interface Message {
  id: string;
  user: string;
  text: string;
  timestamp: Date;
  avatar?: string;
}

export function ChatInterface() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState('');
  const scrollAreaRef = useRef<HTMLDivElement>(null);

  // Mock users for demo
  const currentUser = "You";
  const otherUser = "Friend";

  const handleSendMessage = (e: React.FormEvent) => {
    e.preventDefault();
    if (newMessage.trim() === '') return;

    const message: Message = {
      id: Date.now().toString(),
      user: currentUser, // In a real app, this would be the authenticated user
      text: newMessage,
      timestamp: new Date(),
      avatar: 'https://picsum.photos/seed/you/40/40', // Placeholder avatar
    };
    setMessages((prevMessages) => [...prevMessages, message]);
    setNewMessage('');

    // Simulate a reply for demo purposes
    setTimeout(() => {
      const replyMessage: Message = {
        id: (Date.now() + 1).toString(),
        user: otherUser,
        text: `Echo: ${message.text}`,
        timestamp: new Date(),
        avatar: 'https://picsum.photos/seed/friend/40/40',
      };
      setMessages((prevMessages) => [...prevMessages, replyMessage]);
    }, 1000);
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
                  className={`max-w-[70%] p-3 rounded-lg ${
                    msg.user === currentUser
                      ? 'bg-primary text-primary-foreground'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  <p className="text-sm">{msg.text}</p>
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
                <p>No messages yet. Start the conversation!</p>
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
      <CardFooter className="p-4 border-t">
        <form onSubmit={handleSendMessage} className="flex w-full items-center space-x-2">
          <Input
            type="text"
            placeholder="Type a message..."
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            className="flex-grow"
            aria-label="Chat message input"
          />
          <Button type="submit" size="icon" variant="ghost" aria-label="Send message">
            <SendHorizonal className="h-5 w-5 text-primary" />
          </Button>
        </form>
      </CardFooter>
    </Card>
  );
}
