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
    <div className="rounded-2xl border bg-card p-5 space-y-3">
      <div className="flex items-start gap-3">
        <div className="h-10 w-10 rounded-xl shimmer shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-4 w-2/3 rounded-md shimmer" />
          <div className="h-3 w-1/2 rounded-md shimmer" />
        </div>
      </div>
      <div className="h-3 w-full rounded-md shimmer" />
      <div className="h-3 w-4/5 rounded-md shimmer" />
      <div className="flex gap-2 pt-1">
        <div className="h-7 w-20 rounded-lg shimmer" />
        <div className="h-7 w-20 rounded-lg shimmer" />
      </div>
    </div>
  );
}
