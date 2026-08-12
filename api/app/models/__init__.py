"""SQLModel table definitions (P2).

Only the `services` layer may import from here. Routers must never touch models
directly — see the layering rule in BLUEPRINT §1.3.

Tables land in P2; `database.init_db()` imports this package so that anything
defined here is registered on `SQLModel.metadata` before `create_all` runs.
"""
