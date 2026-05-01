import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, Loader2, Headphones, Settings2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { audioOverviewsApi, type AudioOverviewResponse } from '@/services/api';
import { useToastMutation } from '@/hooks/use-toast-mutation';
import { AudioPlayer } from './AudioPlayer';

interface AudioOverviewDialogProps {
  projectId: number;
  paperIds: number[];
  paperTitles: string[];
  onClose: () => void;
  onGenerated?: () => void;
}

export function AudioOverviewDialog({ projectId, paperIds, paperTitles, onClose, onGenerated }: AudioOverviewDialogProps) {
  const { t } = useTranslation();
  const [tone, setTone] = useState<'formal' | 'conversational'>('conversational');
  const [focusInput, setFocusInput] = useState('');
  const [focusAreas, setFocusAreas] = useState<string[]>([]);

  const generate = useToastMutation<AudioOverviewResponse, void>({
    mutationFn: () =>
      audioOverviewsApi.generate(projectId, {
        paper_ids: paperIds,
        tone,
        focus_areas: focusAreas.length > 0 ? focusAreas : undefined,
      }),
    successMessage: 'Audio overview generated',
    errorMessage: 'Failed to generate audio overview',
    onSettled: () => {
      onGenerated?.();
    },
  });

  const handleGenerate = () => {
    generate.mutate();
  };

  const addFocusArea = () => {
    const trimmed = focusInput.trim();
    if (trimmed && !focusAreas.includes(trimmed)) {
      setFocusAreas((prev) => [...prev, trimmed]);
      setFocusInput('');
    }
  };

  const removeFocusArea = (area: string) => {
    setFocusAreas((prev) => prev.filter((a) => a !== area));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="relative flex h-[90vh] w-[95vw] max-w-4xl flex-col rounded-xl border bg-background shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between border-b px-6 py-4">
          <div className="flex items-center gap-2">
            <Headphones className="size-5 text-primary" />
            <h2 className="text-lg font-semibold">{t('audioOverview.title', 'Audio Overview')}</h2>
          </div>
          <Button size="icon" variant="ghost" onClick={onClose} aria-label="Close">
            <X className="size-4" />
          </Button>
        </div>

        {/* Controls */}
        {!generate.data && (
          <div className="space-y-4 border-b px-6 py-4">
            {/* Selected papers */}
            <div>
              <p className="mb-1 text-sm font-medium">{t('audioOverview.selectedPapers', 'Selected Papers')}</p>
              <div className="flex flex-wrap gap-1">
                {paperTitles.slice(0, 5).map((title, i) => (
                  <Badge key={i} variant="secondary" className="max-w-[200px] truncate">
                    {title}
                  </Badge>
                ))}
                {paperTitles.length > 5 && (
                  <Badge variant="secondary">+{paperTitles.length - 5} more</Badge>
                )}
              </div>
            </div>

            {/* Tone selector */}
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2">
                <Settings2 className="size-4 text-muted-foreground" />
                <span className="text-sm font-medium">{t('audioOverview.tone', 'Tone')}</span>
              </div>
              <Select value={tone} onValueChange={(v) => setTone(v as 'formal' | 'conversational')}>
                <SelectTrigger className="w-[160px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="conversational">{t('audioOverview.conversational', 'Conversational')}</SelectItem>
                  <SelectItem value="formal">{t('audioOverview.formal', 'Formal')}</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Focus areas */}
            <div className="flex items-center gap-2">
              <Input
                placeholder={t('audioOverview.focusPlaceholder', 'Add focus areas (e.g., methodology, results)')}
                value={focusInput}
                onChange={(e) => setFocusInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addFocusArea();
                  }
                }}
                className="max-w-xs"
              />
              <Button variant="outline" size="sm" onClick={addFocusArea}>
                Add
              </Button>
              {focusAreas.map((area) => (
                <Badge key={area} variant="outline" className="cursor-pointer" onClick={() => removeFocusArea(area)}>
                  {area} ×
                </Badge>
              ))}
            </div>

            {/* Generate button */}
            <Button
              onClick={handleGenerate}
              disabled={generate.isPending}
              className="w-full"
            >
              {generate.isPending ? (
                <>
                  <Loader2 className="mr-2 size-4 animate-spin" />
                  {t('audioOverview.generating', 'Generating audio overview...')}
                </>
              ) : (
                <>
                  <Headphones className="mr-2 size-4" />
                  {t('audioOverview.generate', 'Generate Audio Overview')}
                </>
              )}
            </Button>

          </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-4">
          {generate.isPending && !generate.data && (
            <div className="flex flex-col items-center justify-center py-12">
              <Loader2 className="mb-4 size-8 animate-spin text-primary" />
              <p className="text-muted-foreground">{t('audioOverview.generating', 'Generating audio overview...')}</p>
            </div>
          )}

          {generate.data && (
            <AudioPlayer
              script={generate.data.script}
              summary={generate.data.summary}
            />
          )}
        </div>
      </div>
    </div>
  );
}
