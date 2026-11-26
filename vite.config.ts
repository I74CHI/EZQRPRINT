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
            if (/\/node_modules\/@firebase\/firestore\//.test(id) || /\/node_modules\/firebase\/firestore\//.test(id)) {
              return "firebase-firestore";
            }
            if (/\/node_modules\/@firebase\/auth\//.test(id) || /\/node_modules\/firebase\/auth\//.test(id)) {
              return "firebase-auth";
            }
            if (/\/node_modules\/@firebase\/storage\//.test(id) || /\/node_modules\/firebase\/storage\//.test(id)) {
              return "firebase-storage";
            }
            if (/\/node_modules\/@firebase\//.test(id) || /\/node_modules\/firebase\//.test(id)) {
              return "firebase-core";
            }
            if (/\/node_modules\/(react|react-dom|react-router|react-router-dom|scheduler)\//.test(id)) {
              return "react-vendor";
            }
          },
        },
      },
    },
  };
});
