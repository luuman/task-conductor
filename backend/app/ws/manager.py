import json
from datetime import datetime
from typing import Any
from fastapi import WebSocket

class ConnectionManager:
    def __init__(self):
        self.active_connections: dict[str, list[WebSocket]] = {}

    async def connect(self, websocket: WebSocket, channel: str):
        await websocket.accept()
        self.active_connections.setdefault(channel, []).append(websocket)

    def disconnect(self, websocket: WebSocket, channel: str):
        conns = self.active_connections.get(channel, [])
        if websocket in conns:
            conns.remove(websocket)

    def build_message(self, msg_type: str, data: Any) -> dict:
        return {
            "type": msg_type,
            "data": data,
            "ts": datetime.utcnow().isoformat(),
        }

    async def broadcast(self, channel: str, msg_type: str, data: Any):
        message = json.dumps(self.build_message(msg_type, data), ensure_ascii=False)
        dead = []
        for ws in self.active_connections.get(channel, []):
            try:
                await ws.send_text(message)
            except Exception:
                dead.append(ws)
        for ws in dead:
            self.disconnect(ws, channel)

manager = ConnectionManager()
