/* cek-ikon.mjs — memastikan setiap nama ikon yang dipakai index.html & app.js
 * benar-benar ada di assets/icons.js (mencegah kotak kosong di antarmuka).
 *   node tools/cek-ikon.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const w = { IC: null };
global.window = w;
global.document = { addEventListener() {}, querySelectorAll() { return []; }, readyState: 'complete' };
new Function('window', 'document', fs.readFileSync(path.join(AKAR, 'assets/icons.js'), 'utf8'))(w, global.document);

const ada = new Set(w.IC.daftar);
const dipakai = new Set();
const teks = fs.readFileSync(path.join(AKAR, 'index.html'), 'utf8') + '\n' + fs.readFileSync(path.join(AKAR, 'assets/app.js'), 'utf8');
for (const m of teks.matchAll(/data-ic=["']([a-z0-9-]+)/g)) dipakai.add(m[1]);
for (const m of teks.matchAll(/ic\(['"]([a-z0-9-]+)/g)) dipakai.add(m[1]);

const kurang = [...dipakai].filter((n) => !ada.has(n));
console.log(`ikon tersedia : ${ada.size}`);
console.log(`ikon dipakai  : ${dipakai.size}`);
console.log(`tidak ada     : ${kurang.join(', ') || '— tidak ada —'}`);
process.exit(kurang.length ? 1 : 0);
