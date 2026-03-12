/**
 * A2UI custom component: RewriteDiff
 *
 * Displays a side-by-side or unified diff between original and rewritten text
 * within A2UI surfaces.
 */

import { memo } from "react";
import {
  useDataBinding,
  type A2UIComponentProps,
} from "@a2ui-sdk/react/0.8";
import ReactDiffViewer, { DiffMethod } from "react-diff-viewer-continued";
import type { ValueSource } from "@a2ui-sdk/types/0.8";

interface A2UIRewriteDiffProps {
  original: ValueSource;
  rewritten: ValueSource;
  title: ValueSource;
  splitView?: ValueSource;
}

function A2UIRewriteDiff({
  surfaceId,
  original,
  rewritten,
  title,
  splitView,
}: A2UIComponentProps<A2UIRewriteDiffProps>) {
  const originalText = useDataBinding<string>(surfaceId, original, "");
  const rewrittenText = useDataBinding<string>(surfaceId, rewritten, "");
  const titleText = useDataBinding<string>(surfaceId, title, "");
  const isSplitView = useDataBinding<boolean>(surfaceId, splitView, false);

  if (!originalText && !rewrittenText) return null;

  return (
    <div className="rounded-lg border border-border/50 overflow-hidden">
      {titleText && (
        <div className="px-3 py-1.5 border-b border-border/30 bg-muted/30">
          <p className="text-xs font-medium">{titleText}</p>
        </div>
      )}
      <div className="text-xs">
        <ReactDiffViewer
          oldValue={originalText}
          newValue={rewrittenText || " "}
          splitView={isSplitView}
          useDarkTheme={document.documentElement.classList.contains("dark")}
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

export default memo(A2UIRewriteDiff);
