import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        ink:            "var(--color-ink)",
        "ink-2":        "var(--color-ink-2)",
        "ink-3":        "var(--color-ink-3)",
        "ink-muted":    "var(--color-ink-muted)",
        paper:          "var(--color-paper)",
        "paper-2":      "var(--color-paper-2)",
        "paper-3":      "var(--color-paper-3)",
        cream:          "var(--color-cream)",
        brand:          "var(--color-brand)",
        "brand-deep":   "var(--color-brand-deep)",
        "brand-darker": "var(--color-brand-darker)",
        accent:         "var(--color-accent)",
        gold:           "var(--color-gold)",
        "gold-bright": "var(--color-gold-bright)",
        forest:         "var(--color-forest)",
      },
      borderColor: {
        rule:          "var(--rule)",
        "rule-strong": "var(--rule-strong)",
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        mono:    ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
      transitionTimingFunction: {
        "out-expo":  "cubic-bezier(0.2, 0.8, 0.2, 1)",
        "smooth":    "cubic-bezier(0.6, 0, 0.3, 1)",
      },
      maxWidth: {
        content: "1280px",
      },
    },
  },
  plugins: [],
};
export default config;
