import type { Config } from "tailwindcss";

// Nexus Ledger design system — refined "premium fintech" tokens.
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
          DEFAULT: "#2563eb", // refined royal blue — trust, finance
          dark: "#1d4ed8", // hover / pressed
          accent: "#0ea5e9", // sky accent
          soft: "#eef4ff", // tinted surfaces
        },
        success: "#15803d",
        warning: "#b45309",
        danger: "#dc2626",
        surface: "#ffffff",
        canvas: "#f5f7fb",
        line: "#e7ecf3", // hairline borders
      },
      fontFamily: {
        sans: ["var(--font-inter)", "ui-sans-serif", "system-ui", "sans-serif"],
      },
      borderRadius: {
        xl: "0.875rem",
        "2xl": "1.125rem",
        "3xl": "1.5rem",
      },
      boxShadow: {
        xs: "0 1px 2px 0 rgb(15 23 42 / 0.05)",
        card: "0 1px 3px rgb(15 23 42 / 0.06), 0 1px 2px -1px rgb(15 23 42 / 0.05)",
        elev: "0 6px 22px -8px rgb(15 23 42 / 0.14), 0 2px 8px -3px rgb(15 23 42 / 0.07)",
        pop: "0 18px 44px -12px rgb(15 23 42 / 0.22), 0 6px 16px -6px rgb(15 23 42 / 0.12)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0", transform: "translateY(6px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
      animation: {
        "fade-in": "fade-in 0.32s cubic-bezier(0.21, 0.6, 0.35, 1) both",
      },
    },
  },
  plugins: [],
};

export default config;
