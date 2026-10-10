import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Deploy lên GitHub Pages dạng project page:
// https://tranminhhieulkqn.github.io/my_house/ — cần base path đúng tên repo
// khi build, nhưng vẫn để "/" lúc chạy `vite dev` cho tiện.
export default defineConfig(({ command }) => ({
  base: command === "build" ? "/my_house/" : "/",
  plugins: [react()],
}));
