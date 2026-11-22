const App=(()=>{const $=s=>document.querySelector(s);let tt;
function toast(m){const t=$('#toast');t.textContent=m;t.hidden=false;clearTimeout(tt);tt=setTimeout(()=>t.hidden=true,7000)}
const prog=(t,p)=>{$('#prog').hidden=false;$('#progText').textContent=t;$('#progFill').style.width=p+'%';return new Promise(r=>setTimeout(r))};
async function importFiles(files){
 for(const[n,f]of[...files].entries()){
  try{const tag=`(${n+1}/${files.length}) `;await prog(tag+f.name,5);
   const r=await EpubParser.parse(f,(t,p)=>prog(tag+t,p));
   await prog('Menyimpan ke IndexedDB…',90);
   await DB.saveBook({id:crypto.randomUUID(),title:r.title,author:r.author,description:r.description,cover:r.cover,chapterCount:r.chapters.length,lastIndex:-1,importedAt:Date.now(),size:f.size,fileName:f.name},f,r.chapters)}
  catch(e){toast(e.name==='QuotaExceededError'?'Penyimpanan browser penuh. Hapus buku lain lalu coba lagi.':`Gagal mengimpor ${f.name}: ${e.message}`)}}
 $('#prog').hidden=true;await Library.refresh()}
function init(){Reader.bind();
 $('#importBtn').onclick=()=>$('#file').click();$('#file').onchange=e=>{importFiles(e.target.files);e.target.value=''};
 $('#search').oninput=e=>Library.setSearch(e.target.value);$('#sort').onchange=e=>Library.setSort(e.target.value);
 Publisher.bindSettings();
 navigator.storage?.persist?.();
 Library.refresh().catch(e=>toast('Gagal membuka database: '+e.message))}
document.addEventListener('DOMContentLoaded',init);return{toast}})();
