import { RoomEntryForm } from '@/components/forms/RoomEntryForm';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[calc(100vh-10rem)] py-12">
      <RoomEntryForm />
    </div>
  );
}
