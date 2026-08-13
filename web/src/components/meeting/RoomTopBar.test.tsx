import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { RoomTopBar } from "./RoomTopBar";

const writeText = vi.fn();

beforeEach(() => {
  writeText.mockReset().mockResolvedValue(undefined);
  Object.assign(navigator, { clipboard: { writeText } });
});

describe("RoomTopBar invite link", () => {
  it("copies a link carrying ?pwd= so the recipient needs no passcode", async () => {
    render(
      <RoomTopBar
        title="Design Review"
        meetingNumber="54304875714"
        inviteToken="tok-123"
        passcode="eAn8nV"
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = writeText.mock.calls[0][0] as string;
    expect(copied).toContain("/wc/54304875714?pwd=tok-123");
    expect(copied).toContain("Passcode: eAn8nV");
  });

  it("confirms the copy in the label", async () => {
    render(
      <RoomTopBar title="T" meetingNumber="123" inviteToken="tok" passcode="p" />,
    );
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copied" })).toBeTruthy(),
    );
  });

  it("omits ?pwd= when there is no invite token", async () => {
    render(<RoomTopBar title="T" meetingNumber="123" inviteToken={null} />);
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(writeText.mock.calls[0][0] as string).not.toContain("pwd=");
  });

  it("hides the control when there is no meeting number to share", () => {
    render(<RoomTopBar title="T" />);
    expect(screen.queryByRole("button", { name: "Copy invite link" })).toBeNull();
  });

  it("does not claim success when the clipboard is blocked", async () => {
    writeText.mockRejectedValue(new Error("denied"));
    render(<RoomTopBar title="T" meetingNumber="123" inviteToken="tok" />);
    fireEvent.click(screen.getByRole("button", { name: "Copy invite link" }));

    await waitFor(() => expect(writeText).toHaveBeenCalled());
    expect(screen.queryByRole("button", { name: "Copied" })).toBeNull();
  });
});
