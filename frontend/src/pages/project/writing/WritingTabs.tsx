import { useTranslation } from 'react-i18next';
import { FileText, Quote, List, BarChart3, BookOpen } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface WritingTabsProps {
  activeTab: string;
  onTabChange: (value: string) => void;
  children: React.ReactNode;
}

export function WritingTabs({ activeTab, onTabChange, children }: WritingTabsProps) {
  const { t } = useTranslation();

  return (
    <Tabs value={activeTab} onValueChange={onTabChange} className="w-full">
      <TabsList>
        <TabsTrigger value="summarize" className="gap-1.5">
          <FileText className="size-4" />
          {t('writing.tabs.summarize')}
        </TabsTrigger>
        <TabsTrigger value="cite" className="gap-1.5">
          <Quote className="size-4" />
          {t('writing.tabs.cite')}
        </TabsTrigger>
        <TabsTrigger value="outline" className="gap-1.5">
          <List className="size-4" />
          {t('writing.tabs.outline')}
        </TabsTrigger>
        <TabsTrigger value="gap" className="gap-1.5">
          <BarChart3 className="size-4" />
          {t('writing.tabs.gap')}
        </TabsTrigger>
        <TabsTrigger value="review" className="gap-1.5">
          <BookOpen className="size-4" />
          {t('writing.tabs.review', 'Review')}
        </TabsTrigger>
      </TabsList>

      {children}
    </Tabs>
  );
}
