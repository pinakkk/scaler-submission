import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { PreJoinGate } from "./PreJoinGate";

const {
  getPreferencesMock,
  requestUserMediaMock,
  signInAsGuestMock,
  signInMock,
  sessionUser,
} = vi.hoisted(() => ({
  getPreferencesMock: vi.fn(),
  requestUserMediaMock: vi.fn(),
  signInAsGuestMock: vi.fn(),
  signInMock: vi.fn(),
  sessionUser: { current: null as { id: string; name: string } | null },
}));

vi.mock("@/lib/api", () => ({ getPreferences: getPreferencesMock }));
vi.mock("@/lib/session", () => ({
  getToken: () => "app-token",
  signIn: signInMock,
  signInAsGuest: signInAsGuestMock,
  useSession: () => ({ user: sessionUser.current }),
}));
vi.mock("@/lib/webrtc/mediaDevices", () => ({
  requestUserMedia: requestUserMediaMock,
}));

beforeEach(() => {
  vi.clearAllMocks();
  sessionUser.current = { id: "u1", name: "Host" };
});

describe("PreJoinGate preferences", () => {
  it("uses selected devices and applies mute/video-off before joining", async () => {
    const audioTrack = { enabled: true };
    const videoTrack = { enabled: true };
    const stream = {
      getAudioTracks: () => [audioTrack],
      getVideoTracks: () => [videoTrack],
    } as unknown as MediaStream;
    getPreferencesMock.mockResolvedValue({
      audio_input_id: "mic-1",
      video_input_id: "camera-1",
      mute_on_join: true,
      video_off_on_join: true,
    });
    requestUserMediaMock.mockResolvedValue(stream);
    const onJoin = vi.fn();

    render(<PreJoinGate isHost onJoin={onJoin} />);
    await waitFor(() => expect(getPreferencesMock).toHaveBeenCalled());
    fireEvent.click(
      screen.getByRole("button", { name: "Use microphone and camera" }),
    );

    await waitFor(() => expect(onJoin).toHaveBeenCalledWith(stream));
    expect(requestUserMediaMock).toHaveBeenCalledWith({
      audio: { deviceId: { exact: "mic-1" } },
      video: { deviceId: { exact: "camera-1" } },
    });
    expect(audioTrack.enabled).toBe(false);
    expect(videoTrack.enabled).toBe(false);
  });
});

describe("PreJoinGate guest identity (§8)", () => {
  beforeEach(() => {
    sessionUser.current = null;
  });

  it("offers a name field and guest join instead of the media step", () => {
    render(<PreJoinGate isHost={false} onJoin={vi.fn()} topic="Design Review" />);

    expect(screen.getByRole("heading", { name: "Join meeting" })).toBeTruthy();
    expect(screen.getByText("Design Review")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Join as guest" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Sign in" })).toBeTruthy();
    // The media step must not appear before there is an identity to join with.
    expect(
      screen.queryByRole("button", { name: "Use microphone and camera" }),
    ).toBeNull();
  });

  it("mints a guest session from the entered name", async () => {
    signInAsGuestMock.mockResolvedValue({});
    render(<PreJoinGate isHost={false} onJoin={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Your name"), {
      target: { value: "  Pinak's friend  " },
    });
    fireEvent.click(screen.getByRole("button", { name: "Join as guest" }));

    await waitFor(() =>
      expect(signInAsGuestMock).toHaveBeenCalledWith("Pinak's friend"),
    );
  });

  it("refuses an empty name rather than creating a nameless guest", async () => {
    render(<PreJoinGate isHost={false} onJoin={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Join as guest" }));

    await waitFor(() => expect(screen.getByRole("alert")).toBeTruthy());
    expect(signInAsGuestMock).not.toHaveBeenCalled();
  });

  it("shows the media step once a session exists", () => {
    sessionUser.current = { id: "g1", name: "Friend" };
    render(<PreJoinGate isHost={false} onJoin={vi.fn()} />);

    expect(
      screen.getByRole("button", { name: "Use microphone and camera" }),
    ).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Join as guest" })).toBeNull();
  });
});
