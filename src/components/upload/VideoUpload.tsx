'use client';

import { useState, useRef } from 'react';
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
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      if (file.type.startsWith('video/')) {
        setSelectedFile(file);
        const url = URL.createObjectURL(file);
        setPreviewUrl(url); // For local preview, if needed by player
        onVideoSelect(url, file.name); 
        toast({
          title: 'Video Selected',
          description: `${file.name} is ready to play locally.`,
        });
      } else {
        toast({
          title: 'Invalid File Type',
          description: 'Please select a valid video file.',
          variant: 'destructive',
        });
        setSelectedFile(null);
        setPreviewUrl(null);
        if (fileInputRef.current) {
            fileInputRef.current.value = ""; // Reset file input
        }
      }
    }
  };

  const handleRemoveFile = () => {
    setSelectedFile(null);
    if (previewUrl) {
      URL.revokeObjectURL(previewUrl); // Clean up object URL
    }
    setPreviewUrl(null);
    onVideoSelect('', ''); // Clear video in parent
    if (fileInputRef.current) {
        fileInputRef.current.value = ""; // Reset file input
    }
     toast({
        title: 'Video Cleared',
        description: 'Video selection has been removed.',
      });
  };
  
  // Note: Actual server upload logic is omitted as per requirements.
  // In a real app, you'd call `uploadVideo(selectedFile)` here.

  return (
    <Card className="w-full shadow-lg">
      <CardHeader>
        <CardTitle className="text-xl">Upload Video</CardTitle>
        <CardDescription>Select a video file from your device.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {!selectedFile ? (
          <div className="flex flex-col items-center justify-center p-6 border-2 border-dashed rounded-lg hover:border-primary transition-colors">
            <UploadCloud className="w-12 h-12 text-muted-foreground mb-2" />
            <Label htmlFor="video-upload" className="cursor-pointer text-primary font-semibold hover:underline">
              Choose a video file
            </Label>
            <p className="text-xs text-muted-foreground mt-1">MP4, WebM, Ogg up to 500MB</p>
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
              <div className="flex items-center gap-2">
                <Video className="w-6 h-6 text-primary" />
                <span className="text-sm font-medium truncate max-w-[200px]">{selectedFile.name}</span>
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
        {/* Example of "Upload to Server" button - currently non-functional */}
        {/* {selectedFile && (
          <Button 
            onClick={() => alert('Server upload not implemented in this demo.')} 
            className="w-full mt-2"
            disabled={!selectedFile}
          >
            <UploadCloud className="mr-2 h-4 w-4" />
            Upload to Server (Demo)
          </Button>
        )} */}
      </CardContent>
    </Card>
  );
}
