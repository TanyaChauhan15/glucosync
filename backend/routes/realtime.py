import asyncio

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from auth import websocket_user
from config import settings
from database import SessionLocal
from services.realtime import Connection, hub

router = APIRouter()


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    """Authenticated event stream. Channels (event types) are described in services/realtime.py."""
    origin = websocket.headers.get("origin")
    if origin and origin not in settings.cors_origins:
        await websocket.close(code=4403)
        return
    db = SessionLocal()
    try:
        user = await asyncio.to_thread(websocket_user, websocket, db)
    finally:
        db.close()
    if user is None:
        await websocket.close(code=4401)
        return
    await websocket.accept()
    conn = Connection(websocket, user.user_type, user.user_id)
    hub.add(conn)
    try:
        await websocket.send_json({"type": "connected", "data": {"user_type": user.user_type,
                                                                 "user_id": user.user_id}})
        while True:
            msg = await websocket.receive_text()
            if msg == "ping":
                await websocket.send_json({"type": "pong", "data": {}})
    except WebSocketDisconnect:
        pass
    except Exception:
        pass
    finally:
        hub.remove(conn)
