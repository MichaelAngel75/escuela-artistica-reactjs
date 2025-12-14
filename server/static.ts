import express, { type Express } from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function serveStatic(app: Express) {
  // Your Vite build output is in dist/public (per your ls output)
  const distPath = path.resolve(__dirname, "..", "dist", "public");

  const indexHtml = path.resolve(distPath, "index.html");
  if (!fs.existsSync(indexHtml)) {
    throw new Error(
      `Could not find ${indexHtml}. Run "npm run build" and confirm Vite outputs to dist/public.`,
    );
  }

  app.use(express.static(distPath));

  // SPA fallback
  app.use("*", (_req, res) => {
    res.sendFile(indexHtml);
  });
}
