import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  return {
    base: env.VITE_BASE_PATH || "/",
    plugins: [react()],
    test: {
      include: ["src/**/*.{test,spec}.{ts,tsx}"],
    },
    build: {
      rollupOptions: {
        output: {
          manualChunks(id) {
            if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
              return "react-vendor";
            }
          },
        },
      },
    },
  };
});
