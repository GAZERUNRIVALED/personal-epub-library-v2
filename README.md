# Personal EPUB Library — V2 (lokal + Cloudflare + MiruTime)

Alur: **Import EPUB → Publish to MiruTime → baca lewat MiruTime.** Perpustakaan lokal (IndexedDB, reader, parser) tidak berubah; yang ditambahkan: Worker API, D1, R2, dan source Lua.

## Struktur
- `public/` frontend (Cloudflare Pages). `public/config.js` berisi URL API.
- `worker/index.js` Worker REST API. `migrations/0001_init.sql` skema D1. `wrangler.toml` binding D1 + R2.
- `lua/personal_epub_library.lua` source MiruTime (template; `baseUrl` diisi otomatis saat diunduh dari Worker).

## Penyimpanan
IndexedDB: EPUB asli, cover, progress, pengaturan. D1: `novels` (id, judul, penulis, sinopsis, cover, jumlah chapter, status, tanggal) dan `chapters` (id novel, nomor, judul, rev). R2: `novels/{id}/ch/{n}.html` dan `novels/{id}/asset/{nama}`.
ID novel stabil (diturunkan dari ID buku lokal) → update menimpa, tidak menduplikasi. ID chapter = nomor urut spine.

## Deploy
1. `npm install && npx wrangler login`
2. `npx wrangler d1 create epub-library` → salin `database_id` ke `wrangler.toml`.
3. `npx wrangler r2 bucket create epub-library`
4. `npm run db:migrate`
5. `npx wrangler secret put ADMIN_KEY` (string acak panjang; tidak pernah ada di frontend)
6. `npm run deploy` → catat URL Worker (`https://personal-epub-library-api.<akun>.workers.dev`, HTTPS publik).
7. Isi `window.EPL_API` di `public/config.js` dengan URL Worker, lalu `npm run pages` (atau hubungkan repo ke Cloudflare Pages, output directory `public`).
8. Isi `ALLOWED_ORIGIN` di `wrangler.toml` dengan URL Pages (mis. `https://personal-epub-library.pages.dev`), lalu `npm run deploy` lagi (agar CORS mengizinkan frontend).
9. Buka situs → ⚙ → isi Admin API key → "Simpan & tes".

## Memasang source di MiruTime
Di ⚙ salin URL `https://<worker>/api/source/personal_epub_library.lua` (atau unduh file `.lua`), lalu tambahkan ke MiruTime sesuai cara aplikasi menerima source. Jangan memakai file `lua/…` mentah dari ZIP: `baseUrl`-nya masih placeholder. Worker menolak memberi source lewat HTTP non-HTTPS.

## Status publikasi
Local Only · Publishing · Published · Updating · Failed. Upload bertahap per batch (≤40 chapter / ≈1,2 MB), gambar diunggah sebelum chapter yang memakainya. Jika terputus, status Failed bertahan setelah refresh; **Retry Failed Upload** melanjutkan hanya chapter yang belum terunggah (dilacak per `rev` di D1). Novel baru baru tampil di API publik setelah commit sukses. Unpublish menghapus semua data novel di D1 dan R2.

## API
JSON (Content-Type `application/json`, error juga JSON dengan status HTTP sesuai):
- `GET /api/novels?page&size` · `GET /api/search?keyword=&page&size` → `{items,total,page,size,hasNext}`
- `GET /api/novel/{id}` → `{id,title,author,synopsis,cover,chapterCount,publishedAt,updatedAt}`
- `GET /api/novel/{id}/chapters?page&size` (default 1000, maks 2000) → `{novelId,items:[{id,title}],total,page,size,hasNext}`
- `GET /api/novel/{id}/chapter/{n}` → `{id,novelId,title,prev,next,html}`
- `GET /api/asset/{id}/{nama}` (hanya untuk novel published)
Admin (`Authorization: Bearer ADMIN_KEY`): `POST …/begin`, `POST …/chapters`, `PUT …/asset/{nama}`, `POST …/commit`, `DELETE /api/admin/novel/{id}`.

## Kenapa source Lua memakai /api/source/* (HTML), bukan JSON
File referensi `botaodz2.lua` hanya membuktikan fungsi untuk HTML (`http_get` → `r.body`, `html_select`, `html_attr`, …). **Tidak ada fungsi decode JSON yang terbukti** di runtime, dan saya tidak menebaknya. Maka source memanggil endpoint `GET /api/source/list`, `/api/source/novel/{id}`, `/api/source/novel/{id}/chapter/{n}` — endpoint API nyata di Worker (bukan halaman situs, tanpa `/category/all/`) yang mengembalikan HTML dengan struktur yang sama seperti referensi. Jika Anda punya source MiruTime yang berhasil memakai JSON, kirim agar saya pindahkan ke endpoint `/api/*` di atas.
Contoh respons per operasi: katalog/cari → `<div class="librarylist"><ul><li><a href=".../api/source/novel/ID"><img src=".../api/asset/ID/cover"></a><span class="novelname">Judul</span><div class="info"><span>Novel</span><span>Author: Penulis</span></div><p class="intro">…</p></li></ul></div>`; detail → `<meta property="og:novel:book_name|og:novel:author|og:description|og:image">` + `<div class="hide"><a href=".../chapter/1">Bab 1</a>…</div>`; chapter → `<div id="chaptercontent"><p>…</p></div>`.

## Keamanan dan privasi
Secret hanya di Worker Secret. Endpoint admin selalu butuh key (perbandingan konstan); upload dibatasi (3 MB per request, 1,5 MB per chapter, 8 MB per gambar); input divalidasi; HTML chapter disanitasi di klien dan server. **Novel yang dipublikasikan dapat dibaca siapa pun yang tahu URL API** (tidak ada login pembaca) — jangan publikasikan buku yang harus tetap privat. Source tidak mencoba melewati proteksi SSRF MiruTime: gunakan hanya URL HTTPS publik (bukan localhost/IP privat). Error `SsrfBlocked` biasanya berarti `baseUrl` mengarah ke host yang ditolak; error 404 berarti path tidak ada di API.

## Status pengujian (jujur)
Dijalankan: sintaks semua JS; 43 tes Worker dengan SQLite nyata (D1 tiruan) + R2 tiruan: auth, publish bertahap, resume/retry, update tanpa duplikat, hapus chapter usang, katalog/cari (termasuk karakter `%` `_`), paging, chapter prev/next, aset, sanitasi, CORS, HTTPS gate, endpoint HTML untuk Lua, 413/415/404/405 JSON, unpublish.
**Belum dijalankan:** frontend di browser, EPUB nyata (Legado/standar), 6.852 chapter, D1/R2 Cloudflare sungguhan, dan source Lua di MiruTime (tidak ada runtime Lua di sini; kesesuaian hanya berdasar `botaodz2.lua`).
Hal yang tidak bisa dipastikan: nilai `language = "id"`, `standardTransforms` untuk bahasa "id" (dibungkus `pcall`), gambar di chapter kemungkinan tidak tampil karena source mengembalikan teks, dan `getBookStatus` sengaja `nil`.

## Batas
JSZip memuat seluruh EPUB ke memori saat publish/baca (EPUB sangat besar bisa berat di Android lama). Daftar chapter source dikirim sebagai satu halaman (`totalPages=1`) karena semantik `page` di `parsePage` belum terbukti.
