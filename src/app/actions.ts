
'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';

const RoomEntrySchema = z.object({
  roomName: z.string().min(1, { message: 'Room name is required.' }),
  password: z.string().min(1, { message: 'Password is required.' }),
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

  // The actual room joining logic (password check, user limit) will be handled
  // by the Socket.IO server when the client connects on the room page.
  // This server action now primarily validates form input and triggers redirect.
  // The password will be passed via client-side state (sessionStorage) to the room page.
  
  redirect(`/room/${encodeURIComponent(roomName)}`);

  // This part is not reached due to redirect.
  return {
    message: `Proceeding to room ${roomName}. Password will be handled on the room page.`,
    success: true,
  };
}
