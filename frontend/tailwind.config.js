/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        bg:       "#0f1117",
        surface:  "#1d3557",
        surface2: "#2d3748",
        rojo:     "#e63946",
        amarillo: "#f4a261",
        verde:    "#57cc99",
        accent:   "#a8dadc",
        text:     "#f1faee",
      },
    },
  },
  plugins: [],
};
