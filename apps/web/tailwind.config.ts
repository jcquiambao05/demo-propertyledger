import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Natural Limestone & Forest palette matched to the Eagle Cement facility photo
        page: "#F4F6F3",
        surface: "#FFFFFF",
        line: "#DCE3DC",
        ink: "#121D17",
        muted: "#56685E",
        brand: {
          DEFAULT: "#1A472A",
          accent: "#76B82A",
          soft: "#EAF2EC",
          border: "#B7D3BF",
          hover: "#13361F",
        },
        danger: {
          DEFAULT: "#B42318",
          bg: "#FEF3F2",
          dot: "#D92D20",
          border: "#FECDCA",
        },
        warning: {
          DEFAULT: "#B54708",
          bg: "#FFFAEB",
          dot: "#DC8A0E",
          border: "#FEDF89",
        },
        // Unified Limestone & Forest Light Mode tokens for IT Administrator surfaces
        it: {
          page: "#F4F6F3",
          surface: "#FFFFFF",
          line: "#DCE3DC",
          text: "#121D17",
          muted: "#56685E",
          accent: "#1A472A",
          ok: "#1A472A",
          okbg: "#EAF2EC",
          bad: "#B42318",
          badbg: "#FEF3F2",
        },
      },
    },
  },
  plugins: [],
};

export default config;
