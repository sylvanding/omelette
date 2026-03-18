import { useTranslation } from 'react-i18next';
import { Bell, HelpCircle } from 'lucide-react';
import { cn } from '@/lib/utils';

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 6) return 'Good night';
  if (hour < 12) return 'Good morning';
  if (hour < 18) return 'Good afternoon';
  return 'Good evening';
}

interface TopBarProps {
  className?: string;
}

export default function TopBar({ className }: TopBarProps) {
  const { t } = useTranslation();
  const greeting = getGreeting();

  return (
    <header
      className={cn(
        'flex h-14 shrink-0 items-center justify-between border-b border-border bg-background px-6',
        className
      )}
    >
      <div className="flex flex-col">
        <span className="text-sm font-semibold text-foreground">
          {greeting} 👋
        </span>
        <span className="text-xs text-muted-foreground">
          {t('playground.welcome', 'Track your research effectively')}
        </span>
      </div>

      <div className="flex items-center gap-2">
        <button className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <Bell className="size-4" />
        </button>
        <button className="flex size-8 items-center justify-center rounded-lg text-muted-foreground transition-colors hover:bg-accent hover:text-accent-foreground">
          <HelpCircle className="size-4" />
        </button>
        <div className="ml-2 flex size-8 items-center justify-center rounded-full bg-primary/10 text-sm font-medium text-primary">
          U
        </div>
      </div>
    </header>
  );
}
