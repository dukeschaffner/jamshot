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

// Define externals
const externals = [
  "@aws-sdk/*",
  "pg",
  "sharp",
  "music-metadata",
  "bcryptjs",
  "express",
  "hono",
  "@hono/node-server",
  "@codegenie/serverless-express",
  "nodemailer",
  "multer",
  "cors",
  "express-rate-limit",
  "express-slow-down",
  "jsonwebtoken",
  "cookie-parser",
  "axios",
  "better-auth",
  "stripe",
];

// Build with esbuild
esbuild.buildSync({
  entryPoints: [ENTRY],
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  outfile: path.join(DIST, "index.mjs"),
  external: externals,
  sourcemap: false,
  minify: false,
});

// Copy only required fields to package.json
const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
const minimalPkg = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  dependencies: pkg.dependencies,
};
fs.writeFileSync(
  path.join(DIST, "package.json"),
  JSON.stringify(minimalPkg, null, 2)
);

// Install production deps in dist
execSync("npm install --production --omit=dev", { cwd: DIST, stdio: "inherit" });

console.log("✅ Build complete!");
