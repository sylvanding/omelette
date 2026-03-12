import { memo, useState, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { ChevronDown } from "lucide-react";
import { staggerContainer, staggerItem } from "@/lib/motion";
import CitationCard from "./CitationCard";
import type { CitationColorIndex } from "./CitationCard";
import type { Citation } from "@/types/chat";

const INITIAL_DISPLAY_COUNT = 5;

interface CitationCardListProps {
  citations: Citation[];
  isStreaming?: boolean;
}

function CitationCardList({ citations, isStreaming }: CitationCardListProps) {
  const { t } = useTranslation();
  const [expandedIndices, setExpandedIndices] = useState<Set<number>>(new Set());
  const [showAll, setShowAll] = useState(false);

  const toggleExpand = useCallback((index: number) => {
    setExpandedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else {
        next.add(index);
      }
      return next;
    });
  }, []);

  const displayCitations = useMemo(
    () => (showAll ? citations : citations.slice(0, INITIAL_DISPLAY_COUNT)),
    [citations, showAll],
  );

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
          <motion.div key={c.index} variants={staggerItem}>
            <CitationCard
              citation={c}
              colorIndex={(c.index - 1) % 6 as CitationColorIndex}
              isExpanded={expandedIndices.has(c.index)}
              onToggle={() => toggleExpand(c.index)}
            />
          </motion.div>
        ))}
      </motion.div>

      {hasMore && !showAll && !isStreaming && (
        <button
          onClick={() => setShowAll(true)}
          className="mt-2 flex items-center gap-1 text-[11px] text-primary hover:underline"
        >
          <ChevronDown className="size-3" />
          {t("common.showMore", {
            defaultValue: `显示剩余 ${citations.length - INITIAL_DISPLAY_COUNT} 条引用`,
          })}
        </button>
      )}
    </div>
  );
}

export default memo(CitationCardList);
