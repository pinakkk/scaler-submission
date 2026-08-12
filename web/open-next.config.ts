import { defineCloudflareConfig } from "@opennextjs/cloudflare";

// BLUEPRINT §12.1 — default Cloudflare adapter. Incremental cache and tag
// cache stay on the defaults for this submission; the app has no ISR surface.
export default defineCloudflareConfig();
