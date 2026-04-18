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
        "gold-bright":  "var(--color-gold-bright)",
        forest:         "var(--color-forest)",
      },
      borderColor: {
        rule:          "var(--rule)",
        "rule-strong": "var(--rule-strong)",
      },
      fontFamily: {
        display: ["var(--font-display)", "serif"],
        mono:    ["var(--font-mono)", "monospace"],
      },
      fontSize: {
        "display-1": ["92px", { lineHeight: "0.93", letterSpacing: "-0.032em" }],
        "display-2": ["48px", { lineHeight: "1.02", letterSpacing: "-0.028em" }],
        "display-3": ["62px", { lineHeight: "1.02", letterSpacing: "-0.028em" }],
        brand:       ["22px", { lineHeight: "1.1" }],
        price:       ["22px", { lineHeight: "1" }],
        product:     ["15px", { lineHeight: "1.4" }],
        body:        ["17px", { lineHeight: "1.65" }],
        label:       ["11px", { lineHeight: "1.2", letterSpacing: "0.22em" }],
        "label-sm":  ["10px", { lineHeight: "1.2", letterSpacing: "0.26em" }],
        numeral:     ["36px", { lineHeight: "1" }],
      },
      letterSpacing: {
        accent:        "-0.02em",
        label:         "0.22em",
        "label-tight": "0.18em",
        "label-wide":  "0.26em",
      },
      transitionTimingFunction: {
        "out-expo": "cubic-bezier(0.2, 0.8, 0.2, 1)",
        smooth:     "cubic-bezier(0.6, 0, 0.3, 1)",
      },
      maxWidth: {
        content: "1280px",
      },
    },
  },
  plugins: [],
};
export default config;
