import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/index.ts"],
  format: ["esm"],
  target: "node18",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  minify: false,
  splitting: false,
  bundle: true,
  treeshake: true,
  shims: false,
  skipNodeModulesBundle: true,
  banner: {
    js: "#!/usr/bin/env node",
  },
});
