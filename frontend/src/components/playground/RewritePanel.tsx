import { memo, useState, useRef, useCallback, useEffect } from "react";
import { useTranslation } from "react-i18next";
import { motion } from "framer-motion";
import { X, Copy, Check, RotateCcw, Loader2 } from "lucide-react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { streamRewrite } from "@/services/rewrite-api";
import RewriteStyleSelector from "./RewriteStyleSelector";
import type { RewriteStyle } from "@/services/rewrite-api";

interface RewritePanelProps {
  originalText: string;
  paperTitle: string;
  onClose: () => void;
}

type RewriteState = "idle" | "selecting" | "streaming" | "done" | "error";

function RewritePanel({ originalText, paperTitle, onClose }: RewritePanelProps) {
  const { t } = useTranslation();
  const [state, setState] = useState<RewriteState>("selecting");
  const [rewrittenText, setRewrittenText] = useState("");
  const [copied, setCopied] = useState(false);
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const handleSelect = useCallback(
    async (style: RewriteStyle, customPrompt?: string) => {
      setState("streaming");
      setRewrittenText("");

      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const gen = streamRewrite(
          {
            excerpt: originalText,
            style,
            custom_prompt: customPrompt,
          },
          controller.signal,
        );

        for await (const event of gen) {
          if (event.event === "rewrite_delta") {
            const delta = (event.data as { delta: string }).delta;
            setRewrittenText((prev) => prev + delta);
          } else if (event.event === "rewrite_end") {
            setState("done");
          } else if (event.event === "error") {
            const msg = (event.data as { message?: string }).message ?? "Unknown error";
            toast.error(msg);
            setState("error");
          }
        }

        setState((prev) => (prev === "streaming" ? "done" : prev));
      } catch (err) {
        if ((err as Error).name !== "AbortError") {
          toast.error(t("rewrite.error"));
          setState("error");
        }
      } finally {
        abortRef.current = null;
      }
    },
    [originalText, t],
  );

  const handleRetry = () => {
    abortRef.current?.abort();
    setState("selecting");
    setRewrittenText("");
  };

  const handleCopy = async () => {
    await navigator.clipboard.writeText(rewrittenText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleClose = () => {
    abortRef.current?.abort();
    onClose();
  };

  return (
    <motion.div
      initial={{ opacity: 0, height: 0 }}
      animate={{ opacity: 1, height: "auto" }}
      exit={{ opacity: 0, height: 0 }}
      transition={{ duration: 0.2 }}
      className="overflow-hidden border-t border-border/30"
    >
      <div className="px-3 py-2.5 space-y-2">
        <div className="flex items-center justify-between">
          <p className="text-xs font-medium">
            {t("rewrite.title")}
            <span className="ml-1.5 text-muted-foreground font-normal truncate">
              — {paperTitle}
            </span>
          </p>
          <Button
            variant="ghost"
            size="sm"
            className="size-6 p-0"
            onClick={handleClose}
          >
            <X className="size-3.5" />
          </Button>
        </div>

        {state === "selecting" && (
          <RewriteStyleSelector
            onSelect={handleSelect}
            onCancel={handleClose}
          />
        )}

        {(state === "streaming" || state === "done" || state === "error") && (
          <>
            <div className="rounded-lg border border-border/50 overflow-hidden text-xs">
              <ReactDiffViewer
                oldValue={originalText}
                newValue={rewrittenText || " "}
                splitView={false}
                useDarkTheme={document.documentElement.classList.contains("dark")}
                compareMethod={DiffMethod.WORDS}
                hideLineNumbers
                styles={{
                  contentText: { fontSize: "12px", lineHeight: "1.6" },
                  diffContainer: { borderRadius: "0.5rem" },
                }}
              />
            </div>

            {state === "streaming" && (
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Loader2 className="size-3 animate-spin" />
                {t("rewrite.streaming")}
              </div>
            )}

            <div className="flex items-center gap-1.5">
              {state === "done" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleCopy}
                >
                  {copied ? (
                    <Check className="size-3 text-emerald-500" />
                  ) : (
                    <Copy className="size-3" />
                  )}
                  {copied
                    ? t("common.copied")
                    : t("common.copy")}
                </Button>
              )}

              {(state === "done" || state === "error") && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 text-xs gap-1"
                  onClick={handleRetry}
                >
                  <RotateCcw className="size-3" />
                  {t("rewrite.retry")}
                </Button>
              )}
            </div>
          </>
        )}
      </div>
    </motion.div>
  );
}

export default memo(RewritePanel);
