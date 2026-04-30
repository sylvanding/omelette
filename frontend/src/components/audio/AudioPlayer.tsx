import { useState, useRef, useCallback, useEffect } from 'react';
import { Play, Pause, SkipBack, SkipForward, Volume2, VolumeX, FastForward } from 'lucide-react';
import type { DialogueEntry } from '@/services/api';
import { cn } from '@/lib/utils';

interface AudioPlayerProps {
  script: DialogueEntry[];
  summary: string;
}

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2] as const;

export function AudioPlayer({ script, summary }: AudioPlayerProps) {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [speed, setSpeed] = useState<number>(1);
  const [isMuted, setIsMuted] = useState(false);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const estimateDuration = useCallback(() => {
    const totalWords = script.reduce((sum, e) => sum + e.text.split(' ').length, 0);
    return Math.round(totalWords / (150 * speed));
  }, [script, speed]);

  const elapsed = (() => {
    const wordsSoFar = script.slice(0, currentIndex).reduce((sum, e) => sum + e.text.split(' ').length, 0);
    return Math.round(wordsSoFar / (150 * speed));
  })();

  const progress = script.length > 0 ? (currentIndex / script.length) * 100 : 0;

  const clearTimer = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
  }, []);

  const advanceLine = useCallback(() => {
    setCurrentIndex((prev) => {
      if (prev >= script.length - 1) {
        setIsPlaying(false);
        return 0;
      }
      return prev + 1;
    });
  }, [script.length]);

  const startPlaying = useCallback(() => {
    if (currentIndex >= script.length - 1) {
      setCurrentIndex(0);
    }
    setIsPlaying(true);
  }, [currentIndex, script.length]);

  const stopPlaying = useCallback(() => {
    setIsPlaying(false);
    clearTimer();
  }, [clearTimer]);

  useEffect(() => {
    if (isPlaying) {
      const ms = Math.max(400, 2000 / speed);
      clearTimer();
      intervalRef.current = setInterval(advanceLine, ms);
    } else {
      clearTimer();
    }
    return clearTimer;
  }, [isPlaying, speed, advanceLine, clearTimer]);

  const togglePlay = () => {
    if (isPlaying) {
      stopPlaying();
    } else {
      startPlaying();
    }
  };

  const cycleSpeed = () => {
    const idx = SPEEDS.indexOf(speed as (typeof SPEEDS)[number]);
    setSpeed(SPEEDS[(idx + 1) % SPEEDS.length]);
  };

  const skipBack = () => setCurrentIndex((p) => Math.max(0, p - 1));
  const skipForward = () => setCurrentIndex((p) => Math.min(script.length - 1, p + 1));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <p className="text-sm text-muted-foreground">{summary}</p>

      {/* Progress bar */}
      <div className="w-full">
        <div className="h-1.5 w-full overflow-hidden rounded-full bg-secondary">
          <div
            className="h-full bg-primary transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-1 flex justify-between text-xs text-muted-foreground">
          <span>{formatTime(elapsed)}</span>
          <span>{formatTime(estimateDuration())}</span>
        </div>
      </div>

      {/* Controls */}
      <div className="flex items-center justify-center gap-3">
        <button
          onClick={skipBack}
          disabled={currentIndex === 0}
          className="rounded-full p-2 hover:bg-secondary disabled:opacity-30"
          aria-label="Previous line"
        >
          <SkipBack className="size-4" />
        </button>

        <button
          onClick={togglePlay}
          className="flex size-12 items-center justify-center rounded-full bg-primary text-primary-foreground hover:bg-primary/90"
          aria-label={isPlaying ? 'Pause' : 'Play'}
        >
          {isPlaying ? <Pause className="size-5" /> : <Play className="size-5 ml-0.5" />}
        </button>

        <button
          onClick={skipForward}
          disabled={currentIndex >= script.length - 1}
          className="rounded-full p-2 hover:bg-secondary disabled:opacity-30"
          aria-label="Next line"
        >
          <SkipForward className="size-4" />
        </button>

        <button
          onClick={cycleSpeed}
          className="ml-2 flex items-center gap-1 rounded-md px-2 py-1 text-xs hover:bg-secondary"
          aria-label={`Speed: ${speed}x`}
        >
          <FastForward className="size-3" />
          {speed}x
        </button>

        <button
          onClick={() => setIsMuted(!isMuted)}
          className="rounded-full p-2 hover:bg-secondary"
          aria-label={isMuted ? 'Unmute' : 'Mute'}
        >
          {isMuted ? <VolumeX className="size-4" /> : <Volume2 className="size-4" />}
        </button>
      </div>

      {/* Script */}
      <div className="max-h-[40vh] space-y-2 overflow-y-auto rounded-lg border bg-card p-4">
        {script.map((entry, i) => (
          <div
            key={i}
            className={cn(
              'rounded-md px-3 py-2 transition-colors',
              i === currentIndex && isPlaying
                ? 'bg-primary/10 ring-1 ring-primary/20'
                : '',
            )}
          >
            <span
              className={cn(
                'text-xs font-semibold',
                entry.speaker === 'Alex' ? 'text-blue-600 dark:text-blue-400' : 'text-emerald-600 dark:text-emerald-400',
              )}
            >
              {entry.speaker}
            </span>
            <p className="mt-0.5 text-sm leading-relaxed">{entry.text}</p>
          </div>
        ))}
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}
