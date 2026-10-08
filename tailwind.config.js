/** @type {import('tailwindcss').Config} */
const config = {
  content: [
    "./src/modules/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      colors: {
        icam: {
          900: "#1E2A56",
          800: "#2B3668",
          gold: "#B89660",
          "gold-hover": "#A0824F",
        },
        page: "#F5F5F5",
        card: "#FFFFFF",
        subtle: "#EAEBEE",
        "text-primary": "#1E2A56",
        "text-body": "#2C2C2C",
        "text-muted": "#6E6E6E",
      },
      fontFamily: {
        sans: ["var(--font-inter)", "system-ui", "sans-serif"],
      },
    },
  },
  plugins: [],
};

module.exports = config;
