const DB=(()=>{let db;
const open=()=>db?Promise.resolve(db):new Promise((res,rej)=>{
 if(!window.indexedDB)return rej(new Error('IndexedDB tidak tersedia di browser ini.'));
 const r=indexedDB.open('epub-library',1);
 r.onupgradeneeded=()=>{const d=r.result;d.createObjectStore('books',{keyPath:'id'});d.createObjectStore('files');d.createObjectStore('chapters')};
 r.onsuccess=()=>{db=r.result;res(db)};r.onerror=()=>rej(r.error)});
const tx=(stores,mode,fn)=>open().then(d=>new Promise((res,rej)=>{
 const t=d.transaction(stores,mode);const out=fn(t);
 t.oncomplete=()=>res(out&&'result' in out?out.result:undefined);
 t.onerror=t.onabort=()=>rej(t.error||new Error('Transaksi IndexedDB gagal'))}));
return{
 saveBook:(b,blob,chs)=>tx(['books','files','chapters'],'readwrite',t=>{t.objectStore('books').put(b);t.objectStore('files').put(blob,b.id);t.objectStore('chapters').put(chs,b.id)}),
 allBooks:()=>tx('books','readonly',t=>t.objectStore('books').getAll()),
 getBook:id=>tx('books','readonly',t=>t.objectStore('books').get(id)),
 getFile:id=>tx('files','readonly',t=>t.objectStore('files').get(id)),
 getChapters:id=>tx('chapters','readonly',t=>t.objectStore('chapters').get(id)),
 updateBook:b=>tx('books','readwrite',t=>t.objectStore('books').put(b)),
 deleteBook:id=>tx(['books','files','chapters'],'readwrite',t=>{t.objectStore('books').delete(id);t.objectStore('files').delete(id);t.objectStore('chapters').delete(id)})
}})();
