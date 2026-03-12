import { memo, useState } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import {
  BookOpen,
  GraduationCap,
  Languages,
  Pen,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { RewriteStyle } from "@/services/rewrite-api";

interface RewriteStyleSelectorProps {
  onSelect: (style: RewriteStyle, customPrompt?: string) => void;
  onCancel: () => void;
  disabled?: boolean;
}

const PRESET_STYLES = [
  {
    id: "simplify" as const,
    icon: BookOpen,
    labelKey: "rewrite.simplify",
    defaultLabel: "简化表述",
    descKey: "rewrite.simplifyDesc",
    defaultDesc: "将学术语言简化为通俗易懂的表述",
    color: "text-blue-500",
    bg: "bg-blue-500/10",
  },
  {
    id: "academic" as const,
    icon: GraduationCap,
    labelKey: "rewrite.academic",
    defaultLabel: "学术改写",
    descKey: "rewrite.academicDesc",
    defaultDesc: "改写为符合学术规范的正式表述",
    color: "text-purple-500",
    bg: "bg-purple-500/10",
  },
  {
    id: "translate_en" as const,
    icon: Languages,
    labelKey: "rewrite.translateEn",
    defaultLabel: "翻译为英文",
    descKey: "rewrite.translateEnDesc",
    defaultDesc: "翻译为英文，保留学术术语",
    color: "text-emerald-500",
    bg: "bg-emerald-500/10",
  },
  {
    id: "translate_zh" as const,
    icon: Languages,
    labelKey: "rewrite.translateZh",
    defaultLabel: "翻译为中文",
    descKey: "rewrite.translateZhDesc",
    defaultDesc: "翻译为中文，保留学术术语",
    color: "text-amber-500",
    bg: "bg-amber-500/10",
  },
] as const;

function RewriteStyleSelector({
  onSelect,
  onCancel,
  disabled,
}: RewriteStyleSelectorProps) {
  const { t } = useTranslation();
  const [showCustom, setShowCustom] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  const handleCustomSubmit = () => {
    if (customPrompt.trim()) {
      onSelect("custom", customPrompt.trim());
    }
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-1.5">
        {PRESET_STYLES.map((style) => (
          <motion.button
            key={style.id}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={() => onSelect(style.id)}
            disabled={disabled}
            className={cn(
              "flex items-center gap-2 rounded-lg border border-border/50 px-2.5 py-2 text-left",
              "transition-colors hover:border-primary/30 hover:bg-accent/50",
              "disabled:opacity-50 disabled:pointer-events-none",
            )}
          >
            <div
              className={cn(
                "flex size-6 shrink-0 items-center justify-center rounded-md",
                style.bg,
              )}
            >
              <style.icon className={cn("size-3.5", style.color)} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium truncate">
                {t(style.labelKey)}
              </p>
              <p className="text-[10px] text-muted-foreground truncate">
                {t(style.descKey)}
              </p>
            </div>
          </motion.button>
        ))}
      </div>

      {showCustom ? (
        <div className="flex gap-1.5">
          <Input
            value={customPrompt}
            onChange={(e) => setCustomPrompt(e.target.value)}
            placeholder={t("rewrite.customPlaceholder")}
            className="h-8 text-xs"
            onKeyDown={(e) => e.key === "Enter" && handleCustomSubmit()}
            disabled={disabled}
            autoFocus
          />
          <Button
            size="sm"
            className="h-8 px-2"
            onClick={handleCustomSubmit}
            disabled={disabled || !customPrompt.trim()}
          >
            <ChevronRight className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowCustom(true)}
            disabled={disabled}
            className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            <Pen className="size-3" />
            {t("rewrite.custom")}
          </button>
          <button
            onClick={onCancel}
            className="ml-auto text-[11px] text-muted-foreground hover:text-foreground transition-colors"
          >
            {t("common.cancel")}
          </button>
        </div>
      )}
    </div>
  );
}

export default memo(RewriteStyleSelector);
