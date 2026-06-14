import type { Config } from "tailwindcss";

// Design tokens from the LedgerLLC spec's design system.
const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "#1a56db", // professional blue — trust, finance
          accent: "#0ea5e9", // sky blue — action states
        },
        success: "#16a34a",
        warning: "#d97706",
        danger: "#dc2626",
        surface: "#ffffff",
        canvas: "#f8fafc",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
