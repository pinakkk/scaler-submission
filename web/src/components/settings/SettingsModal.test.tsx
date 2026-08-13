import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ToastProvider } from "@/components/ui";
import type { UserPreferences } from "@/lib/types";
import { SettingsModal } from "./SettingsModal";

const { getPreferencesMock, updatePreferencesMock } = vi.hoisted(() => ({
  getPreferencesMock: vi.fn(),
  updatePreferencesMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  getPreferences: getPreferencesMock,
  updatePreferences: updatePreferencesMock,
}));

vi.mock("@/lib/session", () => ({
  getToken: () => "app-token",
  useSession: () => ({ signIn: vi.fn() }),
}));

const preferences: UserPreferences = {
  user_id: "user-1",
  theme: "classic",
  mute_on_join: false,
  video_off_on_join: false,
  gallery_size: 9,
  mirror_video: true,
  always_show_controls: false,
  audio_input_id: null,
  audio_output_id: null,
  video_input_id: null,
  updated_at: "2026-08-13T00:00:00Z",
};

describe("SettingsModal", () => {
  beforeEach(() => {
    getPreferencesMock.mockReset().mockResolvedValue(preferences);
    updatePreferencesMock.mockReset().mockImplementation(async (changes) => ({
      ...preferences,
      ...changes,
    }));
  });

  it("loads real preferences and saves changed behavior settings", async () => {
    render(
      <ToastProvider>
        <SettingsModal open onClose={vi.fn()} />
      </ToastProvider>,
    );

    const controls = await screen.findByRole("switch", {
      name: "Always show meeting controls",
    });
    expect(controls).toHaveAttribute("aria-checked", "false");

    fireEvent.click(controls);
    fireEvent.click(screen.getByRole("button", { name: "Audio" }));
    fireEvent.click(
      screen.getByRole("switch", { name: "Mute my microphone when joining" }),
    );
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => {
      expect(updatePreferencesMock).toHaveBeenCalledWith(
        expect.objectContaining({
          always_show_controls: true,
          mute_on_join: true,
          gallery_size: 9,
        }),
        { token: "app-token" },
      );
    });
    expect(await screen.findByText("Settings saved.")).toBeInTheDocument();
  });

  it("shows Background only for the dark in-meeting variant", async () => {
    const { rerender } = render(
      <ToastProvider>
        <SettingsModal open onClose={vi.fn()} tone="light" />
      </ToastProvider>,
    );
    await screen.findByText("Choose how Zoom Workplace looks and behaves.");
    expect(
      screen.queryByRole("button", { name: "Background & effects" }),
    ).not.toBeInTheDocument();

    rerender(
      <ToastProvider>
        <SettingsModal open onClose={vi.fn()} tone="dark" />
      </ToastProvider>,
    );
    expect(
      screen.getByRole("button", { name: "Background & effects" }),
    ).toBeInTheDocument();
  });
});
