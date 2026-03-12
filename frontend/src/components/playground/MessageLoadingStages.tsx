import { memo } from "react";
import { useTranslation } from "react-i18next";
import { motion, AnimatePresence } from "framer-motion";
import { Search, BookOpen, Sparkles } from "lucide-react";
import { fadeIn } from "@/lib/motion";

export type LoadingStage = "searching" | "citations" | "generating" | "complete";

interface MessageLoadingStagesProps {
  stage: LoadingStage;
  citationCount?: number;
}

const STAGE_CONFIG = {
  searching: {
    icon: Search,
    labelKey: "playground.loading.searching",
    color: "text-blue-500",
    pulse: true,
  },
  citations: {
    icon: BookOpen,
    labelKey: "playground.loading.citations",
    color: "text-emerald-500",
    pulse: true,
  },
  generating: {
    icon: Sparkles,
    labelKey: "playground.loading.generating",
    color: "text-primary",
    pulse: false,
  },
  complete: {
    icon: Sparkles,
    labelKey: "",
    color: "text-primary",
    pulse: false,
  },
} as const;

function MessageLoadingStages({ stage, citationCount }: MessageLoadingStagesProps) {
  const { t } = useTranslation();

  if (stage === "complete") return null;

  const config = STAGE_CONFIG[stage];
  const Icon = config.icon;

  const label = stage === "citations" && citationCount
    ? `${t(config.labelKey)} (${citationCount})`
    : t(config.labelKey);

  return (
    <AnimatePresence mode="wait">
      <motion.div
        key={stage}
        variants={fadeIn}
        initial="hidden"
        animate="visible"
        exit="hidden"
        className="flex items-center gap-2 py-1"
      >
        <div className={config.pulse ? "animate-pulse" : ""}>
          <Icon className={`size-3.5 ${config.color}`} />
        </div>
        <span className="text-xs text-muted-foreground">{label}</span>
      </motion.div>
    </AnimatePresence>
  );
}

export default memo(MessageLoadingStages);
