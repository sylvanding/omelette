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
