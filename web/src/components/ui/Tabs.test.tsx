import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { TabPanel, Tabs } from "./Tabs";
import { Switch } from "./Switch";
import { Avatar } from "./Avatar";
import { Banner, BannerLink } from "./Banner";
import { Spinner } from "./Spinner";

const ITEMS = [
  { value: "upcoming", label: "Upcoming" },
  { value: "previous", label: "Previous" },
  { value: "personal", label: "Personal Room" },
] as const;

function TabsFixture() {
  const [value, setValue] = useState("upcoming");
  return (
    <>
      <Tabs items={ITEMS} value={value} onValueChange={setValue} label="Meeting lists" />
      <TabPanel active={value === "upcoming"}>Upcoming meetings</TabPanel>
      <TabPanel active={value === "previous"}>Previous meetings</TabPanel>
      <TabPanel active={value === "personal"}>Personal room</TabPanel>
    </>
  );
}

describe("Tabs", () => {
  it("marks only the selected tab as selected and keyboard-reachable", () => {
    render(<TabsFixture />);

    const upcoming = screen.getByRole("tab", { name: "Upcoming" });
    const previous = screen.getByRole("tab", { name: "Previous" });

    expect(upcoming).toHaveAttribute("aria-selected", "true");
    expect(upcoming).toHaveAttribute("tabindex", "0");
    expect(previous).toHaveAttribute("aria-selected", "false");
    expect(previous).toHaveAttribute("tabindex", "-1");
  });

  it("renders only the active panel", async () => {
    render(<TabsFixture />);
    expect(screen.getByText("Upcoming meetings")).toBeInTheDocument();
    expect(screen.queryByText("Previous meetings")).toBeNull();

    await userEvent.click(screen.getByRole("tab", { name: "Previous" }));
    expect(screen.getByText("Previous meetings")).toBeInTheDocument();
    expect(screen.queryByText("Upcoming meetings")).toBeNull();
  });

  it("moves selection with Arrow keys and wraps at the ends", async () => {
    render(<TabsFixture />);
    screen.getByRole("tab", { name: "Upcoming" }).focus();

    await userEvent.keyboard("{ArrowRight}");
    expect(screen.getByRole("tab", { name: "Previous" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.keyboard("{ArrowLeft}{ArrowLeft}");
    expect(screen.getByRole("tab", { name: "Personal Room" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });

  it("jumps to first/last with Home and End", async () => {
    render(<TabsFixture />);
    screen.getByRole("tab", { name: "Upcoming" }).focus();

    await userEvent.keyboard("{End}");
    expect(screen.getByRole("tab", { name: "Personal Room" })).toHaveAttribute(
      "aria-selected",
      "true",
    );

    await userEvent.keyboard("{Home}");
    expect(screen.getByRole("tab", { name: "Upcoming" })).toHaveAttribute(
      "aria-selected",
      "true",
    );
  });
});

describe("Switch", () => {
  it("reports state via aria-checked and toggles on click", async () => {
    function Fixture() {
      const [on, setOn] = useState(false);
      return <Switch checked={on} onCheckedChange={setOn} aria-label="Mirror video" />;
    }

    render(<Fixture />);
    const toggle = screen.getByRole("switch", { name: "Mirror video" });

    expect(toggle).toHaveAttribute("aria-checked", "false");
    await userEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-checked", "true");
  });

  it("does not toggle while disabled", async () => {
    const calls: boolean[] = [];
    render(
      <Switch
        checked={false}
        disabled
        onCheckedChange={(next) => calls.push(next)}
        aria-label="Mirror video"
      />,
    );

    await userEvent.click(screen.getByRole("switch"), { pointerEventsCheck: 0 });
    expect(calls).toHaveLength(0);
  });
});

describe("Avatar", () => {
  it("renders the photo with the name as alt text", () => {
    render(<Avatar src="https://example.test/p.jpg" name="Pinak Kundu" />);
    expect(screen.getByAltText("Pinak Kundu")).toHaveAttribute(
      "src",
      "https://example.test/p.jpg",
    );
  });

  it("falls back to up to two initials when there is no photo", () => {
    render(<Avatar name="Pinak Kundu" />);
    expect(screen.getByRole("img", { name: "Pinak Kundu" })).toHaveTextContent("PK");
  });

  it("renders the green presence dot only when asked (§2.9)", () => {
    const { container, rerender } = render(<Avatar name="Pinak Kundu" />);
    expect(container.querySelector(".bg-zm-success")).toBeNull();

    rerender(<Avatar name="Pinak Kundu" presence />);
    expect(container.querySelector(".bg-zm-success")).not.toBeNull();
  });
});

describe("Banner", () => {
  it("uses the blue-bordered info variant by default (OBSERVED §4)", () => {
    render(
      <Banner>
        You haven&apos;t connected your calendar yet. <BannerLink>Connect now</BannerLink>
      </Banner>,
    );

    const banner = screen.getByRole("status");
    expect(banner.className).toContain("border-zm-blue-500");
    expect(screen.getByRole("button", { name: "Connect now" })).toBeInTheDocument();
  });

  it("swaps to the amber tokens for the warning variant (§2.11)", () => {
    render(<Banner variant="warning">You have reached your plan limit.</Banner>);

    const banner = screen.getByRole("status");
    expect(banner.className).toContain("border-zm-warn-border");
    expect(banner.className).toContain("bg-zm-warn-bg");
  });

  it("renders a labelled dismiss control only when onDismiss is supplied", async () => {
    const { rerender } = render(<Banner>Heads up</Banner>);
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();

    let dismissed = false;
    rerender(<Banner onDismiss={() => (dismissed = true)}>Heads up</Banner>);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismissed).toBe(true);
  });
});

describe("Spinner", () => {
  it("announces itself with role=status and a default label", () => {
    render(<Spinner />);
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("uses blue on the light card and white on the dark joining state (OBSERVED §6)", () => {
    const { rerender } = render(<Spinner label="Loading page" />);
    expect(screen.getByRole("status").className).toContain("border-zm-blue-600");

    rerender(<Spinner tone="light" label="Joining meeting" />);
    expect(screen.getByRole("status").className).toContain("border-white");
  });
});
