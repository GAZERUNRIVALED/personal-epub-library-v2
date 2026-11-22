const Library=(()=>{
const $=s=>document.querySelector(s);let books=[],pub=new Map(),sort='imported',qs='',cur=null;const urls=[],busy=new Map();
const fmt=n=>n.toLocaleString('id-ID');
const el=(t,c,x)=>{const e=document.createElement(t);if(c)e.className=c;if(x!=null)e.textContent=x;return e};
const pct=b=>b.lastIndex>=0?Math.round((b.lastIndex+1)/b.chapterCount*100):0;
// Local Only | Publishing | Published | Updating | Failed
const status=b=>{const s=busy.get(b.id);
 if(s)return s.err?['Failed','err']:[s.kind==='update'?'Updating':'Publishing',''];
 if(Publisher.hasPending(b))return['Failed','err'];
 return pub.has(Publisher.nid(b))?['Published','ok']:['Local Only','']};
async function loadPub(){pub=new Map((await Publisher.listPublished()).map(i=>[i.id,i]));upd()}
async function refresh(){books=await DB.allBooks();render();loadPub()}
function upd(){render();if(cur&&$('#detail').open){const b=books.find(x=>x.id===cur.id);b?detail(b):$('#detail').close()}}
function render(){urls.splice(0).forEach(u=>URL.revokeObjectURL(u));
 const f=qs.toLowerCase(),list=books.filter(b=>(b.title+' '+b.author).toLowerCase().includes(f));
 list.sort(sort==='title'?(a,b)=>a.title.localeCompare(b.title):sort==='author'?(a,b)=>a.author.localeCompare(b.author):(a,b)=>b.importedAt-a.importedAt);
 $('#stat').textContent=`${fmt(books.length)} buku · ${fmt(books.reduce((s,b)=>s+b.chapterCount,0))} chapter`;
 $('#empty').hidden=books.length>0;const fr=document.createDocumentFragment();
 for(const b of list){const c=el('div','card'),cv=el('div','cov');
  if(b.cover){const u=URL.createObjectURL(b.cover);urls.push(u);const i=new Image();i.src=u;i.alt='';cv.append(i)}else cv.textContent=(b.title[0]||'?').toUpperCase();
  cv.onclick=()=>read(b);
  const m=el('div','meta'),pg=el('div','pg'),bar=el('i'),[st,cl]=status(b);bar.style.width=pct(b)+'%';pg.append(bar);
  m.append(el('b',null,b.title),el('span','muted',b.author),el('div','muted',`${fmt(b.chapterCount)} chapter · ${pct(b)}%`),pg,el('span','badge '+cl,st));
  const ac=el('div','acts'),i=el('button',null,'Detail');i.onclick=()=>{cur=b;detail(b);if(!$('#detail').open)$('#detail').showModal()};
  ac.append(i);c.append(cv,m,ac);fr.append(c)}
 $('#grid').replaceChildren(fr)}
const read=b=>{$('#detail').open&&$('#detail').close();Reader.open(b.id).catch(e=>App.toast('Gagal membuka buku: '+e.message))};
async function run(b,retry){const kind=pub.has(Publisher.nid(b))?'update':'publish';busy.set(b.id,{kind,msg:'Memulai…'});upd();
 try{const r=await Publisher.publish(b,m=>{busy.set(b.id,{kind,msg:m});upd()},retry);busy.delete(b.id);await loadPub();if(r.skipped)App.toast(`${r.skipped} gambar >8 MB dilewati.`)}
 catch(e){busy.set(b.id,{kind,err:1,msg:e.message});upd()}}
function detail(b){const box=$('#dBody'),id=Publisher.nid(b),pb=pub.get(id),s=busy.get(b.id),[st,cl]=status(b),running=s&&!s.err,failed=st==='Failed';
 const info=[`Chapter: ${fmt(b.chapterCount)}`,`File: ${b.fileName} (${(b.size/1048576).toFixed(2)} MB)`,`Diimpor: ${new Date(b.importedAt).toLocaleString('id-ID')}`,`Progres baca: ${pct(b)}%`];
 if(pb)info.push(`Dipublikasikan: ${new Date(pb.publishedAt).toLocaleString('id-ID')}`,`Diperbarui: ${new Date(pb.updatedAt).toLocaleString('id-ID')}`,`ID server: ${id}`);
 const note=s?.msg||(failed?'Upload sebelumnya belum selesai. Tekan Retry Failed Upload untuk melanjutkan.':'');
 box.replaceChildren(el('h3',null,b.title),el('p','muted',b.author),el('pre',null,info.join('\n')),el('span','badge '+cl,st),el('p','small'+(s?.err?' badge err':' muted'),note));
 const row=el('div','row2'),btn=(t,fn,c,dis)=>{const x=el('button',c,t);x.disabled=!!dis;x.onclick=fn;row.append(x)};
 btn('Baca',()=>read(b),'gold');
 btn(pb?'Update Publication':'Publish to MiruTime',()=>run(b,false),null,running);
 if(failed)btn('Retry Failed Upload',()=>run(b,true),'gold',running);
 if(pb)btn('Unpublish',async()=>{if(!confirm('Hapus novel ini dari server? MiruTime tidak akan bisa membacanya lagi.'))return;
  try{await Publisher.unpublish(b);busy.delete(b.id);await loadPub()}catch(e){busy.set(b.id,{err:1,msg:e.message});upd()}},null,running);
 btn('Hapus lokal',async()=>{if(!confirm(`Hapus “${b.title}” dari perpustakaan lokal?`+(pb?'\nNovel ini juga akan di-unpublish dari server.':'')))return;
  try{if(pb)await Publisher.unpublish(b);await DB.deleteBook(b.id);$('#detail').close();await refresh()}catch(e){App.toast('Gagal menghapus: '+e.message)}},null,running);
 btn('Tutup',()=>$('#detail').close());box.append(row)}
return{refresh,setSearch:v=>{qs=v;render()},setSort:v=>{sort=v;render()}}})();
