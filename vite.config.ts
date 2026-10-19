import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";

const documentDir = fileURLToPath(new URL("./document", import.meta.url));
const virtualId = "virtual:doc-categories";
const resolvedId = "\0" + virtualId;
const categoriesPlugin = (): Plugin => ({
  name: "document-categories",
  resolveId(id) {
    if (id === virtualId) return resolvedId;
  },
  load(id) {
    if (id !== resolvedId) return;
    const categories = fs
      .readdirSync(documentDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && !entry.name.startsWith("."))
      .map((entry) => entry.name)
      .sort();
    return `export const categories = ${JSON.stringify(categories)}`;
  },
  configureServer(server) {
    server.watcher.add(documentDir);
    const reload = (file: string) => {
      if (
        !file
          .replaceAll("\\", "/")
          .startsWith(documentDir.replaceAll("\\", "/"))
      )
        return;
      const module = server.moduleGraph.getModuleById(resolvedId);
      if (module) void server.reloadModule(module);
    };
    server.watcher.on("addDir", reload);
    server.watcher.on("unlinkDir", reload);
  },
});

export default defineConfig({
  plugins: [react(), categoriesPlugin()],
  base: "./",
  server: { host: "127.0.0.1", port: 5174, strictPort: true },
  preview: { host: "127.0.0.1", port: 5174, strictPort: true },
  build: { chunkSizeWarningLimit: 700 },
});
