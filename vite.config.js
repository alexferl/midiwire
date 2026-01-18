import { resolve } from "node:path"
import { defineConfig } from "vite"

export default defineConfig({
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
    open: "/examples/basic.html",
  },
  test: {
    environment: "jsdom",
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      reportsDirectory: "./coverage",
      exclude: ["tests/**", "examples/**", "docs/**", "*.config.js", "**/*.test.js", "coverage/**"],
      thresholds: {
        statements: 70,
        branches: 70,
        functions: 70,
        lines: 70,
      },
    },
  },
})
