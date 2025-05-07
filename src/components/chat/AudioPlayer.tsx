'use client';

import type { FC } from 'react';

interface AudioPlayerProps {
  src: string;
  mimeType?: string;
}

const AudioPlayer: FC<AudioPlayerProps> = ({ src, mimeType }) => {
  if (!src) return null;

  // Ensure a unique key for the audio element if src can change for the same player instance,
  // though in a list, map keys usually handle this. Here, src itself changing forces re-render.
  return (
    <div className="my-1">
      <audio
        controls
        src={src}
        className="w-full h-10 rounded-md shadow-sm bg-background/50"
        preload="metadata" // Good for loading metadata like duration quickly
        key={src} // Force re-render if src changes, helps with blob URLs
      >
        {mimeType && <source src={src} type={mimeType} />}
        Your browser does not support the audio element.
      </audio>
    </div>
  );
};

export default AudioPlayer;
