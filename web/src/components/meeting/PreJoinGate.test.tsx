import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { PreJoinGate } from "./PreJoinGate";

const { getPreferencesMock, requestUserMediaMock } = vi.hoisted(() => ({
  getPreferencesMock: vi.fn(),
  requestUserMediaMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({ getPreferences: getPreferencesMock }));
vi.mock("@/lib/session", () => ({ getToken: () => "app-token" }));
vi.mock("@/lib/webrtc/mediaDevices", () => ({
  requestUserMedia: requestUserMediaMock,
}));

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
