const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const META_KEY='grandrp_pov_meta_v17', DB_NAME='grandrp_pov_db_v1', STORE='videos';
const state={entries:[],queue:[],filter:'all',editing:null,selectedTypes:[],accessToken:sessionStorage.getItem('yt_access_token')||'',tokenClient:null,clientId:localStorage.getItem('yt_client_id')||'',processing:false};
const views={archive:['Archiv','POV-Fälle, Bans und PC-Checks'],cases:['Verdachtsfälle','Nicht eindeutig erkannte Fälle zur manuellen Prüfung'],upload:['POVs hochladen','Mehrere Aufnahmen gleichzeitig verarbeiten'],csv:['CSV erstellen','Export für Proof, Datum, ID, SOC, RID, Discord ID, Familie und Grund'],settings:['Einstellungen','YouTube und OCR']};
function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]))}
function today(){return new Date().toISOString().slice(0,10)}
function fmtDate(d){if(!d)return '';const m=d.match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:d}
function saveMeta(){localStorage.setItem(META_KEY,JSON.stringify(state.entries.map(e=>({...e,videoUrl:undefined}))));}
async function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function putVideo(id,file){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(file,id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function getVideo(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error)})}
async function delVideo(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function clearDB(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=()=>res();tx.onerror=()=>rej(tx.error)})}
async function hydrate(){try{state.entries=JSON.parse(localStorage.getItem(META_KEY)||'[]');for(const e of state.entries){try{const f=await getVideo(e.id);if(f)e.videoUrl=URL.createObjectURL(f)}catch{}}}catch{state.entries=[]}}
function showView(v){$$('.view').forEach(x=>x.classList.remove('active'));$('#view-'+v).classList.add('active');$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#pageTitle').textContent=views[v][0];$('#pageSubtitle').textContent=views[v][1];if(v==='archive')renderArchive();if(v==='cases')renderCases();if(v==='csv')renderCsvPreview()}
$$('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#newUploadBtn').onclick=()=>showView('upload');$('#emptyUploadBtn').onclick=()=>showView('upload');$('#reloadBtn').onclick=()=>renderArchive();$('#casesRefresh').onclick=()=>renderCases();$('#search').oninput=renderArchive;$('#exportCsvBtn').onclick=()=>showView('csv');$('#refreshCsvBtn').onclick=renderCsvPreview;$('#downloadCsvBtn').onclick=downloadCsv;$('#copyCsvBtn').onclick=copyCsv;$('#csvUploadBtn').onclick=()=>showView('upload');
$$('.filter').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));renderArchive()});
const dz=$('#dropzone'),input=$('#fileInput');$('#chooseBtn').onclick=e=>{e.stopPropagation();input.click()};dz.onclick=e=>{if(e.target.closest('button'))return;input.click()};input.onchange=e=>{addFiles([...e.target.files]);input.value=''};
['dragenter','dragover'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.add('drag')}));['dragleave','drop'].forEach(ev=>dz.addEventListener(ev,e=>{e.preventDefault();dz.classList.remove('drag')}));dz.addEventListener('drop',e=>addFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/i.test(f.name))));
function addFiles(files){if(!files.length)return;for(const file of files){state.queue.push({id:crypto.randomUUID(),file,status:'Wartet',progress:0,result:null,processing:false,needsReview:false})}renderQueue();processQueue()}
function formatSize(n){return n>1024**3?(n/1024**3).toFixed(1)+' GB':n>1024**2?(n/1024**2).toFixed(1)+' MB':(n/1024).toFixed(0)+' KB'}
function renderQueue(){const q=$('#uploadQueue');$('#queueCount').textContent=`${state.queue.length} ${state.queue.length===1?'Datei':'Dateien'}`;q.innerHTML=state.queue.map(f=>`<div class="queue-item"><div class="queue-icon">▶</div><div class="queue-name"><strong>${esc(f.file.name)}</strong><small>${formatSize(f.file.size)} · ${esc(f.status)}</small><div class="progress"><i style="width:${f.progress}%"></i></div></div><div class="queue-status">${f.result?.id?`ID ${esc(f.result.id)}`:''}</div><div class="queue-actions"><button class="mini-btn edit-q" data-id="${f.id}">Prüfen</button><button class="mini-btn remove-q" data-id="${f.id}">×</button></div></div>`).join('');$$('.edit-q').forEach(b=>b.onclick=()=>{const x=state.queue.find(x=>x.id===b.dataset.id);if(x)openEditor(x)});$$('.remove-q').forEach(b=>b.onclick=()=>{const x=state.queue.find(x=>x.id===b.dataset.id);if(x?.processing){toast('Diese POV wird gerade verarbeitet.');return}state.queue=state.queue.filter(x=>x.id!==b.dataset.id);renderQueue()})}
async function processQueue(){if(state.processing)return;state.processing=true;try{for(const item of state.queue){if(item.processing||item.status==='Analyse fertig · Prüfung offen'||item.status==='Gespeichert')continue;item.processing=true;item.status='Datei wird vollständig eingelesen';item.progress=5;renderQueue();try{const video=$('#videoProbe');const url=URL.createObjectURL(item.file);video.src=url;await loaded(video);item.progress=12;item.status='Datei vollständig eingelesen · OCR startet';renderQueue();item.result=await analyzeVideo(video,video.duration,(p,msg)=>{item.progress=Math.round(p);item.status=msg;renderQueue()});URL.revokeObjectURL(url);item.progress=100;item.needsReview=!item.result.complete;item.status=item.result.complete?'Analyse fertig · Prüfung offen':'OCR unvollständig · Angaben prüfen';renderQueue();openEditor(item);await waitForEditorClose()}catch(err){console.error(err);item.status='Fehler: '+(err.message||err);item.progress=0;renderQueue()}finally{item.processing=false}}}finally{state.processing=false}}
function waitForEditorClose(){return new Promise(resolve=>{const check=()=>state.editing?setTimeout(check,150):resolve();check()})}
function loaded(v){return new Promise((res,rej)=>{let done=false;const ok=()=>{if(done)return;done=true;cleanup();res()};const bad=()=>{if(done)return;done=true;cleanup();rej(new Error('Video konnte nicht gelesen werden.'))};const cleanup=()=>{v.removeEventListener('loadedmetadata',ok);v.removeEventListener('error',bad)};v.addEventListener('loadedmetadata',ok,{once:true});v.addEventListener('error',bad,{once:true});setTimeout(()=>bad(),15000)})}
function seek(v,t){return new Promise((res,rej)=>{let done=false;const ok=()=>{if(done)return;done=true;cleanup();res()};const bad=()=>{if(done)return;done=true;cleanup();rej(new Error('Video-Suche Timeout'))};const cleanup=()=>v.removeEventListener('seeked',ok);v.addEventListener('seeked',ok,{once:true});v.currentTime=Math.min(Math.max(0,t),Math.max(0,v.duration-.05));setTimeout(bad,12000)})}
function crop(v,x,y,w,h,scale=1.35){const c=document.createElement('canvas'),vw=v.videoWidth,vh=v.videoHeight;c.width=Math.max(1,Math.round(vw*w*scale));c.height=Math.max(1,Math.round(vh*h*scale));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.drawImage(v,Math.round(vw*x),Math.round(vh*y),Math.round(vw*w),Math.round(vh*h),0,0,c.width,c.height);return c}
function crop(v,x,y,w,h,scale=1.35){
  const c=document.createElement('canvas'),vw=v.videoWidth,vh=v.videoHeight;
  c.width=Math.max(1,Math.round(vw*w*scale));
  c.height=Math.max(1,Math.round(vh*h*scale));
  const ctx=c.getContext('2d',{willReadFrequently:true});
  ctx.imageSmoothingEnabled=true;
  ctx.drawImage(v,Math.round(vw*x),Math.round(vh*y),Math.round(vw*w),Math.round(vh*h),0,0,c.width,c.height);
  return c;
}
function preprocess(src,mode='normal'){
  const c=document.createElement('canvas');c.width=src.width;c.height=src.height;
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0);
  if(mode==='normal')return c;
  const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
  for(let i=0;i<d.length;i+=4){
    const r=d[i],g=d[i+1],b=d[i+2];
    let v=.299*r+.587*g+.114*b;
    if(mode==='high')v=v<105?0:255;
    else if(mode==='dark')v=v<135?0:255;
    else if(mode==='light')v=v<175?0:255;
    d[i]=d[i+1]=d[i+2]=v;
  }
  ctx.putImageData(im,0,0);return c;
}
function yellowMask(src){
  const c=document.createElement('canvas');c.width=src.width;c.height=src.height;
  const s=src.getContext('2d').getImageData(0,0,src.width,src.height).data;
  const o=c.getContext('2d'),im=o.createImageData(src.width,src.height),d=im.data;
  for(let i=0;i<s.length;i+=4){
    const r=s[i],g=s[i+1],b=s[i+2];
    const y=(r>145&&g>100&&b<135&&r>b*1.35&&g>b*1.15);
    const v=y?255:0; d[i]=d[i+1]=d[i+2]=v; d[i+3]=255;
  }
  o.putImageData(im,0,0);return c;
}
function serverDigitCrops(v){
  const out=[];
  // Fixed crops around the small yellow server badge at the top-right.
  out.push(crop(v,.958,.000,.042,.075,9));
  out.push(crop(v,.945,.000,.055,.095,8));
  const wide=crop(v,.930,.000,.070,.120,7), mask=yellowMask(wide);
  out.push(mask);
  return out;
}
function serverVotesFromText(t){
  const raw=String(t||'').trim();
  const compact=raw.replace(/\s+/g,'');
  if(/^[1-4]$/.test(compact))return [compact];
  const m=raw.match(/\b([1-4])\b/);return m?[m[1]]:[];
}
function normalizeOcr(s){
  return String(s||'')
    .replace(/\r/g,'')
    .replace(/[“”]/g,'"').replace(/[‘’]/g,"'")
    .replace(/[‐‑‒–—]/g,'-').replace(/\u00a0/g,' ')
    .split('\n').map(line=>line.replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n');
}
function cleanText(s){
  return String(s||'').replace(/\r/g,' ').replace(/\s+/g,' ').trim();
}
const ALLOWED_REASONS=['PC Check Positiv','PC Check Verweigert','PC-Check Positiv 4.1 (Discord)','PC-Check Positiv 4.1 (Redux)','PC-Check Positiv (Banevading)','PC Check Positiv (Cleaning)','Cheating','Acc 1.1','Acc 1.4','Event 1.7'];
function reasonKey(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function levenshtein(a,b){a=String(a);b=String(b);if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const c=[i];for(let j=1;j<=b.length;j++)c[j]=Math.min(c[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c}return p[b.length]}
function similarity(a,b){a=reasonKey(a);b=reasonKey(b);if(!a||!b)return 0;return 1-levenshtein(a,b)/Math.max(a.length,b.length)}
function normalizeHexLoose(s){
  // OCR often confuses a few glyphs in hexadecimal Social Club IDs.
  // Only map characters that are common, visually similar OCR confusions.
  return String(s||'')
    .replace(/[OoQq]/g,'0')
    .replace(/[IiLl]/g,'1')
    .replace(/[Ss]/g,'5')
    .replace(/[Gg]/g,'6')
    .replace(/[Zz]/g,'2')
    .replace(/[^0-9A-Fa-f]/g,'')
    .toLowerCase();
}
function normalizeReasonOcrText(s){return String(s||'').toLowerCase().replace(/[‐‑‒–—]/g,'-').replace(/[|]/g,'i').replace(/0/g,'o').replace(/[^a-z0-9. -]/g,' ').replace(/\s+/g,' ').trim()}
function classifyAllowedReason(src){
  const n=normalizeOcr(src), lines=n.split('\n').map(x=>x.trim()).filter(Boolean);
  const candidates=[];
  for(let i=0;i<lines.length;i++){
    const line=lines[i];
    const m=line.match(/\bgr[uú]nd\s*[:\-]?\s*(.*)$/i);
    if(m){
      let after=m[1];
      after=after.split(/\b(?:IP|SC|5C|S\s*C|Social\s+Club)\s*:/i)[0];
      candidates.push(after);
    }
  }
  // Also inspect short windows, but never allow a raw IP/SC tail to define the reason.
  candidates.push(...lines.slice(0,8));
  for(let i=0;i<lines.length;i++)candidates.push(lines.slice(i,Math.min(lines.length,i+3)).join(' '));
  let best={reason:'',score:0};
  for(const raw of candidates){
    const t=normalizeReasonOcrText(raw), k=reasonKey(t);
    if(!k)continue;
    let r='',score=0;
    const pc=/p.?c.?\s*check|p.?c.?check/.test(t);
    const pos=/posit|posi/.test(t), ver=/verweig|verweiger|verweigu|rweig|we1g/.test(t);
    if(pc&&ver){r='PC Check Verweigert';score=.99}
    else if(/pc[- ]?check.*4\.?1.*discord/.test(t) || /4\.?1.*discord.*pc[- ]?check/.test(t)){r='PC-Check Positiv 4.1 (Discord)';score=.99}
    else if(/pc[- ]?check.*4\.?1.*redux/.test(t) || /4\.?1.*redux.*pc[- ]?check/.test(t)){r='PC-Check Positiv 4.1 (Redux)';score=.99}
    else if(/pc[- ]?check.*banevading/.test(k) || /banevading.*pc[- ]?check/.test(t)){r='PC-Check Positiv (Banevading)';score=.99}
    else if(/pc[- ]?check.*cleaning/.test(k) || /cleaning.*pc[- ]?check/.test(t)){r='PC Check Positiv (Cleaning)';score=.99}
    else if(pc&&pos){r='PC Check Positiv';score=.99}
    else if(/cheat(?:ing|er)?/.test(k)){r='Cheating';score=.99}
    else if(/acc\s*1\s*1|acc11/.test(t)){r='Acc 1.1';score=.99}
    else if(/acc\s*1\s*4|acc14/.test(t)){r='Acc 1.4';score=.99}
    else if(/event\s*1\s*7|event17/.test(t)){r='Event 1.7';score=.99}
    else{
      for(const allowed of ALLOWED_REASONS){const sc=similarity(t,allowed);if(sc>score){score=sc;r=allowed}}
    }
    if(score>best.score)best={reason:r,score};
  }
  return best.score>=.82?best:{reason:'',score:best.score};
}
function normalizeId(s){
  return String(s||'').toUpperCase()
    .replace(/[OQ]/g,'0').replace(/[I|L]/g,'1').replace(/[Z]/g,'2')
    .replace(/[S]/g,'5').replace(/[G]/g,'6').replace(/[T]/g,'7').replace(/[B]/g,'8')
    .replace(/[^0-9]/g,'');
}
function extractTargetIdFromLine(line){
  const raw=String(line||'');
  if(!/\bhat\b/i.test(raw) || !/\b(?:f[üu]r|for)\b/i.test(raw)) return '';
  const before=raw.slice(0, raw.search(/\b(?:f[üu]r|for)\b/i));
  const afterHat=before.split(/\bhat\b/i).slice(1).join(' ');
  const bracketed=[...afterHat.matchAll(/\[\s*([0-9OQILZSGBT|]{3,8})\s*\]/gi)].map(m=>normalizeId(m[1])).filter(x=>x.length>=3&&x.length<=8);
  if(bracketed.length) return bracketed[bracketed.length-1];
  const loose=[...afterHat.matchAll(/(?:^|\s)([0-9OQILZSGBT|]{3,8})(?=\s|$)/gi)].map(m=>normalizeId(m[1])).filter(x=>x.length>=3&&x.length<=8);
  return loose.length?loose[loose.length-1]:'';
}
function findTargetId(src){
  const text=normalizeOcr(src), lines=text.split('\n').map(x=>x.trim()).filter(Boolean);
  for(const line of lines){const id=extractTargetIdFromLine(line);if(id)return id;}
  // OCR can split the banner over two adjacent lines; join only a tiny local window.
  for(let i=0;i<lines.length-1;i++){
    const joined=`${lines[i]} ${lines[i+1]}`;
    const id=extractTargetIdFromLine(joined);if(id)return id;
  }
  return '';
}
function normalizeReasonOcrText(s){
  return String(s||'').toLowerCase()
    .replace(/[‐‑‒–—]/g,'-')
    .replace(/[|]/g,'i')
    .replace(/[^a-z0-9.()\- ]/g,' ')
    .replace(/\s+/g,' ').trim();
}
function reasonSimilarity(a,b){
  const na=normalizeReasonOcrText(a), nb=normalizeReasonOcrText(b); if(!na||!nb)return 0;
  const direct=similarity(na,nb);
  const at=na.replace(/[^a-z0-9]/g,''), bt=nb.replace(/[^a-z0-9]/g,'');
  const compact=similarity(at,bt);
  return Math.max(direct,compact);
}
function classifyReasonCandidate(raw){
  const t=normalizeReasonOcrText(raw); if(!t)return {reason:'',score:0};
  const k=t.replace(/[^a-z0-9]/g,'');
  const compact=t.replace(/\s+/g,' ');
  const hits=[];
  const add=(reason,score)=>hits.push({reason,score});
  // Specific PC-check reasons first so a generic "PC Check" cannot mask them.
  if(/pc\s*-?\s*check/.test(compact) || /pccheck/.test(k)){
    if(/4\.?1/.test(compact) && /discord/.test(compact)) add('PC-Check Positiv 4.1 (Discord)',.995);
    if(/4\.?1/.test(compact) && /redux/.test(compact)) add('PC-Check Positiv 4.1 (Redux)',.995);
    if(/banevad/.test(k)) add('PC-Check Positiv (Banevading)',.99);
    if(/cleaning|cleanin/.test(k)) add('PC Check Positiv (Cleaning)',.99);
    if(/verweig|rweig|rwelg|rwe1g|we1g|we1/.test(k)) add('PC Check Verweigert',.98);
    if(/posit/.test(k)) add('PC Check Positiv',.98);
  }
  if(/cheat/.test(k)) add('Cheating',.99);
  if(/acc\s*1\s*1/.test(compact)||/acc11/.test(k)) add('Acc 1.1',.99);
  if(/acc\s*1\s*4/.test(compact)||/acc14/.test(k)) add('Acc 1.4',.99);
  if(/event\s*1\s*7/.test(compact)||/event17/.test(k)) add('Event 1.7',.99);
  if(hits.length)return hits.sort((a,b)=>b.score-a.score)[0];
  let best={reason:'',score:0};
  for(const allowed of ALLOWED_REASONS){const sc=reasonSimilarity(t,allowed);if(sc>best.score)best={reason:allowed,score:sc};}
  return best.score>=.70?best:{reason:'',score:best.score};
}
function classifyAllowedReason(src){
  const text=normalizeOcr(src), lines=text.split('\n').map(x=>x.trim()).filter(Boolean), candidates=[];
  for(let i=0;i<lines.length;i++){
    const m=lines[i].match(/\bgr[uú]nd\s*[:\-]?\s*(.*)$/i);
    if(m){
      let val=m[1];
      val=val.split(/\b(?:IP|SC|5C|S\s*C|Social\s+Club)\b\s*:/i)[0];
      candidates.push(val);
      if(lines[i+1] && !/^\s*(?:IP|SC|5C|Social)/i.test(lines[i+1])) candidates.push(`${val} ${lines[i+1]}`.trim());
    }
  }
  // Fallback only inspects the first few chat lines, never the entire OCR dump.
  for(const line of lines.slice(0,6)){
    if(/\bgr[uú]nd\b/i.test(line)) candidates.push(line.split(/\bgr[uú]nd\b/i).pop());
  }
  let best={reason:'',score:0}; for(const c of candidates){const x=classifyReasonCandidate(c);if(x.score>best.score)best=x;}
  return best;
}
function extractSc40FromRegion(block){
  const lines=String(block||'').split('\n').slice(0,4), out=[];
  const collect=(str)=>{
    const cleaned=String(str||'').replace(/[^0-9A-Fa-fOoQqIiLlZzSsGg]/g,'');
    const variants=[cleaned,normalizeHexLoose(cleaned)];
    for(const v of variants){if(v.length>=38&&v.length<=42&&/^[0-9a-f]{38,42}$/.test(v.toLowerCase()))out.push(v.toLowerCase());}
  };
  for(const line of lines)collect(line);
  collect(lines.join(''));
  return [...new Set(out)];
}
function extractScCandidatesFromText(src){
  const lines=normalizeOcr(src).split('\n'),out=[];
  const markerRe=/\b(?:SC|5C|S\s*C|SOCIAL\s+CLUB(?:\s+ID)?)\b\s*[:\-]?/i;
  for(let i=0;i<lines.length;i++){
    const m=markerRe.exec(lines[i]); if(!m)continue;
    const block=[lines[i].slice(m.index+m[0].length),lines[i+1]||'',lines[i+2]||'',lines[i+3]||''].join('\n');
    out.push(...extractSc40FromRegion(block));
  }
  return [...new Set(out)];
}
function extractScFromDetailed(data,canvas){
  const out=[];
  for(const d of data){
    const words=(d?.words||[]).filter(w=>String(w.text||'').trim());
    for(const w of words){
      const wt=String(w.text||'').replace(/[^A-Za-z0-9 ]/g,'').trim().toLowerCase();
      if(!/^(sc|5c|s c|social club|social club id)$/.test(wt))continue;
      const b=w.bbox||{}, h=Math.max(18,(b.y1||0)-(b.y0||0));
      const x0=Math.max(0,Math.floor((b.x1||0)+h*.08)), y0=Math.max(0,Math.floor((b.y0||0)-h*.35));
      const y1=Math.min(canvas.height,Math.floor((b.y1||0)+h*3.8));
      const c=document.createElement('canvas');c.width=Math.max(120,canvas.width-x0);c.height=Math.max(30,y1-y0);
      c.getContext('2d').drawImage(canvas,x0,y0,c.width,c.height,0,0,c.width,c.height);out.push(c);
    }
  }
  return out.slice(0,10);
}

function extractReasonFromDetailed(data,canvas){
  const out=[];
  for(const d of data){
    const words=(d?.words||[]).filter(w=>String(w.text||'').trim());
    for(const w of words){
      const wt=String(w.text||'').replace(/[^A-Za-z0-9]/g,'').toLowerCase();
      if(!/^gr[uú]nd$/.test(wt))continue;
      const b=w.bbox||{}, h=Math.max(18,(b.y1||0)-(b.y0||0));
      const x0=Math.max(0,Math.floor(b.x1||0)), y0=Math.max(0,Math.floor((b.y0||0)-h*.25));
      const y1=Math.min(canvas.height,Math.floor((b.y1||0)+h*1.7));
      const c=document.createElement('canvas'); c.width=Math.max(160,canvas.width-x0); c.height=Math.max(30,y1-y0);
      c.getContext('2d').drawImage(canvas,x0,y0,c.width,c.height,0,0,c.width,c.height); out.push(c);
    }
  }
  return out.slice(0,8);
}
function sameReason(a,b){return !!a&&!!b&&(a===b||reasonSimilarity(a,b)>=.86)}
function bestVote(values,normalizer,minLen=1){const vals=values.map(v=>normalizer(v)).filter(v=>v&&v.length>=minLen);if(!vals.length)return'';const map=new Map();for(const v of vals)map.set(v,(map.get(v)||0)+1);return[...map.entries()].sort((a,b)=>b[1]-a[1])[0][0]}
function voteConfidence(values,normalizer,winner){const vals=values.map(v=>normalizer(v)).filter(Boolean);if(!vals.length||!winner)return 0;return vals.filter(v=>v===winner).length/vals.length}
function inferTypes(reason){switch(reason){case 'PC Check Positiv':case 'PC Check Verweigert':case 'PC-Check Positiv 4.1 (Discord)':case 'PC-Check Positiv 4.1 (Redux)':case 'PC-Check Positiv (Banevading)':case 'PC Check Positiv (Cleaning)':return ['pccheck'];case 'Cheating':return ['cheater'];default:return[]}}
async function ocr(worker,canvas,params={}){await worker.setParameters({tessedit_pageseg_mode:params.psm??6,tessedit_char_whitelist:params.whitelist||'',preserve_interword_spaces:'1',user_defined_dpi:'300'});const r=await worker.recognize(canvas);return r.data||{text:'',words:[]}}
function validDate(iso){
  if(!/^\d{4}-\d{2}-\d{2}$/.test(String(iso||''))) return false;
  const [y,m,d]=String(iso).split('-').map(Number);
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y && dt.getUTCMonth()===m-1 && dt.getUTCDate()===d;
}
function extractDate(s){
  let m=String(s||'').match(/\b(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/);if(m)return`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m=String(s||'').match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d{2})\b/);return m?`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`:'';
}
function hamming(a,b){if(!a||!b)return 99;const n=Math.min(a.length,b.length);let d=Math.abs(a.length-b.length);for(let i=0;i<n;i++)if(a[i]!==b[i])d++;return d}
function chooseSc(candidates){
  const vals=candidates.filter(x=>/^[0-9a-f]{38,42}$/.test(x)); if(!vals.length)return{value:'',confidence:0,count:0};
  const clusters=[];
  for(const v of vals){let best=null,bd=99;for(const c of clusters){const dist=hamming(v,c.seed);if(dist<bd){bd=dist;best=c;}}const lim=Math.max(2,Math.floor(Math.max(v.length,best?.seed?.length||v.length)*.08));if(best&&bd<=lim){best.items.push(v)}else clusters.push({seed:v,items:[v]});}
  clusters.sort((a,b)=>b.items.length-a.items.length);const top=clusters[0];if(!top)return{value:'',confidence:0,count:0};
  const counts=new Map();for(const x of top.items)counts.set(x,(counts.get(x)||0)+1);const observed=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];
  const support=top.items.length;return{value:observed[0],confidence:support/vals.length,count:support};
}
function yellowServerCrop(src){
  const c=src,ctx=c.getContext('2d',{willReadFrequently:true}); if(!ctx)return null; const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;let minX=c.width,minY=c.height,maxX=-1,maxY=-1;
  for(let y=0;y<c.height;y++)for(let x=0;x<c.width;x++){const i=(y*c.width+x)*4,r=d[i],g=d[i+1],b=d[i+2];if(r>155&&g>120&&b<120&&r>b*1.4&&g>b*1.2){if(x<minX)minX=x;if(y<minY)minY=y;if(x>maxX)maxX=x;if(y>maxY)maxY=y;}}
  if(maxX<0)return null; const padX=Math.max(6,Math.round((maxX-minX+1)*.35)),padY=Math.max(6,Math.round((maxY-minY+1)*.35));const x0=Math.max(0,minX-padX),y0=Math.max(0,minY-padY),x1=Math.min(c.width,maxX+padX+1),y1=Math.min(c.height,maxY+padY+1);const out=document.createElement('canvas');out.width=Math.max(30,x1-x0);out.height=Math.max(30,y1-y0);out.getContext('2d').drawImage(c,x0,y0,out.width,out.height,0,0,out.width,out.height);return out;
}
function serverCandidatesFromCanvas(c){const arr=[];if(!c)return arr;for(const mode of ['normal','high']){const q=preprocess(c,mode);for(const txt of [c,q]){arr.push(txt);}}return arr}
async function analyzeServerAtCurrentFrame(video,worker){
  const fixed=crop(video,.935,.000,.065,.10,10), mask=yellowServerCrop(fixed); const canvases=[fixed]; if(mask)canvases.unshift(mask);
  const vals=[];for(const c of canvases){const a=await ocr(worker,c,{psm:10,whitelist:'0123456789'}),b=await ocr(worker,preprocess(c,'high'),{psm:10,whitelist:'0123456789'});for(const t of [a.text,b.text]){const m=String(t||'').match(/\b([0-9]{1,2})\b/);if(m&&Number(m[1])>=1&&Number(m[1])<=9)vals.push(m[1]);}}
  return vals;
}
async function analyzeVideo(video,duration,onProgress){
  const frames=Math.max(24,Math.min(60,Number(localStorage.getItem('frame_count_v13')||30)));
  const startT=Math.max(0,duration-40),span=Math.max(.1,duration-startT),worker=await Tesseract.createWorker('eng',1);
  const idRecords=[],reasonRecords=[],broadFrames=[],serverVotes=[],dateVotes=[];
  const fieldTimes={id:0,reason:0,sc:0,server:0,date:0};
  try{
    for(let i=0;i<frames;i++){
      const t=startT+span*((i+.10)/frames);await seek(video,t);
      const left=crop(video,0,.045,.64,.285,3.5), a=await ocr(worker,left,{psm:6}), b=await ocr(worker,preprocess(left,'dark'),{psm:11});
      const combined=[a.text||'',b.text||''].join('\n'),parsed=parseSingleFrame(combined);
      idRecords.push(parsed.id);reasonRecords.push(parsed.reason);broadFrames.push({i,t,parsed,text:combined,details:[a,b]});
      if(parsed.id && !fieldTimes.id) fieldTimes.id=t;
      if(parsed.reason && !fieldTimes.reason) fieldTimes.reason=t;
      if(i%3===0){
        const svs=await analyzeServerAtCurrentFrame(video,worker); serverVotes.push(...svs); if(svs.length&&!fieldTimes.server)fieldTimes.server=t;
        const dc=crop(video,.86,.865,.14,.135,6);const d1=await ocr(worker,dc,{psm:7,whitelist:'0123456789./-'}),d2=await ocr(worker,preprocess(dc,'dark'),{psm:7,whitelist:'0123456789./-'});const dt=extractDate((d1.text||'')+'\n'+(d2.text||''));if(validDate(dt)){dateVotes.push(dt);if(!fieldTimes.date)fieldTimes.date=t;}
      }
      onProgress(10+((i+1)/frames)*40,`Schnellscan · ${i+1}/${frames}`);
    }
    const id=bestVote(idRecords,normalizeId,3);
    const reason=bestVote(reasonRecords.filter(Boolean),x=>x,1);
    const anchors=broadFrames.filter(x=>x.parsed.id===id && x.parsed.reason===reason);
    const nearIds=broadFrames.filter(x=>x.parsed.id===id);
    const sourceFrames=(anchors.length?anchors:nearIds).slice(0,8);
    const anchorTime=sourceFrames[0]?.t||fieldTimes.id||fieldTimes.reason||Math.max(0,duration-20);
    if(!fieldTimes.id)fieldTimes.id=anchorTime;if(!fieldTimes.reason)fieldTimes.reason=anchorTime;if(!fieldTimes.server)fieldTimes.server=anchorTime;if(!fieldTimes.date)fieldTimes.date=anchorTime;if(!fieldTimes.sc)fieldTimes.sc=anchorTime;
    const focusIdx=new Set();for(const a of sourceFrames){for(let d=-2;d<=2;d++){const idx=a.i+d;if(idx>=0&&idx<broadFrames.length)focusIdx.add(idx)}}
    const focus=[...focusIdx].sort((a,b)=>a-b).map(i=>broadFrames[i]);
    const scCandidates=[]; let reasonRefined=[];
    for(let k=0;k<focus.length;k++){
      const fr=focus[k];await seek(video,fr.t);
      const left=crop(video,0,.045,.70,.32,4.2);
      const normal=await ocr(worker,left,{psm:6}), sparse=await ocr(worker,preprocess(left,'dark'),{psm:11});
      const combined=[normal.text||'',sparse.text||''].join('\n');
      const refined=parseSingleFrame(combined);
      if(refined.reason){reasonRefined.push(refined.reason);if(!fieldTimes.reason)fieldTimes.reason=fr.t;}
      for(const rc of extractReasonFromDetailed([normal,sparse],left)){
        const rr1=await ocr(worker,rc,{psm:7}), rr2=await ocr(worker,preprocess(rc,'light'),{psm:7});
        const rr=classifyAllowedReason(`${rr1.text||''}\n${rr2.text||''}`); if(rr.reason)reasonRefined.push(rr.reason);
      }
      const blockMatch=refined.id===id && sameReason(refined.reason,reason);
      const nearAnchor=sourceFrames.some(a=>Math.abs(a.i-fr.i)<=2);
      if(blockMatch||nearAnchor){
        const foundBefore=scCandidates.length;
        scCandidates.push(...extractScCandidatesFromText(combined));
        const markerCanvases=extractScFromDetailed([normal,sparse],left);
        for(const mc of markerCanvases){
          const q1=await ocr(worker,mc,{psm:7,whitelist:'0123456789abcdefABCDEF'}),q2=await ocr(worker,preprocess(mc,'dark'),{psm:7,whitelist:'0123456789abcdefABCDEF'});
          scCandidates.push(...extractSc40FromRegion(q1.text||''),...extractSc40FromRegion(q2.text||''));
        }
        if(scCandidates.length>foundBefore&&!fieldTimes.sc)fieldTimes.sc=fr.t;
      }
      onProgress(50+((k+1)/Math.max(1,focus.length))*43,`Präzisionsscan · ${k+1}/${focus.length}`);
    }
    const refinedReason=bestVote(reasonRefined,x=>x,1)||reason;
    const scChoice=chooseSc(scCandidates);
    const sm=new Map();for(const x of serverVotes)sm.set(x,(sm.get(x)||0)+1);const sv=[...sm.entries()].sort((a,b)=>b[1]-a[1])[0];
    const server=sv&&sv[1]>=3&&sv[1]/Math.max(1,serverVotes.length)>=.55?sv[0]:'';
    const date=bestVote(dateVotes,x=>x,1),types=inferTypes(refinedReason||reason);
    const idConf=voteConfidence(idRecords,normalizeId,id),reasonConf=voteConfidence(reasonRecords.filter(Boolean),x=>x,reason),serverConf=sv?sv[1]/Math.max(1,serverVotes.length):0,dateConf=voteConfidence(dateVotes,x=>x,date);
    const complete=!!(id&&ALLOWED_REASONS.includes(refinedReason||reason)&&scChoice.value&&server&&date&&idConf>=.55&&reasonConf>=.50&&scChoice.count>=2&&serverConf>=.50&&dateConf>=.50);
    return{id,reason:refinedReason||reason,sc:scChoice.value,server,date,types,complete,found:complete,reviewTimes:fieldTimes,confidence:{id:idConf,reason:reasonConf,sc:scChoice.confidence,server:serverConf,date:dateConf},debug:{anchors:anchors.length,focusFrames:focus.length,scCandidates:scCandidates.length,serverVotes:serverVotes.length}};
  }finally{await worker.terminate()}
}
function parseSingleFrame(texts){
  const src=normalizeOcr(texts||'');const id=findTargetId(src);const r=classifyAllowedReason(src);return{id,reason:r.reason,reasonScore:r.score};
}

function formatTimecode(sec){sec=Math.max(0,Math.floor(Number(sec)||0));const m=Math.floor(sec/60),s=String(sec%60).padStart(2,'0');return `${m}:${s}`}
function renderReviewTools(item,p){
  const box=$('#reviewTools'); if(!box)return;
  const times=p.reviewTimes||item.reviewTimes||{};
  const fields=[['id','Ziel-ID',p.id],['reason','Grund',p.reason],['sc','SC / RID',p.sc],['server','Server',p.server],['date','Datum',p.date]];
  const missing=fields.filter(([key])=>!p[key]);
  box.innerHTML='';
  if(!missing.length){box.classList.add('hidden');return}
  box.classList.remove('hidden');
  const title=document.createElement('div');title.className='review-title';title.innerHTML='⚠ Fehlende Angaben – die POV wird im neuen Tab direkt an der ermittelten Stelle geöffnet';box.appendChild(title);
  const row=document.createElement('div');row.className='review-buttons';
  for(const [key,label,value] of fields){
    const t=Number(times[key]||0); if(!t)continue;
    const b=document.createElement('button');b.type='button';b.className='mini-btn review-btn';b.textContent=`${value?`Prüfen: ${label}`:`Fehlt: ${label}`} · ${formatTimecode(t)}`;
    b.onclick=async()=>{const file=state.editing?.file;if(!file){toast('POV-Datei ist für diese Prüfung nicht verfügbar.');return}openPovAtTime(file,t,`${label} · ${formatTimecode(t)}`)};
    row.appendChild(b);
  }
  if(row.children.length)box.appendChild(row);
}
function openPovAtTime(file,seconds,label='POV'){
  const url=URL.createObjectURL(file),win=window.open('about:blank','_blank');
  if(!win){URL.revokeObjectURL(url);toast('Pop-up wurde vom Browser blockiert. Bitte Pop-ups für die Website erlauben.');return}
  const safeLabel=esc(label).replace(/`/g,'');
  win.document.open();win.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${safeLabel}</title><style>body{margin:0;background:#08070b;color:#eee;font-family:Inter,Arial,sans-serif;display:flex;flex-direction:column;height:100vh}header{padding:12px 16px;border-bottom:1px solid #27202f;background:#100d15;font-size:14px}video{flex:1;width:100%;background:#000}small{color:#9d93a6}</style></head><body><header><strong>${safeLabel}</strong><br><small>Start bei ${formatTimecode(seconds)}</small></header><video id="v" controls autoplay muted playsinline></video><script>const v=document.getElementById('v');v.src=${JSON.stringify(url)};v.addEventListener('loadedmetadata',()=>{v.currentTime=${Math.max(0,Number(seconds)||0)};v.play().catch(()=>{})},{once:true});window.addEventListener('beforeunload',()=>{try{URL.revokeObjectURL(v.src)}catch(e){}});</script></body></html>`);win.document.close();
}
function openEditor(item){state.editing=item;state.selectedTypes=[...new Set([...(item.types||[]), ...inferTypes((item.result||{}).reason||item.reason||'')])];const p=item.result||{};$('#modalFile').textContent=item.file.name;$('#targetId').value=p.id||item.id||'';$('#reason').value=p.reason||item.reason||'';$('#sc').value=p.sc||item.sc||'';$('#discordId').value=p.discordId||item.discordId||'';$('#server').value=p.server||item.server||'';$('#date').value=p.date||item.date||today();$('#perma').checked=!!item.perma;$('#notBanned').checked=!!item.notBanned;$$('#banTypes .chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.includes(c.dataset.value)));$('#ocrWarning').classList.toggle('hidden',!!p.complete);renderReviewTools(item,p);updateTitle();$('#editorModal').classList.remove('hidden')}
function closeEditor(){$('#reviewTools')?.classList.add('hidden');state.editing=null;$('#editorModal').classList.add('hidden');renderQueue();renderCases()}
$('#closeModal').onclick=closeEditor;$('#cancelBtn').onclick=closeEditor;
$$('#banTypes .chip').forEach(c=>c.onclick=()=>{c.classList.toggle('active');state.selectedTypes=$$('#banTypes .chip.active').map(x=>x.dataset.value);updateTitle()});
['#targetId','#reason','#date'].forEach(s=>$(s).oninput=updateTitle);function updateTitle(){const id=$('#targetId').value.trim()||'UNBEKANNT',r=$('#reason').value.trim()||'Unbekannt',d=$('#date').value||today();$('#titlePreview').value=`${id}, ${r}, ${fmtDate(d)}`}
$('#perma').onchange=e=>{if(e.target.checked)$('#notBanned').checked=false};$('#notBanned').onchange=e=>{if(e.target.checked)$('#perma').checked=false};
$('#entryForm').onsubmit=async e=>{e.preventDefault();const item=state.editing;if(!item)return;const finalName=`${$('#targetId').value.trim()||'UNBEKANNT'}, ${$('#reason').value.trim()||'Unbekannt'}, ${fmtDate($('#date').value||today())}${ext(item.file.name)}`;const entry={id:$('#targetId').value.trim(),reason:$('#reason').value.trim(),sc:$('#sc').value.trim(),discordId:$('#discordId').value.trim(),server:$('#server').value.trim(),date:$('#date').value||today(),types:[...state.selectedTypes],perma:$('#perma').checked,notBanned:$('#notBanned').checked,reviewTimes:(item.result&&item.result.reviewTimes)||item.reviewTimes||{},fileName:finalName,createdAt:new Date().toISOString(),youtubeId:'',status:'Gespeichert · YouTube nicht verbunden',videoUrl:'',processedAt:new Date().toISOString()};if(!entry.id&&!entry.notBanned){toast('ID fehlt. Bitte ergänzen.');return}if(!entry.notBanned&&!entry.reason){toast('Grund fehlt. Bitte ergänzen.');return}$('#saveBtn').disabled=true;$('#saveBtn').textContent='Wird gespeichert …';try{await putVideo(entry.id+'_'+entry.createdAt,item.file);entry.videoKey=entry.id+'_'+entry.createdAt;entry.videoUrl=URL.createObjectURL(item.file);if(state.accessToken&&!entry.notBanned){$('#saveBtn').textContent='YouTube Upload läuft …';entry.youtubeId=await uploadToYouTube(item.file,entry);entry.status='YouTube · Nicht gelistet'}state.entries.unshift(entry);saveMeta();state.queue=state.queue.filter(x=>x.id!==item.id);closeEditor();renderArchive();renderCsvPreview();toast(entry.youtubeId?'POV hochgeladen, nicht gelistet und archiviert.':'Eintrag gespeichert.');showView('archive')}catch(err){console.error(err);toast('Fehler: '+(err.message||err))}finally{$('#saveBtn').disabled=false;$('#saveBtn').textContent='Speichern & YouTube hochladen'}};
function ext(n){const m=n.match(/\.[^.]+$/);return m?m[0]:'.mp4'}
async function uploadToYouTube(file,entry){const metadata={snippet:{title:entry.fileName.replace(/\.[^.]+$/,''),description:`Server: ${entry.server||'unbekannt'}\nSC: ${entry.sc||'unbekannt'}\nPerma-Bann: ${entry.perma?'Ja':'Nein'}\nBann-Typen: ${entry.types.join(', ')||'keiner'}`},status:{privacyStatus:'unlisted',selfDeclaredMadeForKids:false}};const init=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{Authorization:'Bearer '+state.accessToken,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Length':String(file.size),'X-Upload-Content-Type':file.type||'application/octet-stream'},body:JSON.stringify(metadata)});if(!init.ok)throw new Error('YouTube: '+await init.text());const url=init.headers.get('Location');if(!url)throw new Error('Keine YouTube Upload-URL erhalten.');let start=0,chunk=8*1024*1024;while(start<file.size){const end=Math.min(start+chunk,file.size)-1;const res=await fetch(url,{method:'PUT',headers:{'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${file.size}`},body:file.slice(start,end+1)});if(res.status===308){const range=res.headers.get('Range');start=range?parseInt(range.split('-')[1])+1:end+1}else if(res.ok){return(await res.json()).id}else throw new Error('YouTube Upload: '+await res.text())}}
function getVisibleEntries(){
  const q=($('#search')?.value||'').toLowerCase();
  return state.entries.filter(x=>{
    const t=x.types||[];let ok=state.filter==='all'||(state.filter==='ban'&&t.some(v=>['hardban','socban','cheater','negativ'].includes(v)))||(state.filter==='pccheck'&&t.includes('pccheck'))||(state.filter==='socban'&&t.includes('socban'))||(state.filter==='hardban'&&t.includes('hardban'))||(state.filter==='cheater'&&t.includes('cheater'))||(state.filter==='negativ'&&t.includes('negativ'))||(state.filter==='novideo'&&!x.youtubeId);
    return ok&&JSON.stringify(x).toLowerCase().includes(q);
  });
}
function csvCell(v){return `"${String(v??'').replace(/"/g,'""')}"`}
function csvRows(){
  const header=['Proof','Datum','ID','SOC','RID','Discord ID','Familie','Grund'];
  const rows=state.entries.filter(x=>x&&((x.id||'').trim()||(x.reason||'').trim()||(x.sc||'').trim()||(x.discordId||'').trim()||(x.youtubeId||'').trim()));
  const data=[header];
  for(const x of rows){
    const proof=x.youtubeId?`https://youtu.be/${x.youtubeId}`:'';
    // Export mapping requested by the user: SOC stays empty, RID is the detected SC, Familie stays empty.
    data.push([proof,fmtDate(x.date||''),x.id||'','',x.sc||'',x.discordId||'','',x.reason||'']);
  }
  return data;
}
function csvText(){return csvRows().map(row=>row.map(csvCell).join(';')).join('\r\n')}
function renderCsvPreview(){
  const body=$('#csvPreviewBody'),empty=$('#csvEmpty'),summary=$('#csvSummary'); if(!body)return;
  const data=csvRows(); const rows=data.slice(1);
  summary.innerHTML=`<span class="csv-pill">${rows.length} Einträge</span><span class="csv-pill">SOC bleibt leer</span><span class="csv-pill">RID = SC</span><span class="csv-pill">Familie bleibt leer</span>`;
  body.innerHTML=rows.map(r=>`<tr>${r.map((v,i)=>`<td class="${i===0?'proof-cell':''}">${v?esc(v):'<span class="empty-cell">leer</span>'}</td>`).join('')}</tr>`).join('');
  empty.classList.toggle('hidden',rows.length>0);
}
function downloadCsv(){
  const data=csvRows(); if(data.length===1){toast('Keine gespeicherten Einträge für den CSV-Export vorhanden.');showView('csv');renderCsvPreview();return;}
  const blob=new Blob(["\uFEFF"+data.map(row=>row.map(csvCell).join(';')).join('\r\n')],{type:'text/csv;charset=utf-8'});
  const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`grandrp-pov-${today()}.csv`;document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
  toast(`${data.length-1} Einträge als CSV erstellt.`);
}
async function copyCsv(){
  const data=csvRows(); if(data.length===1){toast('Keine CSV-Daten vorhanden.');return;}
  const text=data.map(row=>row.map(csvCell).join(';')).join('\r\n');
  try{await navigator.clipboard.writeText(text);toast('CSV in die Zwischenablage kopiert.');}
  catch{toast('Kopieren wurde vom Browser blockiert. Bitte CSV herunterladen.');}
}
function renderArchive(){const q=$('#search').value.toLowerCase();const entries=state.entries.filter(x=>{const t=x.types||[];let ok=state.filter==='all'||(state.filter==='ban'&&t.some(v=>['hardban','socban','cheater','negativ'].includes(v)))||(state.filter==='pccheck'&&t.includes('pccheck'))||(state.filter==='socban'&&t.includes('socban'))||(state.filter==='hardban'&&t.includes('hardban'))||(state.filter==='cheater'&&t.includes('cheater'))||(state.filter==='negativ'&&t.includes('negativ'))||(state.filter==='novideo'&&!x.youtubeId);return ok&&JSON.stringify(x).toLowerCase().includes(q)});
$('#countAll').textContent=state.entries.length;$('#countBan').textContent=state.entries.filter(x=>(x.types||[]).some(t=>['hardban','socban','cheater','negativ'].includes(t))).length;$('#countPc').textContent=state.entries.filter(x=>(x.types||[]).includes('pccheck')).length;$('#countSoc').textContent=state.entries.filter(x=>(x.types||[]).includes('socban')).length;$('#countHard').textContent=state.entries.filter(x=>(x.types||[]).includes('hardban')).length;$('#countCheat').textContent=state.entries.filter(x=>(x.types||[]).includes('cheater')).length;$('#countNeg').textContent=state.entries.filter(x=>(x.types||[]).includes('negativ')).length;$('#countNoVideo').textContent=state.entries.filter(x=>!x.youtubeId).length;
$('#archiveGrid').innerHTML=entries.map(x=>`<article class="entry"><div class="thumb">${x.videoUrl?`<video src="${esc(x.videoUrl)}" muted preload="metadata"></video>`:'<div class="thumb-placeholder">◉</div>'}<div class="badge-row">${(x.types||[]).map(t=>`<span class="type-badge">${esc(t)}</span>`).join('')}<span class="server-badge">Server ${esc(x.server||'?')}</span></div></div><div class="entry-body"><h3>${esc(x.id||'Nicht gebannt')} · ${esc(x.reason||'Kein Grund')}</h3><div class="meta"><div>ID<strong>${esc(x.id||'—')}</strong></div><div>Datum<strong>${esc(fmtDate(x.date))}</strong></div><div>SC<strong title="${esc(x.sc)}">${esc(x.sc||'—')}</strong></div><div>Perma<strong>${x.perma?'Ja':'Nein'}</strong></div></div><div class="entry-foot"><span>${esc(x.status)}</span><div class="entry-actions">${x.youtubeId?`<a class="mini-btn" target="_blank" href="https://youtu.be/${encodeURIComponent(x.youtubeId)}">YouTube</a>`:''}<button class="mini-btn edit-entry" data-id="${esc(x.createdAt)}">Bearbeiten</button><button class="mini-btn del-entry" data-id="${esc(x.createdAt)}">Löschen</button></div></div></div></article>`).join('');$('#emptyState').classList.toggle('hidden',entries.length>0);
$$('.del-entry').forEach(b=>b.onclick=async()=>{const x=state.entries.find(e=>e.createdAt===b.dataset.id);if(x){state.entries=state.entries.filter(e=>e.createdAt!==b.dataset.id);saveMeta();if(x.videoKey)await delVideo(x.videoKey);if(x.videoUrl)URL.revokeObjectURL(x.videoUrl);renderArchive()}});$$('.edit-entry').forEach(b=>b.onclick=async()=>{const x=state.entries.find(e=>e.createdAt===b.dataset.id);if(x){const f=await getVideo(x.videoKey);if(!f){toast('POV-Datei wurde lokal nicht gefunden.');return}openEditor({...x,id:x.videoKey,file:f,result:{...x,complete:true,reviewTimes:x.reviewTimes||{}},types:x.types})}})}
function renderCases(){const bad=state.queue.filter(x=>x.result&&!x.result.complete);$('#casesList').innerHTML=bad.length?bad.map(x=>`<div class="case-row"><div><strong>${esc(x.file.name)}</strong><small>OCR: ID ${x.result.id?'✓':'×'} · Grund ${x.result.reason?'✓':'×'} · SC ${x.result.sc?'✓':'×'} · Server ${x.result.server?'✓':'×'} · Datum ${x.result.date?'✓':'×'}</small></div><button class="mini-btn edit-q" data-id="${x.id}">Daten ergänzen</button></div>`).join(''):'<div class="empty"><h2>Keine offenen Verdachtsfälle</h2><p>Alle bisher erkannten Fälle sind geprüft.</p></div>';$$('.edit-q').forEach(b=>b.onclick=()=>{const x=state.queue.find(x=>x.id===b.dataset.id);if(x)openEditor(x)})}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),4000)}
$('#clientId').value=state.clientId;$('#clientId').oninput=e=>{state.clientId=e.target.value.trim();localStorage.setItem('yt_client_id',state.clientId);initGoogle()};$('#frameCount').value=Math.max(24,Math.min(72,Number(localStorage.getItem('frame_count_v13')||30)));$('#frameCount').onchange=e=>localStorage.setItem('frame_count_v13',Math.max(24,Math.min(72,Number(e.target.value)||36)));
function initGoogle(){if(!window.google?.accounts?.oauth2||!state.clientId)return;state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:state.clientId,scope:'https://www.googleapis.com/auth/youtube.upload',callback:r=>{if(r.error)return toast('Google-Anmeldung abgebrochen.');state.accessToken=r.access_token;sessionStorage.setItem('yt_access_token',r.access_token);updateYtStatus()}})}
$('#connectYoutube').onclick=()=>{initGoogle();if(!state.tokenClient)return toast('Bitte zuerst die Google OAuth Client-ID eintragen.');state.tokenClient.requestAccessToken({prompt:'consent'})};$('#disconnectYoutube').onclick=()=>{state.accessToken='';sessionStorage.removeItem('yt_access_token');updateYtStatus()};function updateYtStatus(){$('#ytStatus').innerHTML=state.accessToken?'<span class="status-dot"></span>YouTube verbunden':'<span class="status-dot muted-dot"></span>Nicht verbunden'}setTimeout(initGoogle,1200);
$('#clearLocal').onclick=async()=>{if(!confirm('Wirklich alle lokalen Archivdaten und POV-Dateien löschen?'))return;state.entries=[];state.queue=[];localStorage.removeItem(META_KEY);await clearDB();renderArchive();renderQueue();renderCases();toast('Lokales Archiv gelöscht.')};
window.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus()}if(e.key==='Escape'&&!$('#editorModal').classList.contains('hidden'))closeEditor()});
(async()=>{await hydrate();renderArchive();renderQueue();updateYtStatus();showView('archive')})();
