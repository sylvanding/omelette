import type { SSEEvent } from "@/types/chat";
import { apiUrl } from "@/lib/api-config";

export type RewriteStyle =
  | "simplify"
  | "academic"
  | "translate_en"
  | "translate_zh"
  | "custom";

export interface RewriteRequest {
  excerpt: string;
  style: RewriteStyle;
  custom_prompt?: string;
  source_language?: string;
}

export async function* streamRewrite(
  request: RewriteRequest,
  signal?: AbortSignal,
): AsyncGenerator<SSEEvent> {
  const response = await fetch(apiUrl("/chat/rewrite"), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(request),
    signal,
  });

  if (!response.ok) {
    throw new Error(`Rewrite stream error: ${response.status}`);
  }

  const reader = response.body?.getReader();
  if (!reader) throw new Error("No response body");

  const decoder = new TextDecoder();
  let buffer = "";

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      let currentEvent = "";
      let currentData = "";

      for (const line of lines) {
        if (line.startsWith("event: ")) {
          currentEvent = line.slice(7).trim();
        } else if (line.startsWith("data: ")) {
          currentData = line.slice(6);
        } else if (line === "" && currentEvent && currentData) {
          try {
            yield { event: currentEvent, data: JSON.parse(currentData) };
          } catch {
            yield { event: currentEvent, data: { raw: currentData } };
          }
          currentEvent = "";
          currentData = "";
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}
