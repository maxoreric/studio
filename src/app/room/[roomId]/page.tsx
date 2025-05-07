'use client';

import { useState, useEffect } from 'react';
import { VideoPlayerWrapper } from '@/components/video/VideoPlayerWrapper';
import { ChatInterface } from '@/components/chat/ChatInterface';
import { VideoUpload } from '@/components/upload/VideoUpload';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Separator } from '@/components/ui/separator';
import { LayoutGrid, MessageSquare } from 'lucide-react';

interface RoomPageProps {
  params: { roomId: string };
}

export default function RoomPage({ params }: RoomPageProps) {
  const { roomId } = params;
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [videoFileName, setVideoFileName] = useState<string | null>(null);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true); // Ensure component is mounted before accessing window/localStorage for client-side logic
  }, []);

  const handleVideoSelect = (url: string, fileName: string) => {
    setVideoUrl(url);
    setVideoFileName(fileName);
  };

  if (!mounted) {
    // Optional: show a loading skeleton or spinner while waiting for mount
    return (
      <div className="flex items-center justify-center h-full">
        <p>Loading room...</p>
      </div>
    );
  }
  
  return (
    <div className="flex flex-col lg:flex-row gap-6 h-[calc(100vh-12rem)] max-h-[calc(100vh-12rem)]">
      {/* Main content area: Video player */}
      <div className="lg:flex-[3] flex flex-col gap-4 min-w-0">
        <Card className="shadow-md">
          <CardHeader>
            <CardTitle className="text-2xl flex items-center gap-2">
              <LayoutGrid className="w-6 h-6 text-primary" />
              Room: {decodeURIComponent(roomId)}
            </CardTitle>
          </CardHeader>
          {videoFileName && (
            <CardContent className="pb-2 pt-0">
               <p className="text-sm text-muted-foreground">Now Playing: {videoFileName}</p>
            </CardContent>
          )}
        </Card>
        <div className="flex-grow min-h-0">
         <VideoPlayerWrapper videoUrl={videoUrl} />
        </div>
      </div>

      {/* Sidebar: Chat and Upload */}
      <div className="lg:flex-[1] flex flex-col gap-6 min-w-0 lg:max-w-md">
        <div className="flex-shrink-0">
          <VideoUpload onVideoSelect={handleVideoSelect} />
        </div>
        <Separator className="my-0 lg:my-2" />
        <div className="flex-grow min-h-0">
          <ChatInterface />
        </div>
      </div>
    </div>
  );
}
