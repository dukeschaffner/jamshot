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

// Build with esbuild
esbuild.buildSync({
    entryPoints: [ENTRY],
    bundle: true,
    platform: "node",
    target: "node22",
    format: "esm",
    outfile: path.join(DIST, "index.mjs"),
    packages: "external",
    external: ['!@sterio/*'],
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

// Install production deps in dist
execSync("npm install --production --omit=dev", { cwd: DIST, stdio: "inherit" });

console.log("✅ Build complete!");
