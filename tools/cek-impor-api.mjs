/* cek-impor-api.mjs — memastikan SEMUA berkas di api/ bisa diimpor (tidak ada
 * nama ekspor yang salah). Kesalahan seperti ini dulu tidak terlihat karena
 * halaman diuji dengan tiruan (mock); uji ini menangkapnya langsung.
 *
 *   node tools/cek-impor-api.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const map = [];
function jelajah(dir) {
  for (const n of fs.readdirSync(dir)) {
    const p = path.join(dir, n);
    if (fs.statSync(p).isDirectory()) jelajah(p);
    else if (/\.js$/.test(n) && !/^_/.test(n)) map.push(p);
  }
}
jelajah(path.join(AKAR, 'api'));
let gagal = 0;
for (const p of map) {
  const rel = path.relative(AKAR, p);
  try {
    const m = await import(pathToFileURL(p).href);
    const ok = typeof m.default === 'function';
    console.log((ok ? '  ✓ ' : '  ✗ ') + rel + (ok ? ' — handler siap' : ' — tidak ada ekspor default'));
    if (!ok) gagal++;
  } catch (e) {
    gagal++;
    console.log('  ✗ ' + rel + ' — ' + e.message.split('\n')[0]);
  }
}
/* berkas pendukung (_aman, _ai) juga diimpor supaya ekspornya diperiksa */
for (const nama of ['api/_aman.js', 'api/_ai.js']) {
  const p = path.join(AKAR, nama);
  if (!fs.existsSync(p)) continue;
  try { await import(pathToFileURL(p).href); console.log('  ✓ ' + nama + ' — pendukung bisa diimpor'); }
  catch (e) { gagal++; console.log('  ✗ ' + nama + ' — ' + e.message.split('\n')[0]); }
}
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' berkas bermasalah' : '\nHASIL: SEMUA LULUS — ' + map.length + ' endpoint + 2 pendukung');
process.exit(gagal ? 1 : 0);
