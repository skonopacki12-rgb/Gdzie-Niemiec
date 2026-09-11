/**
 * Buduje statyczną wersję aplikacji do katalogu docs/ - tę, którą serwuje
 * GitHub Pages. Całą pracę backendu (pobranie feedu, dekodowanie protobufa,
 * filtrowanie taboru) przejmuje wtedy przeglądarka.
 */
import { cp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'docs');

await rm(out, { recursive: true, force: true });
await mkdir(path.join(out, 'vendor/leaflet'), { recursive: true });

// 1. Warstwa danych: Tracker + dekoder GTFS-RT spakowane do jednego skryptu.
const bundle = await esbuild.build({
  entryPoints: [path.join(root, 'web/static-source.js')],
  bundle: true,
  minify: true,
  format: 'iife',
  target: ['es2022'],
  platform: 'browser',
  outfile: path.join(out, 'data-static.js'),
  metafile: true,
});

// 2. Interfejs jest wspólny z wersją serwerową - kopiujemy go bez zmian.
await cp(path.join(root, 'public/app.js'), path.join(out, 'app.js'));
await cp(path.join(root, 'public/style.css'), path.join(out, 'style.css'));

// 3. Leaflet lokalnie, bez CDN-a.
for (const file of ['leaflet.js', 'leaflet.css']) {
  await cp(path.join(root, 'node_modules/leaflet/dist', file), path.join(out, 'vendor/leaflet', file));
}
await cp(path.join(root, 'node_modules/leaflet/dist/images'), path.join(out, 'vendor/leaflet/images'), {
  recursive: true,
});

// 4. Strona: ścieżki bezwzględne nie zadziałają pod adresem
//    user.github.io/nazwa-repo/, więc zamieniamy je na względne
//    i dokładamy skrypt warstwy danych przed skryptem interfejsu.
let html = await readFile(path.join(root, 'public/index.html'), 'utf8');
html = html
  .replaceAll('href="/', 'href="./')
  .replaceAll('src="/', 'src="./')
  .replace('<script src="./app.js"></script>', '<script src="./data-static.js"></script>\n    <script src="./app.js"></script>');
await writeFile(path.join(out, 'index.html'), html);

// GitHub Pages domyślnie przepuszcza pliki przez Jekyll - to go wyłącza.
await writeFile(path.join(out, '.nojekyll'), '');

const bytes = Object.values(bundle.metafile.outputs)[0].bytes;
console.log(`docs/ zbudowane. Warstwa danych: ${(bytes / 1024).toFixed(0)} kB (spakowana gzipem ~${Math.round(bytes / 3 / 1024)} kB)`);
