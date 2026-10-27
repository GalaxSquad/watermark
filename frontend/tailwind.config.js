/** @type {import('tailwindcss').Config} */
export default {
  darkMode: "class",
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        /* shadcn CSS-variable-driven tokens */
        background: "var(--background)",
        foreground: "var(--foreground)",
        primary: {
          DEFAULT: "var(--primary)",
          foreground: "var(--primary-foreground)",
        },
        card: {
          DEFAULT: "var(--card)",
          foreground: "var(--card-foreground)",
        },
        popover: {
          DEFAULT: "var(--popover)",
          foreground: "var(--popover-foreground)",
        },
        secondary: {
          DEFAULT: "var(--secondary)",
          foreground: "var(--secondary-foreground)",
        },
        muted: {
          DEFAULT: "var(--muted)",
          foreground: "var(--muted-foreground)",
        },
        accent: {
          DEFAULT: "var(--accent)",
          foreground: "var(--accent-foreground)",
        },
        destructive: {
          DEFAULT: "var(--destructive)",
          foreground: "var(--destructive-foreground)",
        },
        border: "var(--border)",
        input: "var(--input)",
        ring: "var(--ring)",
        /* Project-specific tokens */
        glass: {
          panel: "var(--glass-panel)",
          sidebar: "rgba(10, 10, 10, 0.4)",
        },
        semantic: {
          cyan: "var(--semantic-cyan)",
          purple: "var(--semantic-purple)",
          orange: "var(--semantic-orange)",
          red: "var(--semantic-red)",
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
