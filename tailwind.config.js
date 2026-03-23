/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./src/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        "bg-base": "#010001",
        "forest-deep": "#1a3a2a",
        "forest-mid": "#2d5a41",
        accent: "#4ade80",
        muted: "#7a9c8a",
        body: "#b0c4b1",
        "off-white": "#E7FFEF",
        mint: "#E7FFEF",
      },
      fontFamily: {
        display: ["'Michroma'", "sans-serif"],
        mono: ["'Space Mono'", "monospace"],
      },
      animation: {
        pulse: "pulse 2s cubic-bezier(0.4, 0, 0.6, 1) infinite",
      },
    },
  },
  plugins: [],
};
