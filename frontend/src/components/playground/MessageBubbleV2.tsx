import { memo, useState, useCallback, useMemo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import remarkCitation from "@/lib/remark-citation";
import InlineCitationTag from "./InlineCitationTag";
import CitationCardList from "./CitationCardList";
import ThinkingChain from "./ThinkingChain";
import type { ThinkingStep } from "./ThinkingChain";
import type { OmeletteUIMessage, Citation, ThinkingData } from "@/types/chat";
import { getCitations, getThinkingSteps, getMessageText } from "@/types/chat";

interface MessageBubbleV2Props {
  message: OmeletteUIMessage;
  isStreaming?: boolean;
}

function thinkingDataToStep(data: ThinkingData): ThinkingStep {
  return {
    step: data.step,
    label: data.label,
    status: data.status === "error" ? "error" : data.status,
    detail: data.detail,
    duration_ms: data.duration_ms,
    summary: data.summary,
  };
}

function MessageBubbleV2({ message, isStreaming }: MessageBubbleV2Props) {
  const isUser = message.role === "user";

  const content = useMemo(() => getMessageText(message), [message]);
  const citations = useMemo(() => getCitations(message), [message]);
  const thinkingData = useMemo(() => getThinkingSteps(message), [message]);
  const thinkingSteps = useMemo(
    () => thinkingData.map(thinkingDataToStep),
    [thinkingData],
  );

  const hasThinkingSteps = thinkingSteps.length > 0;
  const showLoading = isStreaming && !content && !hasThinkingSteps;

  const [highlightedCitationIndex, setHighlightedCitationIndex] = useState<
    number | null
  >(null);

  const citationMap = useMemo(() => {
    const map = new Map<number, Citation>();
    for (const c of citations) {
      map.set(c.index, c);
    }
    return map;
  }, [citations]);

  const handleClickCitation = useCallback((index: number) => {
    setHighlightedCitationIndex(index);
  }, []);

  const remarkPlugins = useMemo(
    () => [remarkGfm, remarkMath, remarkCitation],
    [],
  );

  const rehypePlugins = useMemo(() => [rehypeKatex, rehypeHighlight], []);

  const markdownComponents = useMemo(
    () =>
      ({
        "citation-ref": ({
          index: citationIndex,
        }: {
          index?: number;
          children?: React.ReactNode;
        }) => {
          if (citationIndex == null) return null;
          return (
            <InlineCitationTag
              citationIndex={citationIndex}
              citation={citationMap.get(citationIndex)}
              onClickCitation={handleClickCitation}
            />
          );
        },
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
      }) as any,
    [citationMap, handleClickCitation],
  );

  return (
    <div className={cn("flex gap-3", isUser && "flex-row-reverse")}>
      <div
        className={cn(
          "flex size-8 shrink-0 items-center justify-center rounded-full",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground",
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div
        className={cn(
          "max-w-[75%] rounded-2xl px-4 py-3",
          isUser
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-foreground",
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
          <>
            {hasThinkingSteps && <ThinkingChain steps={thinkingSteps} />}

            {showLoading && (
              <div className="flex items-center gap-2 py-1">
                <div className="animate-pulse">
                  <span className="size-3.5 text-primary">...</span>
                </div>
              </div>
            )}

            {content && (
              <div className="prose prose-sm dark:prose-invert max-w-none [&_pre]:bg-background/50 [&_pre]:rounded-lg [&_code]:text-xs">
                <ReactMarkdown
                  remarkPlugins={remarkPlugins}
                  rehypePlugins={rehypePlugins}
                  components={markdownComponents}
                >
                  {content}
                </ReactMarkdown>
                {isStreaming && (
                  <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
                )}
              </div>
            )}

            <CitationCardList
              citations={citations}
              isStreaming={isStreaming}
              highlightedIndex={highlightedCitationIndex}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubbleV2);
