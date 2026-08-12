import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { Checkbox } from "./Checkbox";
import { Radio } from "./Radio";

describe("Checkbox", () => {
  it("associates the visible label with the input so clicking the text toggles it", async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Mirror my video" onChange={onChange} />);

    const input = screen.getByRole("checkbox", { name: "Mirror my video" });
    await userEvent.click(screen.getByText("Mirror my video"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(input).toBeChecked();
  });

  it("stays pinned to its prop in controlled mode", async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Animate emojis" checked={false} onChange={onChange} />);

    const input = screen.getByRole("checkbox");
    await userEvent.click(input);

    expect(onChange).toHaveBeenCalledTimes(1);
    // The parent never updated `checked`, so the box must not drift.
    expect(input).not.toBeChecked();
  });

  it("follows state when the controlling parent does update", async () => {
    function Controlled() {
      const [checked, setChecked] = useState(false);
      return (
        <Checkbox
          label="Hide Self View"
          checked={checked}
          onChange={(event) => setChecked(event.target.checked)}
        />
      );
    }

    render(<Controlled />);
    const input = screen.getByRole("checkbox");

    expect(input).not.toBeChecked();
    await userEvent.click(input);
    expect(input).toBeChecked();
    await userEvent.click(input);
    expect(input).not.toBeChecked();
  });

  it("does not toggle when disabled", async () => {
    const onChange = vi.fn();
    render(<Checkbox label="Sync buttons on headset" disabled onChange={onChange} />);

    await userEvent.click(screen.getByText("Sync buttons on headset"), {
      pointerEventsCheck: 0,
    });

    expect(onChange).not.toHaveBeenCalled();
    expect(screen.getByRole("checkbox")).not.toBeChecked();
  });

  it("uses room text colour in the dark tone (§2.5)", () => {
    render(<Checkbox label="Give feedback" tone="dark" />);
    const label = screen.getByText("Give feedback").closest("label");
    expect(label?.className).toContain("text-zm-room-text");
  });
});

describe("Radio", () => {
  it("selects exactly one option within a name group", async () => {
    render(
      <>
        <Radio name="gallery" value="9" label="9 participants" />
        <Radio name="gallery" value="25" label="25 participants" />
      </>,
    );

    const nine = screen.getByRole("radio", { name: "9 participants" });
    const twentyFive = screen.getByRole("radio", { name: "25 participants" });

    await userEvent.click(twentyFive);
    expect(twentyFive).toBeChecked();
    expect(nine).not.toBeChecked();

    await userEvent.click(nine);
    expect(nine).toBeChecked();
    expect(twentyFive).not.toBeChecked();
  });

  it("reports the selected value to a controlled parent", async () => {
    const onChange = vi.fn();
    render(
      <Radio
        name="noise"
        value="zoom"
        label="Zoom background noise removal"
        checked={false}
        onChange={onChange}
      />,
    );

    await userEvent.click(screen.getByRole("radio"));

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].target.value).toBe("zoom");
    expect(screen.getByRole("radio")).not.toBeChecked();
  });
});
