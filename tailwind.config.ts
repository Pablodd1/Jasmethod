import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
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
      },
      fontFamily: {
        display: ["var(--font-display)", "system-ui"],
        body: ["var(--font-body)", "system-ui"],
      },
    },
  },
  plugins: [],
};

export default config;
