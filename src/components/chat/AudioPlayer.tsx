'use client';

import type { FC } from 'react';

interface AudioPlayerProps {
  src: string;
  mimeType?: string;
}

const AudioPlayer: FC<AudioPlayerProps> = ({ src, mimeType }) => {
  if (!src) return null;

  return (
    <div className="my-1 w-full"> {/* Ensure container takes full width */}
      <audio
        controls
        src={src}
        type={mimeType} // Set the type attribute for the audio element
        className="w-full h-10 rounded-md shadow-sm bg-accent text-accent-foreground" // Use accent for high contrast and set text color
        preload="metadata" 
        key={src} // Force re-render if src changes, helps with blob URLs
      >
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default AudioPlayer;
