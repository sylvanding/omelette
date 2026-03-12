/**
 * A2UI custom component: CitationCard
 *
 * Renders a citation card within A2UI surfaces. Uses data binding to
 * read citation data from the A2UI data model.
 */

import { memo } from "react";
import { useDataBinding } from "@a2ui-sdk/react/0.8";
import { ExternalLink } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { CITATION_COLORS } from "@/components/playground/CitationCard";
import type { ValueSource } from "@a2ui-sdk/types/0.8";

type A2UIComponentProps<T = unknown> = T & {
  surfaceId: string;
  componentId: string;
  weight?: number;
};

interface A2UICitationCardProps {
  title: ValueSource;
  excerpt: ValueSource;
  authors: ValueSource;
  year: ValueSource;
  doi: ValueSource;
  relevanceScore: ValueSource;
  index: ValueSource;
}

function A2UICitationCard({
  surfaceId,
  title,
  excerpt,
  authors,
  year,
  doi,
  relevanceScore,
  index,
}: A2UIComponentProps<A2UICitationCardProps>) {
  const titleText = useDataBinding<string>(surfaceId, title, "");
  const excerptText = useDataBinding<string>(surfaceId, excerpt, "");
  const authorsText = useDataBinding<string>(surfaceId, authors, "");
  const yearNum = useDataBinding<number>(surfaceId, year, 0);
  const doiText = useDataBinding<string>(surfaceId, doi, "");
  const score = useDataBinding<number>(surfaceId, relevanceScore, 0);
  const idx = useDataBinding<number>(surfaceId, index, 1);

  const color = CITATION_COLORS[(idx - 1) % CITATION_COLORS.length];
  const scoreLevel =
    score > 0.8 ? "high" : score > 0.5 ? "medium" : "low";

  const levelStyles = {
    high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    low: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
  };

  return (
    <div
      className="rounded-lg border border-border/50 bg-card p-3 space-y-2"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <div className="flex items-center gap-2">
        <Badge
          variant="outline"
          className="shrink-0 font-mono text-[10px] px-1.5"
          style={{ color, borderColor: color }}
        >
          {idx}
        </Badge>
        <span className="text-xs font-medium flex-1 line-clamp-1">
          {titleText}
        </span>
        <Badge
          variant="secondary"
          className={`text-[10px] px-1.5 ${levelStyles[scoreLevel]}`}
        >
          {Math.round(score * 100)}%
        </Badge>
      </div>

      {excerptText && (
        <p className="text-[11px] leading-relaxed text-muted-foreground line-clamp-3">
          {excerptText}
        </p>
      )}

      <div className="flex flex-wrap gap-x-3 text-[10px] text-muted-foreground">
        {authorsText && <span>{authorsText}</span>}
        {yearNum > 0 && <span>{yearNum}</span>}
        {doiText && (
          <a
            href={`https://doi.org/${doiText}`}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-0.5 text-primary hover:underline"
          >
            DOI <ExternalLink className="size-2" />
          </a>
        )}
      </div>
    </div>
  );
}

export default memo(A2UICitationCard);
