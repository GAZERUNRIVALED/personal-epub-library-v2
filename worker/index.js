import LUA from '../lua/personal_epub_library.lua';

class E extends Error { constructor(m, s = 400) { super(m); this.s = s } }
const J = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: { 'content-type': 'application/json;charset=utf-8', 'cache-control': 'no-store' } });
const H = (b, s = 200) => new Response(b, { status: s, headers: { 'content-type': 'text/html;charset=utf-8', 'cache-control': 'no-store', 'content-security-policy': "default-src 'none'; img-src * data:; style-src 'unsafe-inline'", 'x-content-type-options': 'nosniff' } });
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const like = s => '%' + String(s).trim().replace(/[\\%_]/g, '\\$&') + '%';
const ID = /^[a-z0-9]{8,32}$/;
const MAX_BODY = 3 * 1024 * 1024, MAX_CH = 1.5 * 1024 * 1024, MAX_ASSET = 8 * 1024 * 1024;
const COLS = 'id,title,author,synopsis,has_cover,chapter_count,published_at,updated_at';
const dto = (r, o) => ({ id: r.id, title: r.title, author: r.author, synopsis: r.synopsis, cover: r.has_cover ? `${o}/api/asset/${r.id}/cover` : null, chapterCount: r.chapter_count, publishedAt: r.published_at, updatedAt: r.updated_at });

