import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/demo/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        page: "var(--page)",
        surface: "var(--surface)",
        line: "var(--line)",
        ink: "var(--ink)",
        muted: "var(--muted)",
        brand: { DEFAULT: "var(--brand)", soft: "var(--brand-soft)" },
        danger: {
          fg: "var(--danger-fg)",
          bg: "var(--danger-bg)",
          dot: "var(--danger-dot)",
        },
        warn: {
          fg: "var(--warn-fg)",
          bg: "var(--warn-bg)",
          dot: "var(--warn-dot)",
        },
        pill: { bg: "var(--pill-bg)", fg: "var(--pill-fg)" },
        ok: { fg: "var(--ok-fg)", bg: "var(--ok-bg)" },
      },
    },
  },
  plugins: [],
};
export default config;
