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
          DEFAULT: "#6366f1", // refined indigo
          dark: "#4f46e5", // hover
          accent: "#8b5cf6", // violet accent
          soft: "rgba(99, 102, 241, 0.15)", // translucent brand surface
        },
        success: "#10b981", // emerald
        warning: "#f59e0b", // amber
        danger: "#ef4444", // red
        surface: "var(--surface)",
        canvas: "var(--canvas)",
        line: "var(--line)",
        sidebar: "var(--sidebar-bg)",
        
        // Swapped slate shades to automatically invert dark/light text and backgrounds
        slate: {
          50: "var(--slate-50)",
          100: "var(--slate-100)",
          200: "var(--slate-200)",
          300: "var(--slate-300)",
          400: "var(--slate-400)",
          500: "var(--slate-500)",
          600: "var(--slate-600)",
          700: "var(--slate-700)",
          800: "var(--slate-800)",
          900: "var(--slate-900)",
          950: "var(--slate-950)",
        },
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
        xs: "0 1px 2px 0 rgb(0 0 0 / 0.3)",
        card: "0 4px 20px -2px rgb(0 0 0 / 0.35), 0 2px 8px -1px rgb(0 0 0 / 0.2)",
        elev: "0 20px 25px -5px rgb(0 0 0 / 0.5), 0 8px 10px -6px rgb(0 0 0 / 0.4)",
        pop: "0 25px 50px -12px rgb(0 0 0 / 0.6)",
        glow: "0 0 14px 0 rgba(99, 102, 241, 0.15)",
        "glow-brand": "0 0 16px 0 rgba(99, 102, 241, 0.22)",
      },
      keyframes: {
        "fade-in": {
          from: { opacity: "0" },
          to: { opacity: "1" },
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
