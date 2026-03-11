import { Link, useLocation } from 'react-router-dom';
import {
  MessageSquare,
  Library,
  History,
  Settings,
  Sun,
  Moon,
  Monitor,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const navItems = [
  { path: '/', label: '对话', icon: MessageSquare },
  { path: '/knowledge-bases', label: '知识库', icon: Library },
  { path: '/history', label: '历史记录', icon: History },
] as const;

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeLabels = { light: '浅色', dark: '深色', system: '跟随系统' } as const;
const themeOrder: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

export default function IconSidebar() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    setTheme(themeOrder[(idx + 1) % themeOrder.length]);
  };

  const ThemeIcon = themeIcons[theme];

  return (
    <aside className="flex h-screen w-14 flex-col items-center border-r border-sidebar-border bg-sidebar py-3">
      <Link to="/" className="mb-4 text-2xl" aria-label="Omelette 首页">
        🍳
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/'
              : location.pathname.startsWith(item.path);
          return (
            <Tooltip key={item.path} delayDuration={200}>
              <TooltipTrigger asChild>
                <Link
                  to={item.path}
                  className={cn(
                    'flex size-10 items-center justify-center rounded-lg transition-colors',
                    isActive
                      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                  )}
                >
                  <item.icon className="size-5" />
                </Link>
              </TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {item.label}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      <div className="flex flex-col items-center gap-1">
        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <button
              onClick={cycleTheme}
              className="flex size-10 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            >
              <ThemeIcon className="size-5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            {themeLabels[theme]}
          </TooltipContent>
        </Tooltip>

        <Tooltip delayDuration={200}>
          <TooltipTrigger asChild>
            <Link
              to="/settings"
              className={cn(
                'flex size-10 items-center justify-center rounded-lg transition-colors',
                location.pathname === '/settings'
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
              )}
            >
              <Settings className="size-5" />
            </Link>
          </TooltipTrigger>
          <TooltipContent side="right" sideOffset={8}>
            设置
          </TooltipContent>
        </Tooltip>
      </div>
    </aside>
  );
}