const clean = h => String(h)
  .replace(/<(script|style|iframe|object|embed|form|template)\b[\s\S]*?(<\/\1\s*>|$)/gi, '')
  .replace(/<\/?(script|iframe|object|embed|link|meta|base|form)\b[^>]*>/gi, '')
  .replace(/\son[a-z]+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/gi, '')
  .replace(/(href|src)\s*=\s*(["'])\s*(javascript|vbscript):[^"']*\2/gi, '$1=$2$2');

async function authed(req, env) {
  const k = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
  if (!env.ADMIN_KEY || !k) return false;
  const e = new TextEncoder();
  const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', e.encode(k)), crypto.subtle.digest('SHA-256', e.encode(env.ADMIN_KEY))]);
  const x = new Uint8Array(a), y = new Uint8Array(b);
  let d = 0; for (let i = 0; i < 32; i++) d |= x[i] ^ y[i];
  return d === 0;
}
async function readBody(req, max) {
  if (+req.headers.get('content-length') > max) throw new E('Request terlalu besar', 413);
  const b = await req.arrayBuffer();
  if (b.byteLength > max) throw new E('Request terlalu besar', 413);
  return b;
}
async function readJson(req) {
  const b = await readBody(req, MAX_BODY);
  try { const d = JSON.parse(new TextDecoder().decode(b)); if (!d || typeof d !== 'object') throw 0; return d } catch { throw new E('JSON tidak valid') }
}
const pg = (u, def = 20, max = 100) => { const page = Math.max(1, parseInt(u.searchParams.get('page')) || 1), size = Math.min(max, Math.max(1, parseInt(u.searchParams.get('size')) || def)); return { page, size, off: (page - 1) * size } };

function corsHeaders(req, env) {
  const o = req.headers.get('origin'), ok = (env.ALLOWED_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  return o && ok.includes(o) ? { 'access-control-allow-origin': o, vary: 'Origin', 'access-control-allow-methods': 'GET,POST,PUT,DELETE,OPTIONS', 'access-control-allow-headers': 'authorization,content-type', 'access-control-max-age': '86400' } : null;
}

export default {
  async fetch(req, env) {
    const cors = corsHeaders(req, env);
    if (req.method === 'OPTIONS') return new Response(null, { status: cors ? 204 : 403, headers: cors || {} });
    let res;
    try { res = await route(req, env) }
    catch (e) { res = J({ error: e instanceof E ? e.message : 'Internal error' }, e instanceof E ? e.s : 500) }
    if (cors) { res = new Response(res.body, res); for (const [k, v] of Object.entries(cors)) res.headers.set(k, v) }
    return res;
  }
};

async function listNovels(env, q, { size, off }) {
  const w = q ? `AND (title LIKE ? ESCAPE '\\' OR author LIKE ? ESCAPE '\\')` : '', a = q ? [like(q), like(q)] : [];
  const rows = (await env.DB.prepare(`SELECT ${COLS} FROM novels WHERE status='published' ${w} ORDER BY published_at DESC, id LIMIT ? OFFSET ?`).bind(...a, size, off).all()).results;
  const total = (await env.DB.prepare(`SELECT COUNT(*) AS c FROM novels WHERE status='published' ${w}`).bind(...a).first()).c;
  return { rows, total };
}
const getNovel = (env, id) => env.DB.prepare(`SELECT ${COLS} FROM novels WHERE id=? AND status='published'`).bind(id).first();
const fixSrc = (h, o) => h.replaceAll('src="/api/asset/', `src="${o}/api/asset/`);

async function route(req, env) {
  const u = new URL(req.url), p = u.pathname.replace(/\/+$/, '') || '/', o = u.origin, m = req.method;
  if (p === '/') return J({ name: 'Personal EPUB Library API', version: '2.0.0' });
  if (p.startsWith('/api/admin/')) {
    if (!(await authed(req, env))) return J({ error: 'Unauthorized' }, 401);
    return admin(req, env, p.slice(11), m);
  }
  if (m !== 'GET' && m !== 'HEAD') throw new E('Method tidak diizinkan', 405);
  let x;
  if (p === '/api/novels' || p === '/api/search') {
    const q = p === '/api/search' ? (u.searchParams.get('keyword') || '').trim() : '', s = pg(u);
    const { rows, total } = await listNovels(env, q, s);
    return J({ items: rows.map(r => dto(r, o)), total, page: s.page, size: s.size, hasNext: s.off + rows.length < total });
  }
  if ((x = p.match(/^\/api\/novel\/([a-z0-9]+)(?:\/(chapters)|\/chapter\/(\d+))?$/))) {
    const nv = await getNovel(env, x[1]); if (!nv) throw new E('Novel tidak ditemukan', 404);
    if (x[2]) {
      const s = pg(u, 1000, 2000);
      const rows = (await env.DB.prepare('SELECT n,title FROM chapters WHERE novel_id=? AND n<=? ORDER BY n LIMIT ? OFFSET ?').bind(nv.id, nv.chapter_count, s.size, s.off).all()).results;
      return J({ novelId: nv.id, items: rows.map(r => ({ id: r.n, title: r.title })), total: nv.chapter_count, page: s.page, size: s.size, hasNext: s.off + rows.length < nv.chapter_count });
    }
    if (x[3]) {
      const n = +x[3], c = await env.DB.prepare('SELECT n,title FROM chapters WHERE novel_id=? AND n=?').bind(nv.id, n).first();
      const ob = c && n <= nv.chapter_count && await env.BUCKET.get(`novels/${nv.id}/ch/${n}.html`);
      if (!ob) throw new E('Chapter tidak ditemukan', 404);
      return J({ id: n, novelId: nv.id, title: c.title, prev: n > 1 ? n - 1 : null, next: n < nv.chapter_count ? n + 1 : null, html: fixSrc(await ob.text(), o) });
    }
    return J(dto(nv, o));
  }
  if ((x = p.match(/^\/api\/asset\/([a-z0-9]+)\/([\w.-]{1,80})$/))) {
    if (!(await getNovel(env, x[1]))) throw new E('Aset tidak ditemukan', 404);
    const ob = await env.BUCKET.get(`novels/${x[1]}/asset/${x[2]}`); if (!ob) throw new E('Aset tidak ditemukan', 404);
    return new Response(ob.body, { headers: { 'content-type': ob.httpMetadata?.contentType || 'application/octet-stream', 'cache-control': 'public, max-age=3600', 'x-content-type-options': 'nosniff', 'content-security-policy': 'sandbox' } });
  }
  // ---- Endpoint khusus source Lua (HTML, sesuai fungsi yang terbukti di runtime) ----
  if (p === '/api/source/personal_epub_library.lua') {
    if (u.protocol !== 'https:') throw new E('Source hanya diberikan lewat HTTPS (domain publik workers.dev / custom domain).', 400);
    return new Response(LUA.replaceAll('__BASE_URL__', o), { headers: { 'content-type': 'text/plain;charset=utf-8', 'content-disposition': 'inline; filename="personal_epub_library.lua"', 'cache-control': 'no-store' } });
  }
  if (p === '/api/source/list') {
    const s = pg(u), { rows } = await listNovels(env, (u.searchParams.get('q') || '').trim(), s);
    return H(`<!doctype html><meta charset="utf-8"><div class="librarylist"><ul>${rows.map(b => `<li><a href="${o}/api/source/novel/${b.id}">${b.has_cover ? `<img src="${o}/api/asset/${b.id}/cover">` : ''}</a><span class="novelname">${esc(b.title)}</span><div class="info"><span>Novel</span><span>Author: ${esc(b.author)}</span></div><p class="intro">${esc((b.synopsis || '').slice(0, 200))}</p></li>`).join('')}</ul></div>`);
  }
  if ((x = p.match(/^\/api\/source\/novel\/([a-z0-9]+)(?:\/chapter\/(\d+))?$/))) {
    const nv = await getNovel(env, x[1]); if (!nv) throw new E('Novel tidak ditemukan', 404);
    if (!x[2]) {
      const rows = (await env.DB.prepare('SELECT n,title FROM chapters WHERE novel_id=? AND n<=? ORDER BY n').bind(nv.id, nv.chapter_count).all()).results;
      const mt = (k, v) => `<meta property="${k}" content="${esc(v)}">`;
      return H(`<!doctype html><meta charset="utf-8"><title>${esc(nv.title)}</title>${mt('og:novel:book_name', nv.title)}${mt('og:novel:author', nv.author)}${mt('og:description', nv.synopsis || '')}${mt('og:novel:category', 'EPUB')}${nv.has_cover ? mt('og:image', `${o}/api/asset/${nv.id}/cover`) : ''}<div class="hide">${rows.map(c => `<a href="${o}/api/source/novel/${nv.id}/chapter/${c.n}">${esc(c.title)}</a>`).join('')}</div>`);
    }
    const n = +x[2], c = await env.DB.prepare('SELECT n,title FROM chapters WHERE novel_id=? AND n=?').bind(nv.id, n).first();
    const ob = c && n <= nv.chapter_count && await env.BUCKET.get(`novels/${nv.id}/ch/${n}.html`);
    if (!ob) throw new E('Chapter tidak ditemukan', 404);
    return H(`<!doctype html><meta charset="utf-8"><title>${esc(c.title)}</title><div id="chaptercontent">${fixSrc(await ob.text(), o)}</div>`);
  }
  throw new E('Endpoint tidak ditemukan', 404);
}

async function admin(req, env, p, m) {
  let x;
  if (p === 'ping' && m === 'GET') return J({ ok: true });
  if ((x = p.match(/^novel\/([a-z0-9]{8,32})(?:\/(begin|chapters|commit)|\/asset\/([\w.-]{1,80}))?$/))) {
    const id = x[1];
    if (m === 'DELETE' && !x[2] && !x[3]) return unpublish(env, id);
    if (m === 'POST' && x[2] === 'begin') return begin(req, env, id);
    if (m === 'POST' && x[2] === 'chapters') return putChapters(req, env, id);
    if (m === 'POST' && x[2] === 'commit') return commit(req, env, id);
    if (m === 'PUT' && x[3]) return putAsset(req, env, id, x[3]);
  }
  throw new E('Endpoint tidak ditemukan', 404);
}
const rev = d => { if (!Number.isSafeInteger(d.rev) || d.rev < 1) throw new E('rev tidak valid'); return d.rev };
const str = (v, max) => String(v ?? '').trim().slice(0, max);

async function begin(req, env, id) {
  const d = await readJson(req), r = rev(d), title = str(d.title, 300), author = str(d.author, 300) || 'Unknown', syn = str(d.synopsis, 2000), now = Date.now();
  if (!title) throw new E('Judul wajib diisi');
  await env.DB.prepare(`INSERT INTO novels(id,title,author,synopsis,status,created_at,updated_at) VALUES(?,?,?,?,'draft',?,?) ON CONFLICT(id) DO UPDATE SET title=excluded.title,author=excluded.author,synopsis=excluded.synopsis,updated_at=excluded.updated_at`).bind(id, title, author, syn, now, now).run();
  const up = (await env.DB.prepare('SELECT n FROM chapters WHERE novel_id=? AND rev=?').bind(id, r).all()).results.map(x => x.n);
  return J({ ok: true, uploaded: up });
}

async function putChapters(req, env, id) {
  const d = await readJson(req), r = rev(d), a = d.chapters;
  if (!(await env.DB.prepare('SELECT 1 AS x FROM novels WHERE id=?').bind(id).first())) throw new E('Panggil begin terlebih dahulu', 409);
  if (!Array.isArray(a) || !a.length || a.length > 60) throw new E('chapters harus array 1–60 item');
  for (const c of a) if (!Number.isInteger(c.n) || c.n < 1 || c.n > 20000 || typeof c.html !== 'string' || c.html.length > MAX_CH) throw new E(`Chapter tidak valid (n=${c?.n}); maks 1,5 MB per chapter`);
  const html = a.map(c => clean(c.html));
  await Promise.all(a.map((c, i) => env.BUCKET.put(`novels/${id}/ch/${c.n}.html`, html[i], { httpMetadata: { contentType: 'text/html;charset=utf-8' } })));
  await env.DB.batch(a.map((c, i) => env.DB.prepare('INSERT INTO chapters(novel_id,n,title,rev,size) VALUES(?,?,?,?,?) ON CONFLICT(novel_id,n) DO UPDATE SET title=excluded.title,rev=excluded.rev,size=excluded.size').bind(id, c.n, str(c.title, 300) || `Chapter ${c.n}`, r, html[i].length)));
  return J({ ok: true, saved: a.length });
}

async function putAsset(req, env, id, name) {
  if (!(await env.DB.prepare('SELECT 1 AS x FROM novels WHERE id=?').bind(id).first())) throw new E('Panggil begin terlebih dahulu', 409);
  const t = (req.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (!/^image\/(jpeg|png|gif|webp|svg\+xml)$/.test(t)) throw new E('Tipe aset tidak didukung (hanya gambar)', 415);
  await env.BUCKET.put(`novels/${id}/asset/${name}`, await readBody(req, MAX_ASSET), { httpMetadata: { contentType: t } });
  return J({ ok: true });
}

async function listKeys(env, prefix) {
  const keys = []; let cursor;
  do { const r = await env.BUCKET.list({ prefix, cursor }); keys.push(...r.objects.map(o => o.key)); cursor = r.truncated ? r.cursor : undefined } while (cursor);
  return keys;
}
const delKeys = async (env, keys) => { for (let i = 0; i < keys.length; i += 1000) await env.BUCKET.delete(keys.slice(i, i + 1000)) };

async function commit(req, env, id) {
  const d = await readJson(req), r = rev(d), total = d.total;
  if (!Number.isInteger(total) || total < 1 || total > 20000) throw new E('total tidak valid');
  const title = str(d.title, 300), author = str(d.author, 300) || 'Unknown', syn = str(d.synopsis, 2000);
  if (!title) throw new E('Judul wajib diisi');
  const c = (await env.DB.prepare('SELECT COUNT(*) AS c FROM chapters WHERE novel_id=? AND rev=? AND n<=?').bind(id, r, total).first()).c;
  if (c !== total) throw new E(`Chapter belum lengkap: ${total - c} dari ${total} belum terunggah`, 409);
  const hasCover = !!d.hasCover && !!(await env.BUCKET.head(`novels/${id}/asset/cover`));
  const stale = (await env.DB.prepare('SELECT n FROM chapters WHERE novel_id=? AND n>?').bind(id, total).all()).results.map(x => x.n);
  await delKeys(env, stale.map(n => `novels/${id}/ch/${n}.html`));
  const now = Date.now();
  await env.DB.batch([
    env.DB.prepare('DELETE FROM chapters WHERE novel_id=? AND n>?').bind(id, total),
    env.DB.prepare(`UPDATE novels SET title=?,author=?,synopsis=?,has_cover=?,chapter_count=?,status='published',rev=?,published_at=COALESCE(published_at,?),updated_at=? WHERE id=?`).bind(title, author, syn, hasCover ? 1 : 0, total, r, now, now, id)
  ]);
  return J({ ok: true, id, chapterCount: total });
}

async function unpublish(env, id) {
  const keys = await listKeys(env, `novels/${id}/`);
  await delKeys(env, keys);
  await env.DB.batch([env.DB.prepare('DELETE FROM chapters WHERE novel_id=?').bind(id), env.DB.prepare('DELETE FROM novels WHERE id=?').bind(id)]);
  return J({ ok: true, deleted: keys.length });
}
