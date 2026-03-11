import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import rehypeHighlight from 'rehype-highlight';
import { User, Bot, FileText } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Citation } from '@/types/chat';

interface MessageBubbleProps {
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  isStreaming?: boolean;
}

export default function MessageBubble({
  role,
  content,
  citations,
  isStreaming,
}: MessageBubbleProps) {
  const isUser = role === 'user';

  return (
    <div className={cn('flex gap-3', isUser && 'flex-row-reverse')}>
      <div
        className={cn(
          'flex size-8 shrink-0 items-center justify-center rounded-full',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-muted-foreground',
        )}
      >
        {isUser ? <User className="size-4" /> : <Bot className="size-4" />}
      </div>

      <div
        className={cn(
          'max-w-[75%] rounded-2xl px-4 py-3',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground',
        )}
      >
        {isUser ? (
          <p className="whitespace-pre-wrap text-sm">{content}</p>
        ) : (
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

        {citations && citations.length > 0 && (
          <div className="mt-3 border-t border-border/30 pt-2">
            <p className="mb-1 text-xs font-medium opacity-70">引用来源</p>
            <ul className="space-y-1">
              {citations.map((c) => (
                <li
                  key={c.index}
                  className="flex items-start gap-1.5 text-xs opacity-80"
                >
                  <FileText className="mt-0.5 size-3 shrink-0" />
                  <span>
                    [{c.index}] {c.paper_title}
                    {c.page_number > 0 && ` (p.${c.page_number})`}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  );
}
