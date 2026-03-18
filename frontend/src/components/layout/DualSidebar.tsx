import { useEffect } from 'react';
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
  const { isExpanded, toggle, collapse } = useSidebar();

  const isProjectRoute = location.pathname.startsWith('/projects/');

  useEffect(() => {
    if (isProjectRoute) {
      collapse();
    }
  }, [isProjectRoute, collapse]);

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
        'relative flex h-screen shrink-0 flex-col border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out',
        isExpanded ? 'w-48' : 'w-14'
      )}
      aria-expanded={isExpanded}
    >
      {/* Logo */}
      <div className="flex h-12 items-center px-3">
        <Link
          to="/"
          className="flex size-9 items-center justify-center rounded-xl bg-primary/10 text-xl transition-transform hover:scale-110"
          aria-label={t('nav.home')}
        >
          🍳
        </Link>
        {isExpanded && (
          <span className="ml-2 text-sm font-semibold text-sidebar-foreground truncate">
            {t('app.name')}
          </span>
        )}
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-0.5 px-2 py-2 overflow-y-auto">
        {navItems.map((item) => {
          const active = isActive(item.path);
          const linkContent = (
            <Link
              to={item.path}
              className={cn(
                'flex items-center rounded-lg transition-colors',
                isExpanded ? 'gap-2.5 px-2.5 py-2' : 'justify-center p-2.5',
                active
                  ? 'bg-sidebar-primary text-sidebar-primary-foreground'
                  : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
              )}
            >
              <item.icon className="size-5 shrink-0" />
              {isExpanded && (
                <span className="truncate text-sm">{t(item.labelKey)}</span>
              )}
            </Link>
          );

          if (isExpanded) return <div key={item.path}>{linkContent}</div>;

          return (
            <Tooltip key={item.path} delayDuration={200}>
              <TooltipTrigger asChild>{linkContent}</TooltipTrigger>
              <TooltipContent side="right" sideOffset={8}>
                {t(item.labelKey)}
              </TooltipContent>
            </Tooltip>
          );
        })}
      </nav>

      {/* Bottom tools */}
      <div className="border-t border-sidebar-border/50 px-2 py-2 space-y-0.5">
        {/* Expand/Collapse toggle */}
        <ToolButton
          icon={isExpanded ? PanelLeftClose : PanelLeft}
          label={isExpanded ? t('sidebar.collapse') : t('sidebar.expand')}
          onClick={toggle}
          expanded={isExpanded}
        />

        {/* Language */}
        <ToolButton
          icon={Languages}
          label={t('lang.switchTo')}
          onClick={toggleLang}
          expanded={isExpanded}
        />

        {/* Theme */}
        <ToolButton
          icon={ThemeIcon}
          label={t(`theme.${theme}`)}
          onClick={cycleTheme}
          expanded={isExpanded}
        />

        {/* Settings */}
        <SettingsLink expanded={isExpanded} />
      </div>
    </aside>
  );
}

function ToolButton({
  icon: Icon,
  label,
  onClick,
  expanded,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  expanded: boolean;
}) {
  const btn = (
    <button
      onClick={onClick}
      className={cn(
        'flex w-full items-center rounded-lg text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
        expanded ? 'gap-2.5 px-2.5 py-2' : 'justify-center p-2.5'
      )}
    >
      <Icon className="size-5 shrink-0" />
      {expanded && <span className="truncate text-sm">{label}</span>}
    </button>
  );

  if (expanded) return btn;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{btn}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function SettingsLink({ expanded }: { expanded: boolean }) {
  const { t } = useTranslation();
  const location = useLocation();
  const active = location.pathname === '/settings';

  const link = (
    <Link
      to="/settings"
      className={cn(
        'flex w-full items-center rounded-lg transition-colors',
        expanded ? 'gap-2.5 px-2.5 py-2' : 'justify-center p-2.5',
        active
          ? 'bg-sidebar-primary text-sidebar-primary-foreground'
          : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
      )}
    >
      <Settings className="size-5 shrink-0" />
      {expanded && <span className="truncate text-sm">{t('nav.settings')}</span>}
    </Link>
  );

  if (expanded) return link;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{link}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {t('nav.settings')}
      </TooltipContent>
    </Tooltip>
  );
}
