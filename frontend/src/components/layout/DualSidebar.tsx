import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
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
  Plus,
  Search,
  Clock,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/use-theme';
import { useSidebar } from '@/hooks/use-sidebar';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { conversationApi } from '@/services/chat-api';
import type { Conversation } from '@/types/chat';

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
        isExpanded ? 'w-56' : 'w-14'
      )}
      aria-expanded={isExpanded}
    >
      {/* Logo */}
      <div className="flex h-12 shrink-0 items-center px-2">
        <Link
          to="/"
          className="flex size-10 items-center justify-center rounded-xl bg-primary/10 text-xl transition-transform hover:scale-110"
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
      <nav className="shrink-0 space-y-0.5 px-2 py-1">
        {navItems.map((item) => {
          const active = isActive(item.path);
          return (
            <NavItem
              key={item.path}
              to={item.path}
              icon={item.icon}
              label={t(item.labelKey)}
              active={active}
              expanded={isExpanded}
            />
          );
        })}
      </nav>

      {/* Chat history — visible only when expanded */}
      {isExpanded ? (
        <ChatHistoryList />
      ) : (
        <div className="flex-1" />
      )}

      {/* Bottom tools */}
      <div className="shrink-0 border-t border-sidebar-border/50 px-2 py-2 space-y-0.5">
        <NavItem
          icon={isExpanded ? PanelLeftClose : PanelLeft}
          label={isExpanded ? t('sidebar.collapse') : t('sidebar.expand')}
          onClick={toggle}
          expanded={isExpanded}
        />
        <NavItem
          icon={Languages}
          label={t('lang.switchTo')}
          onClick={toggleLang}
          expanded={isExpanded}
        />
        <NavItem
          icon={ThemeIcon}
          label={t(`theme.${theme}`)}
          onClick={cycleTheme}
          expanded={isExpanded}
        />
        <NavItem
          to="/settings"
          icon={Settings}
          label={t('nav.settings')}
          active={location.pathname === '/settings'}
          expanded={isExpanded}
        />
      </div>
    </aside>
  );
}

function NavItem({
  to,
  icon: Icon,
  label,
  active = false,
  expanded,
  onClick,
}: {
  to?: string;
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  active?: boolean;
  expanded: boolean;
  onClick?: () => void;
}) {
  const classes = cn(
    'flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 transition-colors',
    !expanded && 'justify-center',
    active
      ? 'bg-sidebar-primary text-sidebar-primary-foreground'
      : 'text-sidebar-foreground/60 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground'
  );

  const content = (
    <>
      <Icon className="size-5 shrink-0" />
      {expanded && <span className="truncate text-sm">{label}</span>}
    </>
  );

  const element = to ? (
    <Link to={to} className={classes}>{content}</Link>
  ) : (
    <button onClick={onClick} className={classes}>{content}</button>
  );

  if (expanded) return element;

  return (
    <Tooltip delayDuration={200}>
      <TooltipTrigger asChild>{element}</TooltipTrigger>
      <TooltipContent side="right" sideOffset={8}>
        {label}
      </TooltipContent>
    </Tooltip>
  );
}

function ChatHistoryList() {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();
  const [search, setSearch] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['conversations'],
    queryFn: () => conversationApi.list(1, 50),
    staleTime: 10_000,
  });

  const conversations: Conversation[] = data?.items ?? [];
  const filtered = search
    ? conversations.filter((c) =>
        c.title.toLowerCase().includes(search.toLowerCase()),
      )
    : conversations;

  const currentConvId = location.pathname.startsWith('/chat/')
    ? Number(location.pathname.split('/chat/')[1])
    : undefined;

  const isChatRoute = location.pathname === '/' || location.pathname.startsWith('/chat/');

  const formatTime = (dateStr: string) => {
    const d = new Date(dateStr);
    const now = new Date();
    const diff = now.getTime() - d.getTime();
    const mins = Math.floor(diff / 60000);
    if (mins < 1) return t('history.timeJustNow');
    if (mins < 60) return t('history.timeMinutes', { count: mins });
    const hours = Math.floor(mins / 60);
    if (hours < 24) return t('history.timeHours', { count: hours });
    const days = Math.floor(hours / 24);
    if (days < 7) return t('history.timeDays', { count: days });
    return d.toLocaleDateString(i18n.language === 'zh' ? 'zh-CN' : 'en-US');
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-sidebar-border/50">
      {/* New chat + search */}
      <div className="shrink-0 space-y-1.5 px-2 py-2">
        <Button
          size="sm"
          variant="outline"
          className="w-full gap-1.5 text-xs h-7"
          onClick={() => navigate('/', { replace: true })}
        >
          <Plus className="size-3.5" />
          {t('playground.newChat')}
        </Button>
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      {/* Conversation list */}
      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 px-2 pb-2">
          {isLoading ? (
            <div className="space-y-2 px-1 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-9 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-6 text-center">
              <MessageSquare className="mx-auto mb-1.5 size-4 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                {search ? t('history.noMatch') : t('history.empty')}
              </p>
            </div>
          ) : (
            filtered.map((conv) => {
              const isCurrentConv = isChatRoute && currentConvId === conv.id;
              return (
                <button
                  key={conv.id}
                  onClick={() => navigate(`/chat/${conv.id}`)}
                  className={cn(
                    'flex w-full min-w-0 flex-col gap-0.5 rounded-md px-2 py-1.5 text-left transition-colors',
                    isCurrentConv
                      ? 'bg-sidebar-primary/15 text-sidebar-primary'
                      : 'hover:bg-sidebar-accent/50',
                  )}
                >
                  <span className="truncate text-xs font-medium">{conv.title}</span>
                  <div className="flex items-center gap-1">
                    <Badge variant="secondary" className="px-1 py-0 text-[9px] leading-tight">
                      {conv.tool_mode}
                    </Badge>
                    <span className="flex items-center gap-0.5 text-[9px] text-muted-foreground">
                      <Clock className="size-2" />
                      {formatTime(conv.updated_at)}
                    </span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </ScrollArea>
    </div>
  );
}
