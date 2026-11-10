import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#FAFAF7",
        foreground: "#1E2326",
        muted: "#6B7276",
        tenue: "#9AA0A3",
        panel: {
          DEFAULT: "#FFFFFF",
          900: "#F3F2EE",
        },
        border: "#E6E4DE",
        accent: {
          DEFAULT: "#1F6E7E",
          line: "#3E9DB0",
          soft: "#E3F1F4",
          head: "#4FA9BB",
        },
        success: "#4F7A4A",
        danger: "#A4473B",
        signal: "#B07A2A",
      },
      fontFamily: {
        sans: ["var(--font-ibm-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-ibm-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};

export default config;
