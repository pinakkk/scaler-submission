"""WebSocket signaling, RoomRegistry, and protocol frames (P9, §5.2).

In-process state — the API must stay at one instance/one uvicorn worker for the
registry to remain coherent (§9, §12.2).
"""
