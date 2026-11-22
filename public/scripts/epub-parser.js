const EpubParser=(()=>{
const dec=s=>{try{return decodeURIComponent(s)}catch{return s}};
function resolve(base,rel){rel=dec(rel.split('#')[0].split('?')[0]);if(rel.startsWith('/'))return rel.slice(1);
 const p=base.split('/');p.pop();for(const s of rel.split('/')){if(s==='..')p.pop();else if(s&&s!=='.')p.push(s)}return p.join('/')}
function findFile(zip,path){let f=zip.file(path)||zip.file(dec(path));if(f)return f;
 if(!zip._idx){zip._idx=new Map();zip.forEach((p,e)=>{if(!e.dir)zip._idx.set(p.toLowerCase(),e)})}
 return zip._idx.get(path.toLowerCase())||zip._idx.get(dec(path).toLowerCase())||null}
const q=(n,name)=>[...n.getElementsByTagName('*')].filter(e=>e.localName.toLowerCase()===name);
const NON=/^(cover|book[\s_-]*cover|book[\s_-]*description|description|table[\s_-]*of[\s_-]*contents|contents|toc|nav|navigation|copyright|title[\s_-]*page|titlepage|about[\s_-]*the[\s_-]*author|imprint)$/i;
const isDoc=i=>/html|xhtml/i.test(i.type)||/\.(x?html?)$/i.test(i.href);
async function parse(file,onP=()=>{}){
 const zip=await JSZip.loadAsync(file);
 const text=async p=>{const f=findFile(zip,p);if(!f)throw new Error('Berkas tidak ada di EPUB: '+p);return f.async('string')};
 const xml=s=>{s=s.replace(/^\uFEFF/,'');const d=new DOMParser().parseFromString(s,'application/xml');
  return d.getElementsByTagName('parsererror').length?new DOMParser().parseFromString(s,'text/html'):d};
 await onP('Membaca container.xml…',20);
 const cont=xml(await text('META-INF/container.xml'));
 const rf=q(cont,'rootfile')[0];if(!rf)throw new Error('Bukan EPUB valid (rootfile tidak ditemukan).');
 const opfPath=dec(rf.getAttribute('full-path'));
 await onP('Membaca OPF…',35);const opf=xml(await text(opfPath));
 const title=(q(opf,'title')[0]?.textContent||'').trim()||file.name.replace(/\.epub$/i,'');
 const author=q(opf,'creator').map(e=>e.textContent.trim()).filter(Boolean).join(', ')||'Penulis tidak diketahui';
 const items=new Map();
 for(const e of q(opf,'item'))items.set(e.getAttribute('id'),{id:e.getAttribute('id'),href:resolve(opfPath,e.getAttribute('href')||''),type:e.getAttribute('media-type')||'',props:e.getAttribute('properties')||''});
 const spine=q(opf,'itemref').map(e=>({item:items.get(e.getAttribute('idref')),linear:e.getAttribute('linear')})).filter(s=>s.item);
 await onP('Mencari cover…',45);
 let cov=null;const cm=q(opf,'meta').find(m=>m.getAttribute('name')==='cover');
 if(cm)cov=items.get(cm.getAttribute('content'));
 cov=cov||[...items.values()].find(i=>/cover-image/.test(i.props))||[...items.values()].find(i=>/^image\//.test(i.type)&&/cover/i.test(i.id+i.href));
 let cover=null;if(cov){const f=findFile(zip,cov.href);if(f)cover=new Blob([await f.async('arraybuffer')],{type:cov.type||'image/jpeg'})}
 await onP('Membaca navigasi…',55);
 const titles=new Map();const add=(base,src,t)=>{const k=resolve(base,src||'');t=(t||'').replace(/\s+/g,' ').trim();if(t&&!titles.has(k))titles.set(k,t)};
 const nav=[...items.values()].find(i=>/\bnav\b/.test(i.props));
 if(nav){try{const d=new DOMParser().parseFromString(await text(nav.href),'text/html');
  const ns=[...d.querySelectorAll('nav')];const toc=ns.find(n=>/toc/.test(n.getAttribute('epub:type')||''))||ns[0]||d;
  toc.querySelectorAll('a[href]').forEach(a=>add(nav.href,a.getAttribute('href'),a.textContent))}catch{}}
 const ncxId=q(opf,'spine')[0]?.getAttribute('toc');
 const ncx=items.get(ncxId)||[...items.values()].find(i=>/dtbncx/.test(i.type));
 if(ncx){try{const d=xml(await text(ncx.href));for(const p of q(d,'navpoint')){const c=q(p,'content')[0],l=q(p,'text')[0];if(c&&l)add(ncx.href,c.getAttribute('src'),l.textContent)}}catch{}}
 await onP('Menyusun daftar chapter…',70);
 let all=spine.filter(s=>isDoc(s.item)).map(s=>{const stem=s.item.href.split('/').pop().replace(/\.[^.]+$/,'');
  return{href:s.item.href,title:titles.get(s.item.href)||stem,stem,skip:/\bnav\b/.test(s.item.props)||s.linear==='no'||NON.test(titles.get(s.item.href)||'')||NON.test(stem)}});
 let chapters=all.filter(c=>!c.skip);if(!chapters.length)chapters=all;
 if(!chapters.length)throw new Error('Tidak ada dokumen chapter pada spine EPUB.');
 const description=(q(opf,'description')[0]?.textContent||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,2000);
 return{title,author,description,cover,chapters:chapters.map(({href,title})=>({href,title}))}}
return{parse,findFile,resolve}})();
