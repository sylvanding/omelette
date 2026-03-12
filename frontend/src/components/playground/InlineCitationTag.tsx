import { memo, useCallback } from "react";
import * as HoverCard from "@radix-ui/react-hover-card";
import { cn } from "@/lib/utils";
import { CITATION_COLORS } from "./CitationCard";
import type { Citation } from "@/types/chat";

const EXCERPT_PREVIEW_LENGTH = 150;

interface InlineCitationTagProps {
  citationIndex: number;
  citation?: Citation;
  onClickCitation?: (index: number) => void;
}

function InlineCitationTag({
  citationIndex,
  citation,
  onClickCitation,
}: InlineCitationTagProps) {
  const isActive = !!citation;
  const color = isActive
    ? CITATION_COLORS[(citationIndex - 1) % CITATION_COLORS.length]
    : undefined;

  const handleClick = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      if (isActive && onClickCitation) {
        onClickCitation(citationIndex);
      }
    },
    [citationIndex, isActive, onClickCitation],
  );

  if (!isActive) {
    return (
      <span className="text-muted-foreground text-xs font-mono">
        [{citationIndex}]
      </span>
    );
  }

  const excerptPreview = citation.excerpt.length > EXCERPT_PREVIEW_LENGTH
    ? citation.excerpt.slice(0, EXCERPT_PREVIEW_LENGTH) + "…"
    : citation.excerpt;

  return (
    <HoverCard.Root openDelay={200} closeDelay={100}>
      <HoverCard.Trigger asChild>
        <button
          onClick={handleClick}
          className={cn(
            "inline-flex items-center rounded px-1 py-0.5 text-[11px] font-semibold",
            "cursor-pointer transition-all duration-150",
            "hover:scale-110 hover:shadow-sm",
            "focus:outline-none focus:ring-1 focus:ring-offset-1",
          )}
          style={{
            color,
            backgroundColor: color ? `${color}18` : undefined,
            borderBottom: `1.5px solid ${color}`,
          }}
          aria-label={`Citation ${citationIndex}: ${citation.paper_title}`}
        >
          {citationIndex}
        </button>
      </HoverCard.Trigger>

      <HoverCard.Portal>
        <HoverCard.Content
          sideOffset={6}
          align="center"
          className={cn(
            "z-50 w-72 rounded-lg border bg-popover p-3 shadow-lg",
            "animate-in fade-in-0 zoom-in-95 data-[side=bottom]:slide-in-from-top-2",
            "data-[side=top]:slide-in-from-bottom-2",
          )}
        >
          <div className="space-y-1.5">
            <p className="text-xs font-medium leading-snug line-clamp-2">
              {citation.paper_title}
            </p>

            <div className="flex flex-wrap gap-x-2 text-[10px] text-muted-foreground">
              {citation.authors && (
                <span className="truncate max-w-[180px]">
                  {typeof citation.authors === "string"
                    ? citation.authors
                    : citation.authors.slice(0, 2).join(", ")}
                </span>
              )}
              {citation.year && <span>{citation.year}</span>}
              {citation.page_number > 0 && <span>p.{citation.page_number}</span>}
            </div>

            {excerptPreview && (
              <p className="text-[11px] leading-relaxed text-muted-foreground/80 line-clamp-4">
                {excerptPreview}
              </p>
            )}

            <div className="flex items-center justify-between pt-0.5">
              <span
                className="text-[10px] font-medium"
                style={{ color }}
              >
                {Math.round(citation.relevance_score * 100)}% 相关
              </span>
              <span className="text-[10px] text-muted-foreground">
                点击查看详情
              </span>
            </div>
          </div>

          <HoverCard.Arrow className="fill-popover" />
        </HoverCard.Content>
      </HoverCard.Portal>
    </HoverCard.Root>
  );
}

export default memo(InlineCitationTag);
