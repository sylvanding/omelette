import { memo, useState, useCallback, useMemo, useEffect, useRef } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { staggerContainer, staggerItem } from "@/lib/motion";
import CitationCard from "./CitationCard";
import type { CitationColorIndex } from "./CitationCard";
import type { Citation } from "@/types/chat";

const INITIAL_DISPLAY_COUNT = 5;

interface CitationCardListProps {
  citations: Citation[];
  isStreaming?: boolean;
  highlightedIndex?: number | null;
}

function CitationCardList({
  citations,
  isStreaming,
  highlightedIndex,
}: CitationCardListProps) {
  const { t } = useTranslation();
  const [manualExpanded, setManualExpanded] = useState<Set<number>>(new Set());
  const [userShowAll, setUserShowAll] = useState(false);
  const prevHighlightRef = useRef<number | null>(null);

  const expandedIndices = useMemo(() => {
    const indices = new Set(manualExpanded);
    if (highlightedIndex != null) indices.add(highlightedIndex);
    return indices;
  }, [manualExpanded, highlightedIndex]);

  const highlightRequiresShowAll = highlightedIndex != null &&
    citations.length > INITIAL_DISPLAY_COUNT &&
    citations.findIndex((c) => c.index === highlightedIndex) >= INITIAL_DISPLAY_COUNT;

  const showAll = userShowAll || highlightRequiresShowAll;

  const displayCitations = useMemo(
    () => (showAll ? citations : citations.slice(0, INITIAL_DISPLAY_COUNT)),
    [citations, showAll],
  );

  useEffect(() => {
    if (highlightedIndex == null || highlightedIndex === prevHighlightRef.current) return;
    prevHighlightRef.current = highlightedIndex;

    requestAnimationFrame(() => {
      const el = document.querySelector(`[data-citation-index="${highlightedIndex}"]`);
      el?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
  }, [highlightedIndex]);


  const toggleExpand = useCallback((index: number) => {
    setManualExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const hasMore = citations.length > INITIAL_DISPLAY_COUNT;

  if (citations.length === 0) return null;

  return (
    <div className="mt-3 border-t border-border/30 pt-2">
      <p className="mb-2 text-xs font-medium opacity-70">
        {t("playground.citations")} ({citations.length})
      </p>
      <motion.div
        className="space-y-1.5"
        variants={staggerContainer}
        initial="hidden"
        animate="visible"
      >
        {displayCitations.map((c) => (
          <motion.div
            key={c.index}
            variants={staggerItem}
            data-citation-index={c.index}
            className={cn(
              highlightedIndex === c.index &&
                "animate-pulse ring-2 ring-primary/50 rounded-lg",
            )}
          >
            <CitationCard
              citation={c}
              colorIndex={((c.index - 1) % 6) as CitationColorIndex}
              isExpanded={expandedIndices.has(c.index)}
              onToggle={() => toggleExpand(c.index)}
            />
          </motion.div>
        ))}
      </motion.div>

      {hasMore && !showAll && !isStreaming && (
        <button
          onClick={() => setUserShowAll(true)}
          className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <ChevronDown className="size-3" />
          {t("common.showMore", {
            count: citations.length - INITIAL_DISPLAY_COUNT,
          })}
        </button>
      )}
    </div>
  );
}

export default memo(CitationCardList);
