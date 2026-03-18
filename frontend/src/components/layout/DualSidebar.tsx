import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  MessageSquare,
  Library,
  History,
  ListTodo,
  Settings,
  Sun,
  Moon,
  Monitor,
  Languages,
  PanelLeftClose,
  PanelLeft,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';
import { useSidebar } from '@/hooks/use-sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';

const navItems = [
  { path: '/', labelKey: 'nav.chat', icon: MessageSquare },
  { path: '/knowledge-bases', labelKey: 'nav.knowledgeBases', icon: Library },
  { path: '/history', labelKey: 'nav.history', icon: History },
  { path: '/tasks', labelKey: 'nav.tasks', icon: ListTodo },
] as const;

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeOrder: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

export default function DualSidebar() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const { isExpanded, toggle } = useSidebar();

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    setTheme(themeOrder[(idx + 1) % themeOrder.length]);
  };

  const toggleLang = () => {
    const next = i18n.language?.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(next);
  };

  const ThemeIcon = themeIcons[theme];

  function isActive(path: string) {
    if (path === '/') {
      return location.pathname === '/' || location.pathname.startsWith('/chat/');
    }
    return location.pathname.startsWith(path);
  }

  return (
    <aside
      className={cn(
        'flex h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out',
        isExpanded ? 'w-56' : 'w-14'
      )}
      aria-expanded={isExpanded}
    >
      {/* Icon rail — always visible */}
      <div className="flex w-14 shrink-0 flex-col items-center py-3">
        <Link
          to="/"
          className="mb-4 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-xl transition-transform hover:scale-110"
          aria-label={t('nav.home')}
        >
          🍳
        </Link>

        <nav className="flex flex-1 flex-col items-center gap-1">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return isExpanded ? (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex size-10 items-center justify-center rounded-lg transition-colors',
                  active
                    ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="size-5" />
              </Link>
            ) : (
              <Tooltip key={item.path} delayDuration={200}>
                <TooltipTrigger asChild>
                  <Link
                    to={item.path}
                    className={cn(
                      'flex size-10 items-center justify-center rounded-lg transition-colors',
                      active
                        ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                        : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                    )}
                  >
                    <item.icon className="size-5" />
                  </Link>
                </TooltipTrigger>
                <TooltipContent side="right" sideOffset={8}>
                  {t(item.labelKey)}
                </TooltipContent>
              </Tooltip>
            );
          })}
        </nav>

        <div className="flex flex-col items-center gap-1">
          <Tooltip delayDuration={200}>
            <TooltipTrigger asChild>
              <button
                onClick={toggleLang}
                className="flex size-10 items-center justify-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
              >
                <Languages className="size-5" />
              </button>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {t('lang.switchTo')}
            </TooltipContent>
          </Tooltip>

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
              {t(`theme.${theme}`)}
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
                    : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <Settings className="size-5" />
              </Link>
            </TooltipTrigger>
            <TooltipContent side="right" sideOffset={8}>
              {t('nav.settings')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>

      {/* Text panel — expandable */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-l border-sidebar-border/50 transition-[width,opacity] duration-200 ease-out',
          isExpanded ? 'w-42 opacity-100' : 'w-0 opacity-0'
        )}
      >
        <div className="flex h-14 items-center justify-between px-3">
          <span className="text-sm font-semibold text-sidebar-foreground truncate">
            Omelette
          </span>
          <button
            onClick={toggle}
            className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label={isExpanded ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>

        <nav className="flex-1 space-y-0.5 px-2 py-2 overflow-y-auto">
          {navItems.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
                  active
                    ? 'bg-sidebar-primary/10 text-sidebar-primary font-medium'
                    : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
                )}
              >
                <item.icon className="size-4 shrink-0" />
                <span className="truncate">{t(item.labelKey)}</span>
              </Link>
            );
          })}
        </nav>

        <div className="border-t border-sidebar-border/50 px-2 py-2 space-y-0.5">
          <Link
            to="/settings"
            className={cn(
              'flex items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm transition-colors',
              location.pathname === '/settings'
                ? 'bg-sidebar-primary/10 text-sidebar-primary font-medium'
                : 'text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
            )}
          >
            <Settings className="size-4 shrink-0" />
            <span className="truncate">{t('nav.settings')}</span>
          </Link>
        </div>
      </div>

      {/* Expand button (shown when collapsed) */}
      {!isExpanded && (
        <button
          onClick={toggle}
          className="absolute left-14 top-3 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent"
          aria-label="Expand sidebar"
        >
          <PanelLeft className="size-3" />
        </button>
      )}
    </aside>
  );
}
