
'use client';

import ReactPlayer, { type ReactPlayerProps } from 'react-player/lazy';
import { useState, useEffect, forwardRef, useImperativeHandle, useRef } from 'react';
import Image from 'next/image';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import type { Socket } from 'socket.io-client';

interface VideoPlayerWrapperProps {
  videoUrl: string | null;
  isHost: boolean;
  onPlayerControl: (control: { type: 'play' | 'pause' | 'seek'; time?: number }) => void;
  socket?: Socket | null; 
  roomId?: string; 
}

export interface VideoPlayerHandle {
  play: () => void;
  pause: () => void;
  seekTo: (amount: number, type?: 'seconds' | 'fraction') => void;
  getCurrentState: () => { time: number; playing: boolean; duration: number };
  applyState: (state: { time: number; playing: boolean }) => void;
}

export const VideoPlayerWrapper = forwardRef<VideoPlayerHandle, VideoPlayerWrapperProps>(
  ({ videoUrl, isHost, onPlayerControl, socket, roomId }, ref) => {
    const [hasWindow, setHasWindow] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [isPlaying, setIsPlaying] = useState(false);
    const [currentDuration, setCurrentDuration] = useState(0); // Renamed from duration to avoid conflict
    const [playedSeconds, setPlayedSeconds] = useState(0);
    
    const playerRef = useRef<ReactPlayer>(null);
    const hostJustSeekedRef = useRef(false); // To prevent host reacting to own seek echo

    // Determine if the current videoUrl is a blob URL
    const isBlobUrl = videoUrl?.startsWith('blob:') || false;
    // Non-hosts should not attempt to load blob URLs from the host
    const actualPlayableUrl = (isBlobUrl && !isHost) ? null : videoUrl;


    useImperativeHandle(ref, () => ({
      play: () => {
        if(playerRef.current?.getInternalPlayer()?.play) {
            playerRef.current.getInternalPlayer().play();
            setIsPlaying(true); // Reflect state immediately
        }
      },
      pause: () => {
        if(playerRef.current?.getInternalPlayer()?.pause) {
            playerRef.current.getInternalPlayer().pause();
            setIsPlaying(false); // Reflect state immediately
        }
      },
      seekTo: (amount, type) => {
        if (playerRef.current) {
          playerRef.current.seekTo(amount, type);
          setPlayedSeconds(amount); // Reflect state immediately
        }
      },
      getCurrentState: () => ({
          time: playerRef.current?.getCurrentTime() || playedSeconds, // Fallback to state if ref not ready
          playing: isPlaying,
          duration: playerRef.current?.getDuration() || currentDuration,
      }),
      applyState: (state: { time: number; playing: boolean }) => {
          if (playerRef.current) {
              // Non-host applying state from host.
              // Critical: Prevent seek from re-emitting if onSeek is triggered by this.
              // ReactPlayer's onSeek is usually for user interaction. Programmatic seek shouldn't trigger it.
              playerRef.current.seekTo(state.time, 'seconds');
              setPlayedSeconds(state.time); 
              
              // Ensure player state (playing/paused) is applied *after* seek operation
              // ReactPlayer might internally pause on seek, so re-apply intended state.
              setTimeout(() => {
                  if (state.playing) {
                      playerRef.current?.getInternalPlayer()?.play();
                  } else {
                      playerRef.current?.getInternalPlayer()?.pause();
                  }
                  setIsPlaying(state.playing);
              }, 150); // Small delay for seek to process. Adjust if needed.
          }
      }
    }));

    useEffect(() => {
      if (typeof window !== "undefined") setHasWindow(true);
    }, []);

    useEffect(() => {
      // This effect runs when videoUrl changes (e.g. new video selected by host)
      // or when actualPlayableUrl changes (e.g. I become host of a blob video)
      if (actualPlayableUrl) {
        setIsLoading(true);
        setError(null);
        setIsPlaying(false); 
        setPlayedSeconds(0); 
      } else if (videoUrl && isBlobUrl && !isHost) {
        // Host selected a blob, I'm not host: show placeholder, not loading actual video
        setIsLoading(false);
        setError(null); // Not an error, just can't play it
      } else if (!videoUrl) {
        setIsLoading(false);
        setError(null);
      }
    }, [actualPlayableUrl, videoUrl, isBlobUrl, isHost]); // Key dependencies

    const handleReady = () => {
      setIsLoading(false);
      if (!isHost && socket && roomId && actualPlayableUrl) { // If I can play this URL
        // Non-host just loaded a video (likely a new public URL from host, or became host)
        // Request full sync from host to get correct time and playing state
        socket.emit("request_resync", { roomId });
      }
      // If host is ready, they control.
    };

    const handleError = (e: any) => {
      console.error('Video Player Error:', e, videoUrl);
      let message = 'Failed to load video.';
       if (isBlobUrl && !isHost) { // This case should ideally be caught by actualPlayableUrl being null
          message = "Host is playing a local video. Only controls will be synced.";
      } else if (typeof e === 'string') {
        message = e;
      } else if (e?.type === 'error' && e?.target?.error) { // HTMLMediaElement error
        const mediaError = e.target.error;
        switch (mediaError.code) {
            case mediaError.MEDIA_ERR_ABORTED: message = 'Video playback aborted.'; break;
            case mediaError.MEDIA_ERR_NETWORK: message = 'A network error caused video download to fail.'; break;
            case mediaError.MEDIA_ERR_DECODE: message = 'Video could not be decoded.'; break;
            case mediaError.MEDIA_ERR_SRC_NOT_SUPPORTED: message = 'Video format not supported or source unavailable.'; break;
            default: message = `An unknown video error occurred (code ${mediaError.code}).`;
        }
      } else {
          message = 'Failed to load video. Please check the URL or try a different video.';
      }
      setError(message);
      setIsLoading(false);
    };

    const handlePlay = () => {
      setIsPlaying(true);
      if (isHost) onPlayerControl({ type: 'play' });
    };

    const handlePause = () => {
      setIsPlaying(false);
      if (isHost) onPlayerControl({ type: 'pause' });
    };

    const handleProgress: ReactPlayerProps['onProgress'] = (state) => {
        setPlayedSeconds(state.playedSeconds);
        // Host's regular progress updates are not typically broadcast as 'seek'.
        // Only explicit seeks (scrubbing) are.
    };
    
    const handleSeek = (seconds: number) => {
      // This is called when this client's user manually scrubs the progress bar.
      if (isHost) {
          if (hostJustSeekedRef.current) { // Avoid echo if host received their own seek
              hostJustSeekedRef.current = false;
              return;
          }
          onPlayerControl({ type: 'seek', time: seconds });
          setPlayedSeconds(seconds); 
      }
      // Non-hosts do not emit seek events from their own scrub bar. They only receive and apply.
    };

    const handleDuration = (d: number) => {
      setCurrentDuration(d);
    };

    if (!hasWindow) {
      return <Skeleton className="aspect-video w-full rounded-lg" />;
    }

    const playerNode = (
      <ReactPlayer
        ref={playerRef}
        url={actualPlayableUrl || undefined} 
        width="100%"
        height="100%"
        controls={isHost} // Only host gets native controls to seek/play/pause that sync
        playing={isPlaying} 
        onReady={handleReady}
        onError={handleError}
        onPlay={handlePlay} // Host: emits. Guest: local state update (host's command would have set it)
        onPause={handlePause} // Host: emits. Guest: local state update
        onProgress={handleProgress}
        onSeek={handleSeek} // Host: emits. Guest: local state update from their own bar (but doesn't emit)
        onDuration={handleDuration}
        // Hide player if there's an error for this client, or if it's a blob URL and this client is not host.
        style={{ display: error || (isBlobUrl && !isHost && videoUrl) || (!actualPlayableUrl && !isLoading) ? 'none' : 'block' }}
        config={{
          file: {
            attributes: {
              controlsList: 'nodownload',
            },
          },
        }}
      />
    );

    const placeholderOrErrorNode = () => {
        if (isLoading && videoUrl && !error) { // Loading a potentially playable video
             return (
               <div className="absolute inset-0 flex items-center justify-center bg-muted">
                 <Skeleton className="h-full w-full" />
                 <p className="absolute text-foreground text-lg">Loading video...</p>
               </div>);
        }
        if (!videoUrl && !isLoading && !error) { // No video selected yet
            return (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
                <Image 
                  src="https://picsum.photos/1280/720?grayscale" 
                  alt="Video placeholder" 
                  layout="fill"
                  objectFit="cover"
                  data-ai-hint="placeholder video"
                  priority
                />
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                  <p className="text-background text-xl font-semibold">
                    {isHost ? "Upload a video to start watching" : "Waiting for host to select a video"}
                  </p>
                </div>
              </div>);
        }
        if (error) { // An error occurred trying to load the video
            return (
              <div className="absolute inset-0 flex flex-col items-center justify-center bg-destructive/10 text-destructive p-4 text-center">
                <p className="text-lg font-semibold">Video Error</p>
                <p>{error}</p>
              </div>);
        }
        if (isBlobUrl && !isHost && videoUrl) { // Host is playing a local blob, I'm not host
             return (
               <div className="absolute inset-0 flex flex-col items-center justify-center bg-muted">
                 <Image 
                    src="https://picsum.photos/1280/720?grayscale&blur=2" // Blurred placeholder
                    alt="Host playing local video" 
                    layout="fill"
                    objectFit="cover"
                    data-ai-hint="placeholder host video"
                    priority
                  />
                 <div className="absolute inset-0 bg-black/60 flex items-center justify-center p-4 text-center">
                    <p className="text-background text-lg">Host is playing a local video. Your playback will sync to host's controls.</p>
                 </div>
               </div>
            );
        }
        return null; // Should not happen if logic is correct
    }


    return (
      <Card className="shadow-lg overflow-hidden h-full">
        <CardContent className="p-0 h-full">
          <div className="aspect-video w-full bg-black relative h-full">
            {/* Show player if it's supposed to be shown, otherwise show placeholder/error */}
            {(actualPlayableUrl && !error && !isLoading) ? playerNode : placeholderOrErrorNode()}
          </div>
        </CardContent>
      </Card>
    );
  }
);

VideoPlayerWrapper.displayName = 'VideoPlayerWrapper';
