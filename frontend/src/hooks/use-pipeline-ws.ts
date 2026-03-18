import { useState, useEffect, useRef, useCallback } from 'react';
import type { PipelineWSMessage } from '@/types/api';
import { wsUrl } from '@/lib/api-config';

interface UsePipelineWebSocketReturn {
  status: string | null;
  messages: PipelineWSMessage[];
  isConnected: boolean;
  error: Error | null;
}

export function usePipelineWebSocket(threadId: string | null): UsePipelineWebSocketReturn {
  const [status, setStatus] = useState<string | null>(null);
  const [messages, setMessages] = useState<PipelineWSMessage[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const cleanup = useCallback(() => {
    if (reconnectTimer.current) {
      clearTimeout(reconnectTimer.current);
      reconnectTimer.current = null;
    }
    if (wsRef.current) {
      wsRef.current.close(1000, 'Cleanup');
      wsRef.current = null;
    }
    setIsConnected(false);
  }, []);

  useEffect(() => {
    if (!threadId) {
      cleanup();
      return;
    }

    const url = wsUrl(`/pipelines/${threadId}/ws`);

    function connect() {
      const ws = new WebSocket(url);
      wsRef.current = ws;

      ws.onopen = () => {
        setIsConnected(true);
        setError(null);
      };

      ws.onmessage = (event) => {
        try {
          const msg: PipelineWSMessage = JSON.parse(event.data);
          setMessages((prev) => [...prev, msg]);
          if (msg.type === 'status') {
            setStatus(msg.status);
          }
        } catch {
          // ignore malformed messages
        }
      };

      ws.onerror = () => {
        setError(new Error('WebSocket connection error'));
      };

      ws.onclose = (event) => {
        setIsConnected(false);
        wsRef.current = null;
        if (event.code !== 1000 && threadId) {
          reconnectTimer.current = setTimeout(connect, 3000);
        }
      };
    }

    connect();
    return cleanup;
  }, [threadId, cleanup]);

  return { status, messages, isConnected, error };
}
