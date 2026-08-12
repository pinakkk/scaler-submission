# Zustand store slices

BLUEPRINT §7.1. The meeting room holds a single Zustand store because its state
changes many times per second and must not re-render the tree. Server state
(REST reads) belongs in TanStack Query instead — `staleTime: 30s`, invalidate
`['meetings']` after any mutation.

`useMeetingStore` lands in P10 alongside `PeerManager`. Select narrowly
(`useMeetingStore(s => s.isMuted)`) so a remote ICE update never re-renders the
control bar.
