"""WebSocket connection registry and event fan-out.

One socket per browser tab carries typed events on four logical channels:
  readings       -> reading.new, simulation.status
  notifications  -> notification.new (nurses)
  queue          -> queue.updated (staff)
  acknowledgements -> patient.acknowledged
Patients only ever receive events about themselves; staff receive hospital-wide events.
Events are published only after the database transaction that produced them commits,
so every message reflects saved backend state.
"""
import asyncio
import logging
import threading

from fastapi import WebSocket

log = logging.getLogger("glucosync.realtime")


class Connection:
    def __init__(self, ws: WebSocket, user_type: str, user_id: str):
        self.ws = ws
        self.user_type = user_type
        self.user_id = user_id


class RealtimeHub:
    def __init__(self) -> None:
        self._connections: set[Connection] = set()
        self._lock = threading.Lock()
        self.loop: asyncio.AbstractEventLoop | None = None

    def bind_loop(self, loop: asyncio.AbstractEventLoop) -> None:
        self.loop = loop

    def add(self, conn: Connection) -> None:
        with self._lock:
            self._connections.add(conn)

    def remove(self, conn: Connection) -> None:
        with self._lock:
            self._connections.discard(conn)

    def _targets(self, audience: str, patient_id: str | None) -> list[Connection]:
        with self._lock:
            conns = list(self._connections)
        out = []
        for c in conns:
            if c.user_type == "patient":
                if audience in ("patient", "all") and patient_id is not None and c.user_id == patient_id:
                    out.append(c)
            elif c.user_type == "nurse" and audience in ("staff", "nurses", "all"):
                out.append(c)
            elif c.user_type == "doctor" and audience in ("staff", "all"):
                out.append(c)
        return out

    async def _send(self, message: dict, audience: str, patient_id: str | None) -> None:
        for conn in self._targets(audience, patient_id):
            try:
                await conn.ws.send_json(message)
            except Exception:  # client went away; the receive loop cleans it up
                self.remove(conn)

    def publish(self, event: str, data: dict, audience: str = "all", patient_id: str | None = None) -> None:
        """Thread-safe: callable from async code or from sync route handlers in the threadpool."""
        if self.loop is None or self.loop.is_closed():
            return
        message = {"type": event, "data": data}
        coro = self._send(message, audience, patient_id)
        try:
            running = asyncio.get_running_loop()
        except RuntimeError:
            running = None
        if running is self.loop:
            self.loop.create_task(coro)
        else:
            asyncio.run_coroutine_threadsafe(coro, self.loop)


hub = RealtimeHub()
