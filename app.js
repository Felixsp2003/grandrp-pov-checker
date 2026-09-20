/* Grand RP DC Checker V26
 * Rebuilt OCR pipeline:
 * - Target ID is ONLY 1..6 digits and MUST be the id after "hat ... [ID] für/fur ...".
 * - SC is treated as the second long identifier after an IPv6-like IP; offline/no-IP => SC empty.
 * - Reason is classified against a closed allowed list, never arbitrary OCR text.
 * - Server is read from the yellow server badge only (top-right ROI), never from HUD numbers.
 * - Fast coarse scan + targeted dense scan instead of brute-forcing every frame.
 */
(function(){
  'use strict';

  const isNode = typeof module !== 'undefined' && module.exports;
  const BUILD='V27';
  const META_KEY='grandrp_pov_meta_v27';
  const DB_NAME='grandrp_pov_db_v27';
  const STORE='videos';

  const ALLOWED_REASONS=[
    'PC Check Positiv',
    'PC Check Verweigert',
    'PC-Check Positiv 4.1 (Discord)',
    'PC-Check Positiv 4.1 (Redux)',
    'PC-Check Positiv (Banevading)',
    'PC Check Positiv (Cleaning)',
    'Cheating',
    'Acc 1.1',
    'Acc 1.4',
    'Event 1.7'
  ];
  const REASON_ALIASES={
    'PC Check Positiv':['pc check positiv','pc-check positiv','pccheck positiv','pccheckpositiv'],
    'PC Check Verweigert':['pc check verweigert','pc-check verweigert','pc-check verweigerung','pc check verweigerung','pccheck verweigerung','pccheckverweigert'],
    'PC-Check Positiv 4.1 (Discord)':['pc-check positiv 4.1 discord','pc check positiv 4.1 discord','pccheck positiv 4.1 discord'],
    'PC-Check Positiv 4.1 (Redux)':['pc-check positiv 4.1 redux','pc check positiv 4.1 redux','pccheck positiv 4.1 redux'],
    'PC-Check Positiv (Banevading)':['pc-check positiv banevading','pc check positiv banevading','pccheck positiv banevading'],
    'PC Check Positiv (Cleaning)':['pc check positiv cleaning','pc-check positiv cleaning','pccheck positiv cleaning'],
    'Cheating':['cheating'],
    'Acc 1.1':['acc 1.1','acc1.1','acc 11'],
    'Acc 1.4':['acc 1.4','acc1.4','acc 14'],
    'Event 1.7':['event 1.7','event1.7','event 17']
  };

  function esc(s){return String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));}
  function cleanText(s){return String(s||'').replace(/\r/g,'').replace(/[“”]/g,'"').replace(/[‘’]/g,"'").replace(/[‐‑‒–—]/g,'-').replace(/\u00a0/g,' ').split('\n').map(x=>x.replace(/[ \t]+/g,' ').trim()).filter(Boolean).join('\n');}
  function compact(s){return cleanText(s).toLowerCase().replace(/[^a-z0-9]+/g,'');}
  function levenshtein(a,b){a=String(a);b=String(b);if(a===b)return 0;if(!a)return b.length;if(!b)return a.length;let p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const c=[i];for(let j=1;j<=b.length;j++)c[j]=Math.min(c[j-1]+1,p[j]+1,p[j-1]+(a[i-1]===b[j-1]?0:1));p=c;}return p[b.length];}
  function similarity(a,b){a=compact(a);b=compact(b);if(!a||!b)return 0;return 1-levenshtein(a,b)/Math.max(a.length,b.length);}
  function normalizeHexLoose(s){
    // Preserve real hexadecimal A-F characters. Only map characters that are
    // impossible in hexadecimal and commonly produced by OCR.
    return String(s||'').toUpperCase()
      .replace(/[OoQq]/g,'0').replace(/[IiLl|!]/g,'1').replace(/[Ss$]/g,'5')
      .replace(/[Gg]/g,'6').replace(/[Zz]/g,'2').replace(/[Tt]/g,'7')
      .replace(/[^0-9A-F]/g,'').toLowerCase();
  }
  function normalizeIdToken(s){
    const raw=String(s||'').toUpperCase().replace(/[^0-9A-Z]/g,'');
    if(!raw || !/\d/.test(raw)) return '';
    const mapped=raw.replace(/[A-Z]/g,ch=>({O:'0',Q:'0',I:'1',L:'1',S:'5',Z:'2',G:'6',B:'8',T:'7'}[ch]||''));
    const digits=mapped.replace(/\D/g,'');
    if(digits.length<1 || digits.length>6) return '';
    return digits;
  }
  function stripChatNoise(text){
    return cleanText(text).replace(/\s+/g,' ').trim()
      .replace(/\s*\[A\]\s*IP\s*:.*/i,'')
      .replace(/\s*\bIP\s*:.*/i,'')
      .replace(/\s*\bSC\s*:?\s*.*/i,'')
      .replace(/\s*Social\s+Club(?:\s+ID)?\s*:?.*/i,'')
      .trim();
  }
  function canonicalReason(text){
    const raw=stripChatNoise(String(text||''));
    if(!raw)return null;
    const variants=[];
    const add=(x)=>{x=stripChatNoise(x);if(x&&!variants.includes(x))variants.push(x);};
    add(raw);
    for(const line of cleanText(text).split('\n')){
      const m=line.match(/Grund\s*[\:\.\-]?\s*(.*)$/i); if(m) add(m[1]);
    }
    // Keep only short reason-like windows so IP/SC/chat text cannot contaminate the reason.
    for(const v of [...variants]){
      const words=v.split(/\s+/); for(let n=1;n<=Math.min(8,words.length);n++) add(words.slice(0,n).join(' '));
    }
    let best=null,bestScore=0;
    for(const candidate of variants){
      const c=compact(candidate).replace(/verweigerung/g,'verweigert').replace(/cheats?/g,'cheating');
      for(const reason of ALLOWED_REASONS){
        for(const alias of [reason,...(REASON_ALIASES[reason]||[])]){
          const a=compact(alias); let score=similarity(c,a);
          if(c===a)score=1;
          if(score>bestScore){bestScore=score;best=reason;}
        }
      }
    }
    return bestScore>=0.76?{value:best,score:bestScore}:null;
  }
  function parseTargetId(text){
    const t=cleanText(text);
    const lines=t.split('\n');
    const joined=[];
    for(let i=0;i<lines.length;i++) joined.push(lines.slice(i, i+3).join(' '));

    // Primary Grand-RP pattern: [ADMIN_ID] has Name [TARGET_ID] für X Tage gebannt.
    const adminTargetRe=/\[[^\]]*\b(\d{1,6})\b[^\]]*\]\s*[^\n]*?\bhat\b[^\n\[]*?\[\s*([0-9A-Za-z]{1,8})\s*\][^\n]*?\b(?:für|fur|for)\b\s*\d{1,3}\s*(?:tage|days)\b/i;
    const bracketAfterHatRe=/\bhat\b[\s\S]{0,160}?\[\s*([0-9A-Za-z]{1,8})\s*\][^\n\r]{0,120}?\b(?:für|fur|for)\b/i;
    for(const j of joined){
      let m=j.match(bracketAfterHatRe);
      if(m){const id=normalizeIdToken(m[1]); if(/^\d{1,6}$/.test(id)) return id;}
      m=j.match(adminTargetRe);
      if(m){const id=normalizeIdToken(m[2]); if(/^\d{1,6}$/.test(id)) return id;}
    }
    // Fallback only when there are exactly two bracketed numeric IDs on an administrator ban line.
    for(const line of lines){
      if(!/(administrator|adminstrator|admin)\b/i.test(line) || !/\bhat\b/i.test(line) || !/(gebannt|banned|\bfür\b|\bfur\b|\bfor\b)/i.test(line)) continue;
      const beforeHat=line.split(/\bhat\b/i)[0]||'';
      const afterHat=line.split(/\bhat\b/i)[1]||'';
      const adminIds=[...beforeHat.matchAll(/\[\s*([0-9]{1,6})\s*\]/g)].map(m=>m[1]);
      const targetMatch=afterHat.match(/\[\s*([0-9A-Za-z]{1,8})\s*\]/);
      if(adminIds.length===1 && targetMatch){const id=normalizeIdToken(targetMatch[1]); if(/^\d{1,6}$/.test(id)) return id;}
    }
    return '';
  }
  function classifyReasonStrong(text){
    const c=compact(String(text||''));
    if(!c) return '';
    if(/event17|event1l|eventi7/.test(c)) return 'Event 1.7';
    if(/acc11/.test(c)) return 'Acc 1.1';
    if(/acc14/.test(c)) return 'Acc 1.4';
    if(/cheat|cheats|cheating/.test(c)) return 'Cheating';
    if(/pc/.test(c)){
      if(/banevad|banvad|banevad/.test(c)) return 'PC-Check Positiv (Banevading)';
      if(/clean|cleaning|cleann/.test(c)) return 'PC Check Positiv (Cleaning)';
      if(/discord|discor/.test(c) && /41|4l|4i/.test(c)) return 'PC-Check Positiv 4.1 (Discord)';
      if(/redux|reduc/.test(c) && /41|4l|4i/.test(c)) return 'PC-Check Positiv 4.1 (Redux)';
      if(/verweig|verweig|rweig|rwelg|welg|weiger|refus|reject|rwel/.test(c)) return 'PC Check Verweigert';
      if(/posit|posiv|p0sit|p0si|posi/.test(c)) return 'PC Check Positiv';
      // Typical OCR corruption observed in the Grand-RP banner: "PC-Che K rwelg Nn".
      if(/pcche/.test(c) && /rwel|welg|weig|nn/.test(c)) return 'PC Check Verweigert';
    }
    return '';
  }
  function parseReason(text){
    const lines=cleanText(text).split('\n');
    const candidates=[];
    for(let i=0;i<lines.length;i++){
      const m=lines[i].match(/Grund\s*[\:\.-]?\s*(.*)$/i);
      if(m){candidates.push(m[1]);if(lines[i+1])candidates.push(m[1]+' '+lines[i+1]);}
    }
    if(!candidates.length)return '';
    for(const c of candidates){const strong=classifyReasonStrong(c);if(strong)return strong;}
    let best=null,bestScore=0;
    for(const c of candidates){
      const r=canonicalReason(c);if(r&&r.score>bestScore){bestScore=r.score;best=r.value;}
    }
    return bestScore>=0.72?best:'';
  }
  function looksLikeIpish(s){
    const x=String(s||'').replace(/[‐‑‒–—]/g,'-');
    return /(?:\d{1,3}[\.:\-]){2,6}[0-9A-Fa-f]{1,8}/i.test(x) || /\b\d{1,3}(?:\.\d{1,3}){3}\b/.test(x);
  }
  function extractLongHexRuns(text, min=34, max=44){
    const raw=String(text||'').replace(/[^0-9A-Za-z]/g,'');
    const approx=raw.toUpperCase().replace(/[^0-9A-F]/g,ch=>({O:'0',Q:'0',I:'1',L:'1',S:'5',G:'6',Z:'2',B:'8',T:'7'}[ch]||''));
    const out=[];
    for(let len=max;len>=min;len--){
      for(let i=0;i+len<=approx.length;i++){
        const seg=approx.slice(i,i+len).toLowerCase();
        const hex=(seg.match(/[0-9a-f]/g)||[]).length;
        if(hex/seg.length>=0.92) out.push(seg);
      }
    }
    const seen=new Set(); return out.filter(x=>{if(seen.has(x))return false;seen.add(x);return true;});
  }
  function hexCandidateFromPiece(piece){
    const cleaned=String(piece||'').replace(/[^0-9A-Za-z]/g,'');
    if(!cleaned) return '';
    const norm=normalizeHexLoose(cleaned);
    return /^\w{40}$/.test(norm)?norm:'';
  }
  function extractScOrdered(text,targetId='',reason=''){
    const lines=cleanText(text).split('\n');
    let anchor=-1;
    if(targetId){anchor=lines.findIndex(ln=>ln.includes(targetId));}
    if(anchor<0) anchor=lines.findIndex(ln=>/\bhat\b/i.test(ln));
    if(anchor<0) anchor=lines.findIndex(ln=>/Grund\s*[\:\.-]/i.test(ln));
    const startIdx=Math.max(0,(anchor<0?0:anchor-2));
    const endIdx=Math.min(lines.length-1,(anchor<0?lines.length-1:anchor+5));
    for(let i=startIdx;i<=endIdx;i++){
      const line=lines[i];
      const hasIpLabel=/\bIP\s*:/i.test(line);
      const ipish=hasIpLabel || looksLikeIpish(line);
      if(!ipish) continue;
      const afterIpMatch=line.match(/\bIP\s*:\s*(.*)$/i);
      const afterIp=afterIpMatch?afterIpMatch[1]:line;
      // Strongest rule: explicit SC marker.
      const scMark=afterIp.match(/\bSC\s*:\s*(.*)$/i);
      if(scMark){
        const same=scMark[1];
        const c=hexCandidateFromPiece(same);
        if(c) return {candidate:c,online:true};
        const next=hexCandidateFromPiece(lines[i+1]||'');
        if(next) return {candidate:next,online:true};
        const joined=hexCandidateFromPiece([same,lines[i+1]||'',lines[i+2]||''].join(' '));
        if(joined) return {candidate:joined,online:true};
      }
      // Grand-RP invariant: after the IP comes the SC as the next long identifier.
      const parts=[afterIp,lines[i+1]||'',lines[i+2]||''];
      const long=[];
      for(const part of parts){
        const tokens=String(part).split(/\s+/);
        for(const token of tokens){
          const norm=normalizeHexLoose(token);
          if(/^\w{40}$/.test(norm)) long.push(norm);
        }
      }
      if(long.length>=1) return {candidate:long[0],online:true};
      return {candidate:'',online:true};
    }
    return {candidate:'',online:false};
  }
  function extractScCandidatesFromString(text){const r=extractScOrdered(text);return r.candidate?[r.candidate]:[];}
  function extractHexCandidateAnyText(text){
    const c=extractLongHexRuns(String(text||''),32,44).filter(x=>x.length>=38);
    return c[0]||'';
  }

  function levenshteinLimited(a,b,max=12){a=String(a);b=String(b);if(Math.abs(a.length-b.length)>max)return max+1;let prev=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){const cur=[i];let rowMin=cur[0];for(let j=1;j<=b.length;j++){const v=Math.min(cur[j-1]+1,prev[j]+1,prev[j-1]+(a[i-1]===b[j-1]?0:1));cur[j]=v;if(v<rowMin)rowMin=v;}if(rowMin>max)return max+1;prev=cur;}return prev[b.length];}
  function consensusHex(values){
    const vals=(values||[]).map(v=>normalizeHexLoose(v)).filter(v=>/^\w{38,42}$/.test(v));
    if(!vals.length)return '';
    const exact40=vals.filter(v=>v.length===40);
    const counts=new Map(); exact40.forEach(v=>counts.set(v,(counts.get(v)||0)+1));
    const top=[...counts.entries()].sort((a,b)=>b[1]-a[1])[0];
    if(top && top[1]>=2)return top[0];
    // Fuzzy cluster: prefer the longest candidate inside the densest similarity cluster.
    const scored=vals.map((v)=>({v,score:vals.reduce((s,w)=>s+(levenshteinLimited(v,w,10)<=6?1:0),0)})).sort((a,b)=>b.score-a.score||b.v.length-a.v.length);
    if(scored[0] && scored[0].score>=3){
      const cluster=vals.filter(v=>levenshteinLimited(scored[0].v,v,10)<=6);
      const exact=cluster.find(v=>v.length===40); if(exact)return exact;
    }
    return '';
  }
  function extractServerFromOcr(text){
    const t=String(text||'').replace(/\s/g,'');
    // The yellow badge is isolated and OCR runs in single-character mode.
    // Never accept a multi-digit value or a digit embedded in other text.
    return /^[1-4]$/.test(t)?t:'';
  }
  function uniqueVote(values){const clean=values.filter(Boolean);const m=new Map();for(const v of clean)m.set(v,(m.get(v)||0)+1);const arr=[...m.entries()].sort((a,b)=>b[1]-a[1]);return arr.length?{value:arr[0][0],votes:arr[0][1],total:clean.length}:null;}
  function serverVote(values){const v=values.filter(x=>/^[1-4]$/.test(String(x||'')));const m=uniqueVote(v);return m&&m.votes>=Math.max(2,Math.ceil(m.total*.6))?m.value:'';}
  function dateVote(values){const m=uniqueVote(values.filter(Boolean));return m&&m.votes>=Math.max(2,Math.ceil(m.total*.5))?m.value:'';}
  function extractDate(text){const m=String(text||'').match(/\b(0?[1-9]|[12]\d|3[01])[\/\.\-](0?[1-9]|1[0-2])[\/\.\-](20\d{2})\b/);if(!m)return '';const dd=String(m[1]).padStart(2,'0'),mm=String(m[2]).padStart(2,'0'),yyyy=m[3];const d=new Date(Number(yyyy),Number(mm)-1,Number(dd));if(d.getFullYear()!==Number(yyyy)||d.getMonth()!==Number(mm)-1||d.getDate()!==Number(dd))return '';return `${yyyy}-${mm}-${dd}`;}
  function clampId(s){const v=normalizeIdToken(s);return /^\d{1,6}$/.test(v)?v:'';}
  function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
  function consensusString(values, minVotes=2){const m=uniqueVote(values.filter(Boolean));return m&&m.votes>=minVotes?m.value:'';}
  if(isNode){module.exports={ALLOWED_REASONS,compact,similarity,normalizeHexLoose,normalizeIdToken,canonicalReason,parseTargetId,parseReason,extractScOrdered,extractScCandidatesFromString,extractHexCandidateAnyText,consensusHex,extractServerFromOcr,extractDate,serverVote,dateVote,clampId,validDate};return;}

  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  const state={entries:[],queue:[],filter:'all',editing:null,worker:null,accessToken:sessionStorage.getItem('yt_access_token')||'',tokenClient:null,clientId:localStorage.getItem('yt_client_id')||'',settings:{frames:18,window:6,step:0.6},selectedTypes:new Set()};
  const views={archive:['Archiv','POV-Fälle, Bans, PC-Checks und CSV-Export'],cases:['Verdachtsfälle','Fehlende oder widersprüchliche OCR-Angaben'],upload:['POVs hochladen','Mehrere Aufnahmen gleichzeitig verarbeiten'],csv:['CSV erstellen','Export für Proof, Datum, ID, SOC, RID, Discord ID, Familie und Grund'],settings:['Einstellungen','OCR und YouTube']};

  function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2600);}
  function formatSize(n){return n>1024**3?(n/1024**3).toFixed(1)+' GB':n>1024**2?(n/1024**2).toFixed(1)+' MB':Math.max(1,Math.round(n/1024))+' KB';}
  function formatDateDE(v){if(!v)return '';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:v;}
  function loadMeta(){try{state.entries=JSON.parse(localStorage.getItem(META_KEY)||'[]');}catch{state.entries=[];}state.clientId=localStorage.getItem('yt_client_id')||'';$('#clientId').value=state.clientId;}
  function saveMeta(){localStorage.setItem(META_KEY,JSON.stringify(state.entries.map(e=>({...e,file:undefined,videoUrl:undefined}))));}
  async function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function putVideo(id,file){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(file,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  async function getVideo(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function delVideo(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  async function clearDB(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  function showView(v){$$('.view').forEach(x=>x.classList.remove('active'));$('#view-'+v).classList.add('active');$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#pageTitle').textContent=views[v][0];$('#pageSubtitle').textContent=views[v][1];if(v==='archive')renderArchive();if(v==='cases')renderCases();if(v==='csv')renderCsv();}
  function updateCounts(){const all=state.entries;const count=k=>all.filter(e=>e.types?.includes(k)).length;$('#countAll').textContent=all.length;$('#countBan').textContent=all.filter(e=>!e.notBanned).length;$('#countPc').textContent=count('pccheck');$('#countSoc').textContent=count('socban');$('#countHard').textContent=count('hardban');$('#countCheat').textContent=count('cheater');$('#countNeg').textContent=count('negativ');$('#countNoVideo').textContent=all.filter(e=>!e.videoStored).length;}
  function renderArchive(){updateCounts();const q=($('#search').value||'').toLowerCase().trim();const filter=state.filter;const list=state.entries.filter(e=>{if(filter==='ban'&&e.notBanned)return false;if(filter!=='all'&&filter!=='ban'&&!e.types?.includes(filter))return false;if(filter==='novideo'&&e.videoStored)return false;if(!q)return true;return [e.targetId,e.sc,e.reason,e.server,e.proof].some(v=>String(v||'').toLowerCase().includes(q));});$('#archiveGrid').innerHTML=list.map(e=>`<article class="card"><div class="thumb">${e.videoStored?'POV':'OHNE VIDEO'}</div><div class="card-top"><span class="pill">#${esc(e.id.slice(-6))}</span><span class="pill ${e.complete?'good':'warn'}">${e.complete?'Vollständig':'Prüfen'}</span></div><div class="card-body"><div class="card-title">${esc(e.reason||'Unbekannter Grund')}</div><div class="meta"><div><span>ID</span>${esc(e.targetId||'')}</div><div><span>SC / RID</span>${esc(e.sc||'')}</div><div><span>Server</span>${esc(e.server||'')}</div><div><span>Datum</span>${esc(formatDateDE(e.date)||'')}</div></div></div><div class="card-actions"><button class="mini" data-open="${e.id}">Prüfen</button>${e.videoStored?`<button class="mini primary" data-viewvideo="${e.id}">POV öffnen</button>`:''}</div></article>`).join('');$('#emptyState').classList.toggle('hidden',list.length>0);$$('[data-open]').forEach(b=>b.onclick=async()=>{const e=state.entries.find(x=>x.id===b.dataset.open);if(e)openEditorFromEntry(e);});$$('[data-viewvideo]').forEach(b=>b.onclick=async()=>{const e=state.entries.find(x=>x.id===b.dataset.viewvideo);if(e)await openVideoNewTab(e,0);});}
  function renderCases(){const cases=state.entries.filter(e=>!e.complete);$('#casesList').innerHTML=cases.length?cases.map(e=>`<div class="case-row"><div><strong>${esc(e.originalName)}</strong><small>${esc(e.missing.join(' · ')||'Prüfung nötig')}</small></div><button class="mini" data-case="${e.id}">Prüfen</button></div>`).join(''):'<div class="empty"><div class="empty-icon">✓</div><h2>Keine offenen Fälle</h2><p>Alle gespeicherten Fälle haben die Pflichtangaben.</p></div>';$$('[data-case]').forEach(b=>b.onclick=()=>{const e=state.entries.find(x=>x.id===b.dataset.case);if(e)openEditorFromEntry(e);});}
  function csvRows(){return state.entries.filter(e=>e.saved).map(e=>({Proof:e.proof||'',Datum:formatDateDE(e.date),ID:e.targetId||'',SOC:'',RID:e.sc||'',DiscordID:e.discordId||'',Familie:'',Grund:e.reason||''}));}
  function renderCsv(){const rows=csvRows();$('#csvSummary').textContent=`${rows.length} Einträge`;$('#csvPreviewBody').innerHTML=rows.map(r=>`<tr><td>${esc(r.Proof)}</td><td>${esc(r.Datum)}</td><td>${esc(r.ID)}</td><td></td><td>${esc(r.RID)}</td><td>${esc(r.DiscordID)}</td><td></td><td>${esc(r.Grund)}</td></tr>`).join('');}
  function csvText(){const rows=csvRows();const header=['Proof','Datum','ID','SOC','RID','Discord ID','Familie','Grund'];const line=a=>a.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';');return '\uFEFF'+[line(header),...rows.map(r=>line([r.Proof,r.Datum,r.ID,r.SOC,r.RID,r.DiscordID,r.Familie,r.Grund]))].join('\r\n');}
  function downloadCsv(){const blob=new Blob([csvText()],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='grandrp_bans.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function copyCsv(){try{await navigator.clipboard.writeText(csvText());toast('CSV in die Zwischenablage kopiert.');}catch{toast('Kopieren nicht verfügbar. CSV herunterladen.');}}

  function setupNav(){
    $$('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#headerUploadBtn').onclick=()=>showView('upload');$('#emptyUploadBtn').onclick=()=>showView('upload');$('#headerCsvBtn').onclick=()=>showView('csv');$('#reloadBtn').onclick=()=>renderArchive();$('#casesRefresh').onclick=renderCases;$('#search').oninput=renderArchive;$('#refreshCsvBtn').onclick=renderCsv;$('#downloadCsvBtn').onclick=downloadCsv;$('#copyCsvBtn').onclick=copyCsv;
    $$('.filter').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));renderArchive();});
  }

  const dropzone=$('#dropzone'), input=$('#fileInput');
  function setupUpload(){
    $('#chooseBtn').onclick=e=>{e.stopPropagation();input.click();};dropzone.onclick=e=>{if(!e.target.closest('button'))input.click();};input.onchange=e=>{addFiles([...e.target.files]);input.value='';};
    ['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag');}));
    ['dragleave','drop'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag');}));
    dropzone.addEventListener('drop',e=>addFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/i.test(f.name))));
  }
  function addFiles(files){for(const file of files){state.queue.push({id:crypto.randomUUID(),file,status:'Wartet',progress:0,result:null,processing:false,editingDone:false});}renderQueue();processQueue();}
  function renderQueue(){const q=$('#uploadQueue');$('#queueCount').textContent=`${state.queue.length} ${state.queue.length===1?'Datei':'Dateien'}`;q.innerHTML=state.queue.map(item=>`<div class="queue-item"><div class="queue-icon">▶</div><div class="queue-name"><strong>${esc(item.finalName||item.file.name)}</strong><small>${formatSize(item.file.size)} · ${esc(item.status)}</small><div class="progress"><i style="width:${item.progress}%"></i></div></div><div class="queue-actions"><button class="mini" data-check="${item.id}">Prüfen</button><button class="mini" data-remove="${item.id}">×</button></div></div>`).join('');$$('[data-check]').forEach(b=>b.onclick=()=>{const x=state.queue.find(i=>i.id===b.dataset.check);if(x?.result)openEditor(x);});$$('[data-remove]').forEach(b=>b.onclick=()=>{const x=state.queue.find(i=>i.id===b.dataset.remove);if(x?.processing){toast('POV wird gerade verarbeitet.');return;}state.queue=state.queue.filter(i=>i.id!==b.dataset.remove);renderQueue();});}
  async function loaded(v){return new Promise((res,rej)=>{let done=false;const cleanup=()=>{v.removeEventListener('loadedmetadata',ok);v.removeEventListener('error',bad);};const ok=()=>{if(done)return;done=true;cleanup();res();};const bad=()=>{if(done)return;done=true;cleanup();rej(new Error('Video konnte nicht gelesen werden.'));};v.addEventListener('loadedmetadata',ok,{once:true});v.addEventListener('error',bad,{once:true});setTimeout(()=>bad(),20000);});}
  async function seek(v,t){return new Promise((res,rej)=>{let done=false;const cleanup=()=>v.removeEventListener('seeked',ok);const ok=()=>{if(done)return;done=true;cleanup();res();};v.addEventListener('seeked',ok,{once:true});v.currentTime=Math.max(0,Math.min(Number(t)||0,Math.max(0,v.duration-.05)));setTimeout(()=>{if(done)return;done=true;cleanup();rej(new Error('Video-Suche Timeout'));},10000);});}
  function makeCrop(v,x,y,w,h,scale=2){const c=document.createElement('canvas');const vw=v.videoWidth,vh=v.videoHeight;c.width=Math.max(1,Math.round(vw*w*scale));c.height=Math.max(1,Math.round(vh*h*scale));const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.drawImage(v,Math.round(vw*x),Math.round(vh*y),Math.round(vw*w),Math.round(vh*h),0,0,c.width,c.height);return c;}
  function threshold(src,cut=145){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0);const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const v=.299*d[i]+.587*d[i+1]+.114*d[i+2];const b=v<cut?0:255;d[i]=d[i+1]=d[i+2]=b;}ctx.putImageData(im,0,0);return c;}
  function yellowMask(src){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const inCtx=src.getContext('2d',{willReadFrequently:true});const data=inCtx.getImageData(0,0,src.width,src.height).data;const out=c.getContext('2d'),im=out.createImageData(src.width,src.height),d=im.data;for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];const y=(r>140&&g>90&&b<150&&r>b*1.35&&g>b*1.12);const v=y?255:0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}out.putImageData(im,0,0);return c;}
  function sharpness(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height;const data=ctx.getImageData(0,0,w,h).data;let s=0,n=0;for(let y=1;y<h-1;y+=3){for(let x=1;x<w-1;x+=3){const i=(y*w+x)*4;const l=((y*w+x-1)*4),r=((y*w+x+1)*4),u=(((y-1)*w+x)*4),d=(((y+1)*w+x)*4);const g=(data[i]+data[i+1]+data[i+2])/3;const gl=(data[l]+data[l+1]+data[l+2])/3,gr=(data[r]+data[r+1]+data[r+2])/3,gu=(data[u]+data[u+1]+data[u+2])/3,gd=(data[d]+data[d+1]+data[d+2])/3;s+=Math.abs(2*g-gl-gr)+Math.abs(2*g-gu-gd);n++;}}return n?s/n:0;}

  function orangeMask(src){
    const c=document.createElement('canvas'); c.width=src.width; c.height=src.height; const ctx=src.getContext('2d',{willReadFrequently:true}); const data=ctx.getImageData(0,0,src.width,src.height).data; const out=c.getContext('2d'); const im=out.createImageData(src.width,src.height);
    for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2]; const isOrange=(r>70&&g>18&&b<110&&r>g*1.2&&g>b*1.02); const v=isOrange?0:255; im.data[i]=im.data[i+1]=im.data[i+2]=v; im.data[i+3]=255;}
    out.putImageData(im,0,0); return c;
  }
  function makeServerBadgeCrop(video){
    // Two-stage ROI: first a generous top-right search, then yellow connected-component crop.
    const raw=makeCrop(video,.88,.01,.12,.17,4.0); const mask=yellowMask(raw);
    const ctx=mask.getContext('2d',{willReadFrequently:true}); const {width,height}=mask; const d=ctx.getImageData(0,0,width,height).data;
    let minX=width,minY=height,maxX=-1,maxY=-1,count=0; for(let y=0;y<height;y++){for(let x=0;x<width;x++){const i=(y*width+x)*4;if(d[i]>200){count++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}}
    let badge=raw; if(count>100 && maxX>minX && maxY>minY){const pad=18;const sx=Math.max(0,minX-pad),sy=Math.max(0,minY-pad),sw=Math.min(width-sx,maxX-minX+pad*2),sh=Math.min(height-sy,maxY-minY+pad*2);badge=document.createElement('canvas');badge.width=sw;badge.height=sh;badge.getContext('2d').drawImage(raw,sx,sy,sw,sh,0,0,sw,sh);}
    const big=document.createElement('canvas');big.width=badge.width*2;big.height=badge.height*2;big.getContext('2d').drawImage(badge,0,0,big.width,big.height);
    return {variants:[big,threshold(big,160),yellowMask(big)]};
  }
  async function ensureWorker(onProgress){
    if(state.worker)return state.worker;
    if(!window.Tesseract)throw new Error('Tesseract konnte nicht geladen werden. Bitte Internetverbindung prüfen.');
    state.worker=await Tesseract.createWorker('eng');
    await state.worker.setParameters({preserve_interword_spaces:'1'});
    return state.worker;
  }
  async function ocr(worker,canvas,opts={}){
    const p={tessedit_pageseg_mode:String(opts.psm||6)};
    if(opts.whitelist)p.tessedit_char_whitelist=opts.whitelist;
    await worker.setParameters(p);
    const r=await worker.recognize(canvas);
    return r.data;
  }
  function findWordData(data,needle){const n=compact(needle);return (data?.words||[]).filter(w=>compact(w.text||'').includes(n));}
  function extractScFromData(data,canvas){
    const lines=data?.lines||[]; const words=data?.words||[];
    const scWord=words.find(w=>/^sc\:?$/i.test(String(w.text||'').trim()) || /^social$/i.test(String(w.text||'').trim()));
    const ipWord=words.find(w=>/^ip\:?$/i.test(String(w.text||'').trim()));
    let y0=0,y1=Math.min(canvas.height,canvas.height*.28),x0=0;
    if(scWord?.bbox){
      x0=Math.max(0,Math.floor(scWord.bbox.x1+6)); y0=Math.max(0,Math.floor(scWord.bbox.y0-6));
      const nextLines=lines.filter(l=>(l.bbox?.y0||9999)>=y0).slice(0,2);
      y1=Math.min(canvas.height,Math.max(y0+50,...nextLines.map(l=>(l.bbox?.y1||y0+50)))+8);
    } else if(ipWord?.bbox){
      x0=Math.max(0,Math.floor(ipWord.bbox.x1+6)); y0=Math.max(0,Math.floor(ipWord.bbox.y0-6));
      const nextLines=lines.filter(l=>(l.bbox?.y0||9999)>=y0).slice(0,3); y1=Math.min(canvas.height,Math.max(y0+60,...nextLines.map(l=>(l.bbox?.y1||y0+60)))+8);
    } else {
      const ipLine=lines.find(l=>/\bIP\b/i.test(l.text||''));
      if(!ipLine)return {canvas:null,y:0,raw:'',online:false};
      x0=Math.max(0,Math.floor(canvas.width*.22)); y0=Math.max(0,Math.floor((ipLine.bbox?.y0||0)-5)); y1=Math.min(canvas.height,y0+Math.max(80,(ipLine.bbox?.y1||0)-(ipLine.bbox?.y0||0)+70));
    }
    const c=document.createElement('canvas'); c.width=Math.max(1,canvas.width-x0); c.height=Math.max(1,y1-y0); c.getContext('2d').drawImage(canvas,x0,y0,c.width,c.height,0,0,c.width,c.height);
    const raw=lines.filter(l=>(l.bbox?.y1||0)>=y0 && (l.bbox?.y0||0)<=y1).map(l=>l.text||'').join('\n');
    return {canvas:c,y:y0,raw,online:true};
  }
  async function analyzeVideo(video,onProgress){
    const worker=await ensureWorker(); const duration=video.duration; const start=Math.max(0,duration-40); const settings=state.settings;
    const baseCount=Math.max(18,Math.min(28,Number(settings.frames)||24)); const coarse=[];
    // Fast scan: orange chat text only. 24 frames covers the last 40 seconds without brute-force OCR.
    for(let i=0;i<baseCount;i++){
      const t=duration<=40?(duration*(i/Math.max(1,baseCount-1))):start + (39.5*i/Math.max(1,baseCount-1));
      await seek(video,t);
      const chat=makeCrop(video,0,.025,.58,.34,2.7); const om=orangeMask(chat); const data=await ocr(worker,om,{psm:6}); const text=cleanText(data.text||'');
      const id=parseTargetId(text), reason=parseReason(text), scInfo=extractScOrdered(text,id,reason); const score=(id?10:0)+(reason?10:0)+(scInfo.candidate?8:0)+(scInfo.online?3:0)+(/administrator|admin/i.test(text)?2:0)+(/grund/i.test(text)?3:0);
      coarse.push({time:t,chat,data,text,id,reason,sc:scInfo.candidate,online:scInfo.online,score,sharp:sharpness(chat)});
      onProgress?.(8+Math.round(i/baseCount*42),`Schnellscan ${i+1}/${baseCount}`);
    }
    const grouped=new Map(); for(const f of coarse){if(f.id&&f.reason){const k=`${f.id}|${f.reason}`;(grouped.get(k)||grouped.set(k,[]).get(k)).push(f);}}
    let group=[...grouped.values()].sort((a,b)=>b.length-a.length||b.reduce((s,x)=>s+x.score,0)-a.reduce((s,x)=>s+x.score,0))[0]||[];
    if(!group.length)group=coarse.filter(f=>f.id||f.reason).sort((a,b)=>b.score-a.score||b.sharp-a.sharp).slice(0,4);
    const seeds=group.slice().sort((a,b)=>b.score-a.score||b.sharp-a.sharp).slice(0,2);
    const refineTimes=new Set(); const win=Math.max(3,Math.min(7,Number(settings.window)||4.5)); const rstep=Math.max(.4,Math.min(1.0,Number(settings.step)||.5));
    for(const seed of seeds){for(let t=Math.max(start,seed.time-win/2);t<=Math.min(duration-.05,seed.time+win/2);t+=rstep) refineTimes.add(Math.round(t*20)/20);}
    const refined=[]; let n=0; const times=[...refineTimes].sort((a,b)=>a-b);
    for(const t of times){await seek(video,t);const chat=makeCrop(video,0,.025,.58,.34,3.2);const om=orangeMask(chat);const data=await ocr(worker,om,{psm:6});const text=cleanText(data.text||'');const id=parseTargetId(text),reason=parseReason(text),scInfo=extractScOrdered(text,id,reason);refined.push({time:t,chat,data,text,id,reason,sc:scInfo.candidate,online:scInfo.online,score:(id?10:0)+(reason?10:0)+(scInfo.candidate?8:0)+(scInfo.online?3:0),sharp:sharpness(chat)});n++;onProgress?.(50+Math.round(n/Math.max(1,times.length)*28),`Präzisionsscan ${n}/${times.length}`);}
    const all=[...coarse,...refined];
    const coherent=all.filter(f=>f.id&&f.reason); const blockMap=new Map();
    for(const f of coherent){const k=`${f.id}|${f.reason}`;(blockMap.get(k)||blockMap.set(k,[]).get(k)).push(f);}
    const bannerFrames=[...( [...blockMap.values()].sort((a,b)=>b.length-a.length||b.reduce((s,x)=>s+x.score,0)-a.reduce((s,x)=>s+x.score,0))[0]||[] )].sort((a,b)=>b.score-a.score||b.sharp-a.sharp);
    const frames=bannerFrames.length?bannerFrames:all.filter(f=>f.id||f.reason).sort((a,b)=>b.score-a.score||b.sharp-a.sharp).slice(0,6);
    const idV=uniqueVote(frames.map(f=>f.id)); const reasonV=uniqueVote(frames.map(f=>f.reason));
    const bannerTime=frames[0]?.time??start; const timestamps={banner:bannerTime}; if(idV?.value)timestamps.targetId=bannerTime; if(reasonV?.value)timestamps.reason=bannerTime;

    // SC: only from the banner block. If IP is absent in every banner frame, treat player as offline and keep SC empty.
    const onlineSeen=frames.some(f=>f.online); const scCandidates=[];
    for(const f of frames.slice(0,8)){
      const textCandidates=[f.text||''];
      try{
        const precise=extractScFromData(f.data,f.chat);
        if(precise.canvas){
          const a=await ocr(worker,precise.canvas,{psm:7,whitelist:'0123456789ABCDEFabcdefOoQqIiLlSsGgZzBbTt'}); const b=await ocr(worker,threshold(precise.canvas,145),{psm:7,whitelist:'0123456789ABCDEFabcdefOoQqIiLlSsGgZzBbTt'});
          const ca=extractHexCandidateAnyText(a.text||''); const cb=extractHexCandidateAnyText(b.text||'');
          if(ca)scCandidates.push(ca); if(cb)scCandidates.push(cb);
          textCandidates.push(precise.raw||'');
        }
      }catch{}
      for(const tx of textCandidates){const r=extractScOrdered(tx, f.id, f.reason);if(r.candidate)scCandidates.push(r.candidate);}
    }
    let sc=onlineSeen?consensusHex(scCandidates):''; if(sc)timestamps.sc=frames.find(f=>f.sc)?.time??bannerTime;

    // Server: detect only the yellow badge in the top-right, never arbitrary numbers from the HUD.
    const serverTimes=new Set(); for(let dt=-1.2;dt<=1.21;dt+=.6)serverTimes.add(Math.max(0,Math.min(duration-.05,bannerTime+dt)));
    const serverVotes=[];
    for(const t of serverTimes){await seek(video,t);const badge=makeServerBadgeCrop(video);for(const c of badge.variants){const d=await ocr(worker,c,{psm:10,whitelist:'1234'});const s=extractServerFromOcr(d.text||'');if(s)serverVotes.push(s);}}
    const server=serverVote(serverVotes); if(server)timestamps.server=bannerTime;

    // Date: right-bottom ROI around the banner time.
    const dateVotes=[]; let dc=0; for(const t of serverTimes){if(dc++>=6)break;await seek(video,t);const crop=makeCrop(video,.80,.82,.20,.18,4.0);const d1=await ocr(worker,crop,{psm:6,whitelist:'0123456789./-'});const d2=await ocr(worker,threshold(crop,150),{psm:7,whitelist:'0123456789./-'});for(const tx of [d1.text||'',d2.text||'']){const dv=extractDate(tx);if(dv)dateVotes.push(dv);}}
    const date=dateVote(dateVotes); if(date)timestamps.date=bannerTime;

    const missing=[]; if(!idV?.value)missing.push('Ziel-ID'); if(!reasonV?.value)missing.push('Grund'); if(!server)missing.push('Server'); if(!date)missing.push('Datum'); if(onlineSeen&&!sc)missing.push('SC');
    onProgress?.(100,'Analyse abgeschlossen');
    return {targetId:/^\d{1,6}$/.test(idV?.value||'')?(idV.value||''):'',reason:reasonV?.value||'',sc:onlineSeen?(sc||''):'',server,date,offline:!onlineSeen,missing,complete:missing.length===0,timestamps,confidence:{id:idV?idV.votes/Math.max(1,frames.length):0,reason:reasonV?reasonV.votes/Math.max(1,frames.length):0,sc:sc?1:0,server:server?1:0,date:date?1:0}};
  }
  function openVideoNewTab(entry,seconds=0){if(!entry)return;const file=entry.file||null;if(!file){toast('POV-Datei ist nicht verfügbar.');return;}const url=URL.createObjectURL(file);const w=window.open('about:blank','_blank');if(!w){toast('Pop-up blockiert. Bitte Pop-ups erlauben.');URL.revokeObjectURL(url);return;}w.document.write(`<!doctype html><meta charset="utf-8"><title>${esc(entry.finalName||entry.originalName)}</title><style>html,body{margin:0;background:#05040a;color:#eee;font-family:Inter,Arial,sans-serif;height:100%}.wrap{height:100%;display:flex;flex-direction:column}.bar{padding:10px 14px;background:#120d19;border-bottom:1px solid #2a2033;display:flex;gap:10px;align-items:center;flex-wrap:wrap}.bar button,.bar input{background:#1b1424;border:1px solid #3a2948;color:#eee;border-radius:7px;padding:7px 9px}.stage{flex:1;display:grid;place-items:center;position:relative;overflow:hidden}video{max-width:100%;max-height:100%;object-fit:contain}</style><div class="wrap"><div class="bar"><strong>${esc(entry.finalName||entry.originalName)}</strong><label>Zeit <input id="t" type="number" min="0" step="0.1" value="${Math.max(0,Number(seconds)||0)}"></label><button id="go">Springen</button><button id="minus">−1s</button><button id="plus">+1s</button></div><div class="stage"><video id="v" controls autoplay src="${url}"></video></div></div><script>const v=document.getElementById('v');const t=document.getElementById('t');const set=()=>{v.currentTime=Math.max(0,Number(t.value)||0)};document.getElementById('go').onclick=set;document.getElementById('minus').onclick=()=>{v.currentTime=Math.max(0,v.currentTime-1);t.value=v.currentTime.toFixed(1)};document.getElementById('plus').onclick=()=>{v.currentTime=Math.min(v.duration||1e9,v.currentTime+1);t.value=v.currentTime.toFixed(1)};v.addEventListener('timeupdate',()=>t.value=v.currentTime.toFixed(1));v.addEventListener('loadedmetadata',set);window.addEventListener('beforeunload',()=>URL.revokeObjectURL(${JSON.stringify(url)}));<\/script>`);w.document.close();}

  function openManualPicker(entry, field){
    if(!entry)return;
    const file=entry.file||null;
    if(!file){toast('POV-Datei ist nicht verfügbar.');return;}
    const start=Number(entry.result?.timestamps?.[field]||entry.result?.timestamps?.banner||0)||0;
    const url=URL.createObjectURL(file);
    const w=window.open('about:blank','_blank','noopener,noreferrer');
    if(!w){toast('Pop-up blockiert. Bitte Pop-ups erlauben.');URL.revokeObjectURL(url);return;}
    const title=field==='targetId'?'Ziel-ID':field==='reason'?'Grund':field==='sc'?'SC':field==='server'?'Server':field==='date'?'Datum':'Discord ID';
    w.document.write(`<!doctype html><html lang="de"><head><meta charset="utf-8"><title>${title} manuell auswählen</title><script src="https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js"></script><style>html,body{margin:0;background:#07060c;color:#eee;font-family:Inter,Arial,sans-serif}.wrap{min-height:100vh;display:flex;flex-direction:column}.bar{padding:12px 14px;background:#120d19;border-bottom:1px solid #2b2134;display:flex;gap:8px;align-items:center;flex-wrap:wrap}.bar strong{margin-right:auto}.bar button,.bar input,.bar select,.bar textarea{background:#1a1322;color:#fff;border:1px solid #3b2a49;border-radius:8px;padding:8px}.bar button.primary{background:#ff2380;border-color:#ff2380}.help{padding:10px 14px;color:#b8aebf;font-size:13px}.stage{padding:14px;display:grid;place-items:center;min-height:60vh}.frame{position:relative;display:inline-block;max-width:100%;max-height:70vh}.frame video{display:block;max-width:100%;max-height:70vh;background:#000}.frame canvas{position:absolute;left:0;top:0;cursor:crosshair}.result{padding:14px;border-top:1px solid #2b2134;display:grid;gap:8px}.result textarea{width:100%;min-height:70px;box-sizing:border-box}.small{font-size:12px;color:#988ca0}.status{color:#69e1af}.warn{color:#ffbf66}</style></head><body><div class="wrap"><div class="bar"><strong>${title} manuell auswählen</strong><label>Zeit <input id="time" type="number" step="0.1" min="0" value="${start}"></label><button id="seek">Springen</button><button id="prev">−0.5s</button><button id="next">+0.5s</button><select id="preset"><option value="">Bereich wählen</option><option value="chat">Links oben Chat</option><option value="server">Rechts oben Server</option><option value="date">Rechts unten Datum</option></select></div><div class="help">Ziehe mit der Maus einen Rahmen um den Text im Video. Danach wird <b>nur diese Auswahl</b> per OCR gelesen. Bei Unsicherheit kannst du den Text unten auch direkt eingeben.</div><div class="stage"><div class="frame"><video id="v" controls autoplay src="${url}"></video><canvas id="overlay"></canvas></div></div><div class="result"><div id="status" class="small">Bereit.</div><textarea id="manual" placeholder="Erkannten Text hier korrigieren oder direkt eingeben…"></textarea><div><button id="ocr" class="primary">Auswahl per OCR lesen</button><button id="use" class="primary">Text übernehmen</button><button id="clear">Auswahl löschen</button></div></div></div><script>(()=>{const FIELD=${JSON.stringify(field)},START=${JSON.stringify(start)},URL=${JSON.stringify(url)};const v=document.getElementById('v'),c=document.getElementById('overlay'),ctx=c.getContext('2d'),time=document.getElementById('time'),manual=document.getElementById('manual'),status=document.getElementById('status');let sel=null,drawing=false,sx=0,sy=0;function sync(){const r=v.getBoundingClientRect();c.width=Math.max(1,Math.round(r.width));c.height=Math.max(1,Math.round(r.height));c.style.width=r.width+'px';c.style.height=r.height+'px';draw()}function draw(){ctx.clearRect(0,0,c.width,c.height);if(sel){ctx.fillStyle='rgba(255,35,128,.15)';ctx.fillRect(sel.x,sel.y,sel.w,sel.h);ctx.strokeStyle='#ff2380';ctx.lineWidth=2;ctx.strokeRect(sel.x+.5,sel.y+.5,sel.w,sel.h)}}function pos(e){const r=c.getBoundingClientRect();return{x:Math.max(0,Math.min(c.width,e.clientX-r.left)),y:Math.max(0,Math.min(c.height,e.clientY-r.top))}}c.addEventListener('pointerdown',e=>{const p=pos(e);drawing=true;sx=p.x;sy=p.y;sel={x:sx,y:sy,w:0,h:0};c.setPointerCapture(e.pointerId);draw()});c.addEventListener('pointermove',e=>{if(!drawing)return;const p=pos(e);sel={x:Math.min(sx,p.x),y:Math.min(sy,p.y),w:Math.abs(p.x-sx),h:Math.abs(p.y-sy)};draw()});c.addEventListener('pointerup',()=>drawing=false);function seek(){v.currentTime=Math.max(0,Number(time.value)||0)}document.getElementById('seek').onclick=seek;document.getElementById('prev').onclick=()=>{v.currentTime=Math.max(0,v.currentTime-.5);time.value=v.currentTime.toFixed(1)};document.getElementById('next').onclick=()=>{v.currentTime=Math.min(v.duration||1e9,v.currentTime+.5);time.value=v.currentTime.toFixed(1)};v.addEventListener('timeupdate',()=>time.value=v.currentTime.toFixed(1));v.addEventListener('loadedmetadata',()=>{sync();v.currentTime=Math.min(v.duration||START,Math.max(0,START))});window.addEventListener('resize',sync);document.getElementById('clear').onclick=()=>{sel=null;draw();manual.value='';status.textContent='Auswahl gelöscht.'};document.getElementById('preset').onchange=e=>{const r=v.getBoundingClientRect();const presets={chat:[0,.02,.62,.34],server:[.88,.01,.12,.16],date:[.78,.80,.22,.20]};const p=presets[e.target.value];if(!p)return;sel={x:r.width*p[0],y:r.height*p[1],w:r.width*p[2],h:r.height*p[3]};draw()};document.getElementById('ocr').onclick=async()=>{if(!sel||sel.w<5||sel.h<5){status.textContent='Bitte zuerst einen Bereich markieren.';return}status.textContent='OCR läuft…';try{const sX=sel.x/c.clientWidth*v.videoWidth,sY=sel.y/c.clientHeight*v.videoHeight,sW=sel.w/c.clientWidth*v.videoWidth,sH=sel.h/c.clientHeight*v.videoHeight;const out=document.createElement('canvas');out.width=Math.max(1,Math.round(sW*2.5));out.height=Math.max(1,Math.round(sH*2.5));out.getContext('2d').drawImage(v,sX,sY,sW,sH,0,0,out.width,out.height);const res=await Tesseract.recognize(out,'eng',{logger:m=>{if(m.status&&m.progress)status.textContent=Math.round(m.progress*100)+'% '+m.status}});manual.value=(res.data.text||'').trim();status.textContent='OCR fertig. Bitte prüfen und „Text übernehmen“ klicken.'}catch(err){status.textContent='OCR-Fehler: '+err.message}};document.getElementById('use').onclick=()=>{const value=manual.value.trim();if(!value){status.textContent='Kein Text vorhanden.';return}if(window.opener){window.opener.postMessage({type:'grandrp-manual-field',field:FIELD,value,time:Number(v.currentTime)||0},'*');status.textContent='Übernommen. Dieses Fenster kann jetzt geschlossen werden.'}else{status.textContent='Kein Ursprungsfenster vorhanden.'}};})();</script></body></html>`);
    w.document.close();
    setTimeout(()=>{URL.revokeObjectURL(url);},0);
  }

  function applyManualField(field,value,time){
    const ctx=state.editing;if(!ctx)return;
    let v=String(value||'').trim();
    if(field==='targetId') v=parseTargetId(v)||normalizeIdToken(v);
    if(field==='reason'){const r=canonicalReason(v);v=r?.value||'';}
    if(field==='sc') v=normalizeHexLoose(v); if(v.length!==40)v='';
    if(field==='server'){const m=String(v).match(/[1-4]/);v=m?m[0]:'';}
    if(field==='date'){v=extractDate(v)||'';}
    if(field==='discordId'){v=v.replace(/[^0-9]/g,'');}
    if(field==='targetId')$('#targetId').value=clampId(v);
    else if(field==='reason')$('#reason').value=v;
    else if(field==='sc')$('#sc').value=v;
    else if(field==='server')$('#server').value=v;
    else if(field==='date')$('#date').value=v;
    else if(field==='discordId')$('#discordId').value=v;
    renderTitlePreview();
    const target=ctx.item?.result||ctx.entry||{}; if(target){target.timestamps=target.timestamps||{};target.timestamps[field]=Number(time)||target.timestamps[field]||0;}
    setFieldStatus(ctx.item||{result:target});
    toast(`${field==='targetId'?'Ziel-ID':field==='reason'?'Grund':field==='sc'?'SC':field==='server'?'Server':field==='date'?'Datum':'Discord ID'} übernommen.`);
  }

  function setFieldStatus(item){const r=item.result||{};const status=[['ID',!!r.targetId],['Grund',!!r.reason],['SC',r.offline?'offline':!!r.sc],['Server',!!r.server],['Datum',!!r.date]];$('#fieldStatus').innerHTML=status.map(([k,ok])=>`<div class="status-chip ${ok?'ok':'warn'}">${ok==='offline'?'—':(ok?'✓':'⚠')} ${k}</div>`).join('');$$('.jump').forEach(btn=>{const key=btn.dataset.field;const missing=!r[key]&&(['targetId','reason','sc','server','date'].includes(key))&&!(key==='sc'&&r.offline);btn.classList.toggle('hidden',!missing);btn.textContent=missing?'Manuell auswählen':'';btn.onclick=()=>openManualPicker(item,key);});const warn=item.result?.missing?.length?`⚠ Fehlend: ${item.result.missing.join(' · ')}. Klicke bei einem Feld auf „Manuell auswählen“. Offline-Spieler können ohne IP/SC auftreten.`:'';$('#ocrWarning').textContent=warn;$('#ocrWarning').classList.toggle('hidden',!warn);}
  function setEditorValues(r){$('#targetId').value=clampId(r.targetId);$('#reason').value=ALLOWED_REASONS.includes(r.reason)?r.reason:'';$('#sc').value=r.sc||'';$('#server').value=/^[1-4]$/.test(r.server||'')?r.server:'';$('#date').value=r.date||'';$('#discordId').value=r.discordId||'';$('#proof').value=r.proof||'';$('#perma').checked=!!r.perma;$('#notBanned').checked=!!r.notBanned;renderTitlePreview();}
  function renderTitlePreview(){const id=clampId($('#targetId').value),reason=$('#reason').value,date=formatDateDE($('#date').value);$('#titlePreview').value=id&&reason&&date?`${id}, ${reason}, ${date}.mp4`:'';}
  function setFieldStatus(item){const r=item.result||{};const status=[['ID',!!r.targetId],['Grund',!!r.reason],['SC',r.offline?'offline':!!r.sc],['Server',!!r.server],['Datum',!!r.date]];$('#fieldStatus').innerHTML=status.map(([k,ok])=>`<div class="status-chip ${ok?'ok':'warn'}">${ok==='offline'?'—':(ok?'✓':'⚠')} ${k}</div>`).join('');$$('.jump').forEach(btn=>{const key=btn.dataset.field;const missing=!r[key]&&(['targetId','reason','sc','server','date'].includes(key))&&!(key==='sc'&&r.offline);btn.classList.toggle('hidden',!missing);btn.onclick=()=>openVideoNewTab(item,item.result?.timestamps?.[key]||item.result?.timestamps?.banner||0);});const warn=item.result?.missing?.length?`⚠ Fehlend: ${item.result.missing.join(' · ')}. Öffne bei Bedarf die POV direkt an der Fundstelle. Offline-Spieler können ohne IP/SC auftreten.`:'';$('#ocrWarning').textContent=warn;$('#ocrWarning').classList.toggle('hidden',!warn);}
  function openEditor(item){state.editing={item};$('#modalFile').textContent=item.finalName||item.file.name;setEditorValues({...item.result,discordId:item.result?.discordId||'',proof:item.result?.proof||'',perma:false,notBanned:false});state.selectedTypes=new Set(item.result?.types||[]);$$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));setFieldStatus(item);$('#editorModal').classList.remove('hidden');}
  async function openEditorFromEntry(entry){const file=entry.file||await getVideo(entry.id);if(file)entry.file=file;state.editing={entry};$('#modalFile').textContent=entry.finalName||entry.originalName;setEditorValues(entry);state.selectedTypes=new Set(entry.types||[]);$$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));setFieldStatus({result:entry});$('#editorModal').classList.remove('hidden');}
  function closeEditor(){state.editing=null;$('#editorModal').classList.add('hidden');}
  async function saveEditor(e){
    e.preventDefault(); const ctx=state.editing; if(!ctx)return;
    const targetId=clampId($('#targetId').value), reason=$('#reason').value, sc=normalizeHexLoose($('#sc').value), server=$('#server').value, date=$('#date').value;
    const offline=!!(ctx.item?.result?.offline||ctx.entry?.offline);
    const missing=[]; if(!/^\d{1,6}$/.test(targetId))missing.push('Ziel-ID'); if(!ALLOWED_REASONS.includes(reason))missing.push('Grund'); if(!/^[1-4]$/.test(server))missing.push('Server'); if(!validDate(date))missing.push('Datum'); if(!offline && sc.length!==40)missing.push('SC');
    if(missing.length){toast('Bitte fehlende Angaben prüfen: '+missing.join(', '));return;}
    const base=ctx.item||ctx.entry; const types=[...state.selectedTypes]; if(reason.startsWith('PC'))types.push('pccheck'); if(reason==='Cheating')types.push('cheater'); const finalTypes=[...new Set(types)];
    const finalName=`${targetId}, ${reason}, ${formatDateDE(date)}.mp4`;
    const namedFile=new File([base.file],finalName,{type:base.file.type||'video/mp4',lastModified:base.file.lastModified||Date.now()});
    const record={id:base.id||crypto.randomUUID(),originalName:base.originalName||base.file.name,finalName,targetId,reason,sc:offline?'':sc,server,date,types:finalTypes,perma:$('#perma').checked,notBanned:$('#notBanned').checked,discordId:$('#discordId').value.trim(),proof:$('#proof').value.trim(),complete:true,saved:true,videoStored:true,offline,timestamps:base.result?.timestamps||base.timestamps||{},missing:[],file:namedFile};
    await putVideo(record.id,namedFile); state.entries=[record,...state.entries.filter(x=>x.id!==record.id)]; saveMeta();
    if(ctx.item){ctx.item.file=namedFile;ctx.item.finalName=finalName;ctx.item.result={...ctx.item.result,...record};ctx.item.status='Gespeichert';ctx.item.progress=100;renderQueue();}
    closeEditor(); renderArchive(); renderCases(); renderCsv(); toast('Gespeichert. Die POV wurde erst jetzt final benannt.');
    if(state.accessToken&&state.clientId){try{const url=await uploadYoutube(namedFile,finalName,state.accessToken);const saved=state.entries.find(x=>x.id===record.id);if(saved){saved.proof=url;saveMeta();renderArchive();renderCsv();}toast('YouTube-Upload abgeschlossen.');}catch(err){console.error(err);toast('YouTube-Upload fehlgeschlagen: '+err.message);}}
  }
  window.addEventListener('message',e=>{if(e.data?.type==='grandrp-manual-field'){applyManualField(e.data.field,e.data.value,e.data.time);}});

  function setupEditor(){
    $('#closeModal').onclick=closeEditor;$('#cancelBtn').onclick=closeEditor;$('#entryForm').addEventListener('submit',saveEditor);['#targetId','#date'].forEach(s=>$(s).addEventListener('input',renderTitlePreview));$('#reason').addEventListener('change',renderTitlePreview);$('#targetId').addEventListener('input',()=>{$('#targetId').value=clampId($('#targetId').value)});
    $$('.chip').forEach(c=>c.onclick=()=>{const v=c.dataset.value;c.classList.toggle('active');if(c.classList.contains('active'))state.selectedTypes.add(v);else state.selectedTypes.delete(v);});
  }

  async function processQueue(){for(const item of state.queue){if(item.processing||item.editingDone||item.status==='Gespeichert')continue;item.processing=true;try{item.status='Datei wird vollständig eingelesen';item.progress=4;renderQueue();const video=$('#videoProbe');const url=URL.createObjectURL(item.file);video.src=url;await loaded(video);item.progress=8;item.status='OCR Schnellscan startet';renderQueue();item.result=await analyzeVideo(video,p=>{item.progress=p;renderQueue();});item.result.originalName=item.file.name;item.result.types=[];item.status=item.result.complete?'OCR fertig · Prüfung offen':'OCR unvollständig · Prüfung nötig';renderQueue();openEditor(item);await new Promise(resolve=>{const timer=setInterval(()=>{if(!state.editing){clearInterval(timer);resolve();}},150);});URL.revokeObjectURL(url);}catch(err){console.error(err);item.status='Fehler: '+(err?.message||err);item.progress=0;renderQueue();}finally{item.processing=false;}}
  }

  async function initYoutube(){if(!state.clientId)throw new Error('Bitte zuerst die Google OAuth Client-ID in Einstellungen eintragen.');if(!window.google?.accounts?.oauth2)throw new Error('Google OAuth ist noch nicht geladen.');state.tokenClient=google.accounts.oauth2.initTokenClient({client_id:state.clientId,scope:'https://www.googleapis.com/auth/youtube.upload',callback:(resp)=>{if(resp.error){toast('YouTube OAuth: '+resp.error);return;}state.accessToken=resp.access_token;sessionStorage.setItem('yt_access_token',resp.access_token);updateYtStatus(true);toast('YouTube verbunden.');}});state.tokenClient.requestAccessToken({prompt:'consent'});}
  function updateYtStatus(){const connected=!!state.accessToken;$('#ytStatus').textContent=connected?'● Verbunden':'● Nicht verbunden';$('#ytStatus').style.color=connected?'#69e1af':'#7f7488';}
  async function uploadYoutube(file,title,token){if(!file||!token)throw new Error('YouTube nicht verbunden.');const meta={snippet:{title,description:'Grand RP POV Checker',categoryId:'20'},status:{privacyStatus:'unlisted',selfDeclaredMadeForKids:false}};const init=await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Length':String(file.size),'X-Upload-Content-Type':file.type||'video/mp4'},body:JSON.stringify(meta)});if(!init.ok)throw new Error((await init.text()).slice(0,300));const loc=init.headers.get('Location');if(!loc)throw new Error('YouTube Upload-URL fehlt.');const up=await fetch(loc,{method:'PUT',headers:{Authorization:`Bearer ${token}`,'Content-Type':file.type||'video/mp4'},body:file});if(!up.ok)throw new Error((await up.text()).slice(0,300));const data=await up.json();return `https://youtu.be/${data.id}`;}
  function setupSettings(){state.settings.frames=Number(localStorage.getItem('v26_frames')||24);state.settings.window=Number(localStorage.getItem('v26_window')||4.5);state.settings.step=Number(localStorage.getItem('v26_step')||.5);$('#frameCount').value=state.settings.frames;$('#refineWindow').value=state.settings.window;$('#refineStep').value=state.settings.step;$('#frameCount').onchange=e=>{state.settings.frames=Math.max(18,Math.min(28,Number(e.target.value)||24));localStorage.setItem('v26_frames',state.settings.frames)};$('#refineWindow').onchange=e=>{state.settings.window=Math.max(3,Math.min(7,Number(e.target.value)||4.5));localStorage.setItem('v26_window',state.settings.window)};$('#refineStep').onchange=e=>{state.settings.step=Math.max(.4,Math.min(1.0,Number(e.target.value)||.5));localStorage.setItem('v26_step',state.settings.step)};$('#connectYoutube').onclick=()=>initYoutube().catch(e=>toast(e.message));$('#disconnectYoutube').onclick=()=>{state.accessToken='';sessionStorage.removeItem('yt_access_token');updateYtStatus();};$('#clearLocal').onclick=async()=>{if(!confirm('Lokales Archiv wirklich löschen?'))return;state.entries=[];state.queue=[];saveMeta();await clearDB();renderArchive();renderCases();renderCsv();renderQueue();toast('Lokale Daten gelöscht.');};updateYtStatus();}

  window.addEventListener('beforeunload',()=>{try{state.worker?.terminate();}catch{}});
  setupNav();setupUpload();setupEditor();setupSettings();loadMeta();renderArchive();renderQueue();updateYtStatus();
})();
