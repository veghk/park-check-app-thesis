/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          DEFAULT: "#15803d",
          dark: "#14532d",
          light: "#16a34a",
        },
      },
      keyframes: {
        "loading-bar": {
          "0%":   { transform: "translateX(-100%)" },
          "50%":  { transform: "translateX(150%)" },
          "100%": { transform: "translateX(350%)" },
        },
      },
      animation: {
        "loading-bar": "loading-bar 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
};
