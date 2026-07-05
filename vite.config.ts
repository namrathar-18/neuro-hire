import { defineConfig } from "vite";
import { fileURLToPath } from "node:url";
import path from "node:path";
import tsConfigPaths from "vite-tsconfig-paths";
import tailwindcss from "@tailwindcss/vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";

const srcDir = path.resolve(fileURLToPath(new URL(".", import.meta.url)), "src");

export default defineConfig({
  server: {
    port: 8080,
  },
  resolve: {
    alias: {
      "@": srcDir,
    },
  },
  plugins: [
    tsConfigPaths(),
    tailwindcss(),
    tanstackStart({ customViteReactPlugin: true }),
    viteReact(),
  ],
});
