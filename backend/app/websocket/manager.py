"""Room-based WebSocket connection manager for pipeline status broadcasts."""

import logging
from collections import defaultdict

from fastapi import WebSocket

logger = logging.getLogger(__name__)


class PipelineConnectionManager:
    """Manages WebSocket connections grouped by pipeline thread_id (room)."""

    def __init__(self) -> None:
        self.rooms: dict[str, set[WebSocket]] = defaultdict(set)

    async def connect(self, websocket: WebSocket, thread_id: str) -> None:
        await websocket.accept()
        self.rooms[thread_id].add(websocket)
        logger.debug("WS connected to room %s (%d clients)", thread_id, len(self.rooms[thread_id]))

    def disconnect(self, websocket: WebSocket, thread_id: str) -> None:
        if thread_id in self.rooms:
            self.rooms[thread_id].discard(websocket)
            if not self.rooms[thread_id]:
                del self.rooms[thread_id]

    async def broadcast_to_room(self, thread_id: str, message: dict) -> None:
        if thread_id not in self.rooms:
            return
        dead: list[WebSocket] = []
        for conn in list(self.rooms[thread_id]):
            try:
                await conn.send_json(message)
            except Exception:
                dead.append(conn)
        for conn in dead:
            self.rooms[thread_id].discard(conn)
        if thread_id in self.rooms and not self.rooms[thread_id]:
            del self.rooms[thread_id]


pipeline_manager = PipelineConnectionManager()
