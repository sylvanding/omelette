import { Skeleton } from './skeleton';
import { cn } from '@/lib/utils';

interface SkeletonProps {
  count?: number;
  className?: string;
}

export function CardSkeleton({ count = 6, className }: SkeletonProps) {
  return (
    <div className={cn('grid gap-4 sm:grid-cols-2 lg:grid-cols-3', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
          <Skeleton className="size-10 rounded-lg" />
          <Skeleton className="h-5 w-3/4" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-1/2" />
          <Skeleton className="mt-2 h-5 w-20 rounded-full" />
        </div>
      ))}
    </div>
  );
}

export function ListItemSkeleton({ count = 5, className }: SkeletonProps) {
  return (
    <div className={cn('space-y-2', className)}>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="rounded-lg border border-border bg-card p-4 space-y-2">
          <Skeleton className="h-5 w-2/3" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-5 w-16 rounded-full" />
            <Skeleton className="h-5 w-12 rounded-full" />
            <Skeleton className="h-4 w-20" />
          </div>
        </div>
      ))}
    </div>
  );
}

export function TableSkeleton({
  rows = 4,
  cols = 4,
  className,
}: {
  rows?: number;
  cols?: number;
  className?: string;
}) {
  return (
    <div className={cn('overflow-hidden', className)}>
      <div className="border-b border-border bg-muted/50 flex">
        {Array.from({ length: cols }).map((_, i) => (
          <div key={i} className="flex-1 px-4 py-3">
            <Skeleton className="h-3 w-16" />
          </div>
        ))}
      </div>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="border-b border-border flex">
          {Array.from({ length: cols }).map((_, j) => (
            <div key={j} className="flex-1 px-4 py-3">
              <Skeleton className={cn('h-4', j === 0 ? 'w-24' : j === 1 ? 'w-16 rounded-full' : 'w-12')} />
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function SettingsSkeleton({ className }: { className?: string }) {
  return (
    <div className={cn('space-y-6', className)}>
      {[1, 2].map((i) => (
        <div key={i} className="rounded-xl border border-border bg-card overflow-hidden">
          <div className="p-6 pb-4">
            <div className="flex items-center gap-2">
              <Skeleton className="size-5 rounded" />
              <Skeleton className="h-5 w-40" />
            </div>
          </div>
          <div className="px-6 pb-6 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-10 w-full rounded-md" />
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
