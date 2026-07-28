// esbuild.config.mjs
import esbuild from "esbuild";
import fs from "fs";
import path from "path";
import { execSync } from "child_process";

// Directories
const DIST = path.resolve("./dist");
const ENTRY = path.resolve("./index.js");
const PACKAGE_ROOT = path.resolve(".");

/**
 * Resolve the exact installed version from the workspace node_modules
 * (populated by root `npm ci`), walking up from this package.
 * Avoids floating caret ranges when installing into dist/.
 */
const resolveExactVersion = (depName) => {
  let dir = PACKAGE_ROOT;
  while (true) {
    const candidate = path.join(dir, "node_modules", ...depName.split("/"), "package.json");
    if (fs.existsSync(candidate)) {
      return JSON.parse(fs.readFileSync(candidate, "utf-8")).version;
    }
    const parent = path.dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }
  throw new Error(
    `Could not resolve installed version for "${depName}". Run npm ci at the repo root first.`
  );
};

const pinDependencies = (dependencies) => {
  const pinned = {};
  for (const [name, range] of Object.entries(dependencies)) {
    if (name.startsWith("@sterio/") || name.startsWith("@aws-sdk/")) {
      continue;
    }
    const version = resolveExactVersion(name);
    pinned[name] = version;
    if (version !== range) {
      console.log(`Pinning ${name}@${version} (package.json range was ${range})`);
    }
  }
  return pinned;
};

const assertInstalledVersions = (pinnedDependencies) => {
  for (const [name, expected] of Object.entries(pinnedDependencies)) {
    const installedPkgPath = path.join(DIST, "node_modules", ...name.split("/"), "package.json");
    if (!fs.existsSync(installedPkgPath)) {
      throw new Error(`Pinned dependency missing after install: ${name}@${expected}`);
    }
    const installed = JSON.parse(fs.readFileSync(installedPkgPath, "utf-8")).version;
    if (installed !== expected) {
      throw new Error(
        `Pinned dependency version mismatch for ${name}: expected ${expected}, installed ${installed}`
      );
    }
  }
};

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
    external: [
      "prisma",
      "@prisma/client",
      "@prisma/engine",
      "effect",
      "react-dom",
      "drizzle-orm",
      // Add any other Better Auth transitive deps you want to exclude
    ],
    sourcemap: false,
    minify: false,
  });
  
  // Pin exact versions from the workspace install so dist npm install cannot float
  const pkg = JSON.parse(fs.readFileSync("package.json", "utf-8"));
  const pinnedDependencies = pinDependencies(pkg.dependencies);
  const minimalPkg = {
    name: pkg.name,
    version: pkg.version,
    type: pkg.type,
    dependencies: pinnedDependencies,
  };
  fs.writeFileSync(
    path.join(DIST, "package.json"),
    JSON.stringify(minimalPkg, null, 2)
  );

// Install production deps in dist using exact pinned versions (no caret ranges)
execSync("npm install --omit=dev --no-package-lock", { cwd: DIST, stdio: "inherit" });
assertInstalledVersions(pinnedDependencies);

// Remove unwanted transitive dependencies from dist/node_modules
const unwantedDeps = ["prisma", "@prisma", "effect", "react-dom", "drizzle-orm"];
unwantedDeps.forEach(dep => {
  const depPath = path.join(DIST, "node_modules", dep);
  if (fs.existsSync(depPath)) {
    console.log(`Removing ${dep} from dist/node_modules...`);
    fs.rmSync(depPath, { recursive: true, force: true });
  }
});

console.log("✅ Build complete!");
