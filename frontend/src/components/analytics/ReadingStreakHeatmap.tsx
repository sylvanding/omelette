import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Flame } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';

interface ActivityDay {
  date: string; // ISO date string 'YYYY-MM-DD'
  count: number;
}

interface PaperSummary {
  id: number;
  title: string;
  read_at: string | null;
}

interface ReadingStreakHeatmapProps {
  activityDays: ActivityDay[];
  streakDays: number;
  papersByDate: Record<string, PaperSummary[]>;
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

function parseDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function getDayOfWeek(dateStr: string): number {
  return parseDate(dateStr).getDay(); // 0=Sun .. 6=Sat
}

function formatDate(dateStr: string, locale: string): string {
  return parseDate(dateStr).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatFullDate(dateStr: string, locale: string): string {
  return parseDate(dateStr).toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

function formatTime(isoString: string): string {
  return new Date(isoString).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const INTENSITY_CLASSES: Record<number, string> = {
  0: 'fill-zinc-200 dark:fill-zinc-800',
  1: 'fill-green-200 dark:fill-green-900',
  2: 'fill-green-400 dark:fill-green-800',
  3: 'fill-green-600 dark:fill-green-700',
  4: 'fill-green-800 dark:fill-green-500',
};

function getIntensity(count: number, maxCount: number): number {
  if (count === 0) return 0;
  const ratio = maxCount > 0 ? count / maxCount : 0;
  if (ratio <= 0.25) return 1;
  if (ratio <= 0.5) return 2;
  if (ratio <= 0.75) return 3;
  return 4;
}

export function ReadingStreakHeatmap({
  activityDays,
  streakDays,
  papersByDate,
}: ReadingStreakHeatmapProps) {
  const { t, i18n } = useTranslation();
  const locale = i18n.language;
  const [tooltip, setTooltip] = useState<{
    x: number;
    y: number;
    date: string;
    count: number;
  } | null>(null);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const cellSize = 13;
  const cellGap = 3;
  const rowHeight = cellSize + cellGap;

  // Organize into weeks (columns)
  // Each week is an array of 7 (one per day of week, Sun=0..Sat=6)
  const weeks: (ActivityDay | null)[][] = [];
  let currentWeek: (ActivityDay | null)[] = Array(7).fill(null);

  for (const day of activityDays) {
    const dow = getDayOfWeek(day.date);
    currentWeek[dow] = day;

    // When we hit Saturday or it's the last day, finalize the week
    if (dow === 6 || day === activityDays[activityDays.length - 1]) {
      weeks.push([...currentWeek]);
      if (day !== activityDays[activityDays.length - 1]) {
        currentWeek = Array(7).fill(null);
      }
    }
  }
  // Handle trailing partial week
  if (currentWeek.some(Boolean)) {
    weeks.push([...currentWeek]);
  }

  const maxCount = Math.max(...activityDays.map((d) => d.count), 1);

  const svgWidth = weeks.length * (cellSize + cellGap) + 28;
  const svgHeight = 7 * rowHeight;

  const selectedPapers = selectedDate ? (papersByDate[selectedDate] ?? []) : [];

  return (
    <div className="space-y-4">
      {/* Streak counter */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-2 shadow-sm">
          <Flame className="size-5 text-orange-500" />
          <span className="text-lg font-bold">{streakDays}</span>
          <span className="text-sm text-muted-foreground">
            {t('analytics.streakDays', 'day streak')}
          </span>
        </div>
      </div>

      {/* Heatmap SVG */}
      <div className="overflow-x-auto">
        <svg
          width={svgWidth}
          height={svgHeight + 18}
          className="select-none"
          role="img"
          aria-label={t('analytics.readingHeatmap', 'Reading activity heatmap')}
        >
          {/* Day-of-week labels */}
          {DAY_LABELS.map((label, row) => (
            <text
              key={label}
              x={0}
              y={row * rowHeight + cellSize + 2}
              fontSize={9}
              fill="currentColor"
            >
              {label}
            </text>
          ))}

          {/* Month labels */}
          {(() => {
            let lastMonth = -1;
            return weeks.map((week, colIdx) => {
              const firstActive = week.find(Boolean);
              if (!firstActive) return null;
              const month = parseDate(firstActive.date).getMonth();
              if (month === lastMonth) return null;
              lastMonth = month;
              const d = parseDate(firstActive.date);
              const monthName = d.toLocaleDateString(locale === 'zh' ? 'zh-CN' : 'en-US', {
                month: 'short',
              });
              return (
                <text
                  key={colIdx}
                  x={28 + colIdx * (cellSize + cellGap)}
                  y={-6}
                  fontSize={9}
                  fill="currentColor"
                >
                  {monthName}
                </text>
              );
            });
          })()}

          {/* Cells */}
          {weeks.map((week, colIdx) =>
            week.map((day, row) => {
              if (!day) return null;
              const x = 28 + colIdx * (cellSize + cellGap);
              const y = row * rowHeight;
              const intensity = getIntensity(day.count, maxCount);

              return (
                <rect
                  key={day.date}
                  x={x}
                  y={y}
                  width={cellSize}
                  height={cellSize}
                  rx={2}
                  className={`${INTENSITY_CLASSES[intensity]} cursor-pointer transition-opacity hover:opacity-80`}
                  onClick={() => day.count > 0 && setSelectedDate(day.date)}
                  onMouseEnter={(e) => {
                    const rect = (e.target as SVGRectElement).getBoundingClientRect();
                    setTooltip({
                      x: rect.left + rect.width / 2,
                      y: rect.top,
                      date: formatDate(day.date, locale),
                      count: day.count,
                    });
                  }}
                  onMouseLeave={() => setTooltip(null)}
                />
              );
            }),
          )}
        </svg>

        {/* Legend */}
        <div className="mt-2 flex items-center gap-1 text-xs text-muted-foreground">
          <span>{t('analytics.less', 'Less')}</span>
          {[0, 1, 2, 3, 4].map((level) => (
            <svg key={level} width={cellSize} height={cellSize}>
              <rect
                width={cellSize}
                height={cellSize}
                rx={2}
                className={INTENSITY_CLASSES[level]}
              />
            </svg>
          ))}
          <span>{t('analytics.more', 'More')}</span>
        </div>
      </div>

      {/* Tooltip */}
      {tooltip && (
        <div
          className="pointer-events-none fixed z-50 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{
            left: tooltip.x,
            top: tooltip.y - 30,
            transform: 'translateX(-50%)',
          }}
        >
          <div className="font-medium">{tooltip.date}</div>
          <div className="text-muted-foreground">
            {tooltip.count === 0
              ? t('analytics.noActivity', 'No papers read')
              : t('analytics.papersReadCount', '{{count}} paper(s) read', {
                  count: tooltip.count,
                })}
          </div>
        </div>
      )}

      {/* Day detail dialog */}
      <Dialog open={!!selectedDate} onOpenChange={(open) => !open && setSelectedDate(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selectedDate ? formatFullDate(selectedDate, locale) : ''}
            </DialogTitle>
          </DialogHeader>
          {selectedPapers.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {t('analytics.noPapersThisDay', 'No papers were read on this day')}
            </p>
          ) : (
            <ul className="space-y-2">
              {selectedPapers.map((paper) => (
                <li
                  key={paper.id}
                  className="rounded-lg bg-muted/30 px-3 py-2 text-sm"
                >
                  <span className="font-medium">{paper.title}</span>
                  {paper.read_at && (
                    <Badge variant="secondary" className="ml-2 text-xs">
                      {formatTime(paper.read_at)}
                    </Badge>
                  )}
                </li>
              ))}
            </ul>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
