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
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';
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

export default function IconSidebar() {
  const location = useLocation();
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    setTheme(themeOrder[(idx + 1) % themeOrder.length]);
  };

  const toggleLang = () => {
    const next = i18n.language?.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(next);
  };

  const ThemeIcon = themeIcons[theme];

  return (
    <aside className="flex h-screen w-14 flex-col items-center border-r border-sidebar-border bg-sidebar py-3">
      <Link
        to="/"
        className="mb-4 flex size-9 items-center justify-center rounded-xl bg-primary/10 text-xl transition-transform hover:scale-110"
        aria-label={t('nav.home')}
      >
        🍳
      </Link>

      <nav className="flex flex-1 flex-col items-center gap-1">
        {navItems.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/' || location.pathname.startsWith('/chat/')
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
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
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
    </aside>
  );
}
