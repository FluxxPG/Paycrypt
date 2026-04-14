import type { Config } from "tailwindcss";

export default {
  darkMode: ["class"],
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "rgba(15, 23, 42, 0.72)",
        stroke: "rgba(148, 163, 184, 0.18)"
      },
      boxShadow: {
        glow: "0 0 40px rgba(59, 130, 246, 0.18)"
      },
      backgroundImage: {
        "hero-grid":
          "radial-gradient(circle at 10% 20%, rgba(56,189,248,.22), transparent 25%), radial-gradient(circle at 85% 15%, rgba(168,85,247,.20), transparent 30%), radial-gradient(circle at 50% 80%, rgba(59,130,246,.16), transparent 24%)"
      }
    }
  },
  plugins: []
} satisfies Config;
