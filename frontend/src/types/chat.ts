import type { UIMessage, UIMessagePart } from 'ai';

// ---------------------------------------------------------------------------
// Domain types
// ---------------------------------------------------------------------------

export interface Conversation {
  id: number;
  title: string;
  knowledge_base_ids: number[];
  model: string | null;
  tool_mode: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
  message_count?: number;
  last_message_preview?: string;
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
  citations: Citation[] | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface Citation {
  index: number;
  paper_id: number;
  paper_title: string;
  chunk_type: string;
  page_number: number;
  relevance_score: number;
  excerpt: string;
  authors?: string[] | string | null;
  year?: number | null;
  doi?: string | null;
}

export function isCitation(data: unknown): data is Citation {
  return (
    typeof data === "object" &&
    data !== null &&
    "index" in data &&
    "paper_id" in data &&
    ("excerpt" in data || "snippet" in data)
  );
}

export function normalizeCitation(raw: Record<string, unknown>): Citation {
  return {
    index: raw.index as number,
    paper_id: raw.paper_id as number,
    paper_title: (raw.paper_title as string) ?? "",
    chunk_type: (raw.chunk_type as string) ?? "text",
    page_number: (raw.page_number as number) ?? 0,
    relevance_score: (raw.relevance_score as number) ?? 0,
    excerpt: (raw.excerpt as string) ?? (raw.snippet as string) ?? "",
    authors: raw.authors as string[] | string | null | undefined,
    year: raw.year as number | null | undefined,
    doi: raw.doi as string | null | undefined,
  };
}

export type ToolMode = 'qa' | 'citation_lookup' | 'review_outline' | 'gap_analysis';

export interface SSEEvent {
  event: string;
  data: Record<string, unknown>;
}

export interface ConversationCreate {
  title?: string;
  knowledge_base_ids?: number[];
  model?: string;
  tool_mode?: string;
}

export interface ChatStreamRequest {
  conversation_id?: number;
  message: string;
  knowledge_base_ids?: number[];
  model?: string;
  tool_mode?: string;
}

// ---------------------------------------------------------------------------
// AI SDK 5.0 data part types (maps to backend data-* stream events)
// ---------------------------------------------------------------------------

export interface ThinkingData {
  step: string;
  label: string;
  status: 'running' | 'done' | 'error';
  detail?: string;
  duration_ms?: number;
  summary?: string;
}

export interface ConversationData {
  conversation_id: number;
}

export type OmeletteDataParts = {
  citation: Citation;
  thinking: ThinkingData;
  conversation: ConversationData;
};

export type OmeletteUIMessage = UIMessage<unknown, OmeletteDataParts>;
export type OmelettePart = UIMessagePart<OmeletteDataParts, Record<string, never>>;

// ---------------------------------------------------------------------------
// Part extraction helpers
// ---------------------------------------------------------------------------

export function getCitations(message: OmeletteUIMessage): Citation[] {
  return message.parts
    .filter((p): p is { type: 'data-citation'; id?: string; data: Citation } => p.type === 'data-citation')
    .map((p) => p.data);
}

export function getThinkingSteps(message: OmeletteUIMessage): ThinkingData[] {
  return message.parts
    .filter((p): p is { type: 'data-thinking'; id?: string; data: ThinkingData } => p.type === 'data-thinking')
    .map((p) => p.data);
}

export function getConversationId(message: OmeletteUIMessage): number | undefined {
  const part = message.parts.find(
    (p): p is { type: 'data-conversation'; id?: string; data: ConversationData } => p.type === 'data-conversation',
  );
  return part?.data.conversation_id;
}

export function getMessageText(message: OmeletteUIMessage): string {
  return message.parts
    .filter((p): p is { type: 'text'; text: string } => p.type === 'text')
    .map((p) => p.text)
    .join('');
}
