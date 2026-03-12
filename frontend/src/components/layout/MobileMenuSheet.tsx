import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Settings, Sun, Moon, Monitor, Languages } from 'lucide-react';
import { useTheme } from '@/hooks/use-theme';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';

const themeIcons = { light: Sun, dark: Moon, system: Monitor } as const;
const themeOrder: Array<'light' | 'dark' | 'system'> = ['light', 'dark', 'system'];

interface MobileMenuSheetProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export default function MobileMenuSheet({ open, onOpenChange }: MobileMenuSheetProps) {
  const { theme, setTheme } = useTheme();
  const { t, i18n } = useTranslation();
  const ThemeIcon = themeIcons[theme];

  const cycleTheme = () => {
    const idx = themeOrder.indexOf(theme);
    setTheme(themeOrder[(idx + 1) % themeOrder.length]);
  };

  const toggleLang = () => {
    const next = i18n.language?.startsWith('zh') ? 'en' : 'zh';
    i18n.changeLanguage(next);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="rounded-t-2xl">
        <SheetHeader>
          <SheetTitle>{t('nav.more')}</SheetTitle>
        </SheetHeader>
        <div className="space-y-1 py-4">
          <Link
            to="/settings"
            onClick={() => onOpenChange(false)}
            className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent"
          >
            <Settings className="size-5 text-muted-foreground" />
            {t('nav.settings')}
          </Link>
          <button
            onClick={cycleTheme}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent"
          >
            <ThemeIcon className="size-5 text-muted-foreground" />
            {t(`theme.${theme}`)}
          </button>
          <button
            onClick={toggleLang}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors hover:bg-accent"
          >
            <Languages className="size-5 text-muted-foreground" />
            {t('lang.switchTo')}
          </button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
