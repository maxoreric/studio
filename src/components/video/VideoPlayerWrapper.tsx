'use client';

import ReactPlayer from 'react-player/lazy';
import { useState, useEffect } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface VideoPlayerWrapperProps {
  videoUrl: string | null;
}

export function VideoPlayerWrapper({ videoUrl }: VideoPlayerWrapperProps) {
  const [hasWindow, setHasWindow] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (typeof window !== "undefined") {
      setHasWindow(true);
    }
  }, []);

  useEffect(() => {
    if (videoUrl) {
      setIsLoading(true);
      setError(null);
    } else {
      setIsLoading(false); // No URL, so not loading
    }
  }, [videoUrl]);

  const handleReady = () => {
    setIsLoading(false);
  };

  const handleError = (e: any) => {
    console.error('Video Player Error:', e);
    setError('Failed to load video. Please check the URL or try a different video.');
    setIsLoading(false);
  };

  if (!hasWindow) {
    return <Skeleton className="aspect-video w-full rounded-lg" />;
  }

  return (
    <Card className="shadow-lg overflow-hidden">
      <CardContent className="p-0">
        <div className="aspect-video w-full bg-black relative">
          {isLoading && !error && videoUrl && (
             <div className="absolute inset-0 flex items-center justify-center bg-muted">
               <Skeleton className="h-full w-full" />
               <p className="absolute text-foreground text-lg">Loading video...</p>
             </div>
          )}
          {!videoUrl && !error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
              <Image 
                src="https://picsum.photos/1280/720?grayscale" 
                alt="Video placeholder" 
                layout="fill"
                objectFit="cover"
                data-ai-hint="placeholder video"
              />
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <p className="text-background text-xl font-semibold">Upload a video to start watching</p>
              </div>
            </div>
          )}
          {error && (
            <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 text-destructive p-4">
              <p className="text-lg font-semibold">Error</p>
              <p className="text-center">{error}</p>
            </div>
          )}
          {videoUrl && (
            <ReactPlayer
              url={videoUrl}
              width="100%"
              height="100%"
              controls
              playing={false} // Autoplay can be annoying, default to false
              onReady={handleReady}
              onError={handleError}
              style={{ display: error ? 'none' : 'block' }}
              config={{
                file: {
                  attributes: {
                    controlsList: 'nodownload', // Optional: Disable download button
                  },
                },
              }}
            />
          )}
        </div>
      </CardContent>
    </Card>
  );
}
