import { memo } from "react";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";

interface RewriteDiffViewerProps {
  original: string;
  rewritten: string;
  title?: string;
  splitView?: boolean;
}

function RewriteDiffViewer({
  original,
  rewritten,
  title,
  splitView = false,
}: RewriteDiffViewerProps) {
  if (!original && !rewritten) return null;

  const isDark = document.documentElement.classList.contains("dark");

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      {title && (
        <div className="px-3 py-1.5 border-b border-border/30 bg-muted/30">
          <p className="text-xs font-medium">{title}</p>
        </div>
      )}
      <div className="text-xs">
        <ReactDiffViewer
          oldValue={original}
          newValue={rewritten || " "}
          splitView={splitView}
          useDarkTheme={isDark}
          compareMethod={DiffMethod.WORDS}
          hideLineNumbers
          styles={{
            contentText: { fontSize: "12px", lineHeight: "1.6" },
          }}
        />
      </div>
    </div>
  );
}

export default memo(RewriteDiffViewer);
