import type { ReactNode } from 'react';

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  action?: ReactNode;
  className?: string;
}

export default function PageHeader({ title, subtitle, action, className }: PageHeaderProps) {
  return (
    <div className={`flex items-center justify-between ${className ?? ''}`}>
      <div>
        <h1 className="text-2xl font-bold">{title}</h1>
        {subtitle && (
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        )}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
