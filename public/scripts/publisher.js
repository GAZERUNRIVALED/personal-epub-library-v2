const Publisher=(()=>{
const $=s=>document.querySelector(s),tick=()=>new Promise(r=>setTimeout(r)),JH={'content-type':'application/json'};
const nid=b=>'n'+b.id.replace(/-/g,'').slice(0,14);
const base=()=>(window.EPL_API||'').replace(/\/+$/,'');
const origin=()=>base()||location.origin;
const revKey=b=>'epl-rev-'+nid(b);
const hasPending=b=>!!localStorage.getItem(revKey(b));
async function api(path,opt={}){const key=localStorage.getItem('epl-admin');
 if(!key)throw new Error('Admin API key belum diisi (tombol ⚙ di dashboard).');
 let r;try{r=await fetch(base()+'/api'+path,{...opt,headers:{...(opt.headers||{}),authorization:'Bearer '+key}})}
 catch{throw new Error('Tidak bisa menghubungi server (offline, URL API salah, atau CORS: periksa ALLOWED_ORIGIN).')}
 if(!r.ok){let m=r.statusText;try{m=(await r.json()).error||m}catch{}throw new Error(r.status===401?'Admin API key salah.':`${r.status} ${m}`)}return r}
async function listPublished(){try{const out=[];for(let p=1;p<=20;p++){const r=await fetch(`${base()}/api/novels?size=100&page=${p}`);if(!r.ok)break;const j=await r.json();out.push(...j.items);if(!j.hasNext)break}return out}catch{return[]}}
const TYPES={jpg:'image/jpeg',jpeg:'image/jpeg',png:'image/png',gif:'image/gif',webp:'image/webp',svg:'image/svg+xml'};
async function publish(book,onP,retry){
 const id=nid(book);onP('Memvalidasi EPUB & metadata…');
 const[blob,chs]=await Promise.all([DB.getFile(book.id),DB.getChapters(book.id)]);
 if(!blob||!chs||!chs.length)throw new Error('Data EPUB lokal tidak lengkap.');
 if(!book.title||!book.title.trim())throw new Error('Judul novel kosong.');
 const zip=await JSZip.loadAsync(blob),bad=chs.filter(c=>!EpubParser.findFile(zip,c.href));
 if(bad.length)throw new Error(`${bad.length} chapter tidak ditemukan di EPUB (mis. ${bad[0].href}).`);
 await api('/admin/ping');
 let rev=retry?+localStorage.getItem(revKey(book)):0;rev=rev||Date.now();localStorage.setItem(revKey(book),String(rev));
 const total=chs.length,meta={rev,title:book.title,author:book.author,synopsis:book.description||''};
 const{uploaded}=await(await api(`/admin/novel/${id}/begin`,{method:'POST',headers:JH,body:JSON.stringify(meta)})).json();
 const have=new Set(uploaded),sent=new Set();let skipped=0,batch=[],bi=new Map(),size=0;
 const putImg=async(name,path)=>{const f=EpubParser.findFile(zip,path),type=TYPES[name.split('.').pop()];if(!f||!type)return;
  const buf=await f.async('arraybuffer');if(buf.byteLength>8*1024*1024){skipped++;return}
  await api(`/admin/novel/${id}/asset/${name}`,{method:'PUT',headers:{'content-type':type},body:new Blob([buf],{type})})};
 const flush=async()=>{if(!batch.length)return;
  for(const[n,p]of bi){if(!sent.has(n)){await putImg(n,p);sent.add(n)}}   // gambar dulu, baru chapter -> resume aman
  await api(`/admin/novel/${id}/chapters`,{method:'POST',headers:JH,body:JSON.stringify({rev,chapters:batch})});batch=[];bi=new Map();size=0};
 for(let i=0;i<total;i++){
  if(have.has(i+1))continue;
  const im=new Map(),html=await AssetResolver.exportChapter(zip,chs[i].href,`/api/asset/${id}/`,im);
  if(html.length>1.5e6)throw new Error(`Chapter ${i+1} terlalu besar (>1,5 MB).`);
  im.forEach((v,k)=>bi.set(k,v));batch.push({n:i+1,title:chs[i].title,html});size+=html.length;
  if(size>1.2e6||batch.length>=40)await flush();
  if(i%10===0){onP(`Mengunggah chapter ${i+1}/${total}…`);await tick()}}
 await flush();
 let hasCover=false;
 if(book.cover&&/^image\/(jpeg|png|gif|webp)$/.test(book.cover.type)){onP('Mengunggah cover…');await api(`/admin/novel/${id}/asset/cover`,{method:'PUT',headers:{'content-type':book.cover.type},body:book.cover});hasCover=true}
 onP('Menyelesaikan publikasi…');
 await api(`/admin/novel/${id}/commit`,{method:'POST',headers:JH,body:JSON.stringify({...meta,total,hasCover})});
 localStorage.removeItem(revKey(book));return{skipped}}
async function unpublish(b){await api(`/admin/novel/${nid(b)}`,{method:'DELETE'});localStorage.removeItem(revKey(b))}
function bindSettings(){const d=$('#cfg'),url=()=>origin()+'/api/source/personal_epub_library.lua';
 $('#setBtn').onclick=()=>{$('#cKey').value=localStorage.getItem('epl-admin')||'';$('#cUrl').value=url();$('#cDl').href=url();$('#cMsg').textContent='';d.showModal()};
 $('#cClose').onclick=()=>d.close();
 $('#cSave').onclick=async()=>{const k=$('#cKey').value.trim();if(!k){localStorage.removeItem('epl-admin');$('#cMsg').textContent='Key dihapus dari browser ini.';return}
  localStorage.setItem('epl-admin',k);$('#cMsg').textContent='Menguji…';try{await api('/admin/ping');$('#cMsg').textContent='Koneksi & key valid ✓'}catch(e){$('#cMsg').textContent='Gagal: '+e.message}};
 $('#cCopy').onclick=async()=>{try{await navigator.clipboard.writeText($('#cUrl').value);$('#cMsg').textContent='URL disalin.'}catch{$('#cUrl').select();$('#cMsg').textContent='Salin manual dari kolom di atas.'}}}
return{nid,publish,unpublish,listPublished,bindSettings,hasPending}})();
