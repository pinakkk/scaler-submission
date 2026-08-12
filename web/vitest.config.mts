import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { fileURLToPath } from "node:url";

// BLUEPRINT §11 — frontend unit tests: formatMeetingId, UI primitive behavior
// (Modal focus trap / Escape, Button variants, controlled Checkbox / Radio),
// and later PeerManager glare handling + SignalingClient reconnect backoff.
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    // jsdom is required by the React Testing Library specs for the
    // `components/ui` primitives; pure-node specs run fine under it too.
    environment: "jsdom",
    setupFiles: ["./vitest.setup.ts"],
    include: ["src/**/*.{test,spec}.{ts,tsx}"],
    globals: true,
  },
});
