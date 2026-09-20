const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
const META_KEY='grandrp_pov_meta_v4', DB_NAME='grandrp_pov_db_v1', STORE='videos';
const state={entries:[],queue:[],filter:'all',editing:null,selectedTypes:[],accessToken:sessionStorage.getItem('yt_access_token')||'',tokenClient:null,clientId:localStorage.getItem('yt_client_id')||'',processing:false};
const views={archive:['Archiv','POV-Fälle, Bans und PC-Checks'],cases:['Verdachtsfälle','Nicht eindeutig erkannte Fälle zur manuellen Prüfung'],upload:['POVs hochladen','Mehrere Aufnahmen gleichzeitig verarbeiten'],settings:['Einstellungen','YouTube und OCR']};
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
function showView(v){$$('.view').forEach(x=>x.classList.remove('active'));$('#view-'+v).classList.add('active');$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#pageTitle').textContent=views[v][0];$('#pageSubtitle').textContent=views[v][1];if(v==='archive')renderArchive();if(v==='cases')renderCases()}
$$('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#newUploadBtn').onclick=()=>showView('upload');$('#emptyUploadBtn').onclick=()=>showView('upload');$('#reloadBtn').onclick=()=>renderArchive();$('#casesRefresh').onclick=()=>renderCases();$('#search').oninput=renderArchive;
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
function preprocess(src,mode='normal'){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0);if(mode==='normal')return c;const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];let v=.299*r+.587*g+.114*b;if(mode==='high')v=v<105?0:255;else if(mode==='dark')v=v<135?0:255;else if(mode==='light')v=v<175?0:255;d[i]=d[i+1]=d[i+2]=v}ctx.putImageData(im,0,0);return c}
function serverDigitCrops(v){
  // Grand-style HUD: server badge is the small yellow badge at the extreme top-right.
  // Detect the yellow badge by color/shape instead of OCR'ing the whole HUD.
  const base=crop(v,.88,0,.12,.14,4.5),ctx=base.getContext('2d',{willReadFrequently:true});
  const im=ctx.getImageData(0,0,base.width,base.height),d=im.data,w=base.width,h=base.height;
  const mask=new Uint8Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=(y*w+x)*4,r=d[i],g=d[i+1],b=d[i+2];
    mask[y*w+x]=(r>155&&g>120&&b<120&&r>b*1.5&&g>b*1.25)?1:0;
  }
  const seen=new Uint8Array(w*h), comps=[];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=y*w+x;if(!mask[p]||seen[p])continue;
    const q=[p];seen[p]=1;let minX=x,maxX=x,minY=y,maxY=y,n=0;
    for(let qi=0;qi<q.length;qi++){
      const z=q[qi],zx=z%w,zy=(z-zx)/w;n++;minX=Math.min(minX,zx);maxX=Math.max(maxX,zx);minY=Math.min(minY,zy);maxY=Math.max(maxY,zy);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const nx=zx+dx,ny=zy+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const np=ny*w+nx;if(mask[np]&&!seen[np]){seen[np]=1;q.push(np)}}
    }
    const cw=maxX-minX+1,ch=maxY-minY+1,fill=n/(cw*ch);
    if(n>80&&cw>=12&&ch>=12&&cw<=base.width*.7&&ch<=base.height*.7&&cw/ch>.55&&cw/ch<1.8&&fill>.28){
      comps.push({n,minX,maxX,minY,maxY,fill});
    }
  }
  comps.sort((a,b)=>a.minY-b.minY||b.n-a.n);
  const out=[];
  for(const box of comps.slice(0,5)){
    const pad=Math.max(10,Math.round(Math.min(box.maxX-box.minX+1,box.maxY-box.minY+1)*.45));
    const sx=Math.max(0,box.minX-pad),sy=Math.max(0,box.minY-pad),ex=Math.min(w,box.maxX+pad+1),ey=Math.min(h,box.maxY+pad+1);
    const c=document.createElement('canvas');c.width=ex-sx;c.height=ey-sy;c.getContext('2d').putImageData(ctx.getImageData(sx,sy,c.width,c.height),0,0);out.push(c);
  }
  // Fallback: a deliberately narrow fixed crop around the badge, not the rest of the HUD.
  if(!out.length)out.push(crop(v,.955,.004,.04,.045,7));
  return out;
}
function serverVotesFromTexts(texts){
  const vals=[];
  for(const t of texts){
    const s=String(t||'').replace(/[^1-4]/g,'');
    if(s.length===1)vals.push(s);
    else if(/\b[1-4]\b/.test(t))vals.push(t.match(/\b([1-4])\b/)?.[1]||'');
  }
  return vals.filter(Boolean);
}

