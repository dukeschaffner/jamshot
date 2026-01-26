// esbuild.config.mjs
import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Directories
const DIST = path.resolve("./dist");
const ENTRY = path.resolve("./index.js");

// Clean dist
if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

const externalizeDeps = {
  name: 'externalize-deps',
  setup(build) {
    build.onResolve({ filter: /.*/ }, args => {
      // relative & absolute imports → bundle
      if (args.path.startsWith('.') || path.isAbsolute(args.path)) {
        return;
      }

      // internal monorepo packages → bundle
      if (args.path.startsWith('@sterio/')) {
        return;
      }

      // everything else → external
      return { external: true };
    });
  },
};

// Build with esbuild
await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: path.join(DIST, "index.mjs"),
  plugins: [externalizeDeps],
  sourcemap: false,
  minify: false,
});

// Copy only required fields to package.json
const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
const minimalPkg = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  dependencies: Object.fromEntries(
    Object.entries(pkg.dependencies).filter(([key]) =>
      !key.startsWith('@sterio/') && !key.startsWith('@aws-sdk/')
    )
  ),
};
fs.writeFileSync(
  path.join(DIST, "package.json"),
  JSON.stringify(minimalPkg, null, 2)
);

// Copy ffmpeg binary if it exists
const ffmpegPath = path.resolve("./ffmpeg");
if (fs.existsSync(ffmpegPath)) {
  fs.copyFileSync(ffmpegPath, path.join(DIST, "ffmpeg"));
  fs.chmodSync(path.join(DIST, "ffmpeg"), 0o755); // Make executable
  console.log("✅ Copied ffmpeg binary");
}

// Install production deps in dist
execSync("npm install --production --omit=dev", { cwd: DIST, stdio: "inherit" });

console.log("✅ Build complete!");

