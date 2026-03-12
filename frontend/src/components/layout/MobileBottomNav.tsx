import { Link, useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { MessageSquare, Library, History, ListTodo, Menu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useState } from 'react';
import MobileMenuSheet from './MobileMenuSheet';

const navItems = [
  { path: '/', labelKey: 'nav.chat', icon: MessageSquare },
  { path: '/knowledge-bases', labelKey: 'nav.knowledgeBases', icon: Library },
  { path: '/history', labelKey: 'nav.history', icon: History },
  { path: '/tasks', labelKey: 'nav.tasks', icon: ListTodo },
] as const;

export default function MobileBottomNav() {
  const location = useLocation();
  const { t } = useTranslation();
  const [menuOpen, setMenuOpen] = useState(false);

  return (
    <>
      <nav className="fixed inset-x-0 bottom-0 z-50 flex items-center justify-around border-t border-border bg-background pb-[env(safe-area-inset-bottom)]">
        {navItems.map((item) => {
          const isActive =
            item.path === '/'
              ? location.pathname === '/' || location.pathname.startsWith('/chat/')
              : location.pathname.startsWith(item.path);
          return (
            <Link
              key={item.path}
              to={item.path}
              className={cn(
                'flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] transition-colors',
                isActive
                  ? 'text-primary font-medium'
                  : 'text-muted-foreground',
              )}
            >
              <item.icon className="size-5" />
              <span>{t(item.labelKey)}</span>
            </Link>
          );
        })}
        <button
          onClick={() => setMenuOpen(true)}
          className="flex flex-col items-center gap-0.5 px-3 py-2 text-[10px] text-muted-foreground transition-colors"
        >
          <Menu className="size-5" />
          <span>{t('nav.more')}</span>
        </button>
      </nav>

      <MobileMenuSheet open={menuOpen} onOpenChange={setMenuOpen} />
    </>
  );
}
