/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./App.{js,jsx,ts,tsx}", "./src/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        ink: "#1C1C1E",
        muted: "#6E6E73",
        line: "#ECECEF",
        canvas: "#FFFFFF",
        soft: "#F7F7F9",
        accent: "#FF3F6C",
        success: "#178A54",
        sale: "#E53935",
        gold: "#B58A42"
      },
      borderRadius: { card: "10px", sheet: "24px" },
      boxShadow: { boutique: "0 6px 18px rgba(28,28,30,0.08)" }
    }
  },
  plugins: [],
};
