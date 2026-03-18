import type { ReactNode } from 'react';
import { cn } from '@/lib/utils';

interface PageLayoutProps {
  title: string;
  subtitle?: ReactNode;
  action?: ReactNode;
  tabs?: ReactNode;
  className?: string;
  children: ReactNode;
}

export default function PageLayout({
  title,
  subtitle,
  action,
  tabs,
  className,
  children,
}: PageLayoutProps) {
  return (
    <div className={cn('flex h-full flex-col', className)}>
      <div className="shrink-0 space-y-4 px-6 pt-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
            {subtitle != null && subtitle !== '' && (
              <div className="text-sm text-muted-foreground">{subtitle}</div>
            )}
          </div>
          {action && <div className="shrink-0">{action}</div>}
        </div>
        {tabs}
      </div>
      <div className="flex-1 overflow-y-auto px-6 py-6">{children}</div>
    </div>
  );
}
