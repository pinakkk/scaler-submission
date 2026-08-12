"""Pydantic request/response models — the wire contract.

Routers serialize to and from these. They never expose SQLModel table classes
directly, which keeps internal columns from leaking into the API (see §4's
`/lookup`, which must omit private fields).
"""
