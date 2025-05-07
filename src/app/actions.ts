'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

const RoomEntrySchema = z.object({
  roomName: z.string().min(3, { message: 'Room name must be at least 3 characters.' }),
  password: z.string().min(4, { message: 'Password must be at least 4 characters.' }),
});

export interface RoomEntryFormState {
  message?: string;
  errors?: {
    roomName?: string[];
    password?: string[];
    _form?: string[];
  };
  success: boolean;
}

export async function handleRoomEntry(prevState: RoomEntryFormState | undefined, formData: FormData): Promise<RoomEntryFormState> {
  const validatedFields = RoomEntrySchema.safeParse({
    roomName: formData.get('roomName'),
    password: formData.get('password'),
  });

  if (!validatedFields.success) {
    return {
      errors: validatedFields.error.flatten().fieldErrors,
      message: 'Invalid input.',
      success: false,
    };
  }

  const { roomName } = validatedFields.data;

  // In a real app, you'd validate room & password against a DB or state store.
  // For now, we'll simulate success and redirect.
  console.log('Attempting to enter room:', validatedFields.data);

  // Simulate some server-side logic/delay
  await new Promise(resolve => setTimeout(resolve, 500));

  // On successful validation/creation:
  redirect(`/room/${encodeURIComponent(roomName)}`);

  //This part will not be reached due to redirect, but shows how to return success state
  return {
    message: `Successfully joined room ${roomName}`,
    success: true,
  };
}
