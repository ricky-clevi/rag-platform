import { Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export function Spinner({ className }: { className?: string }) {
  return <Loader2 className={cn('h-4 w-4 animate-spin', className)} />;
}

export function FullPageLoader() {
  return (
    <div className="flex h-[50vh] w-full items-center justify-center">
      <Spinner className="h-8 w-8" />
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-lg border bg-card p-6 animate-pulse">
      <div className="h-4 w-3/4 bg-muted rounded mb-4" />
      <div className="h-3 w-1/2 bg-muted rounded mb-2" />
      <div className="h-3 w-2/3 bg-muted rounded" />
    </div>
  );
}
