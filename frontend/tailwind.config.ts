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
        bg:          "#030B1B",
        surface:     "rgba(14,28,64,0.55)",
        "surface-2": "rgba(22,44,90,0.72)",
        border:      "rgba(255,255,255,0.09)",
        muted:       "#7890B0",
        text:        "#D8E8F6",
        primary: {
          DEFAULT: "#00C896",
          hover:   "#00AA80",
          bg:      "rgba(0,200,150,0.12)",
        },
        success:     "#00C896",
        danger:      "#FF4565",
        "danger-bg": "rgba(255,69,101,0.14)",
        warning:     "#F59E0B",
        info:        "#4A9EFF",
        "info-bg":   "rgba(74,158,255,0.12)",
      },
      fontFamily: {
        sans: ["Inter", "system-ui", "sans-serif"],
        mono: ["JetBrains Mono", "ui-monospace", "monospace"],
      },
      borderRadius: {
        input:  "8px",
        card:   "12px",
        modal:  "16px",
      },
      boxShadow: {
        glass: "0 4px 32px rgba(0,0,0,0.40), inset 0 1px 0 rgba(255,255,255,0.08)",
        glow:  "0 0 24px rgba(0,200,150,0.25)",
        "glow-sm": "0 0 12px rgba(0,200,150,0.18)",
      },
    },
  },
  plugins: [],
};

export default config;
