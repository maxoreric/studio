
'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useActionState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { handleRoomEntry, type RoomEntryFormState } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
// No client-side router needed if action handles redirect

const roomEntrySchema = z.object({
  roomName: z.string().min(1, { message: 'Room name is required.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
});

type RoomEntryFormData = z.infer<typeof roomEntrySchema>;

export function RoomEntryForm() {
  const { toast } = useToast();
  
  const [state, formAction, isPending] = useActionState<RoomEntryFormState | undefined, FormData>(handleRoomEntry, undefined);

  const form = useForm<RoomEntryFormData>({
    resolver: zodResolver(roomEntrySchema),
    defaultValues: {
      roomName: '',
      password: '',
    },
  });

  useEffect(() => {
    if (state?.success === false && state.message) {
      toast({
        title: 'Error',
        description: state.message,
        variant: 'destructive',
      });
      if (state.errors?._form) form.clearErrors();
    } else if (state?.errors) {
        if(state.errors.roomName) form.setError("roomName", { type: "server", message: state.errors.roomName.join(', ') });
        if(state.errors.password) form.setError("password", { type: "server", message: state.errors.password.join(', ') });
    }
    // Redirect is handled by the server action.
  }, [state, toast, form]);

  const onSubmit = (data: RoomEntryFormData) => {
    // Store password and username in sessionStorage BEFORE submitting the form.
    // This way, RoomPage can access it after the redirect caused by the server action.
    try {
        sessionStorage.setItem('roomPasswordSyncStream', data.password); // Use a more specific key
        // Simple unique username generation
        const existingUsername = sessionStorage.getItem('roomUsernameSyncStream');
        if (!existingUsername) {
            sessionStorage.setItem('roomUsernameSyncStream', `User_${Math.random().toString(36).substring(2, 7)}`);
        }
    } catch (error) {
        console.warn("Could not set item in sessionStorage:", error);
        toast({
            title: "Browser Storage Issue",
            description: "Could not save session details. You may need to re-enter them on the next page.",
            variant: "destructive"
        })
    }
    
    const formData = new FormData();
    formData.append('roomName', data.roomName);
    formData.append('password', data.password);
    formAction(formData);
  };


  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Join or Create a Room</CardTitle>
        <CardDescription>Enter a room name and password to start streaming together.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
          <CardContent className="space-y-4">
            <FormField
              control={form.control}
              name="roomName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Room Name</FormLabel>
                  <FormControl>
                    <Input placeholder="eg. Movie Night" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="password"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Password</FormLabel>
                  <FormControl>
                    <Input type="password" placeholder="••••••••" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
             {state?.errors?._form && (
              <p className="text-sm font-medium text-destructive">{state.errors._form.join(', ')}</p>
            )}
          </CardContent>
          <CardFooter>
            <Button type="submit" className="w-full" disabled={isPending}>
              {isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Enter Room
            </Button>
          </CardFooter>
        </form>
      </Form>
    </Card>
  );
}
