import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0b0f14",
        foreground: "#e5e7eb",
        muted: "#94a3b8",
        panel: {
          DEFAULT: "#111827",
          900: "#0f172a",
        },
        border: "#1f2937",
        accent: "#22d3ee",
        success: "#34d399",
        danger: "#fb7185",
      },
      fontFamily: {
        sans: ["var(--font-ibm-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      boxShadow: {
        terminal: "0 0 0 1px rgba(34, 211, 238, 0.15), 0 14px 30px rgba(2, 6, 23, 0.45)",
      },
      backgroundImage: {
        "terminal-grid":
          "linear-gradient(to right, rgba(148,163,184,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(148,163,184,0.06) 1px, transparent 1px)",
      },
      backgroundSize: {
        "terminal-grid": "42px 42px",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