function normalizeOcr(s){
  return String(s||'')
    .replace(/\r/g,'')
    .replace(/[“”]/g,'"')
    .replace(/[‘’]/g,"'")
    .replace(/[‐‑‒–—]/g,'-')
    .replace(/\u00a0/g,' ')
    .split('\n')
    .map(line=>line.replace(/[ \t]+/g,' ').trim())
    .filter(Boolean)
    .join('\n');
}

function cleanText(s){
  return String(s||'')
    .replace(/\r/g,' ')
    .replace(/\b(?:\[?A\]?\s*)?IP\s*:[\s\S]*$/i,'')
    .replace(/\bSC\s*:[\s\S]*$/i,'')
    .replace(/\b(?:für|for)\s+\d+\s+(?:Tage|Days)\b[\s\S]*$/i,'')
    .replace(/\s+/g,' ')
    .replace(/[|]+$/,'')
    .trim();
}

const ALLOWED_REASONS=[
  'PC Check Positiv',
  'PC Check Verweigert',
  'Cheating',
  'Acc 1.1',
  'Acc 1.4',
  'Event 1.7'
];

function normalizeId(s){
  return String(s||'').toUpperCase()
    .replace(/[OQIDL|]/g,'1').replace(/[Z]/g,'2').replace(/[S]/g,'5')
    .replace(/[G]/g,'6').replace(/[T]/g,'7').replace(/[B]/g,'8')
    .replace(/[^0-9]/g,'');
}
function normalizeHex(s){
  // Never rewrite valid A-F characters. Only map characters that cannot be a hex digit.
  return String(s||'')
    .replace(/[OoQq]/g,'0').replace(/[IiLl|]/g,'1')
    .replace(/[Zz]/g,'2').replace(/[Ss]/g,'5').replace(/[Gg]/g,'6')
    .replace(/[^0-9A-Fa-f]/g,'');
}
function reasonKey(s){return String(s||'').toLowerCase().replace(/[^a-z0-9]/g,'')}
function levenshtein(a,b){
  a=String(a);b=String(b);if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;
  let prev=Array.from({length:b.length+1},(_,i)=>i);
  for(let i=1;i<=a.length;i++){
    const cur=[i];
    for(let j=1;j<=b.length;j++) cur[j]=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));
    prev=cur;
  }
  return prev[b.length];
}
function similarity(a,b){a=reasonKey(a);b=reasonKey(b);if(!a||!b)return 0;return 1-levenshtein(a,b)/Math.max(a.length,b.length)}
function normalizeReasonOcrText(s){
  return String(s||'').toLowerCase()
    .replace(/[‐‑‒–—]/g,'-')
    .replace(/[|]/g,'i')
    .replace(/0/g,'o')
    .replace(/[^a-z0-9. -]/g,' ')
    .replace(/\s+/g,' ').trim();
}
function reasonScoreForWindow(text, allowed){
  const nk=reasonKey(text), ak=reasonKey(allowed);
  let score=similarity(nk,ak);
  const compact=nk;
  if(allowed==='Cheating'){
    if(/cheat(?:ing|er)?/.test(compact)) score=Math.max(score,.96);
  }else if(/^Acc 1\.1$/.test(allowed)){
    if(/\bacc?\s*1\s*1\b/.test(text)||/acc11/.test(compact)) score=Math.max(score,.95);
  }else if(/^Acc 1\.4$/.test(allowed)){
    if(/\bacc?\s*1\s*4\b/.test(text)||/acc14/.test(compact)) score=Math.max(score,.95);
  }else if(/^Event 1\.7$/.test(allowed)){
    if(/event\s*1\s*7/.test(text)||/event17/.test(compact)) score=Math.max(score,.95);
  }else if(allowed==='PC Check Positiv'){
    const pc=/p.?c.?\s*check/.test(compact), pos=/posit/.test(compact)||/posi/.test(compact);
    if(pc&&pos)score=Math.max(score,.96);
  }else if(allowed==='PC Check Verweigert'){
    const pc=/p.?c.?\s*check/.test(compact), ver=/verweig|verweiger|verweigert/.test(compact);
    // OCR often turns "Check Verweigerung" into fragmented tokens; PC + an approximate "verweig" is enough.
    if(pc&&ver)score=Math.max(score,.96);
    if(pc&&/rwe|we1g|we!g/.test(compact))score=Math.max(score,.90);
  }
  return score;
}
function classifyAllowedReason(src){
  const normalized=normalizeOcr(src);
  const lines=normalized.split('\n').map(x=>x.trim()).filter(Boolean);
  const lower=normalized.toLowerCase();
  const marker=/gr[uú]nd\s*[:\-]?/i.exec(lower);
  const candidateChunks=[];
  if(marker){
    const after=normalized.slice(marker.index+marker[0].length);
    const stop=after.search(/\b(?:IP|SC|5C|Social\s+Club)\s*:/i);
    candidateChunks.push((stop>=0?after.slice(0,stop):after).slice(0,120));
  }
  // Also score each OCR line and short 2-4 line windows. This handles arbitrary line breaks.
  candidateChunks.push(...lines.slice(0,12));
  for(let i=0;i<lines.length;i++){
    candidateChunks.push(lines.slice(i,Math.min(lines.length,i+4)).join(' '));
  }
  let best={reason:'',score:0};
  for(const chunk of candidateChunks){
    const clean=normalizeReasonOcrText(chunk);
    for(const allowed of ALLOWED_REASONS){
      let score=reasonScoreForWindow(clean,allowed);
      // Compare the clean text to short windows of tokens to avoid IP/SC noise dominating.
      const words=clean.split(/\s+/).filter(Boolean);
      for(let i=0;i<words.length;i++){
        let acc='';
        for(let j=i;j<Math.min(words.length,i+7);j++){
          acc+=(acc?' ':'')+words[j];
          score=Math.max(score,reasonScoreForWindow(acc,allowed));
        }
      }
      if(score>best.score)best={reason:allowed,score};
    }
  }
  return best.score>=.76?best:{reason:'',score:best.score};
}
function findTargetId(src){
  const text=normalizeOcr(src);
  let m=text.match(/\bhat\s+[^\n\[]{1,90}\[(\d{1,8})\]/i);
  if(m)return normalizeId(m[1]);
  // Prefer the second bracketed ID in the administrator ban sentence.
  const line=text.split('\n').find(x=>/hat/i.test(x));
  if(line){
    const ids=[...line.matchAll(/\[(?:\s*)([0-9OIQLZSGB]{1,8})(?:\s*)\]/gi)].map(x=>normalizeId(x[1])).filter(Boolean);
    if(ids.length>=2)return ids[1];
    if(ids.length===1)return ids[0];
  }
  const ids=[...text.matchAll(/\[(?:\s*)([0-9OIQLZSGB]{3,8})(?:\s*)\]/gi)].map(x=>normalizeId(x[1])).filter(Boolean);
  return ids.length>=2?ids[1]:(ids[0]||'');
}
function extractSc40(text){
  const raw=String(text||'');
  const compact=normalizeHex(raw);
  const hits=compact.match(/[0-9a-f]{40}/gi)||[];
  return hits.filter(x=>x.length===40).map(x=>x.toLowerCase());
}
function extractScCandidatesFromText(src){
  const n=normalizeOcr(src);
  const lines=n.split('\n');
  const out=[];
  const markerRe=/\b(?:SC|5C|S\s*C|SOCIAL\s+CLUB(?:\s+ID)?)\b\s*[:\-]?/i;
  let idx=-1,match=null;
  for(let i=0;i<lines.length;i++){
    const m=markerRe.exec(lines[i]);
    if(m){idx=i;match=m;break;}
  }
  if(idx>=0){
    const same=match?lines[idx].slice(match.index+match[0].length):'';
    const block=[same,lines[idx+1]||'',lines[idx+2]||''].join('\n');
    out.push(...extractSc40(block));
  }
  return [...new Set(out)];
}
function extractScFromDetailed(data,canvas){
  const candidates=[];
  for(const d of data){
    const words=(d?.words||[]).filter(w=>String(w.text||'').trim());
    for(const w of words){
      const wt=String(w.text||'').replace(/[^A-Za-z0-9]/g,'').toLowerCase();
      if(!/^(sc|5c|social|club)$/.test(wt))continue;
      const b=w.bbox||{},lineH=Math.max(18,(b.y1||0)-(b.y0||0));
      const x0=Math.max(0,Math.floor((b.x0||0)-lineH*.1));
      const y0=Math.max(0,Math.floor((b.y0||0)-lineH*.15));
      const y1=Math.min(canvas.height,Math.floor((b.y1||0)+lineH*2.8));
      const c=document.createElement('canvas');c.width=Math.max(40,canvas.width-x0);c.height=Math.max(20,y1-y0);
      c.getContext('2d').drawImage(canvas,x0,y0,c.width,c.height,0,0,c.width,c.height);
      candidates.push(c);
    }
  }
  return candidates.slice(0,5);
}
function validDate(s){return /^20\d{2}-\d{2}-\d{2}$/.test(s||'')}
function bestVote(values,normalizer,minLen=1){const vals=values.map(v=>normalizer(v)).filter(v=>v&&v.length>=minLen);if(!vals.length)return'';const map=new Map();for(const v of vals)map.set(v,(map.get(v)||0)+1);return [...map.entries()].sort((a,b)=>b[1]-a[1])[0][0]}
function voteConfidence(values,normalizer,winner){const vals=values.map(v=>normalizer(v)).filter(Boolean);if(!vals.length||!winner)return 0;return vals.filter(v=>v===winner).length/vals.length}
function inferTypes(reason){
  switch(reason){
    case 'PC Check Positiv': return ['pccheck'];
    case 'PC Check Verweigert': return ['pccheck'];
    case 'Cheating': return ['cheater'];
    default:return[];
  }
}
function serverDigitCrops(v){
  const crops=[];
  // Very tight top-right crops; only the yellow server badge is considered.
  for(const [x,y,w,h,s] of [[.935,.005,.065,.10,7],[.91,.00,.09,.12,6]]) crops.push(crop(v,x,y,w,h,s));
  return crops;
}
function serverVotesFromText(t){
  const s=String(t||'').replace(/[^1-4]/g,'');
  return s.length===1?[s]:[];
}
function preprocess(src,mode='normal'){
  const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0);
  if(mode==='normal')return c;
  const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
  for(let i=0;i<d.length;i+=4){const r=d[i],g=d[i+1],b=d[i+2];let v=.299*r+.587*g+.114*b;if(mode==='high')v=v<105?0:255;else if(mode==='dark')v=v<135?0:255;else if(mode==='light')v=v<175?0:255;d[i]=d[i+1]=d[i+2]=v;}
  ctx.putImageData(im,0,0);return c;
}
function crop(v,x,y,w,h,scale=1.35){
  const c=document.createElement('canvas'),vw=v.videoWidth,vh=v.videoHeight;c.width=Math.max(1,Math.round(vw*w*scale));c.height=Math.max(1,Math.round(vh*h*scale));
  const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.drawImage(v,Math.round(vw*x),Math.round(vh*y),Math.round(vw*w),Math.round(vh*h),0,0,c.width,c.height);return c;
}
async function ocr(worker,canvas,params={}){
  await worker.setParameters({tessedit_pageseg_mode:params.psm??6,tessedit_char_whitelist:params.whitelist||'',preserve_interword_spaces:'1',user_defined_dpi:'300'});
  const r=await worker.recognize(canvas);return r.data||{text:'',words:[]};
}
function extractDate(s){
  let m=String(s||'').match(/\b(20\d{2})[.\-/](\d{1,2})[.\-/](\d{1,2})\b/);if(m)return`${m[1]}-${String(m[2]).padStart(2,'0')}-${String(m[3]).padStart(2,'0')}`;
  m=String(s||'').match(/\b(\d{1,2})[.\-/](\d{1,2})[.\-/](20\d{2})\b/);return m?`${m[3]}-${String(m[2]).padStart(2,'0')}-${String(m[1]).padStart(2,'0')}`:'';
}
function hamming(a,b){if(!a||!b||a.length!==b.length)return 99;let d=0;for(let i=0;i<a.length;i++)if(a[i]!==b[i])d++;return d}
function chooseSc(candidates){
  const vals=candidates.filter(x=>/^[0-9a-f]{40}$/.test(x));if(!vals.length)return {value:'',confidence:0,count:0};
  const clusters=[];
  for(const v of vals){
    let best=null,bd=99;
    for(const c of clusters){const dist=hamming(v,c.seed);if(dist<bd){bd=dist;best=c;}}
    if(best&&bd<=8){best.items.push(v);best.weight+=1}else clusters.push({seed:v,items:[v],weight:1});
  }
  clusters.sort((a,b)=>b.weight-a.weight);const top=clusters[0];if(!top)return {value:'',confidence:0,count:0};
  const support=top.items.length;
  if(support<3)return {value:'',confidence:support/Math.max(1,vals.length),count:support};
  // Return the real observed candidate with the most cluster support, not a synthetic string.
  const counts=new Map();for(const x of top.items)counts.set(x,(counts.get(x)||0)+1);
  const observed=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];
  return {value:observed[0],confidence:support/vals.length,count:support};
}
async function analyzeVideo(video,duration,onProgress){
  const frames=Math.max(24,Math.min(72,Number(localStorage.getItem('frame_count_v10')||36)));
  const start=Math.max(0,duration-40),span=Math.max(.1,duration-start);
  const worker=await Tesseract.createWorker('eng',1);
  const idRecords=[],reasonRecords=[],broadFrames=[];
  try{
    // Fast broad pass: one normal OCR per frame. We deliberately do not OCR SC/IP/date here.
    for(let i=0;i<frames;i++){
      const t=start+span*((i+.12)/frames);await seek(video,t);
      const left=crop(video,0,.055,.72,.28,2.8);
      const a=await ocr(worker,left,{psm:6});
      const parsed=parseSingleFrame(a.text||'');
      idRecords.push(parsed.id);reasonRecords.push({reason:parsed.reason,score:parsed.reasonScore||0});
      broadFrames.push({i,t,parsed,text:a.text||''});
      onProgress(10+((i+1)/frames)*48,`Schnellscan · ${i+1}/${frames}`);
    }
    const id=bestVote(idRecords,normalizeId,3);
    const reasonVotes=reasonRecords.filter(x=>x.reason).map(x=>x.reason);
    const reason=bestVote(reasonVotes,x=>x,1);
    // Focus on the strongest frames plus nearby frames. This is much faster and more precise than brute-force OCR everywhere.
    const ranked=broadFrames
      .filter(x=>x.parsed.id===id || x.parsed.reason===reason)
      .sort((a,b)=>(b.parsed.id===id?1:0)+(b.parsed.reason===reason?1:0)+b.parsed.reasonScore-( (a.parsed.id===id?1:0)+(a.parsed.reason===reason?1:0)+a.parsed.reasonScore));
    const focusIdx=new Set();
    for(const r of ranked.slice(0,8)){for(let d=-1;d<=1;d++){const idx=r.i+d;if(idx>=0&&idx<broadFrames.length)focusIdx.add(idx)}}
    const focusFrames=[...focusIdx].sort((a,b)=>a-b).map(i=>broadFrames[i]);

    const scCandidates=[];const serverVotes=[];const dateVotes=[];
    for(let k=0;k<focusFrames.length;k++){
      const fr=focusFrames[k];await seek(video,fr.t);
      const left=crop(video,0,.055,.72,.30,3.4);
      const normal=await ocr(worker,left,{psm:6});
      const line11=await ocr(worker,preprocess(left,'dark'),{psm:11});
      const combinedText=[normal.text||'',line11.text||''].join('\n');
      const p=parseSingleFrame(combinedText);
      if(p.id===id && p.reason===reason){
        scCandidates.push(...extractScCandidatesFromText(combinedText));
        const markerCrops=extractScFromDetailed([normal,line11],left);
        for(const c of markerCrops.slice(0,3)){
          const s=await ocr(worker,c,{psm:6,whitelist:'0123456789abcdefABCDEF'});
          scCandidates.push(...extractSc40(s.text||''));
        }
      }
      // Server badge: only the tight top-right yellow badge crops, never the whole HUD.
      for(const scrop of serverDigitCrops(video)){
        const s=await ocr(worker,scrop,{psm:10,whitelist:'1234'});serverVotes.push(...serverVotesFromText(s.text||''));
        const sh=await ocr(worker,preprocess(scrop,'high'),{psm:10,whitelist:'1234'});serverVotes.push(...serverVotesFromText(sh.text||''));
      }
      // Date: right-bottom only.
      const dc=crop(video,.82,.86,.18,.14,4.5);const d1=await ocr(worker,dc,{psm:7,whitelist:'0123456789./-'});const d2=await ocr(worker,preprocess(dc,'dark'),{psm:7,whitelist:'0123456789./-'});
      const dt=extractDate((d1.text||'')+'\n'+(d2.text||''));if(validDate(dt))dateVotes.push(dt);
      onProgress(58+((k+1)/Math.max(1,focusFrames.length))*37,`Präzisionsscan · ${k+1}/${focusFrames.length}`);
    }
    const scChoice=chooseSc(scCandidates);
    const sc=scChoice.value;
    const serverMap=new Map();for(const s of serverVotes)serverMap.set(s,(serverMap.get(s)||0)+1);const serverSorted=[...serverMap.entries()].sort((a,b)=>b[1]-a[1]);
    const serverTop=serverSorted[0];const server=serverTop&&serverTop[1]>=6&&serverTop[1]/Math.max(1,serverVotes.length)>=.62?serverTop[0]:'';
    const date=bestVote(dateVotes,x=>x,10);
    const types=inferTypes(reason);
    const idConf=voteConfidence(idRecords,normalizeId,id),reasonConf=voteConfidence(reasonVotes,x=>x,reason);
    const serverConf=serverTop?serverTop[1]/Math.max(1,serverVotes.length):0,dateConf=voteConfidence(dateVotes,x=>x,date);
    // Complete only when the OCR has a real SC cluster. No guessing from single frames.
    const complete=!!(id&&ALLOWED_REASONS.includes(reason)&&sc&&server&&date&&idConf>=.45&&reasonConf>=.50&&scChoice.count>=3&&serverConf>=.62&&dateConf>=.50);
    return {id,reason,sc,server,date,types,complete,found:complete,confidence:{id:idConf,reason:reasonConf,sc:scChoice.confidence,server:serverConf,date:dateConf},debug:{scCandidates:scCandidates.length,serverVotes:serverVotes.length,focusFrames:focusFrames.length}};
  }finally{await worker.terminate()}
}
function parseSingleFrame(texts){
  const src=normalizeOcr(texts||'');const id=findTargetId(src);const r=classifyAllowedReason(src);return{id,reason:r.reason,reasonScore:r.score};
}

