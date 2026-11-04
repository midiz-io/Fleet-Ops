import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import runtimeErrorOverlay from "@replit/vite-plugin-runtime-error-modal";
import { VitePWA } from "vite-plugin-pwa";
const rawPort = process.env.PORT || "5173";

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

const basePath = process.env.BASE_PATH || "/";

export default defineConfig({
  base: basePath,
  plugins: [
    react(),
    tailwindcss(),
    runtimeErrorOverlay(),
    {
      name: 'export-fuel-dev-middleware',
      configureServer(server) {
        server.middlewares.use(async (req, res, next) => {
          if (req.url && req.url.startsWith('/api/export-fuel')) {
            try {
              const exportHandler = (await import('./api/export-fuel.js')).default;
              const parsedUrl = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
              const query = Object.fromEntries(parsedUrl.searchParams.entries());
              const fakeReq = { query };
              const fakeRes = {
                statusCode: 200,
                setHeader(name: string, value: string) {
                  res.setHeader(name, value);
                },
                status(code: number) {
                  this.statusCode = code;
                  res.statusCode = code;
                  return this;
                },
                send(body: string) {
                  res.end(body);
                },
              };
              await exportHandler(fakeReq, fakeRes);
            } catch (err: any) {
              console.error('Export fuel middleware error:', err);
              res.statusCode = 500;
              res.end('Export error: ' + (err?.message || 'Server error'));
            }
          } else {
            next();
          }
        });
      },
    },
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.png', 'pwa-192x192.png', 'pwa-512x512.png', 'sw-push.js'],
      workbox: {
        importScripts: ['/sw-push.js'],
        navigateFallbackDenylist: [/^\/api\//],
      },
      manifest: {
        id: '/',
        start_url: '/',
        name: 'Vehicle Maintenance Fleet App',
        short_name: 'Fleet App',
        description: 'Manage vehicle maintenance, fuel, repairs, and schedule.',
        theme_color: '#ffffff',
        background_color: '#ffffff',
        display: 'standalone',
        icons: [
          {
            src: 'pwa-192x192.png',
            sizes: '192x192',
            type: 'image/png'
          },
          {
            src: 'pwa-512x512.png',
            sizes: '512x512',
            type: 'image/png'
          }
        ]
      },
      devOptions: {
        enabled: true
      }
    }),
    ...(process.env.NODE_ENV !== "production" &&
    process.env.REPL_ID !== undefined
      ? [
          await import("@replit/vite-plugin-cartographer").then((m) =>
            m.cartographer({
              root: path.resolve(import.meta.dirname, ".."),
            }),
          ),
          await import("@replit/vite-plugin-dev-banner").then((m) =>
            m.devBanner(),
          ),
        ]
      : []),
  ],
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "src"),
      "@assets": path.resolve(import.meta.dirname, "..", "..", "attached_assets"),
    },
    dedupe: ["react", "react-dom"],
  },
  root: path.resolve(import.meta.dirname),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
  },
  server: {
    port,
    strictPort: true,
    host: "0.0.0.0",
    allowedHosts: true,
    fs: {
      strict: true,
    },
  },
  preview: {
    port,
    host: "0.0.0.0",
    allowedHosts: true,
  },
});
