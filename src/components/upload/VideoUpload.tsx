
'use client';

import { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/hooks/use-toast';
import { UploadCloud, Video, X } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

interface VideoUploadProps {
  onVideoSelect: (videoUrl: string, fileName: string) => void;
}

export function VideoUpload({ onVideoSelect }: VideoUploadProps) {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null); // This is a blob URL
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  // Clean up object URL when component unmounts or previewUrl changes and is no longer needed
  useEffect(() => {
    const currentPreviewUrl = previewUrl; // Capture current value for cleanup
    return () => {
      if (currentPreviewUrl) {
        URL.revokeObjectURL(currentPreviewUrl);
      }
    };
  }, [previewUrl]);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        // Revoke previous URL if exists, before creating new one
        if (previewUrl) {
          URL.revokeObjectURL(previewUrl);
        }

        setSelectedFile(file);
        const newPreviewUrl = URL.createObjectURL(file);
        setPreviewUrl(newPreviewUrl); // Set the new blob URL for potential local preview
        onVideoSelect(newPreviewUrl, file.name); // Pass blob URL and name to parent (RoomPage)
        toast({
          title: 'Video Selected',
          description: `${file.name} is ready. Host controls are active.`,
        });
      } else {
        toast({
          title: 'Invalid File Type',
          description: 'Please select a valid video file.',
          variant: 'destructive',
        });
        // Clear previous selection if invalid file is chosen
        if (previewUrl) URL.revokeObjectURL(previewUrl);
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = ""; // Reset the file input so the same file can be re-selected after error
        }
        onVideoSelect('', ''); // Clear in parent as well
      }
    } else { // No file selected (e.g., user cancelled dialog)
        // If a file was previously selected, and now it's unselected, clear it.
        if (selectedFile) {
            handleRemoveFile(); // Treat as removal
        }
    }
  };

  const handleRemoveFile = () => {
    if (previewUrl) { // previewUrl is always a blob URL here
      URL.revokeObjectURL(previewUrl);
    }
    setSelectedFile(null);
    setPreviewUrl(null);
    onVideoSelect('', ''); // Clear video in parent
    if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Reset the file input
    }
     toast({
        title: 'Video Cleared',
        description: 'Video selection has been removed.',
      });
  };
  
  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Select Video (Host)</CardTitle>
        <CardDescription>Choose a local video file. Other users will sync to your playback.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selectedFile ? (
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg hover:border-primary transition-colors">
            <UploadCloud className="w-12 h-12 text-muted-foreground mb-2" />
            <Label htmlFor="video-upload" className="cursor-pointer text-primary font-semibold hover:underline">
              Choose a video file
            </Label>
            <p className="text-xs text-muted-foreground mt-1">MP4, WebM, Ogg. This plays locally for you.</p>
            <Input
              id="video-upload"
              type="file"
              accept="video/*"
              onChange={handleFileChange}
              ref={fileInputRef}
              className="hidden"
              aria-label="Video file input"
            />
          </div>
        ) : (
          <div className="p-4 border rounded-lg bg-muted/50">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 min-w-0"> 
                <Video className="w-6 h-6 text-primary flex-shrink-0" />
                <span className="text-sm font-medium truncate" title={selectedFile.name}>{selectedFile.name}</span>
              </div>
              <Button variant="ghost" size="icon" onClick={handleRemoveFile} aria-label="Remove selected video">
                <X className="w-5 h-5 text-destructive" />
              </Button>
            </div>
             <p className="text-xs text-muted-foreground mt-1">
              ({(selectedFile.size / (1024 * 1024)).toFixed(2)} MB)
            </p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
