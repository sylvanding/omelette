import { memo } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import rehypeHighlight from "rehype-highlight";
import { User, Bot } from "lucide-react";
import { cn } from "@/lib/utils";
import CitationCardList from "./CitationCardList";
import MessageLoadingStages from "./MessageLoadingStages";
import type { LoadingStage } from "./MessageLoadingStages";
import type { Citation } from "@/types/chat";

interface MessageBubbleProps {
  role: "user" | "assistant";
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
  loadingStage?: LoadingStage;
}

function MessageBubble({
  role,
  content,
  citations,
  isStreaming,
  loadingStage,
}: MessageBubbleProps) {
  const isUser = role === "user";
  const effectiveStage = loadingStage ?? (isStreaming ? "generating" : "complete");
  const showLoading = isStreaming && !content && effectiveStage !== "complete";

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
            {showLoading && (
              <MessageLoadingStages
                stage={effectiveStage}
                citationCount={citations?.length}
              />
            )}

            {content && (
              <div className="prose prose-sm dark:prose-invert max-w-none [&_pre]:bg-background/50 [&_pre]:rounded-lg [&_code]:text-xs">
                <ReactMarkdown
                  remarkPlugins={[remarkGfm, remarkMath]}
                  rehypePlugins={[rehypeKatex, rehypeHighlight]}
                >
                  {content}
                </ReactMarkdown>
                {isStreaming && (
                  <span className="inline-block size-2 animate-pulse rounded-full bg-primary" />
                )}
              </div>
            )}

            <CitationCardList
              citations={citations ?? []}
              isStreaming={isStreaming}
            />
          </>
        )}
      </div>
    </div>
  );
}

export default memo(MessageBubble);
