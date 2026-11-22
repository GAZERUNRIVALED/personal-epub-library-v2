const AssetResolver=(()=>{
let zip=null;const cache=new Map();
const MIME={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml',css:'text/css',ttf:'font/ttf',otf:'font/otf',woff:'font/woff',woff2:'font/woff2'};
const skipUrl=u=>/^(data:|https?:|\/\/|#|blob:|javascript:)/i.test(u);
function setZip(z){cache.forEach(u=>URL.revokeObjectURL(u));cache.clear();zip=z}
async function blobUrl(path){if(cache.has(path))return cache.get(path);
 const f=EpubParser.findFile(zip,path);if(!f)return null;
 const u=URL.createObjectURL(new Blob([await f.async('arraybuffer')],{type:MIME[path.split('.').pop().toLowerCase()]||'application/octet-stream'}));cache.set(path,u);return u}
async function css(src,base,depth=0){
 if(depth<3)for(const m of [...src.matchAll(/@import\s+(?:url\(\s*)?['"]?([^'")\s;]+)['"]?\s*\)?[^;]*;/g)]){
  if(skipUrl(m[1]))continue;const p=EpubParser.resolve(base,m[1]),f=EpubParser.findFile(zip,p);
  src=src.replace(m[0],f?await css(await f.async('string'),p,depth+1):'')}
 const re=/url\(\s*(['"]?)(.*?)\1\s*\)/g,urls=new Set();src.replace(re,(m,k,u)=>urls.add(u));
 const map=new Map();await Promise.all([...urls].map(async u=>{if(skipUrl(u))return;const b=await blobUrl(EpubParser.resolve(base,u));if(b)map.set(u,b)}));
 return src.replace(re,(m,k,u)=>map.has(u)?`url("${map.get(u)}")`:/^https?:|^\/\//i.test(u)?'none':m)}
function sanitize(doc){
 doc.querySelectorAll('script,iframe,frame,object,embed,applet,base,noscript,meta[http-equiv],form').forEach(n=>n.remove());
 doc.querySelectorAll('*').forEach(el=>{for(const a of [...el.attributes]){const n=a.name.toLowerCase();
  if(n.startsWith('on'))el.removeAttribute(a.name);
  else if(['href','src','xlink:href','action'].includes(n)&&/^\s*javascript:/i.test(a.value))el.removeAttribute(a.name)}
  if(el.tagName==='A'){const h=el.getAttribute('href');if(h&&!h.startsWith('#'))el.removeAttribute('href')}})}
async function fixImg(path,el,attr){const v=el.getAttribute(attr);if(!v)return;if(skipUrl(v)){if(/^(https?:|\/\/)/i.test(v))el.removeAttribute(attr);return}
 const b=await blobUrl(EpubParser.resolve(path,v));if(b)el.setAttribute(attr,b)}
function readerCss(s){const T={dark:['#17171a','#e8e4da'],light:['#fff','#1a1a1a'],sepia:['#f3e8d0','#4a3b27']}[s.theme]||['#17171a','#e8e4da'];
 return`html{background:${T[0]};color:${T[1]}}body{max-width:${s.width}px;margin:0 auto;padding:18px 16px 60px;font-family:${s.font};font-size:${s.size}px;line-height:${s.lh};overflow-wrap:anywhere}img,svg,video{max-width:100%;height:auto}p{margin:0 0 1em}`}
async function render(path,mode,s){
 const f=EpubParser.findFile(zip,path);if(!f)throw new Error('Chapter tidak ditemukan: '+path);
 const doc=new DOMParser().parseFromString(await f.async('string'),'text/html');
 sanitize(doc);const head=doc.head,orig=mode==='original';const jobs=[];
 doc.querySelectorAll('img,image,source').forEach(el=>{
  jobs.push(fixImg(path,el,'src'));
  if(el.tagName.toLowerCase()==='image')for(const a of ['href','xlink:href'])if(el.hasAttribute(a))jobs.push(fixImg(path,el,a));
  if(el.hasAttribute('srcset')){const parts=el.getAttribute('srcset').split(',').map(x=>x.trim().split(/\s+/));
   jobs.push(Promise.all(parts.map(async p=>{const b=skipUrl(p[0])?null:await blobUrl(EpubParser.resolve(path,p[0]));return b?[b,...p.slice(1)].join(' '):null})).then(r=>{const ok=r.filter(Boolean);ok.length?el.setAttribute('srcset',ok.join(', ')):el.removeAttribute('srcset')}))}});
 if(orig){
  doc.querySelectorAll('link[rel~=stylesheet]').forEach(l=>{jobs.push((async()=>{const h=l.getAttribute('href'),p=h&&!skipUrl(h)?EpubParser.resolve(path,h):null,ff=p&&EpubParser.findFile(zip,p);
   if(ff){const st=doc.createElement('style');st.textContent=await css(await ff.async('string'),p);l.replaceWith(st)}else l.remove()})())});
  doc.querySelectorAll('style').forEach(st=>jobs.push(css(st.textContent,path).then(t=>{st.textContent=t})));
  doc.querySelectorAll('[style]').forEach(el=>jobs.push(css(el.getAttribute('style'),path).then(t=>el.setAttribute('style',t))));
 }else{doc.querySelectorAll('link,style').forEach(n=>n.remove());doc.querySelectorAll('[style],[class],[width],[height]').forEach(el=>{el.removeAttribute('style');el.removeAttribute('class');if(el.tagName!=='IMG'){el.removeAttribute('width');el.removeAttribute('height')}})}
 await Promise.all(jobs);
 const csp=doc.createElement('meta');csp.setAttribute('http-equiv','Content-Security-Policy');
 csp.setAttribute('content',"default-src 'none'; img-src blob: data:; style-src 'unsafe-inline' blob:; font-src blob: data:");
 const base=doc.createElement('style');
 base.textContent=orig?'html{background:#fff;color:#111}body{overflow-wrap:anywhere}img,svg{max-width:100%;height:auto}':readerCss(s);
 head.prepend(base);head.prepend(csp);
 return'<!doctype html>'+doc.documentElement.outerHTML}
const hash=s=>{let h=2166136261;for(let i=0;i<s.length;i++){h^=s.charCodeAt(i);h=Math.imul(h,16777619)}return(h>>>0).toString(16)};
// Untuk publikasi: HTML bersih (tanpa class/style/script), gambar -> {base}{hash}.{ext}; imgs: name -> path di ZIP
async function exportChapter(z,path,base,imgs){
 const f=EpubParser.findFile(z,path);if(!f)throw new Error('Chapter tidak ditemukan: '+path);
 const doc=new DOMParser().parseFromString(await f.async('string'),'text/html');sanitize(doc);
 doc.querySelectorAll('link,style,title').forEach(n=>n.remove());
 doc.querySelectorAll('[style],[class],[id],[width],[height]').forEach(el=>['style','class','id','width','height'].forEach(a=>el.removeAttribute(a)));
 doc.querySelectorAll('img').forEach(el=>{const v=el.getAttribute('src');el.removeAttribute('srcset');
  if(v&&/^data:image/i.test(v))return;if(!v||skipUrl(v)){el.remove();return}
  const p=EpubParser.resolve(path,v),ext=(p.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'')||'jpg').slice(0,5),name=hash(p)+'.'+ext;
  imgs.set(name,p);el.setAttribute('src',base+name)});
 return doc.body.innerHTML}
return{setZip,render,exportChapter}})();
