import { resolve } from "node:path"
import { defineConfig } from "vite"
import dts from "vite-plugin-dts"

export default defineConfig({
  plugins: [
    dts({
      exclude: ["**/*.{test,spec}.*", "tests/**/*", "examples/**/*", "docs/**/*"],
    }),
  ],
  build: {
    lib: {
      entry: resolve(__dirname, "src/index.js"),
      name: "MIDIControls",
      fileName: (format) => `midiwire.${format}.js`,
      formats: ["es", "umd"],
    },
    rollupOptions: {
      output: {
        exports: "named",
      },
    },
  },
  server: {
    open: "/examples/index.html",
  },
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: ["tests/**", "examples/**", "docs/**", "*.config.js", "**/*.test.js", "coverage/**"],
    },
  },
})
