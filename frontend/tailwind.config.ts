import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
    "./lib/**/*.{js,ts,jsx,tsx,mdx}",
    "./contexts/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        bg:          "#0F172A",
        surface:     "#1E293B",
        "surface-2": "#334155",
        border:      "#334155",
        muted:       "#94A3B8",
        text:        "#F8FAFC",
        primary: {
          DEFAULT: "#059669",
          hover:   "#047857",
          bg:      "#064E3B",
        },
        success:    "#10B981",
        danger:     "#DC2626",
        "danger-bg":"#7F1D1D",
        warning:    "#F59E0B",
        info:       "#3B82F6",
        "info-bg":  "#1E3A5F",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        input:  "6px",
        card:   "10px",
        modal:  "12px",
      },
    },
  },
  plugins: [],
};

export default config;
