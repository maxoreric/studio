'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useActionState, useEffect } from 'react'; // Changed from 'react-dom' and renamed useFormState
import { useForm } from 'react-hook-form';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardFooter, CardHeader, CardTitle } from '@/components/ui/card';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { handleRoomEntry, type RoomEntryFormState } from '@/app/actions';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';

const roomEntrySchema = z.object({
  roomName: z.string().min(3, { message: 'Room name must be at least 3 characters.' }),
  password: z.string().min(4, { message: 'Password must be at least 4 characters.' }),
});

type RoomEntryFormData = z.infer<typeof roomEntrySchema>;

export function RoomEntryForm() {
  const { toast } = useToast();
  
  const [state, formAction, isPending] = useActionState<RoomEntryFormState | undefined, FormData>(handleRoomEntry, undefined); // Updated to useActionState and added isPending

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
    }
    if (state?.errors?._form) {
       toast({
        title: 'Submission Error',
        description: state.errors._form.join(', '),
        variant: 'destructive',
      });
    }
  }, [state, toast]);
  
  // const {formState: {isSubmitting}} = form; // isSubmitting is now isPending from useActionState


  return (
    <Card className="w-full max-w-md shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Join or Create a Room</CardTitle>
        <CardDescription>Enter a room name and password to start streaming together.</CardDescription>
      </CardHeader>
      <Form {...form}>
        <form action={formAction} className="space-y-6">
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

