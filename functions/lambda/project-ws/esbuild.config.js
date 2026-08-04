import esbuild from 'esbuild';
import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(__dirname, './dist');
const ENTRY = path.resolve(__dirname, './index.js');

if (fs.existsSync(DIST)) {
  fs.rmSync(DIST, { recursive: true });
}
fs.mkdirSync(DIST, { recursive: true });

const externalizeDeps = {
  name: 'externalize-deps',
  setup(build) {
    build.onResolve({ filter: /.*/ }, (args) => {
      if (args.path.startsWith('.') || path.isAbsolute(args.path)) {
        return;
      }
      if (args.path.startsWith('@sterio/')) {
        return;
      }
      return { external: true };
    });
  },
};

await esbuild.build({
  entryPoints: [ENTRY],
  bundle: true,
  platform: 'node',
  target: 'node22',
  format: 'esm',
  outfile: path.join(DIST, 'index.mjs'),
  plugins: [externalizeDeps],
  external: ['effect', 'react-dom', 'drizzle-orm'],
  sourcemap: false,
  minify: false,
});

const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, 'package.json'), 'utf-8'));
const minimalPkg = {
  name: pkg.name,
  version: pkg.version,
  type: pkg.type,
  dependencies: Object.fromEntries(
    Object.entries(pkg.dependencies).filter(
      ([key]) => !key.startsWith('@sterio/') && !key.startsWith('@aws-sdk/')
    )
  ),
};
fs.writeFileSync(path.join(DIST, 'package.json'), JSON.stringify(minimalPkg, null, 2));

execSync('npm install --production --omit=dev', { cwd: DIST, stdio: 'inherit' });

console.log('✅ Project WS lambda build complete!');
