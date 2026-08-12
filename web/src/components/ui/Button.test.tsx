import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { createRef } from "react";
import { Button } from "./Button";

describe("Button", () => {
  it("applies the primary blue fill by default at the md (40px) size", () => {
    render(<Button>Join</Button>);
    const button = screen.getByRole("button", { name: "Join" });

    expect(button.className).toContain("bg-zm-blue-600");
    expect(button.className).toContain("h-[var(--zm-btn-md)]");
    expect(button).toHaveAttribute("data-variant", "primary");
  });

  it.each([
    ["secondary", "border-zm-line-200"],
    ["ghost", "text-zm-blue-600"],
    ["danger", "bg-zm-danger-strong"],
    ["pill", "rounded-[var(--r-full)]"],
  ] as const)("applies the %s variant classes", (variant, expected) => {
    render(<Button variant={variant}>Action</Button>);
    expect(screen.getByRole("button").className).toContain(expected);
  });

  it.each([
    ["sm", "h-[var(--zm-btn-sm)]"],
    ["md", "h-[var(--zm-btn-md)]"],
    ["lg", "h-[var(--zm-btn-lg)]"],
  ] as const)("maps size %s to its height token", (size, expected) => {
    render(<Button size={size}>Action</Button>);
    expect(screen.getByRole("button").className).toContain(expected);
  });

  it("squares off icon-only buttons at the size's height", () => {
    render(
      <Button iconOnly size="sm" aria-label="Go back">
        <span />
      </Button>,
    );
    const button = screen.getByRole("button", { name: "Go back" });
    expect(button.className).toContain("w-[var(--zm-btn-sm)]");
  });

  it("defaults to type=button so it never submits an enclosing form by accident", () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "button");
  });

  it("honours an explicit type", () => {
    render(<Button type="submit">Save</Button>);
    expect(screen.getByRole("button")).toHaveAttribute("type", "submit");
  });

  it("lets a caller className win over the variant's own utilities", () => {
    render(<Button className="bg-zm-orange-500">New meeting</Button>);
    const className = screen.getByRole("button").className;

    // cn() runs tailwind-merge, so the conflicting background is de-duplicated.
    expect(className).toContain("bg-zm-orange-500");
    expect(className).not.toContain("bg-zm-blue-600");
  });

  it("does not fire onClick while disabled", async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Join
      </Button>,
    );

    await userEvent.click(screen.getByRole("button"), { pointerEventsCheck: 0 });
    expect(onClick).not.toHaveBeenCalled();
  });

  it("renders the disabled state as a grey fill, not a faded blue (OBSERVED §5)", () => {
    render(<Button disabled>Join</Button>);
    expect(screen.getByRole("button").className).toContain(
      "disabled:bg-zm-line-200",
    );
  });

  it("forwards its ref to the underlying button element", () => {
    const ref = createRef<HTMLButtonElement>();
    render(<Button ref={ref}>Join</Button>);
    expect(ref.current).toBeInstanceOf(HTMLButtonElement);
  });
});
