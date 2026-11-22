const Reader=(()=>{
const $=s=>document.querySelector(s),ROW=46;
const DEF={theme:'dark',font:'Georgia, serif',size:19,lh:1.7,width:720,mode:'text'};
let S={...DEF,...(()=>{try{return JSON.parse(localStorage.getItem('epl-settings'))}catch{return{}}})()};
let book,chs=[],idx=0,flt=[],tok=0;
const persist=()=>{try{localStorage.setItem('epl-settings',JSON.stringify(S))}catch{}};
const esc=s=>String(s).replace(/[&<>]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));
async function open(id){book=await DB.getBook(id);const[blob,c]=await Promise.all([DB.getFile(id),DB.getChapters(id)]);
 if(!blob||!c)throw new Error('Data buku tidak lengkap.');chs=c;AssetResolver.setZip(await JSZip.loadAsync(blob));
 $('#reader').hidden=false;$('#rTitle').textContent=book.title;await go(Math.min(Math.max(book.lastIndex,0),chs.length-1))}
async function go(i){if(i<0||i>=chs.length)return;idx=i;const t=++tok;
 $('#rPos').textContent=`${i+1} / ${chs.length}`;$('#rChap').textContent=chs[i].title;$('#rMode').textContent=S.mode==='text'?'Aa':'⎙';
 try{const h=await AssetResolver.render(chs[i].href,S.mode,S);if(t===tok)$('#frame').srcdoc=h}
 catch(e){$('#frame').srcdoc='<body style="font:16px sans-serif;padding:16px">Gagal memuat chapter: '+esc(e.message)+'</body>'}
 if(book.lastIndex!==i){book.lastIndex=i;DB.updateBook(book).catch(()=>{})}}
function filter(v){v=v.trim().toLowerCase();flt=[];for(let i=0;i<chs.length;i++){const c=chs[i];if(!v||(c._l??=c.title.toLowerCase()).includes(v))flt.push(i)}
 $('#chInner').style.height=flt.length*ROW+'px';paint()}
function paint(){const b=$('#chBox'),a=Math.max(0,Math.floor(b.scrollTop/ROW)-5),z=Math.min(flt.length,Math.ceil((b.scrollTop+b.clientHeight)/ROW)+5),fr=document.createDocumentFragment();
 for(let k=a;k<z;k++){const i=flt[k],d=document.createElement('div');d.className='row'+(i===idx?' cur':'');d.style.top=k*ROW+'px';d.textContent=`${i+1}. ${chs[i].title}`;d.onclick=()=>{$('#drawer').hidden=true;go(i)};fr.append(d)}
 $('#chInner').replaceChildren(fr)}
function bind(){
 $('#rBack').onclick=()=>{tok++;$('#reader').hidden=true;$('#frame').srcdoc='';Library.refresh()};
 $('#rPrev').onclick=()=>go(idx-1);$('#rNext').onclick=()=>go(idx+1);
 $('#rMode').onclick=()=>{S.mode=S.mode==='text'?'original':'text';persist();go(idx)};
 $('#rList').onclick=()=>{$('#drawer').hidden=false;$('#chSearch').value='';filter('');$('#chBox').scrollTop=Math.max(0,idx*ROW-120);paint()};
 $('#chClose').onclick=()=>$('#drawer').hidden=true;$('#chSearch').oninput=e=>filter(e.target.value);
 let raf;$('#chBox').onscroll=()=>{cancelAnimationFrame(raf);raf=requestAnimationFrame(paint)};
 $('#rSet').onclick=()=>$('#setPanel').hidden=false;$('#setClose').onclick=()=>$('#setPanel').hidden=true;
 const map={sTheme:'theme',sFont:'font',sSize:'size',sLh:'lh',sWidth:'width'};
 for(const[id,k]of Object.entries(map)){const e=$('#'+id);e.value=S[k];e.onchange=()=>{S[k]=e.type==='range'?+e.value:e.value;S.mode='text';persist();go(idx)}}
 addEventListener('keydown',e=>{if($('#reader').hidden||e.target.matches('input,select'))return;if(e.key==='ArrowLeft')go(idx-1);if(e.key==='ArrowRight')go(idx+1)})}
return{open,bind}})();
