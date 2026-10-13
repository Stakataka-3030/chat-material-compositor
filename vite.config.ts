import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  root: "web",
  plugins: [react()],
  build: { outDir: "../dist/client", emptyOutDir: true, target: "chrome110" },
  server: { host: "127.0.0.1" },
});
