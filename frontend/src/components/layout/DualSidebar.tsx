import { useState } from 'react';
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
  const { isExpanded, toggle } = useSidebar();

  const isChatRoute = location.pathname === '/' || location.pathname.startsWith('/chat/');

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
        'relative flex h-screen shrink-0 border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out',
        isExpanded ? 'w-72' : 'w-14'
      )}
      aria-expanded={isExpanded}
    >
      {/* Icon rail */}
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
            return (
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
                {!isExpanded && (
                  <TooltipContent side="right" sideOffset={8}>
                    {t(item.labelKey)}
                  </TooltipContent>
                )}
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

      {/* Expandable panel — context-aware */}
      <div
        className={cn(
          'flex flex-col overflow-hidden border-l border-sidebar-border/50 transition-[width,opacity] duration-200 ease-out',
          isExpanded ? 'w-58 opacity-100' : 'w-0 opacity-0'
        )}
      >
        <div className="flex h-12 items-center justify-between px-3">
          <span className="text-sm font-semibold text-sidebar-foreground truncate">
            {isChatRoute ? t('history.title') : t('app.name')}
          </span>
          <button
            onClick={toggle}
            className="flex size-7 items-center justify-center rounded-md text-sidebar-foreground/60 transition-colors hover:bg-sidebar-accent hover:text-sidebar-accent-foreground"
            aria-label={t('sidebar.collapse')}
          >
            <PanelLeftClose className="size-4" />
          </button>
        </div>

        {isChatRoute ? (
          <ChatHistoryPanel />
        ) : (
          <NavPanel isActive={isActive} />
        )}
      </div>

      {/* Expand toggle when collapsed */}
      {!isExpanded && (
        <button
          onClick={toggle}
          className="absolute left-14 top-3 z-10 flex size-6 -translate-x-1/2 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm transition-colors hover:bg-accent"
          aria-label={t('sidebar.expand')}
        >
          <PanelLeft className="size-3" />
        </button>
      )}
    </aside>
  );
}

function NavPanel({ isActive }: { isActive: (path: string) => boolean }) {
  const { t } = useTranslation();
  const location = useLocation();

  return (
    <>
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
    </>
  );
}

function ChatHistoryPanel() {
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

  const handleNewChat = () => {
    navigate('/', { replace: true });
  };

  return (
    <>
      <div className="flex items-center gap-1.5 px-2 py-1.5">
        <Button
          size="sm"
          variant="outline"
          className="flex-1 gap-1.5 text-xs h-8"
          onClick={handleNewChat}
        >
          <Plus className="size-3.5" />
          {t('playground.newChat')}
        </Button>
      </div>

      <div className="px-2 py-1">
        <div className="relative">
          <Search className="absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t('history.searchPlaceholder')}
            className="h-7 pl-7 text-xs"
          />
        </div>
      </div>

      <ScrollArea className="min-h-0 flex-1">
        <div className="space-y-0.5 px-2 pb-2">
          {isLoading ? (
            <div className="space-y-2 px-1 py-2">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-10 animate-pulse rounded-md bg-muted" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="px-2 py-8 text-center">
              <MessageSquare className="mx-auto mb-2 size-5 text-muted-foreground/50" />
              <p className="text-xs text-muted-foreground">
                {search ? t('history.noMatch') : t('history.empty')}
              </p>
            </div>
          ) : (
            filtered.map((conv) => (
              <button
                key={conv.id}
                onClick={() => navigate(`/chat/${conv.id}`)}
                className={cn(
                  'flex w-full flex-col gap-0.5 rounded-md px-2.5 py-1.5 text-left transition-colors',
                  currentConvId === conv.id
                    ? 'bg-sidebar-accent'
                    : 'hover:bg-sidebar-accent/50',
                )}
              >
                <span className="truncate text-sm">{conv.title}</span>
                <div className="flex items-center gap-1.5">
                  <Badge variant="secondary" className="px-1 py-0 text-[10px]">
                    {conv.tool_mode}
                  </Badge>
                  <span className="flex items-center gap-0.5 text-[10px] text-muted-foreground">
                    <Clock className="size-2.5" />
                    {formatTime(conv.updated_at)}
                  </span>
                </div>
              </button>
            ))
          )}
        </div>
      </ScrollArea>
    </>
  );
}
