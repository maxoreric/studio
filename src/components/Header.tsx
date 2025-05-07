import Link from 'next/link';

export function Header() {
  return (
    <header className="sticky top-0 z-50 w-full border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
      <div className="container mx-auto flex h-16 items-center px-4 sm:px-6 lg:px-8">
        <Link href="/" className="text-2xl font-bold text-primary hover:opacity-80 transition-opacity">
          SyncStream
        </Link>
        {/* Future: Add navigation items or theme toggle here */}
      </div>
    </header>
  );
}
