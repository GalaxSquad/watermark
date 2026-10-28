/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* shadcn CSS-variable-driven tokens (with alpha-value support via color-mix) */
        background: "color-mix(in srgb, var(--background) calc(<alpha-value> * 100%), transparent)",
        foreground: "color-mix(in srgb, var(--foreground) calc(<alpha-value> * 100%), transparent)",
        primary: {
          DEFAULT: "color-mix(in srgb, var(--primary) calc(<alpha-value> * 100%), transparent)",
          foreground: "color-mix(in srgb, var(--primary-foreground) calc(<alpha-value> * 100%), transparent)",
        },
        card: {
          DEFAULT: "color-mix(in srgb, var(--card) calc(<alpha-value> * 100%), transparent)",
          foreground: "color-mix(in srgb, var(--card-foreground) calc(<alpha-value> * 100%), transparent)",
        },
        popover: {
          DEFAULT: "color-mix(in srgb, var(--popover) calc(<alpha-value> * 100%), transparent)",
          foreground: "color-mix(in srgb, var(--popover-foreground) calc(<alpha-value> * 100%), transparent)",
        },
        secondary: {
          DEFAULT: "color-mix(in srgb, var(--secondary) calc(<alpha-value> * 100%), transparent)",
          foreground: "color-mix(in srgb, var(--secondary-foreground) calc(<alpha-value> * 100%), transparent)",
        },
        muted: {
          DEFAULT: "color-mix(in srgb, var(--muted) calc(<alpha-value> * 100%), transparent)",
          foreground: "color-mix(in srgb, var(--muted-foreground) calc(<alpha-value> * 100%), transparent)",
        },
        accent: {
          DEFAULT: "color-mix(in srgb, var(--accent) calc(<alpha-value> * 100%), transparent)",
          foreground: "color-mix(in srgb, var(--accent-foreground) calc(<alpha-value> * 100%), transparent)",
        },
        destructive: {
          DEFAULT: "color-mix(in srgb, var(--destructive) calc(<alpha-value> * 100%), transparent)",
          foreground: "color-mix(in srgb, var(--destructive-foreground) calc(<alpha-value> * 100%), transparent)",
        },
        border: "color-mix(in srgb, var(--border) calc(<alpha-value> * 100%), transparent)",
        input: "color-mix(in srgb, var(--input) calc(<alpha-value> * 100%), transparent)",
        ring: "color-mix(in srgb, var(--ring) calc(<alpha-value> * 100%), transparent)",
        /* Project-specific tokens */
        glass: {
          panel: "var(--glass-panel)",
          sidebar: "rgba(10, 10, 10, 0.4)",
        },
        semantic: {
          cyan: "color-mix(in srgb, var(--semantic-cyan) calc(<alpha-value> * 100%), transparent)",
          purple: "color-mix(in srgb, var(--semantic-purple) calc(<alpha-value> * 100%), transparent)",
          orange: "color-mix(in srgb, var(--semantic-orange) calc(<alpha-value> * 100%), transparent)",
          red: "color-mix(in srgb, var(--semantic-red) calc(<alpha-value> * 100%), transparent)",
        },
        status: {
          healthy: "rgb(var(--status-healthy-rgb) / <alpha-value>)",
          "healthy-foreground": "var(--status-healthy-foreground)",
          rebalancing: "rgb(var(--status-rebalancing-rgb) / <alpha-value>)",
          "rebalancing-foreground": "var(--status-rebalancing-foreground)",
          dead: "rgb(var(--status-dead-rgb) / <alpha-value>)",
          "dead-foreground": "var(--status-dead-foreground)",
          empty: "rgb(var(--status-empty-rgb) / <alpha-value>)",
          "empty-foreground": "var(--status-empty-foreground)",
        },
      },
      fontFamily: {
        display: ["Space Grotesk", "Geist Variable", "Geist", "Inter", "sans-serif"],
        body: ["Geist Variable", "Geist", "Inter", "sans-serif"],
        sans: ["Geist Variable", "Geist", "Inter", "sans-serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
      borderRadius: {
        glass: "16px",
        lg: "var(--radius)",
        md: "calc(var(--radius) - 2px)",
        sm: "calc(var(--radius) - 4px)",
      },
      animation: {
        "pulse-slow": "pulse 3s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [require("tailwindcss-animate")],
};
