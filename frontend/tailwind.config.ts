import type { Config } from "tailwindcss";

/**
 * Design tokens. All spacing uses the default 4px scale (4/8/12/16/20/24/32/40/48).
 * Radii are deliberately small so the UI reads as an application, not a marketing page.
 */
const config: Config = {
  content: ["./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      fontFamily: {
        sans: ["var(--font-sans)", "ui-sans-serif", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "monospace"],
      },
      colors: {
        // Surfaces
        canvas: "#f7f8fa",
        surface: "#ffffff",
        raised: "#fbfcfd",
        line: {
          DEFAULT: "#e4e7ec",
          strong: "#d3d8e0",
        },
        // Left navigation (product identity: deep ink-navy, not Slack aubergine)
        nav: {
          bg: "#131a24",
          hover: "#1d2734",
          active: "#1f4f8f",
          border: "#202a37",
          text: "#a9b4c2",
          strong: "#f4f6f8",
          muted: "#6f7d8d",
        },
        brand: {
          50: "#eef4ff",
          100: "#dbe7fe",
          200: "#bfd4fd",
          500: "#2563eb",
          600: "#1d4ed8",
          700: "#1b3fa8",
        },
      },
      fontSize: {
        // Application-scale type ramp
        "2xs": ["11px", { lineHeight: "16px" }],
        xs: ["12px", { lineHeight: "18px" }],
        sm: ["13px", { lineHeight: "20px" }],
        base: ["14px", { lineHeight: "21px" }],
        md: ["15px", { lineHeight: "22px" }],
        lg: ["17px", { lineHeight: "24px" }],
        xl: ["20px", { lineHeight: "28px" }],
      },
      borderRadius: {
        sm: "4px",
        DEFAULT: "6px",
        md: "6px",
        lg: "8px",
        xl: "10px",
      },
      boxShadow: {
        xs: "0 1px 1px rgba(16, 24, 40, 0.04)",
        sm: "0 1px 2px rgba(16, 24, 40, 0.06)",
        card: "0 1px 2px rgba(16, 24, 40, 0.05)",
        popover:
          "0 4px 12px rgba(16, 24, 40, 0.10), 0 1px 3px rgba(16, 24, 40, 0.08)",
        modal: "0 16px 48px rgba(16, 24, 40, 0.18)",
      },
      height: {
        // Consistent component heights
        control: "34px",
        "control-sm": "28px",
        "control-lg": "38px",
        row: "32px",
        header: "56px",
      },
      letterSpacing: {
        tightish: "-0.01em",
        wideish: "0.04em",
      },
      transitionDuration: {
        DEFAULT: "150ms",
      },
      screens: {
        xs: "480px",
        "3xl": "1800px",
      },
    },
  },
  plugins: [],
};

export default config;
