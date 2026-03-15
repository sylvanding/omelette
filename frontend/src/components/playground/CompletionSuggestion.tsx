interface CompletionSuggestionProps {
  completion: string;
  visible: boolean;
}

export default function CompletionSuggestion({
  completion,
  visible,
}: CompletionSuggestionProps) {
  if (!visible || !completion) return null;

  return (
    <span className="pointer-events-none select-none text-muted-foreground/50 italic">
      {completion}
      <kbd className="ml-2 inline-flex items-center rounded border border-border/40 px-1 py-0.5 text-[10px] font-mono text-muted-foreground/40 not-italic">
        Tab
      </kbd>
    </span>
  );
}
