import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vite";

const here = path.dirname(fileURLToPath(import.meta.url));
const gatewayOrigin = process.env.GATEWAY_ORIGIN ?? "http://127.0.0.1:8040";

export default defineConfig({
  root: here,
  server: {
    host: "127.0.0.1",
    port: 5173,
    strictPort: true,
    proxy: {
      "/api": { target: gatewayOrigin, changeOrigin: true },
      "/health": { target: gatewayOrigin, changeOrigin: true },
      "/ws": { target: gatewayOrigin, ws: true, changeOrigin: true },
    },
  },
  resolve: {
    alias: {
      "@lorien-stack/contracts": path.resolve(
        here,
        "../../packages/contracts/src/index.ts",
      ),
    },
  },
});
