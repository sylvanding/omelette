/**
 * A2UI custom component: StatsDashboard
 *
 * Displays a grid of statistics cards for knowledge base overview,
 * triggered by queries like "分析知识库概况".
 */

import { memo } from "react";
import {
  useDataBinding,
  type A2UIComponentProps,
} from "@a2ui-sdk/react/0.8";
import { FileText, Users, Calendar, TrendingUp } from "lucide-react";
import type { ValueSource } from "@a2ui-sdk/types/0.8";

interface StatItem {
  label: string;
  value: string | number;
  icon?: string;
  trend?: string;
}

interface A2UIStatsDashboardProps {
  title: ValueSource;
  stats: ValueSource;
}

const ICON_MAP: Record<string, React.ElementType> = {
  papers: FileText,
  authors: Users,
  years: Calendar,
  trending: TrendingUp,
  default: TrendingUp,
};

function A2UIStatsDashboard({
  surfaceId,
  title,
  stats,
}: A2UIComponentProps<A2UIStatsDashboardProps>) {
  const titleText = useDataBinding<string>(surfaceId, title, "");
  const statsData = useDataBinding<StatItem[]>(surfaceId, stats, []);

  if (!statsData || statsData.length === 0) return null;

  return (
    <div className="rounded-lg border border-border/50 bg-card p-3 space-y-2.5">
      {titleText && (
        <p className="text-xs font-medium">{titleText}</p>
      )}

      <div className="grid grid-cols-2 gap-2">
        {statsData.map((stat, i) => {
          const Icon = ICON_MAP[stat.icon ?? "default"] ?? TrendingUp;
          return (
            <div
              key={i}
              className="flex items-center gap-2.5 rounded-md bg-muted/40 px-3 py-2"
            >
              <div className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                <Icon className="size-3.5" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-semibold tabular-nums">
                  {stat.value}
                </p>
                <p className="text-[10px] text-muted-foreground truncate">
                  {stat.label}
                </p>
              </div>
              {stat.trend && (
                <span className="ml-auto text-[10px] text-emerald-500 font-medium">
                  {stat.trend}
                </span>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default memo(A2UIStatsDashboard);
