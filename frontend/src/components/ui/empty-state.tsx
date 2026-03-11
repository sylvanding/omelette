import { type LucideIcon } from 'lucide-react';
import { Button } from './button';

interface EmptyStateAction {
  label: string;
  onClick: () => void;
  variant?: 'default' | 'outline';
}

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: EmptyStateAction;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div className={`flex flex-col items-center justify-center py-12 text-center ${className ?? ''}`}>
      <Icon className="h-12 w-12 text-muted-foreground/50" />
      <h3 className="mt-4 text-lg font-medium">{title}</h3>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      {action && (
        <Button
          variant={action.variant ?? 'default'}
          className="mt-4"
          onClick={action.onClick}
        >
          {action.label}
        </Button>
      )}
    </div>
  );
}
