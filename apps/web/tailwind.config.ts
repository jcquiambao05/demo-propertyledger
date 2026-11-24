import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      colors: {
        // Dynamic CSS-variable-driven theme tokens (6 total themes supported)
        page: "var(--epl-page)",
        surface: "var(--epl-surface)",
        "surface-muted": "var(--epl-surface-muted)",
        line: "var(--epl-line)",
        ink: "var(--epl-ink)",
        muted: "var(--epl-muted)",
        brand: {
          DEFAULT: "var(--epl-brand-text)",
          fill: "var(--epl-brand)",
          fg: "var(--epl-brand-fg)",
          accent: "var(--epl-brand-accent)",
          soft: "var(--epl-brand-soft)",
          "soft-fg": "var(--epl-brand-soft-fg)",
          border: "var(--epl-brand-border)",
          hover: "var(--epl-brand-hover)",
        },
        danger: {
          DEFAULT: "var(--epl-danger)",
          bg: "var(--epl-danger-bg)",
          dot: "var(--epl-danger-dot)",
          border: "var(--epl-danger-border)",
        },
        warning: {
          DEFAULT: "var(--epl-warning)",
          bg: "var(--epl-warning-bg)",
          dot: "var(--epl-warning-dot)",
          border: "var(--epl-warning-border)",
        },
        // IT Administrator surfaces follow the active theme tokens seamlessly
        it: {
          page: "var(--epl-page)",
          surface: "var(--epl-surface)",
          line: "var(--epl-line)",
          text: "var(--epl-ink)",
          muted: "var(--epl-muted)",
          accent: "var(--epl-brand-text)",
          ok: "var(--epl-brand-soft-fg)",
          okbg: "var(--epl-brand-soft)",
          bad: "var(--epl-danger)",
          badbg: "var(--epl-danger-bg)",
        },
      },
    },
  },
  plugins: [],
};

export default config;
