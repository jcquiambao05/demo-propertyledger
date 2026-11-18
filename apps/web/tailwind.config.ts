import type { Config } from "tailwindcss";

// Design tokens: docs/demo/DEMO_PAGES.md §1 (light theme; IT uses the dark-blue set).
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        page: "#F6F7F9",
        surface: "#FFFFFF",
        line: "#E4E7EB",
        ink: "#1F2933",
        muted: "#6B7280",
        brand: { DEFAULT: "#1F5C3B", soft: "#EEF4F0" },
        danger: { DEFAULT: "#B42318", bg: "#FEF3F2", dot: "#D92D20" },
        warning: { DEFAULT: "#B54708", bg: "#FFFAEB", dot: "#DC8A0E" },
        it: { page: "#0F1B2D", surface: "#13223A", line: "#22344F", text: "#DCE4EF", muted: "#8EA0BA", accent: "#3D6FD8", ok: "#7BD3A8", okbg: "#14342B", bad: "#F4A39A", badbg: "#3A1D22" },
      },
    },
  },
  plugins: [],
};
export default config;
