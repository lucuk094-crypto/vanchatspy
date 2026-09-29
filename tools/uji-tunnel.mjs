/* uji-tunnel.mjs — memastikan link tunnel melayani seluruh berkas & API.
 * Sandbox ini sesekali menyimpan cache DNS negatif untuk hostname tunnel yang
 * baru dibuat, jadi host diarahkan langsung ke IP Cloudflare (tidak mengubah
 * apa pun di sisi pengguna — dari HP/PC kamu, DNS normal sudah benar).
 *
 *   node /tmp/uji-tunnel.mjs https://xxxx.trycloudflare.com 104.16.231.132
 */
import { createRequire } from 'node:module';
/* Puppeteer dipakai untuk uji di browser sungguhan.
   Di komputer sendiri cukup:  npm i puppeteer   (di folder proyek).
   Di sandbox uji, puppeteer bisa ada di /tmp/u — lewat PUPPETEER_DIR. */
const PUPPETEER_DIR = process.env.PUPPETEER_DIR || '/tmp/u';
const puppeteer = (() => {
  const kandidat = [createRequire(import.meta.url), createRequire(PUPPETEER_DIR + '/package.json')];
  for (const r of kandidat) { try { return r('puppeteer'); } catch (e) {} }
  console.error('Puppeteer tidak ditemukan. Pasang dulu:  npm i puppeteer   (di folder proyek ini)');
  process.exit(2);
})();

const URL_TUNNEL = process.argv[2];
const IP = process.argv[3];
const HOST = new URL(URL_TUNNEL).hostname;

const browser = await puppeteer.launch({
  headless: true,
  /* jalur Chrome bisa berbeda setelah sandbox dipulihkan → ambil yang ada */
  executablePath: process.env.CHROME || (() => {
    const fs0 = require('node:fs');
    const akar = '/tmp/pcache/chrome';
    if (!fs0.existsSync(akar)) return undefined;
    const versi = fs0.readdirSync(akar)[0];
    return akar + '/' + versi + '/chrome-linux64/chrome';
  })(),
  args: ['--no-sandbox', '--disable-dev-shm-usage', `--host-resolver-rules=MAP ${HOST} ${IP}`, '--lang=id-ID'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1440, height: 900 });
const galat = [];
page.on('pageerror', (e) => galat.push('pageerror: ' + e.message));

await page.goto(URL_TUNNEL, { waitUntil: 'networkidle2', timeout: 60000 });
await page.evaluate(() => localStorage.clear());
await page.reload({ waitUntil: 'networkidle2', timeout: 60000 });
await new Promise((r) => setTimeout(r, 1500));

const hasil = await page.evaluate(() => ({
  judul: document.title,
  logoMerek: (document.querySelector('.brand-mk') || {}).naturalWidth > 0,
  logoSambutan: (document.querySelector('.hero-ic img') || {}).naturalWidth > 0,
  ikon: document.querySelectorAll('svg.ic').length,
  status: document.querySelector('#statTx').textContent.trim(),
  kelasStatus: document.querySelector('#stat').className,
}));
console.log('judul            :', hasil.judul);
console.log('logo termuat     : merek', hasil.logoMerek, '· papan sambutan', hasil.logoSambutan);
console.log('ikon SVG         :', hasil.ikon);
console.log('status server    :', hasil.status, '(' + hasil.kelasStatus + ')');
console.log('galat JS         :', galat.length ? galat.join(' | ') : 'tidak ada');
await page.screenshot({ path: '/home/user/van-chat-spy/bukti-uji/20-tunnel.png' });
await browser.close();
process.exit(galat.length ? 1 : 0);