function openEditor(item){state.editing=item;state.selectedTypes=[...new Set([...(item.types||[]), ...inferTypes((item.result||{}).reason||item.reason||'')])];const p=item.result||{};$('#modalFile').textContent=item.file.name;$('#targetId').value=p.id||item.id||'';$('#reason').value=p.reason||item.reason||'';$('#sc').value=p.sc||item.sc||'';$('#server').value=p.server||item.server||'';$('#date').value=p.date||item.date||today();$('#perma').checked=!!item.perma;$('#notBanned').checked=!!item.notBanned;$$('#banTypes .chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.includes(c.dataset.value)));$('#ocrWarning').classList.toggle('hidden',!!p.complete);updateTitle();$('#editorModal').classList.remove('hidden')}
function closeEditor(){state.editing=null;$('#editorModal').classList.add('hidden');renderQueue();renderCases()}
$('#closeModal').onclick=closeEditor;$('#cancelBtn').onclick=closeEditor;
$$('#banTypes .chip').forEach(c=>c.onclick=()=>{c.classList.toggle('active');state.selectedTypes=$$('#banTypes .chip.active').map(x=>x.dataset.value);updateTitle()});
['#targetId','#reason','#date'].forEach(s=>$(s).oninput=updateTitle);function updateTitle(){const id=$('#targetId').value.trim()||'UNBEKANNT',r=$('#reason').value.trim()||'Unbekannt',d=$('#date').value||today();$('#titlePreview').value=`${id}, ${r}, ${fmtDate(d)}`}
$('#perma').onchange=e=>{if(e.target.checked)$('#notBanned').checked=false};$('#notBanned').onchange=e=>{if(e.target.checked)$('#perma').checked=false};
$('#entryForm').onsubmit=async e=>{e.preventDefault();const item=state.editing;if(!item)return;const entry={id:$('#targetId').value.trim(),reason:$('#reason').value.trim(),sc:$('#sc').value.trim(),server:$('#server').value.trim(),date:$('#date').value||today(),types:[...state.selectedTypes],perma:$('#perma').checked,notBanned:$('#notBanned').checked,fileName:`${$('#targetId').value.trim()||'UNBEKANNT'}, ${$('#reason').value.trim()||'Unbekannt'}, ${fmtDate($('#date').value||today())}${ext(item.file.name)}`,createdAt:new Date().toISOString(),youtubeId:'',status:'Gespeichert · YouTube nicht verbunden',videoUrl:''};if(!entry.id&&!entry.notBanned){toast('ID fehlt. Bitte ergänzen.');return}if(!entry.notBanned&&!entry.reason){toast('Grund fehlt. Bitte ergänzen.');return}$('#saveBtn').disabled=true;$('#saveBtn').textContent='Wird gespeichert …';try{await putVideo(entry.id+'_'+entry.createdAt,item.file);entry.videoKey=entry.id+'_'+entry.createdAt;entry.videoUrl=URL.createObjectURL(item.file);if(state.accessToken&&!entry.notBanned){$('#saveBtn').textContent='YouTube Upload läuft …';entry.youtubeId=await uploadToYouTube(item.file,entry);entry.status='YouTube · Nicht gelistet'}state.entries.unshift(entry);saveMeta();state.queue=state.queue.filter(x=>x.id!==item.id);closeEditor();renderArchive();toast(entry.youtubeId?'POV hochgeladen, nicht gelistet und archiviert.':'Eintrag gespeichert.');showView('archive')}catch(err){console.error(err);toast('Fehler: '+(err.message||err))}finally{$('#saveBtn').disabled=false;$('#saveBtn').textContent='Speichern & YouTube hochladen'}};
function ext(n){const m=n.match(/\.[^.]+$/);return m?m[0]:'.mp4'}
async function uploadToYouTube(file,entry){const metadata={snippet:{title:entry.fileName.replace(/\.[^.]+$/,''),description:`Server: ${entry.server||'unbekannt'}\nSC: ${entry.sc||'unbekannt'}\nPerma-Bann: ${entry.perma?'Ja':'Nein'}\nBann-Typen: ${entry.types.join(', ')||'keiner'}`},status:{privacyStatus:'unlisted',selfDeclaredMadeForKids:false}};const init=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{Authorization:'Bearer '+state.accessToken,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Length':String(file.size),'X-Upload-Content-Type':file.type||'application/octet-stream'},body:JSON.stringify(metadata)});if(!init.ok)throw new Error('YouTube: '+await init.text());const url=init.headers.get('Location');if(!url)throw new Error('Keine YouTube Upload-URL erhalten.');let start=0,chunk=8*1024*1024;while(start<file.size){const end=Math.min(start+chunk,file.size)-1;const res=await fetch(url,{method:'PUT',headers:{'Content-Length':String(end-start+1),'Content-Range':`bytes ${start}-${end}/${file.size}`},body:file.slice(start,end+1)});if(res.status===308){const range=res.headers.get('Range');start=range?parseInt(range.split('-')[1])+1:end+1}else if(res.ok){return(await res.json()).id}else throw new Error('YouTube Upload: '+await res.text())}}
function renderArchive(){const q=$('#search').value.toLowerCase();const entries=state.entries.filter(x=>{const t=x.types||[];let ok=state.filter==='all'||(state.filter==='ban'&&t.some(v=>['hardban','socban','cheater','negativ'].includes(v)))||(state.filter==='pccheck'&&t.includes('pccheck'))||(state.filter==='socban'&&t.includes('socban'))||(state.filter==='hardban'&&t.includes('hardban'))||(state.filter==='cheater'&&t.includes('cheater'))||(state.filter==='negativ'&&t.includes('negativ'))||(state.filter==='novideo'&&!x.youtubeId);return ok&&JSON.stringify(x).toLowerCase().includes(q)});
$('#countAll').textContent=state.entries.length;$('#countBan').textContent=state.entries.filter(x=>(x.types||[]).some(t=>['hardban','socban','cheater','negativ'].includes(t))).length;$('#countPc').textContent=state.entries.filter(x=>(x.types||[]).includes('pccheck')).length;$('#countSoc').textContent=state.entries.filter(x=>(x.types||[]).includes('socban')).length;$('#countHard').textContent=state.entries.filter(x=>(x.types||[]).includes('hardban')).length;$('#countCheat').textContent=state.entries.filter(x=>(x.types||[]).includes('cheater')).length;$('#countNeg').textContent=state.entries.filter(x=>(x.types||[]).includes('negativ')).length;$('#countNoVideo').textContent=state.entries.filter(x=>!x.youtubeId).length;
$('#archiveGrid').innerHTML=entries.map(x=>`<article class="entry"><div class="thumb">${x.videoUrl?`<video src="${esc(x.videoUrl)}" muted preload="metadata"></video>`:'<div class="thumb-placeholder">◉</div>'}<div class="badge-row">${(x.types||[]).map(t=>`<span class="type-badge">${esc(t)}</span>`).join('')}<span class="server-badge">Server ${esc(x.server||'?')}</span></div></div><div class="entry-body"><h3>${esc(x.id||'Nicht gebannt')} · ${esc(x.reason||'Kein Grund')}</h3><div class="meta"><div>ID<strong>${esc(x.id||'—')}</strong></div><div>Datum<strong>${esc(fmtDate(x.date))}</strong></div><div>SC<strong title="${esc(x.sc)}">${esc(x.sc||'—')}</strong></div><div>Perma<strong>${x.perma?'Ja':'Nein'}</strong></div></div><div class="entry-foot"><span>${esc(x.status)}</span><div class="entry-actions">${x.youtubeId?`<a class="mini-btn" target="_blank" href="https://youtu.be/${encodeURIComponent(x.youtubeId)}">YouTube</a>`:''}<button class="mini-btn edit-entry" data-id="${esc(x.createdAt)}">Bearbeiten</button><button class="mini-btn del-entry" data-id="${esc(x.createdAt)}">Löschen</button></div></div></div></article>`).join('');$('#emptyState').classList.toggle('hidden',entries.length>0);
$$('.del-entry').forEach(b=>b.onclick=async()=>{const x=state.entries.find(e=>e.createdAt===b.dataset.id);if(x){state.entries=state.entries.filter(e=>e.createdAt!==b.dataset.id);saveMeta();if(x.videoKey)await delVideo(x.videoKey);if(x.videoUrl)URL.revokeObjectURL(x.videoUrl);renderArchive()}});$$('.edit-entry').forEach(b=>b.onclick=async()=>{const x=state.entries.find(e=>e.createdAt===b.dataset.id);if(x){const f=await getVideo(x.videoKey);if(!f){toast('POV-Datei wurde lokal nicht gefunden.');return}openEditor({...x,id:x.videoKey,file:f,result:{...x,complete:true},types:x.types})}})}
function renderCases(){const bad=state.queue.filter(x=>x.result&&!x.result.complete);$('#casesList').innerHTML=bad.length?bad.map(x=>`<div class="case-row"><div><strong>${esc(x.file.name)}</strong><small>OCR: ID ${x.result.id?'✓':'×'} · Grund ${x.result.reason?'✓':'×'} · SC ${x.result.sc?'✓':'×'} · Server ${x.result.server?'✓':'×'} · Datum ${x.result.date?'✓':'×'}</small></div><button class="mini-btn edit-q" data-id="${x.id}">Daten ergänzen</button></div>`).join(''):'<div class="empty"><h2>Keine offenen Verdachtsfälle</h2><p>Alle bisher erkannten Fälle sind geprüft.</p></div>';$$('.edit-q').forEach(b=>b.onclick=()=>{const x=state.queue.find(x=>x.id===b.dataset.id);if(x)openEditor(x)})}
function toast(t){const el=$('#toast');el.textContent=t;el.classList.add('show');clearTimeout(toast.t);toast.t=setTimeout(()=>el.classList.remove('show'),4000)}
$('#clientId').value=state.clientId;$('#clientId').oninput=e=>{state.clientId=e.target.value.trim();localStorage.setItem('yt_client_id',state.clientId);initGoogle()};$('#frameCount').value=Math.max(24,Math.min(72,Number(localStorage.getItem('frame_count_v10')||36)));$('#frameCount').onchange=e=>localStorage.setItem('frame_count_v10',Math.max(24,Math.min(72,Number(e.target.value)||36)));
function initGoogle(){if(!window.google?.accounts?.oauth2||!state.clientId)return;state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:state.clientId,scope:'https://www.googleapis.com/auth/youtube.upload',callback:r=>{if(r.error)return toast('Google-Anmeldung abgebrochen.');state.accessToken=r.access_token;sessionStorage.setItem('yt_access_token',r.access_token);updateYtStatus()}})}
$('#connectYoutube').onclick=()=>{initGoogle();if(!state.tokenClient)return toast('Bitte zuerst die Google OAuth Client-ID eintragen.');state.tokenClient.requestAccessToken({prompt:'consent'})};$('#disconnectYoutube').onclick=()=>{state.accessToken='';sessionStorage.removeItem('yt_access_token');updateYtStatus()};function updateYtStatus(){$('#ytStatus').innerHTML=state.accessToken?'<span class="status-dot"></span>YouTube verbunden':'<span class="status-dot muted-dot"></span>Nicht verbunden'}setTimeout(initGoogle,1200);
$('#clearLocal').onclick=async()=>{if(!confirm('Wirklich alle lokalen Archivdaten und POV-Dateien löschen?'))return;state.entries=[];state.queue=[];localStorage.removeItem(META_KEY);await clearDB();renderArchive();renderQueue();renderCases();toast('Lokales Archiv gelöscht.')};
window.addEventListener('keydown',e=>{if(e.key==='/'&&!['INPUT','TEXTAREA'].includes(document.activeElement.tagName)){e.preventDefault();$('#search').focus()}if(e.key==='Escape'&&!$('#editorModal').classList.contains('hidden'))closeEditor()});
(async()=>{await hydrate();renderArchive();renderQueue();updateYtStatus();showView('archive')})();
