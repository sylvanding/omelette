export interface Conversation {
  id: number;
  title: string;
  knowledge_base_ids: number[];
  model: string | null;
  tool_mode: string;
  created_at: string;
  updated_at: string;
  messages: ChatMessage[];
}

export interface ChatMessage {
  id: number;
  conversation_id: number;
  role: 'user' | 'assistant' | 'system';
  content: string;
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
  snippet: string;
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
