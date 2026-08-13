import { describe, it, expect, beforeEach } from "vitest";
import { useMeetingStore, selectOrderedParticipants } from "./meetingStore";

const p = (id: string, role: "host" | "participant" = "participant") =>
  ({ id, name: id, role, isMuted: false, isVideoOn: true }) as never;

describe("selectOrderedParticipants", () => {
  beforeEach(() => useMeetingStore.getState().reset());

  it("is referentially stable when state is unchanged", () => {
    const s = useMeetingStore.getState();
    expect(Object.is(selectOrderedParticipants(s), selectOrderedParticipants(s))).toBe(true);
  });

  it("returns a NEW reference after participants change", () => {
    const before = selectOrderedParticipants(useMeetingStore.getState());
    useMeetingStore.getState().upsertParticipant(p("a"));
    const after = selectOrderedParticipants(useMeetingStore.getState());
    expect(Object.is(before, after)).toBe(false);
    expect(after.map((x) => x.id)).toEqual(["a"]);
  });

  it("still puts self first", () => {
    const st = useMeetingStore.getState();
    st.setRoomState({ id: "m" } as never, p("me", "host"), [p("a"), p("me", "host"), p("b")]);
    expect(selectOrderedParticipants(useMeetingStore.getState())[0].id).toBe("me");
  });

  it("recomputes when self.id changes but participants do not", () => {
    const st = useMeetingStore.getState();
    st.setRoomState({ id: "m" } as never, p("a"), [p("a"), p("b")]);
    const first = selectOrderedParticipants(useMeetingStore.getState());
    expect(first[0].id).toBe("a");
    const s2 = { ...useMeetingStore.getState(), self: p("b") } as never;
    expect(selectOrderedParticipants(s2)[0].id).toBe("b");
  });
});
