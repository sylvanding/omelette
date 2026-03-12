/**
 * A2UISurface — renders A2UI messages within a chat message bubble.
 *
 * Receives A2UI messages from SSE `a2ui_surface` events and renders them
 * using the @a2ui-sdk/react renderer with our custom Omelette catalog.
 *
 * Falls back to null rendering if messages are empty or invalid.
 */

import { memo, useCallback, useMemo } from "react";
import { A2UIProvider, A2UIRenderer } from "@a2ui-sdk/react/0.8";
import type { A2UIMessage, ActionPayload } from "@a2ui-sdk/types/0.8";
import { toast } from "sonner";
import { omeletteCatalog } from "./catalog";

interface A2UISurfaceProps {
  messages: A2UIMessage[];
}

function A2UISurface({ messages }: A2UISurfaceProps) {
  const handleAction = useCallback((action: ActionPayload) => {
    if (action.name === "copy") {
      const text = action.context?.text;
      if (typeof text === "string") {
        navigator.clipboard.writeText(text);
        toast.success("已复制");
      }
    }
  }, []);

  const validMessages = useMemo(
    () =>
      messages.filter(
        (m) =>
          m.beginRendering || m.surfaceUpdate || m.dataModelUpdate,
      ),
    [messages],
  );

  if (validMessages.length === 0) return null;

  return (
    <div className="mt-2 space-y-2">
      <A2UIProvider messages={validMessages} catalog={omeletteCatalog}>
        <A2UIRenderer onAction={handleAction} />
      </A2UIProvider>
    </div>
  );
}

export default memo(A2UISurface);
