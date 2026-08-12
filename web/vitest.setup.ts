import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

// RTL does not auto-clean when `globals: true` is combined with a custom setup
// file, so unmount between specs to keep the jsdom document isolated.
afterEach(() => {
  cleanup();
});
