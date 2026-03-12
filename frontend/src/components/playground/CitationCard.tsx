import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import ReactMarkdown from "react-markdown";
import { ChevronDown, ExternalLink, Copy } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { cn } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { Citation } from "@/types/chat";

const RELEVANCE_STYLES = {
  high: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
  medium: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
  low: "bg-zinc-100 text-zinc-500 dark:bg-zinc-800 dark:text-zinc-400",
} as const;

const EXCERPT_PREVIEW_LENGTH = 300;
const EXCERPT_MAX_DISPLAY = 500;

export const CITATION_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#EF4444",
  "#8B5CF6",
  "#06B6D4",
] as const;

export type CitationColorIndex = 0 | 1 | 2 | 3 | 4 | 5;

function getRelevanceLevel(score: number) {
  if (score > 0.8) return "high";
  if (score > 0.5) return "medium";
  return "low";
}

function formatAuthors(authors: string[] | string | null | undefined): string {
  if (!authors) return "";
  if (typeof authors === "string") return authors;
  if (authors.length <= 2) return authors.join(", ");
  return `${authors[0]} et al.`;
}

interface CitationCardProps {
  citation: Citation;
  colorIndex: CitationColorIndex;
  isExpanded: boolean;
  onToggle: () => void;
}

function CitationCard({
  citation,
  colorIndex,
  isExpanded,
  onToggle,
}: CitationCardProps) {
  const { t } = useTranslation();
  const [showFullExcerpt, setShowFullExcerpt] = useState(false);
  const level = getRelevanceLevel(citation.relevance_score);
  const color = CITATION_COLORS[colorIndex];
  const authors = formatAuthors(citation.authors);
  const needsTruncation = citation.excerpt.length > EXCERPT_MAX_DISPLAY;
  const displayExcerpt =
    needsTruncation && !showFullExcerpt
      ? citation.excerpt.slice(0, EXCERPT_PREVIEW_LENGTH) + "..."
      : citation.excerpt;

  const handleCopyExcerpt = () => {
    navigator.clipboard.writeText(citation.excerpt);
  };

  return (
    <div
      className="rounded-lg border border-border/50 bg-card transition-colors hover:border-border"
      style={{ borderLeftColor: color, borderLeftWidth: 3 }}
    >
      <button
        onClick={onToggle}
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        aria-expanded={isExpanded}
      >
        <Badge
          variant="outline"
          className="shrink-0 font-mono text-[10px] px-1.5"
          style={{ color, borderColor: color }}
        >
          {citation.index}
        </Badge>

        <span className="min-w-0 flex-1 truncate text-xs font-medium">
          {citation.paper_title}
        </span>

        {citation.page_number > 0 && (
          <span className="shrink-0 text-[10px] text-muted-foreground">
            p.{citation.page_number}
          </span>
        )}

        <Badge
          variant="secondary"
          className={cn("shrink-0 text-[10px] px-1.5", RELEVANCE_STYLES[level])}
        >
          {Math.round(citation.relevance_score * 100)}%
        </Badge>

        <ChevronDown
          className={cn(
            "size-3.5 shrink-0 text-muted-foreground transition-transform duration-200",
            isExpanded && "rotate-180",
          )}
        />
      </button>

      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: "easeInOut" }}
            className="overflow-hidden"
          >
            <div className="border-t border-border/30 px-3 py-2.5 space-y-2">
              {citation.excerpt && (
                <div className="rounded-md bg-muted/50 px-3 py-2">
                  <div className="prose prose-xs dark:prose-invert max-w-none text-xs leading-relaxed opacity-90">
                    <ReactMarkdown>{displayExcerpt}</ReactMarkdown>
                  </div>
                  <div className="mt-1.5 flex items-center gap-2">
                    {needsTruncation && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          setShowFullExcerpt(!showFullExcerpt);
                        }}
                        className="text-[10px] text-primary hover:underline"
                      >
                        {showFullExcerpt
                          ? t("common.collapse", { defaultValue: "收起" })
                          : t("common.expandAll", { defaultValue: "展开全文" })}
                      </button>
                    )}
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-5 px-1.5 text-[10px] text-muted-foreground"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyExcerpt();
                      }}
                    >
                      <Copy className="mr-0.5 size-2.5" />
                      {t("common.copy", { defaultValue: "复制" })}
                    </Button>
                  </div>
                </div>
              )}

              <div className="flex flex-wrap gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
                {authors && <span>{authors}</span>}
                {citation.year && <span>{citation.year}</span>}
                {citation.doi && (
                  <a
                    href={`https://doi.org/${citation.doi}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={(e) => e.stopPropagation()}
                    className="inline-flex items-center gap-0.5 text-primary hover:underline"
                  >
                    DOI
                    <ExternalLink className="size-2" />
                  </a>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export default memo(CitationCard);
