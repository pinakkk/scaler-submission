# Web application

Next.js 16/React 19 frontend for the Zoom Workplace clone. It contains the responsive app shell, meeting/scheduling/join flows, Auth.js Google OAuth callback, WebSocket signaling client, WebRTC mesh, and the Cloudflare OpenNext Worker wrapper.

Use the repository root [`README.md`](../README.md) for local setup and [`deployment.md`](../deployment.md) for Cloudflare deployment.

```bash
npm ci
cp .env.example .env.local
npm run dev
```

Validation commands:

```bash
npm run typecheck
npm run typecheck:worker
npm run lint
npm test -- --run
npm run build
npm run cf:build
```
