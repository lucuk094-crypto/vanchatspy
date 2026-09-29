/*
 * uji-domain.mjs — menguji tools/cek-domain-9router.mjs memakai 9Router tiruan
 * (tanpa perlu domain/Cloudflare sungguhan). Yang diperiksa:
 *   1. kunci diwajibkan → tanpa kunci 401, dengan kunci 200 + daftar model
 *   2. alamat mati → dilaporkan tidak bisa dijangkau (bukan pura-pura baik)
 *   3. indikasi CGNAT: IP WAN privat/CGNAT vs IP publik → peringatan tegas
 *   4. IP WAN sama dengan IP publik → dinyatakan siap
 *
 *   node tools/uji-domain.mjs
 */
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const catatan = [];
const tulis = (s) => { console.log(s); catatan.push(s); };
let gagal = 0;
const cek = (nama, benar, ket) => {
  tulis((benar ? '  ✓ ' : '  ✗ ') + nama + (ket ? ' — ' + ket : ''));
  if (!benar) gagal++;
};

const proses = [];
const jalankanAnak = (berkas, argv) => new Promise((selesai) => {
  const p = spawn('node', [path.join(AKAR, berkas), ...argv], { cwd: AKAR });
  proses.push(p);
  let keluaran = '';
  p.stdout.on('data', (d) => { keluaran += d; });
  p.stderr.on('data', (d) => { keluaran += d; });
  p.on('close', (kode) => selesai({ kode, keluaran }));
});
const tunggu = (ms) => new Promise((r) => setTimeout(r, ms));

try {
  tulis('══ uji pemeriksa alamat publik 9Router ══');
  const router = spawn('node', [path.join(AKAR, 'tools', 'mock-9router.mjs'), '--port', '20131', '--butuh-kunci', 'kunci-domain'], { cwd: AKAR, stdio: 'ignore' });
  proses.push(router);
  await tunggu(1200);

  /* 1. wajib kunci */
  const a = await jalankanAnak('tools/cek-domain-9router.mjs', ['--domain', '127.0.0.1', '--port', '20131', '--key', 'kunci-domain']);
  tulis(a.keluaran.trim().split('\n').filter((b) => /^\s*[✓✗]/.test(b)).join('\n'));
  cek('tanpa kunci → 401 dianggap benar (kunci aktif)', /kunci memang diwajibkan \(401\/403\)/.test(a.keluaran) || /✓ kunci memang diwajibkan/.test(a.keluaran));
  cek('dengan kunci → 200 + daftar model', /✓ dengan kunci → 200 \+ daftar model/.test(a.keluaran));
  cek('mencetak nilai env untuk Vercel', /AI_BASE_URL = http:\/\/127\.0\.0\.1:20131\/v1/.test(a.keluaran));
  cek('seluruh pemeriksaan lolos', a.kode === 0, 'keluar ' + a.kode);

  /* 2. alamat mati → jujur */
  const b = await jalankanAnak('tools/cek-domain-9router.mjs', ['--domain', '127.0.0.1', '--port', '20999', '--key', 'x']);
  cek('alamat mati → dilaporkan tidak bisa dijangkau', /✗ alamat bisa dijangkau/.test(b.keluaran) && b.kode === 1);

  /* 3. CGNAT: WAN privat vs IP publik */
  const c = await jalankanAnak('tools/cek-domain-9router.mjs', ['--domain', '127.0.0.1', '--port', '20131', '--key', 'kunci-domain', '--wan', '100.64.1.5', '--publik', '36.73.1.9']);
  tulis('   baris CGNAT: ' + (c.keluaran.split('\n').find((l) => /CGNAT/.test(l)) || '(tidak ada)').trim());
  cek('WAN di rentang CGNAT → diberi peringatan tegas', /port forward TIDAK akan jalan/.test(c.keluaran));

  /* 4. WAN sama dengan publik → siap */
  const d = await jalankanAnak('tools/cek-domain-9router.mjs', ['--domain', '127.0.0.1', '--port', '20131', '--key', 'kunci-domain', '--wan', '36.73.1.9', '--publik', '36.73.1.9']);
  cek('WAN = IP publik → dinyatakan siap port forward', /✓ IP WAN router = IP publik/.test(d.keluaran));
} catch (e) {
  gagal++;
  tulis('GAGAL: ' + e.message);
} finally {
  proses.forEach((p) => { try { p.kill('SIGTERM'); } catch (e) {} });
}

const kepala = 'UJI PEMERIKSA ALAMAT PUBLIK (tiruan 9Router)\n' + new Date().toLocaleString('id-ID') + '\n' + '─'.repeat(58) + '\n';
fs.writeFileSync(path.join(AKAR, 'bukti-uji', 'HASIL-UJI-DOMAIN.txt'), kepala + catatan.join('\n') + '\n\n'
  + (gagal ? 'HASIL: GAGAL — ' + gagal + ' pemeriksaan' : 'HASIL: SEMUA LULUS') + '\n');
console.log(gagal ? '\nHASIL: GAGAL — ' + gagal + ' pemeriksaan' : '\nHASIL: SEMUA LULUS');
process.exit(gagal ? 1 : 0);
