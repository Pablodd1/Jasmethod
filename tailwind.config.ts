import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // App tokens (authenticated dashboard) — kept intact.
        ocean: {
          50: "#eef9ff",
          100: "#d8f1ff",
          200: "#bae8ff",
          300: "#8ad9ff",
          400: "#52c2ff",
          500: "#2aa3f5",
          600: "#1683e0",
          700: "#1468b5",
          800: "#175793",
          900: "#184a78",
          950: "#102f50",
        },
        coral: {
          400: "#ff7a6e",
          500: "#f85a4e",
          600: "#e23a30",
        },
        sand: {
          100: "#fdf6ec",
          200: "#f9ead3",
          300: "#f0d5a8",
        },
        // Editorial sports-science system (public site).
        paper: {
          DEFAULT: "#f7f2e9",
          50: "#fbf8f1",
          100: "#f3eddf",
          200: "#e9dfc9",
        },
        ink: {
          900: "#16120d",
          800: "#221d16",
          700: "#3a3329",
          600: "#4f473c",
          500: "#6b6155",
          400: "#8a7f72",
          300: "#a89d90",
          200: "#c9c0b4",
          100: "#e4ded4",
        },
        vermillion: {
          400: "#e06a4f",
          500: "#c94b31",
          600: "#b03a24",
          700: "#8f2f1e",
        },
      },
      fontFamily: {
        display: ["var(--font-display)", "Georgia", "serif"],
        body: ["var(--font-body)", "system-ui", "sans-serif"],
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "monospace"],
      },
    },
  },
  plugins: [],
};

export default config;
