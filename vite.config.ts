import path from "path"
import tailwindcss from "@tailwindcss/vite"
import react from "@vitejs/plugin-react"
import { defineConfig, loadEnv } from "vite"

// https://vite.dev/config/
export default defineConfig(({ command, mode }) => {
  const env = { ...loadEnv(mode, process.cwd(), 'VITE_'), ...process.env };
  if (command === 'build' && !/^pk_(live|test)_[A-Za-z0-9]+$/.test(env.VITE_STRIPE_PUBLISHABLE_KEY || '')) {
    throw new Error('VITE_STRIPE_PUBLISHABLE_KEY is required to build a web checkout. Configure the matching Stripe publishable key in the build environment.');
  }
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
  };
});