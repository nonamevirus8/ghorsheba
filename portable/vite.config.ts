import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Standard Vite build: the React client in `client/src` is bundled to
// `dist/`, which Vercel serves as static files. The `api/` folder holds
// the serverless functions (actions RPC + blob serving).
export default defineConfig({
  plugins: [react(), tailwindcss()],
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
});
