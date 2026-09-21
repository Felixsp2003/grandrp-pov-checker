/* Grand RP DC Checker V58
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
  const BUILD='V58';
  const META_KEY='grandrp_pov_meta_v42';
  const DB_NAME='grandrp_pov_db_v42';
  const STORE='videos';
  const BAN_ADMIN_NAME='Adam Byers';
  const BAN_ADMIN_ID='15340';

  const ALLOWED_REASONS=[
    'PC Check Positiv',
    'PC Check Verweigert',
    'PC-Check Positiv 4.1 (Discord)',
    'PC-Check Positiv 4.1 (Redux)',
    'PC-Check Positiv (Banevading)',
    'PC Check Positiv (Cleaning)',
    'PC Check Trolling',
    'Cheating',
    'Acc 1.1',
    'Acc 1.4',
    'ACC 1.4 (Twink)',
    'Event 1.7'
  ];
  const REASON_ALIASES={
    'PC Check Positiv':['pc check positiv','pc-check positiv','pccheck positiv','pccheckpositiv'],
    'PC Check Verweigert':['pc check verweigert','pc-check verweigert','pc-check verweigerung','pc check verweigerung','pccheck verweigerung','pccheckverweigert'],
    'PC-Check Positiv 4.1 (Discord)':['pc-check positiv 4.1 discord','pc check positiv 4.1 discord','pccheck positiv 4.1 discord'],
    'PC-Check Positiv 4.1 (Redux)':['pc-check positiv 4.1 redux','pc check positiv 4.1 redux','pccheck positiv 4.1 redux'],
    'PC-Check Positiv (Banevading)':['pc-check positiv banevading','pc check positiv banevading','pccheck positiv banevading'],
    'PC Check Positiv (Cleaning)':['pc check positiv cleaning','pc-check positiv cleaning','pccheck positiv cleaning'],
    'PC Check Trolling':['pc check trolling','pc-check trolling','pccheck trolling','pc trolling'],
    'Cheating':['cheating'],
    'Acc 1.1':['acc 1.1','acc1.1','acc 11'],
    'Acc 1.4':['acc 1.4','acc1.4','acc 14'],
    'ACC 1.4 (Twink)':['acc 1.4 twink','acc1.4 twink','acc 14 twink'],
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
    // Ziel-ID is numeric only. OCR frequently confuses 0/O/Q, 1/I/i/l/L, 5/S,
    // 2/Z, 6/G, 8/B and 7/T. Normalize only inside a short ID token so ordinary
    // words can never leak into the result.
    const raw=String(s||'').replace(/[|!]/g,'I').toUpperCase().replace(/[^0-9A-Z]/g,'');
    if(!raw || !/\d|[OQILSZGBT]/.test(raw)) return '';
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
  function fuzzyWordMatch(word,target){
    const a=compact(word), b=compact(target);
    if(!a||!b)return false;
    if(a===b)return true;
    return similarity(a,b)>=0.72;
  }
  function hasAdamByersAnchor(before){
    const raw=cleanText(before);
    const words=raw.split(/\s+/).map(x=>x.replace(/[^A-Za-z]/g,'')).filter(Boolean);
    for(let i=0;i<words.length-1;i++){
      if(fuzzyWordMatch(words[i],'Adam') && fuzzyWordMatch(words[i+1],'Byers')) return true;
    }
    const c=compact(raw);
    return c.includes(compact(BAN_ADMIN_NAME)) || /ad[a4]m.{0,3}by[e3]rs/i.test(c);
  }
  function extractBanEvent(text){
    const t=cleanText(text);
    if(!t)return null;
    const lines=t.split('\n');
    const joined=[];
    for(let i=0;i<lines.length;i++)joined.push(lines.slice(i,i+4).join(' '));
    let best=null;
    for(const j of joined){
      if(!/\b(?:hat|ha[t7l1i])\b/i.test(j))continue;
      const hat=j.search(/\b(?:hat|ha[t7l1i])\b/i);if(hat<0)continue;
      const before=j.slice(0,hat),after=j.slice(hat+3);
      const adminIds=[...before.matchAll(/\[\s*([0-9]{1,6})\s*\]/g)].map(m=>m[1]);
      if(!adminIds.includes(BAN_ADMIN_ID))continue;
      const adminName=hasAdamByersAnchor(before);
      const dur=after.match(/\b(?:für|fur|fiir|fuer|for)\b\s*[0-9]{1,3}\s*(?:tage|days|tag|day)\b/i);
      if(!dur||!/\b(?:gebannt|banned|ban)\b/i.test(j))continue;
      const pre=after.slice(0,dur.index);
      const targetIds=[...pre.matchAll(/\[\s*([0-9]{1,6})\s*\]/g)].map(m=>m[1]);
      if(!targetIds.length){
        const nums=[...pre.matchAll(/(?:\bspieler\b|\bplayer\b|\buser\b)[^0-9]{0,50}\b([0-9]{1,6})\b/ig)].map(m=>m[1]);
        if(nums.length)targetIds.push(nums[nums.length-1]);
      }
      if(!targetIds.length)continue;
      const target=normalizeIdToken(targetIds[targetIds.length-1]);
      const reasonMatch=j.match(/\bGrund\s*[:.\-]?\s*(.+)$/i);
      const reason=reasonMatch?parseReason(reasonMatch[1]):parseReason(j);
      let score=65;if(adminName)score+=25;if(/\bGrund\b/i.test(j))score+=6;if(reason)score+=18;if(target===BAN_ADMIN_ID)score-=1000;
      const candidate={targetId:target,adminId:BAN_ADMIN_ID,adminNameMatched:adminName,reason:reason?.value||'',reasonScore:reason?.score||0,score,text:j};
      if(/^\d{1,6}$/.test(candidate.targetId)&&candidate.targetId!==BAN_ADMIN_ID&&(!best||candidate.score>best.score))best=candidate;
    }
    return best;
  }
  function parseTargetId(text){
    // Strict parser: a target ID is valid only when the actual ban event is
    // anchored to Adam Byers / administrator ID 15340. No generic numeric fallback.
    const ban=extractBanEvent(text);
    return ban?.targetId&&/^\d{1,6}$/.test(ban.targetId)?ban.targetId:'';
  }
  function classifyReasonStrong(text){
    const c=compact(String(text||''));
    if(!c) return '';
    if(/event17|event1l|eventi7/.test(c)) return 'Event 1.7';
    if(/acc11/.test(c)) return 'Acc 1.1';
    if(/acc14twink|acc1.4twink|acc14twnk|acc14twing|acc14twinck|acc14twinkk/.test(c)) return 'ACC 1.4 (Twink)';
    if(/acc14/.test(c)) return 'Acc 1.4';
    if(/cheat|cheats|cheating/.test(c)) return 'Cheating';
    if(/pc/.test(c)){
      if(/troll|trol|trowl|troling|trolling/.test(c)) return 'PC Check Trolling';
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
    const raw=cleanText(text);
    if(!raw)return '';
    // First pass over the whole OCR block. This is important when OCR misses the literal "Grund:".
    const wholeStrong=classifyReasonStrong(raw);
    if(wholeStrong)return wholeStrong;
    const lines=raw.split('\n');
    const candidates=[raw];
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      const m=line.match(/Grund\s*[\:\.\-]?\s*(.*)$/i);
      if(m){candidates.push(m[1]);if(lines[i+1])candidates.push(m[1]+' '+lines[i+1]);}
      if(/\b(pc|cheat|acc|event)\b/i.test(line)) candidates.push(line);
    }
    for(const c of candidates){const strong=classifyReasonStrong(c);if(strong)return strong;}
    let best=null,bestScore=0;
    for(const c of candidates){
      const r=canonicalReason(c);if(r&&r.score>bestScore){bestScore=r.score;best=r.value;}
    }
    return bestScore>=0.68?best:'';
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
    if(targetId)anchor=lines.findIndex(ln=>ln.includes(targetId));
    if(anchor<0)anchor=lines.findIndex(ln=>/\bhat\b/i.test(ln));
    if(anchor<0)anchor=lines.findIndex(ln=>/Grund\s*[\:\.\-]/i.test(ln));
    const startIdx=Math.max(0,(anchor<0?0:anchor-3));
    const endIdx=Math.min(lines.length-1,(anchor<0?lines.length-1:anchor+7));
    for(let i=startIdx;i<=endIdx;i++){
      const line=lines[i];
      const hasIpLabel=/\bIP\s*:/i.test(line);
      const ipish=hasIpLabel || looksLikeIpish(line);
      if(!ipish)continue;
      const afterIpMatch=line.match(/\bIP\s*:\s*(.*)$/i);
      const afterIp=afterIpMatch?afterIpMatch[1]:line;
      // Remove the IP itself before looking for a long hexadecimal SC value; otherwise the
      // IPv6 address can be mistaken for the start of the SC identifier.
      const ipStripped=String(afterIp).replace(/^\s*(?:[0-9A-Fa-f]{1,4}:){2,8}[0-9A-Fa-f]{0,4}\s*/,'');
      const parts=[ipStripped,lines[i+1]||'',lines[i+2]||''];
      const around=parts.join(' ');
      const scMark=around.match(/\bSC\s*:\s*([0-9A-Za-z\s_-]{12,120})/i);
      if(scMark){
        const c=hexCandidateFromPiece(scMark[1]);if(c)return {candidate:c,online:true};
      }
      // Prefer an exact 40-character token on the same line as the IP, then in the
      // immediately following line. Never concatenate arbitrary prose across the
      // whole banner because words like "Grund"/"PC" also contain A-F letters.
      for(const part of parts){
        const rawTokens=String(part).split(/\s+/).filter(Boolean);
        const exact=rawTokens.map(normalizeHexLoose).find(x=>x.length===40);
        if(exact)return {candidate:exact,online:true};
        for(let a=0;a<rawTokens.length;a++){
          let acc='';
          for(let b=a;b<Math.min(rawTokens.length,a+5);b++){
            const rawTok=rawTokens[b]; const norm=normalizeHexLoose(rawTok);
            if(!norm)break;
            const ratio=norm.length/Math.max(1,String(rawTok).replace(/[^0-9A-Za-z]/g,'').length);
            if(ratio<0.78 || norm.length<3)break;
            acc+=norm;
            if(acc.length>40)break;
            if(acc.length===40)return {candidate:acc,online:true};
          }
        }
        // OCR may insert/remove a single character inside the SC. On the text that remains
        // after the IP, inspect all 40-character windows as well; later consensus across frames
        // removes isolated OCR errors without ever mixing the IP into the candidate.
        const normalizedPart=normalizeHexLoose(String(part));
        if(normalizedPart.length>=40 && normalizedPart.length<=48){
          for(let start=0;start+40<=normalizedPart.length;start++){
            const win=normalizedPart.slice(start,start+40);
            if(!/^\w{40}$/.test(win))continue;
            if(win.length===40)return {candidate:win,online:true};
          }
        }
      }
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

    // Align only same-length 40-char candidates. For noisy OCR, majority voting per
    // character is safer than accepting one isolated frame. This also resolves recurring
    // I/i/1/O/0-style errors because normalizeHexLoose maps impossible hex glyphs first.
    if(exact40.length>=3){
      const seed=exact40.slice().sort((a,b)=>{
        const sa=exact40.reduce((n,w)=>n+(levenshteinLimited(a,w,8)<=6?1:0),0);
        const sb=exact40.reduce((n,w)=>n+(levenshteinLimited(b,w,8)<=6?1:0),0);
        return sb-sa;
      })[0];
      const cluster=exact40.filter(v=>levenshteinLimited(seed,v,8)<=8);
      if(cluster.length>=3){
        let out='';
        for(let i=0;i<40;i++){
          const m=new Map();
          for(const v of cluster){const ch=v[i];m.set(ch,(m.get(ch)||0)+1);}
          const ranked=[...m.entries()].sort((a,b)=>b[1]-a[1]);
          out+=ranked[0]?.[0]||seed[i];
        }
        if(/^\w{40}$/.test(out))return out;
      }
    }

    // Fuzzy cluster for candidates with one inserted/deleted OCR character.
    const scored=vals.map((v)=>({v,score:vals.reduce((n,w)=>n+(levenshteinLimited(v,w,10)<=6?1:0),0)})).sort((a,b)=>b.score-a.score||b.v.length-a.v.length);
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
  const state={entries:[],queue:[],filter:'all',editing:null,worker:null,specialWorker:null,accessToken:localStorage.getItem('yt_access_token')||sessionStorage.getItem('yt_access_token')||'',tokenClient:null,clientId:localStorage.getItem('yt_client_id')||'',settings:{frames:24,window:4.5,step:0.5},selectedTypes:new Set(),queueRunner:false,tokenExpiresAt:Number(localStorage.getItem('yt_access_expires_at_v50')||0),tokenRefreshPromise:null};
  const views={archive:['Archiv','POV-Fälle, Bans, PC-Checks und CSV-Export'],cases:['Verdachtsfälle','Fehlende oder widersprüchliche OCR-Angaben'],upload:['POVs hochladen','Mehrere Aufnahmen gleichzeitig verarbeiten'],csv:['CSV erstellen','Export für Proof, Datum, ID, SOC, RID, Discord ID, Familie und Grund'],settings:['Einstellungen','OCR und YouTube']};

  function toast(msg){const el=$('#toast');el.textContent=msg;el.classList.add('show');clearTimeout(el._t);el._t=setTimeout(()=>el.classList.remove('show'),2600);}
  // File sizes are displayed in decimal units, matching Windows/browser file
  // properties more closely (1 MB = 1,000,000 bytes). The actual upload always
  // uses the exact File.size byte count, never this formatted value.
  function formatSize(n){const x=Number(n)||0;return x>=1e9?(x/1e9).toFixed(1)+' GB':x>=1e6?(x/1e6).toFixed(1)+' MB':x>=1e3?(x/1e3).toFixed(1)+' KB':Math.max(0,Math.round(x))+' B';}
  function formatBytesExact(n){return `${Number(n)||0} Bytes`; }
  async function compareFileEdges(a,b){
    if(!a||!b||Number(a.size)!==Number(b.size)) return false;
    const edge=1024*1024;
    const aHead=new Uint8Array(await a.slice(0,Math.min(edge,a.size)).arrayBuffer());
    const bHead=new Uint8Array(await b.slice(0,Math.min(edge,b.size)).arrayBuffer());
    if(aHead.length!==bHead.length)return false;
    for(let i=0;i<aHead.length;i++)if(aHead[i]!==bHead[i])return false;
    const start=Math.max(0,a.size-edge);
    const aTail=new Uint8Array(await a.slice(start,a.size).arrayBuffer());
    const bTail=new Uint8Array(await b.slice(start,b.size).arrayBuffer());
    if(aTail.length!==bTail.length)return false;
    for(let i=0;i<aTail.length;i++)if(aTail[i]!==bTail[i])return false;
    return true;
  }
  async function verifyLocalFile(file,expectedSize=0,stage='Datei'){
    if(!file)throw new Error(`${stage}: Datei fehlt.`);
    const actual=Number(file.size)||0;
    if(actual<=0)throw new Error(`${stage}: Datei hat 0 Byte.`);
    if(expectedSize && actual!==Number(expectedSize))throw new Error(`${stage}: Dateigröße geändert (${formatBytesExact(expectedSize)} → ${formatBytesExact(actual)}).`);
    const head=await file.slice(0,Math.min(32,actual)).arrayBuffer();
    if(!head.byteLength)throw new Error(`${stage}: Datei konnte nicht gelesen werden.`);
    return actual;
  }
  function formatDateDE(v){if(!v)return '';const m=String(v).match(/^(\d{4})-(\d{2})-(\d{2})$/);return m?`${m[3]}.${m[2]}.${m[1]}`:v;}
  async function loadMeta(){
    try{
      let raw=localStorage.getItem(META_KEY);
      if(!raw) raw=localStorage.getItem('grandrp_pov_meta_v27')||localStorage.getItem('grandrp_pov_meta_v26')||localStorage.getItem('grandrp_pov_meta_v25')||'[]';
      state.entries=JSON.parse(raw)||[];
    }catch{state.entries=[];}
    state.clientId=localStorage.getItem('yt_client_id')||'';$('#clientId').value=state.clientId;
    // Repair legacy archive size metadata from the actual IndexedDB blob.
    // This fixes old cards that displayed a stale/wrong sourceSize even though
    // the stored POV file itself had the correct byte size.
    try{
      let changed=false;
      for(const e of state.entries){
        if(!e.id||!e.videoStored)continue;
        const stored=await getVideo(e.id);
        if(!stored)continue;
        if(Number(e.sourceSize)!==Number(stored.size)){e.sourceSize=stored.size; changed=true;}
      }
      if(changed)saveMeta();
    }catch(err){console.warn('Archivgrößen konnten nicht synchronisiert werden',err);}
  }
  function saveMeta(){localStorage.setItem(META_KEY,JSON.stringify(state.entries.map(e=>({...e,file:undefined,videoUrl:undefined}))));}
  async function openDB(){return new Promise((res,rej)=>{const r=indexedDB.open(DB_NAME,1);r.onupgradeneeded=()=>r.result.createObjectStore(STORE);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function putVideo(id,file){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(file,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  async function getVideo(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function delVideo(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  async function clearDB(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  function showView(v){$$('.view').forEach(x=>x.classList.remove('active'));$('#view-'+v).classList.add('active');$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#pageTitle').textContent=views[v][0];$('#pageSubtitle').textContent=views[v][1];if(v==='archive')renderArchive();if(v==='cases')renderCases();if(v==='csv')renderCsv();}
  function updateCounts(){const all=state.entries;const count=k=>all.filter(e=>e.types?.includes(k)).length;$('#countAll').textContent=all.length;$('#countBan').textContent=all.filter(e=>!e.notBanned).length;$('#countPc').textContent=count('pccheck');$('#countSoc').textContent=count('socban');$('#countHard').textContent=count('hardban');$('#countCheat').textContent=count('cheater');$('#countNeg').textContent=count('negativ');$('#countNoVideo').textContent=all.filter(e=>!e.videoStored).length;}
  function renderArchive(){updateCounts();const q=($('#search').value||'').toLowerCase().trim();const filter=state.filter;const list=state.entries.filter(e=>{if(filter==='ban'&&e.notBanned)return false;if(filter!=='all'&&filter!=='ban'&&!e.types?.includes(filter))return false;if(filter==='novideo'&&e.videoStored)return false;if(!q)return true;return [e.targetId,e.sc,e.reason,e.server,e.proof].some(v=>String(v||'').toLowerCase().includes(q));});$('#archiveGrid').innerHTML=list.map(e=>`<article class="card"><div class="thumb">${e.videoStored?'POV':'OHNE VIDEO'}</div><div class="card-top"><span class="pill">#${esc(e.id.slice(-6))}</span><span class="pill ${e.complete?'good':'warn'}">${e.complete?'Vollständig':'Prüfen'}</span></div><div class="card-body"><div class="card-title">${esc(e.reason||'Unbekannter Grund')}</div><div class="meta"><div><span>ID</span>${esc(e.targetId||'')}</div><div class="rid-cell"><span>SC / RID</span>${esc(e.sc||'')}</div><div><span>Server</span>${esc(e.server||'')}</div><div><span>Datum</span>${esc(formatDateDE(e.date)||'')}</div>${e.sourceSize?`<div><span>Dateigröße</span>${esc(formatSize(e.sourceSize))}<small class="size-bytes">${esc(formatBytesExact(e.sourceSize))}</small></div>`:''}</div></div><div class="card-actions"><button class="mini" data-open="${e.id}">Prüfen</button>${e.youtube?.url||e.proof?`<button class="mini primary" data-youtube="${esc(e.youtube?.url||e.proof)}">POV öffnen</button>`:''}<button class="mini danger" data-delete="${e.id}">Löschen</button></div></article>`).join('');$('#emptyState').classList.toggle('hidden',list.length>0);$$('[data-open]').forEach(b=>b.onclick=async()=>{const e=state.entries.find(x=>x.id===b.dataset.open);if(e)openEditorFromEntry(e);});$$('[data-youtube]').forEach(b=>b.onclick=()=>{const url=b.dataset.youtube;if(url)window.open(url,'_blank','noopener,noreferrer');});$$('[data-delete]').forEach(b=>b.onclick=async()=>{const e=state.entries.find(x=>x.id===b.dataset.delete);if(!e)return;if(!confirm(`POV „${e.finalName||e.originalName||e.id}“ aus dem Archiv löschen?\n\nDas YouTube-Video wird NICHT gelöscht.`))return;try{await delVideo(e.id);state.entries=state.entries.filter(x=>x.id!==e.id);saveMeta();renderArchive();renderCases();renderCsv();toast('POV aus dem Archiv gelöscht. YouTube bleibt erhalten.');}catch(err){console.error(err);toast('Löschen fehlgeschlagen: '+(err?.message||err));}});}
  function renderCases(){const cases=state.entries.filter(e=>!e.complete);$('#casesList').innerHTML=cases.length?cases.map(e=>`<div class="case-row"><div><strong>${esc(e.originalName)}</strong><small>${esc(e.missing.join(' · ')||'Prüfung nötig')}</small></div><button class="mini" data-case="${e.id}">Prüfen</button></div>`).join(''):'<div class="empty"><div class="empty-icon">✓</div><h2>Keine offenen Fälle</h2><p>Alle gespeicherten Fälle haben die Pflichtangaben.</p></div>';$$('[data-case]').forEach(b=>b.onclick=()=>{const e=state.entries.find(x=>x.id===b.dataset.case);if(e)openEditorFromEntry(e);});}
  function csvRowsBase(){return state.entries.filter(e=>e.saved).map(e=>({Proof:e.proof||'',Datum:formatDateDE(e.date),ID:e.targetId||'',SOC:'',RID:e.sc||'',DiscordID:e.discordId||'',Familie:'',Grund:e.reason||''}));}
  function csvRows(){
    const q=(($('#csvFilterSearch')?.value)||'').toLowerCase().trim();
    const reason=($('#csvFilterReason')?.value)||'all';
    const sc=($('#csvFilterSc')?.value)||'all';
    const discord=($('#csvFilterDiscord')?.value)||'all';
    return csvRowsBase().filter(r=>{
      if(reason!=='all' && r.Grund!==reason)return false;
      if(sc==='present' && !r.RID)return false;
      if(sc==='empty' && r.RID)return false;
      if(discord==='present' && !r.DiscordID)return false;
      if(discord==='empty' && r.DiscordID)return false;
      if(q && ![r.Proof,r.Datum,r.ID,r.RID,r.DiscordID,r.Grund].some(v=>String(v||'').toLowerCase().includes(q)))return false;
      return true;
    });
  }
  function renderCsv(){
    const all=csvRowsBase(), rows=csvRows();
    $('#csvSummary').textContent=`${rows.length} von ${all.length} Einträgen`;
    $('#csvPreviewBody').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.Proof)}</td><td>${esc(r.Datum)}</td><td>${esc(r.ID)}</td><td></td><td>${esc(r.RID)}</td><td>${esc(r.DiscordID)}</td><td></td><td>${esc(r.Grund)}</td></tr>`).join(''):'<tr><td colspan=8 class="csv-empty">Keine Einträge passen zum Filter.</td></tr>';
  }
  function csvText(){const rows=csvRows();const header=['Proof','Datum','ID','SOC','RID','Discord ID','Familie','Grund'];const line=a=>a.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';');return '\uFEFF'+[line(header),...rows.map(r=>line([r.Proof,r.Datum,r.ID,r.SOC,r.RID,r.DiscordID,r.Familie,r.Grund]))].join('\r\n');}
  function downloadCsv(){const blob=new Blob([csvText()],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='grandrp_bans.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  async function copyCsv(){try{await navigator.clipboard.writeText(csvText());toast('CSV in die Zwischenablage kopiert.');}catch{toast('Kopieren nicht verfügbar. CSV herunterladen.');}}

  function setupNav(){
    $$('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#headerUploadBtn').onclick=()=>showView('upload');$('#emptyUploadBtn').onclick=()=>showView('upload');$('#headerCsvBtn').onclick=()=>showView('csv');$('#reloadBtn').onclick=()=>renderArchive();$('#casesRefresh').onclick=renderCases;$('#search').oninput=renderArchive;$('#refreshCsvBtn').onclick=renderCsv;$('#downloadCsvBtn').onclick=downloadCsv;$('#copyCsvBtn').onclick=copyCsv;['#csvFilterSearch','#csvFilterReason','#csvFilterSc','#csvFilterDiscord'].forEach(s=>$(s)?.addEventListener($(s)?.tagName==='SELECT'?'change':'input',renderCsv));$('#csvFilterClear')?.addEventListener('click',()=>{if($('#csvFilterSearch'))$('#csvFilterSearch').value='';if($('#csvFilterReason'))$('#csvFilterReason').value='all';if($('#csvFilterSc'))$('#csvFilterSc').value='all';if($('#csvFilterDiscord'))$('#csvFilterDiscord').value='all';renderCsv();});
    $$('.filter').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));renderArchive();});
  }

  const dropzone=$('#dropzone'), input=$('#fileInput');
  function setupUpload(){
    $('#chooseBtn').onclick=e=>{e.stopPropagation();input.click();};dropzone.onclick=e=>{if(!e.target.closest('button'))input.click();};input.onchange=e=>{addFiles([...e.target.files]);input.value='';};
    ['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag');}));
    ['dragleave','drop'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag');}));
    dropzone.addEventListener('drop',e=>addFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/i.test(f.name))));
  }
  function addFiles(files){for(const file of files){state.queue.push({id:crypto.randomUUID(),file,status:'Wartet',progress:0,result:null,processing:false,editingDone:false,youtube:null});}renderQueue();processQueue();}
  async function retryQueueItem(item){
    if(!item||item.processing)return;
    if(item.youtube){await retryLocalOCR(item);return;}
    item.status='Wartet · neuer Versuch';item.progress=0;item.processing=false;renderQueue();await processQueue();
  }
  function renderQueue(){const q=$('#uploadQueue');$('#queueCount').textContent=`${state.queue.length} ${state.queue.length===1?'Datei':'Dateien'}`;q.innerHTML=state.queue.map(item=>{const hasError=/^Fehler:/i.test(item.status||'');const retry=(!item.processing&&((!!item.youtube&&!item.result)||hasError));const label=item.youtube?'OCR erneut':'Erneut verarbeiten';return `<div class="queue-item ${hasError?'has-error':''}"><div class="queue-icon">▶</div><div class="queue-name"><strong>${esc(item.finalName||item.file.name)}</strong><small>${formatSize(item.file.size)} · ${esc(item.status)}</small><div class="progress"><i style="width:${item.progress}%"></i></div></div><div class="queue-actions">${item.result?`<button class="mini" data-check="${item.id}">Prüfen</button>`:''}${retry?`<button class="mini primary" data-retry="${item.id}">${label}</button>`:''}<button class="mini" data-remove="${item.id}">×</button></div></div>`}).join('');$$('[data-check]').forEach(b=>b.onclick=()=>{const x=state.queue.find(i=>i.id===b.dataset.check);if(x?.result)openEditor(x);});$$('[data-retry]').forEach(b=>b.onclick=async()=>{const x=state.queue.find(i=>i.id===b.dataset.retry);if(x)await retryQueueItem(x);});$$('[data-remove]').forEach(b=>b.onclick=()=>{const x=state.queue.find(i=>i.id===b.dataset.remove);if(x?.processing){toast('POV wird gerade verarbeitet.');return;}state.queue=state.queue.filter(i=>i.id!==b.dataset.remove);renderQueue();});}
  async function retryLocalOCR(item){
    if(item.processing)return;
    item.processing=true;item.status='OCR wird erneut gestartet…';item.progress=60;renderQueue();
    let media=null;
    try{
      const file=item.file||await getVideo(item.id);
      if(!file)throw new Error('Lokale POV-Datei ist nicht mehr verfügbar.');
      item.file=file;
      const stored=await getVideo(item.id);
      const sourceSize=await verifyLocalFile(file,0,'OCR-Quelle');
      if(stored && Number(stored.size)!==sourceSize)throw new Error(`OCR-Quelle beschädigt: ${formatBytesExact(sourceSize)} · Archiv ${formatBytesExact(stored.size)}.`);
      media=await openLocalVideo(file,`POV ${file.name}`,stored&&stored!==file?stored:null);
      item.result=await analyzeVideo(media.video,p=>{item.progress=60+Math.round(p*.40);item.status=`OCR ${p}% · erneuter Versuch`;renderQueue();});
      item.result.originalName=file.name;item.result.sourceSize=sourceSize;item.result.remoteSize=Number(item.result.remoteSize||item.youtube?.remoteSize||0);item.result.sourceType=file.type||'video/mp4';item.result.types=[];item.result.proof=item.youtube?.url||item.result.proof||'';item.result.youtube=item.youtube||item.result.youtube;
      item.status=item.result.complete?`OCR fertig · Prüfung offen`:'OCR unvollständig · Prüfung nötig';item.progress=100;renderQueue();if(!state.editing)openEditor(item);else{item.status+=' · Prüfung wartet';renderQueue();}
    }catch(err){item.status='Fehler: '+(err?.message||err);item.progress=0;renderQueue();}finally{closeLocalVideo(media);item.processing=false;renderQueue();}
  }
  async function loadVideoElement(v,label='POV'){
    return await new Promise((res,rej)=>{
      let done=false;
      const finish=(fn,val)=>{if(done)return;done=true;cleanup();fn(val);};
      const cleanup=()=>{
        clearTimeout(timer);
        v.removeEventListener('loadedmetadata',ok);
        v.removeEventListener('durationchange',durationOk);
        v.removeEventListener('loadeddata',dataOk);
        v.removeEventListener('canplay',canPlayOk);
        v.removeEventListener('error',bad);
      };
      const ok=()=>{
        if(Number.isFinite(v.duration)&&v.duration>0)finish(res, v);
      };
      const durationOk=()=>ok();
      const dataOk=()=>ok();
      const canPlayOk=()=>ok();
      const bad=()=>{
        const code=v.error?.code||0;
        const map={1:'Laden abgebrochen',2:'Netzwerk-/Dateizugriffsfehler',3:'Videodecodierung fehlgeschlagen',4:'Videoformat oder Codec wird vom Browser nicht unterstützt'};
        finish(rej,new Error(`${label} konnte nicht gelesen werden${code?` (${map[code]||`MediaError ${code}`})`:''}.`));
      };
      v.addEventListener('loadedmetadata',ok);
      v.addEventListener('durationchange',durationOk);
      v.addEventListener('loadeddata',dataOk);
      v.addEventListener('canplay',canPlayOk);
      v.addEventListener('error',bad);
      const timer=setTimeout(()=>finish(rej,new Error(`${label} konnte nicht gelesen werden (Timeout beim Einlesen der Videodaten).`)),90000);
      try{v.load();}catch(e){finish(rej,e instanceof Error?e:new Error(String(e)));}
    });
  }
  async function openLocalVideo(file,label='POV',fallbackFile=null){
    const sources=[];
    if(file)sources.push(file);
    if(fallbackFile && fallbackFile!==file)sources.push(fallbackFile);
    if(!sources.length)throw new Error(`${label}: Datei fehlt.`);
    let lastErr=null;
    for(let sourceIndex=0;sourceIndex<sources.length;sourceIndex++){
      const source=sources[sourceIndex];
      for(let attempt=1;attempt<=2;attempt++){
        const v=document.createElement('video');
        v.muted=true; v.playsInline=true; v.preload='auto';
        v.style.position='fixed'; v.style.left='-20000px'; v.style.top='-20000px'; v.style.width='2px'; v.style.height='2px';
        document.body.appendChild(v);
        const url=URL.createObjectURL(source);
        try{
          v.src=url;
          const suffix=sourceIndex===1?' · Archivkopie':'';
          await loadVideoElement(v,`${label}${suffix}${attempt===2?' · zweiter Versuch':''}`);
          return {video:v,url};
        }catch(err){
          lastErr=err;
          try{v.pause();}catch{}
          v.removeAttribute('src');
          try{v.load();}catch{}
          v.remove();
          URL.revokeObjectURL(url);
          if(attempt===1)await new Promise(r=>setTimeout(r,250));
        }
      }
    }
    throw lastErr||new Error(`${label} konnte nicht gelesen werden.`);
  }
  function closeLocalVideo(media){
    if(!media)return;
    try{media.video.pause();}catch{}
    try{media.video.removeAttribute('src');media.video.load();}catch{}
    try{media.video.remove();}catch{}
    try{URL.revokeObjectURL(media.url);}catch{}
  }
  async function seek(v,t,timeout=18000){return new Promise((res,rej)=>{let done=false;const cleanup=()=>{clearTimeout(timer);v.removeEventListener('seeked',ok);v.removeEventListener('error',bad);};const ok=()=>{if(done)return;done=true;cleanup();res();};const bad=()=>{if(done)return;done=true;cleanup();rej(new Error('Videodecoder meldet einen Fehler beim Suchen.'));};v.addEventListener('seeked',ok,{once:true});v.addEventListener('error',bad,{once:true});try{v.currentTime=Math.max(0,Math.min(Number(t)||0,Math.max(0,v.duration-.05)));}catch(e){bad();return;}const timer=setTimeout(()=>{if(done)return;done=true;cleanup();rej(new Error('Video-Suche Timeout'));},timeout);});}
  async function safeSeek(v,t,tries=3){let last=null;for(let i=0;i<tries;i++){try{await seek(v,t,22000);return true;}catch(err){last=err;try{v.pause();}catch{}await new Promise(r=>setTimeout(r,250*(i+1)));}}return false;}
  function makeCrop(v,x,y,w,h,scale=2){
    const c=document.createElement('canvas');const vw=v.videoWidth,vh=v.videoHeight;
    let cw=Math.max(1,Math.round(vw*w*scale)),ch=Math.max(1,Math.round(vh*h*scale));
    const maxPixels=5_000_000;
    if(cw*ch>maxPixels){const factor=Math.sqrt(maxPixels/(cw*ch));cw=Math.max(1,Math.floor(cw*factor));ch=Math.max(1,Math.floor(ch*factor));}
    c.width=cw;c.height=ch;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;
    ctx.drawImage(v,Math.round(vw*x),Math.round(vh*y),Math.round(vw*w),Math.round(vh*h),0,0,c.width,c.height);return c;
  }
  function threshold(src,cut=145){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0);const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;for(let i=0;i<d.length;i+=4){const v=.299*d[i]+.587*d[i+1]+.114*d[i+2];const b=v<cut?0:255;d[i]=d[i+1]=d[i+2]=b;}ctx.putImageData(im,0,0);return c;}
  function yellowMask(src){const c=document.createElement('canvas');c.width=src.width;c.height=src.height;const inCtx=src.getContext('2d',{willReadFrequently:true});const data=inCtx.getImageData(0,0,src.width,src.height).data;const out=c.getContext('2d'),im=out.createImageData(src.width,src.height),d=im.data;for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2];const y=(r>140&&g>90&&b<150&&r>b*1.35&&g>b*1.12);const v=y?255:0;d[i]=d[i+1]=d[i+2]=v;d[i+3]=255;}out.putImageData(im,0,0);return c;}
  function sharpness(canvas){const ctx=canvas.getContext('2d',{willReadFrequently:true}),w=canvas.width,h=canvas.height;const data=ctx.getImageData(0,0,w,h).data;let s=0,n=0;for(let y=1;y<h-1;y+=3){for(let x=1;x<w-1;x+=3){const i=(y*w+x)*4;const l=((y*w+x-1)*4),r=((y*w+x+1)*4),u=(((y-1)*w+x)*4),d=(((y+1)*w+x)*4);const g=(data[i]+data[i+1]+data[i+2])/3;const gl=(data[l]+data[l+1]+data[l+2])/3,gr=(data[r]+data[r+1]+data[r+2])/3,gu=(data[u]+data[u+1]+data[u+2])/3,gd=(data[d]+data[d+1]+data[d+2])/3;s+=Math.abs(2*g-gl-gr)+Math.abs(2*g-gu-gd);n++;}}return n?s/n:0;}

  function orangeMask(src){
    const c=document.createElement('canvas'); c.width=src.width; c.height=src.height; const ctx=src.getContext('2d',{willReadFrequently:true}); const data=ctx.getImageData(0,0,src.width,src.height).data; const out=c.getContext('2d'); const im=out.createImageData(src.width,src.height);
    for(let i=0;i<data.length;i+=4){const r=data[i],g=data[i+1],b=data[i+2]; const isOrange=(r>70&&g>18&&b<110&&r>g*1.2&&g>b*1.02); const v=isOrange?0:255; im.data[i]=im.data[i+1]=im.data[i+2]=v; im.data[i+3]=255;}
    out.putImageData(im,0,0); return c;
  }
  function enhancedCanvas(src,contrast=1.35,brightness=1.02){
    const c=document.createElement('canvas');c.width=src.width;c.height=src.height;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.imageSmoothingEnabled=true;ctx.filter=`contrast(${contrast}) brightness(${brightness}) saturate(.8)`;ctx.drawImage(src,0,0);ctx.filter='none';
    return c;
  }
  function clearCanvas(c){try{c.width=1;c.height=1;}catch{}}
  function makeServerBadgeCrop(video){
    // Two-stage ROI: first a generous top-right search, then yellow connected-component crop.
    const raw=makeCrop(video,.88,.01,.12,.17,4.0); const mask=yellowMask(raw);
    const ctx=mask.getContext('2d',{willReadFrequently:true}); const {width,height}=mask; const d=ctx.getImageData(0,0,width,height).data;
    let minX=width,minY=height,maxX=-1,maxY=-1,count=0; for(let y=0;y<height;y++){for(let x=0;x<width;x++){const i=(y*width+x)*4;if(d[i]>200){count++;if(x<minX)minX=x;if(x>maxX)maxX=x;if(y<minY)minY=y;if(y>maxY)maxY=y;}}}
    let badge=raw; if(count>100 && maxX>minX && maxY>minY){const pad=18;const sx=Math.max(0,minX-pad),sy=Math.max(0,minY-pad),sw=Math.min(width-sx,maxX-minX+pad*2),sh=Math.min(height-sy,maxY-minY+pad*2);badge=document.createElement('canvas');badge.width=sw;badge.height=sh;badge.getContext('2d').drawImage(raw,sx,sy,sw,sh,0,0,sw,sh);}
    const big=document.createElement('canvas');big.width=badge.width*2;big.height=badge.height*2;big.getContext('2d').drawImage(badge,0,0,big.width,big.height);
    return {variants:[big,threshold(big,160),yellowMask(big)]};
  }
  async function ensureWorker(){
    if(state.worker)return state.worker;
    if(!window.Tesseract)throw new Error('Tesseract konnte nicht geladen werden. Bitte Internetverbindung prüfen.');
    state.worker=await Tesseract.createWorker('eng');
    await state.worker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6'});
    return state.worker;
  }
  async function ensureSpecialWorker(){
    if(state.specialWorker)return state.specialWorker;
    if(!window.Tesseract)throw new Error('Tesseract konnte nicht geladen werden. Bitte Internetverbindung prüfen.');
    state.specialWorker=await Tesseract.createWorker('eng');
    await state.specialWorker.setParameters({preserve_interword_spaces:'1'});
    return state.specialWorker;
  }
  async function ocr(worker,canvas,opts={}){
    // General OCR and restricted numeric/hex OCR use separate workers. This is deliberate:
    // Tesseract.js persists tessedit_char_whitelist on a worker, and clearing it with an
    // empty string is not reliable across all builds. A restricted pass can therefore never
    // poison the general pass used for Ziel-ID and Grund on the next frame/video.
    const p={tessedit_pageseg_mode:String(opts.psm||6)};
    if(opts.whitelist) p.tessedit_char_whitelist=String(opts.whitelist);
    if(opts.numeric) p.classify_bln_numeric_mode='1';
    if(opts.nodict) {p.load_system_dawg='0';p.load_freq_dawg='0';p.tessedit_enable_dict_correction='0';}
    await worker.setParameters(p);
    const r=await worker.recognize(canvas);
    return r.data;
  }
  function grayCanvas(src){
    const c=document.createElement('canvas');c.width=src.width;c.height=src.height;
    const ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(src,0,0);
    const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
    for(let i=0;i<d.length;i+=4){const v=Math.round(.299*d[i]+.587*d[i+1]+.114*d[i+2]);d[i]=d[i+1]=d[i+2]=v;}
    ctx.putImageData(im,0,0);return c;
  }
  function ocrQuality(data){
    const t=String(data?.text||'');
    const conf=Number.isFinite(Number(data?.confidence))?Number(data.confidence):0;
    const words=Array.isArray(data?.words)?data.words.filter(w=>String(w.text||'').trim()).length:0;
    // Confidence is primary, with a small text/word bonus to avoid selecting an
    // empty high-confidence fragment over a complete banner line.
    return conf + Math.min(20,t.length/40) + Math.min(10,words/4);
  }

  async function readChat(worker,chat){
    const texts=[];let best=null;
    // Broad OCR passes. Different preprocessing catches thin fonts, compression and
    // colored UI text without relying on one Tesseract interpretation.
    const baseVariants=[
      [grayCanvas(chat),6],
      [orangeMask(chat),6],
      [enhancedCanvas(chat,1.55,1.03),6],
      [grayCanvas(chat),11],
      [threshold(chat,145),11],
      [threshold(chat,175),11],
      [threshold(chat,205),12]
    ];
    for(const [img,psm] of baseVariants){try{const r=await ocr(worker,img,{psm});if(r?.text)texts.push(cleanText(r.text));if(!best||ocrQuality(r)>ocrQuality(best))best=r;}finally{clearCanvas(img);}}

    let merged=[...new Set(texts.filter(Boolean))].join('\n');
    if(!parseTargetId(merged)||!parseReason(merged)){
      const extra=[
        [enhancedCanvas(chat,1.85,1.06),11],
        [threshold(enhancedCanvas(chat,1.40,1.0),135),6]
      ];
      for(const [img,psm] of extra){try{const r=await ocr(worker,img,{psm});if(r?.text)texts.push(cleanText(r.text));if(!best||ocrQuality(r)>ocrQuality(best))best=r;}finally{clearCanvas(img);}}
      merged=[...new Set(texts.filter(Boolean))].join('\n');
    }

    // Dedicated numeric pass: target IDs and Discord IDs are numeric fields, so an
    // unrestricted language OCR can confuse I/i/l with 1. A digit whitelist removes
    // that ambiguity and the parser treats only the short numeric result as an ID.
    try{
      const idImg=enhancedCanvas(chat,1.65,1.02);
      const idPass=await ocr(worker,idImg,{psm:11,whitelist:'0123456789[]()',numeric:true,nodict:true});
      const idText=cleanText(idPass?.text||''); if(idText)texts.push(idText); clearCanvas(idImg);
    }catch{}

    // Dedicated hexadecimal pass: Social-Club/RID is hexadecimal. Restricting the
    // alphabet prevents Tesseract from inventing arbitrary letters; normalizeHexLoose
    // still maps common OCR confusions such as O/0 and I/1.
    try{
      const hx=enhancedCanvas(chat,1.70,1.02);
      const p1=await ocr(worker,hx,{psm:11,whitelist:'0123456789ABCDEFabcdef',nodict:true});
      const p2=await ocr(worker,threshold(hx,150),{psm:7,whitelist:'0123456789ABCDEFabcdef',nodict:true});
      for(const r of [p1,p2]){if(r?.text)texts.push(cleanText(r.text));}
      clearCanvas(hx);
    }catch{}

    merged=[...new Set(texts.filter(Boolean))].join('\n');
    // Keep a clean 40-char hex candidate in the returned text even when general OCR
    // split it across lines. The SC extractor will only accept it in online/IP context.
    const hxCandidate=extractHexCandidateAnyText(merged);
    if(hxCandidate)merged += `\nSC_OCR_EXACT: ${hxCandidate}`;
    return {text:merged,data:best||{}};
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
  const BAN_ROI={x:0,y:.005,w:.84,h:.34};
  async function readBanOnly(worker,video){
    const chat=makeCrop(video,BAN_ROI.x,BAN_ROI.y,BAN_ROI.w,BAN_ROI.h,3.8);
    const texts=[];
    const variants=[[grayCanvas(chat),6],[enhancedCanvas(chat,1.60,1.03),6],[threshold(chat,145),11],[threshold(chat,185),11],[grayCanvas(chat),11]];
    try{const nimg=enhancedCanvas(chat,1.75,1.03);const r=await ocr(worker,nimg,{psm:11,whitelist:'0123456789[]',numeric:true,nodict:true});if(r?.text)texts.push(cleanText(r.text));clearCanvas(nimg);}catch{}
    for(const [img,psm] of variants){try{const r=await ocr(worker,img,{psm,nodict:true});if(r?.text)texts.push(cleanText(r.text));}catch{}finally{clearCanvas(img);}}
    const merged=[...new Set(texts.filter(Boolean))].join('\n');clearCanvas(chat);return {text:merged};
  }
  async function analyzeVideo(video,onProgress){
    const worker=await ensureWorker();const duration=video.duration;const start=Math.max(0,duration-45);const settings=state.settings;
    if(!Number.isFinite(duration)||duration<=0)throw new Error('Videodauer konnte nicht bestimmt werden.');
    const baseCount=Math.max(26,Math.min(40,Number(settings.frames)||30));const coarse=[];
    for(let i=0;i<baseCount;i++){
      const t=duration<=45?duration*(i/Math.max(1,baseCount-1)):start+((duration-start-.35)*i/Math.max(1,baseCount-1));
      if(!(await safeSeek(video,t,3)))continue;
      try{const read=await readBanOnly(worker,video);const ban=extractBanEvent(read.text);coarse.push({time:t,text:read.text,ban,sharp:ban?sharpness(makeCrop(video,BAN_ROI.x,BAN_ROI.y,BAN_ROI.w,BAN_ROI.h,2.2)):0});}catch(err){console.debug('Ban OCR skipped',err);}
      onProgress?.(8+Math.round((i+1)/baseCount*40),`Bann-Scan ${i+1}/${baseCount}`);
    }
    const strictCoarse=coarse.filter(f=>f.ban&&f.ban.adminId===BAN_ADMIN_ID&&f.ban.targetId&&f.ban.reason);
    if(!strictCoarse.length){onProgress?.(100,`Kein eindeutiger Ban von ${BAN_ADMIN_NAME} [${BAN_ADMIN_ID}]`);return {targetId:'',reason:'',sc:'',server:'3',date:'',offline:true,missing:['Ziel-ID','Grund','Datum'],complete:false,timestamps:{},confidence:{id:0,reason:0,sc:0,server:1,date:0,ban:0,admin:0}};}
    const grouped=new Map();for(const f of strictCoarse){const k=`${f.ban.targetId}|${f.ban.reason}`;(grouped.get(k)||grouped.set(k,[]).get(k)).push(f);}
    const group=[...grouped.values()].sort((a,b)=>b.length-a.length||b.reduce((s,x)=>s+x.ban.score,0)-a.reduce((s,x)=>s+x.ban.score,0))[0]||[];
    const seeds=group.slice().sort((a,b)=>b.ban.score-a.ban.score||b.sharp-a.sharp).slice(0,6);const refineTimes=new Set();const win=Math.max(3,Math.min(9,Number(settings.window)||5));const rstep=Math.max(.30,Math.min(.8,Number(settings.step)||.4));
    for(const seed of seeds)for(let t=Math.max(start,seed.time-win/2);t<=Math.min(duration-.05,seed.time+win/2);t+=rstep)refineTimes.add(Math.round(t*20)/20);
    const refined=[];const times=[...refineTimes].sort((a,b)=>a-b);let n=0;
    for(const t of times){if(!(await safeSeek(video,t,2)))continue;try{const read=await readBanOnly(worker,video);const ban=extractBanEvent(read.text);if(ban)refined.push({time:t,text:read.text,ban,sharp:0});}catch{}n++;onProgress?.(48+Math.round(n/Math.max(1,times.length)*28),`Ban-Präzisionsscan ${n}/${times.length}`);}
    const all=[...strictCoarse,...refined].filter(f=>f.ban&&f.ban.adminId===BAN_ADMIN_ID&&f.ban.targetId&&f.ban.reason);const map=new Map();for(const f of all){const k=`${f.ban.targetId}|${f.ban.reason}`;(map.get(k)||map.set(k,[]).get(k)).push(f);}
    const frames=[...(( [...map.values()].sort((a,b)=>b.length-a.length||b.reduce((s,x)=>s+x.ban.score,0)-a.reduce((s,x)=>s+x.ban.score,0))[0] )||[])];
    if(!frames.length){onProgress?.(100,'Ban-Anker nicht stabil genug');return {targetId:'',reason:'',sc:'',server:'3',date:'',offline:true,missing:['Ziel-ID','Grund','Datum'],complete:false,timestamps:{},confidence:{id:0,reason:0,sc:0,server:1,date:0,ban:0,admin:0}};}
    const idV=uniqueVote(frames.map(f=>f.ban.targetId));const reasonV=uniqueVote(frames.map(f=>f.ban.reason));const anchor=frames.slice().sort((a,b)=>b.ban.score-a.ban.score||b.sharp-a.sharp)[0];const bannerTime=anchor.time;const timestamps={banner:bannerTime,targetId:bannerTime,reason:bannerTime,server:bannerTime};
    const specialWorker=await ensureSpecialWorker();const scCandidates=[];
    for(const f of frames.slice(0,12)){if(!(await safeSeek(video,f.time,2)))continue;let chat=null;try{chat=makeCrop(video,0,.005,.82,.40,3.6);const read=await readChat(worker,chat);const precise=extractScFromData(read.data,chat);if(precise.canvas){for(const [img,psm] of [[precise.canvas,7],[threshold(precise.canvas,125),7],[threshold(precise.canvas,150),7],[enhancedCanvas(precise.canvas,1.8,1.02),7]]){try{const r=await ocr(specialWorker,img,{psm,whitelist:'0123456789ABCDEFabcdef',nodict:true});const c=extractHexCandidateAnyText(r.text||'');if(c)scCandidates.push(c);}finally{if(img!==precise.canvas)clearCanvas(img);}}clearCanvas(precise.canvas);}}catch(err){console.debug('SC precision OCR',err);}finally{clearCanvas(chat);}}
    const online=frames.some(f=>/\bIP\b/i.test(f.text||''));const sc=online?consensusHex(scCandidates):'';if(sc)timestamps.sc=anchor.time;const server='3';const dateVotes=[];
    for(let dt=-1.5;dt<=1.51;dt+=.5){const t=Math.max(0,Math.min(duration-.05,bannerTime+dt));if(!(await safeSeek(video,t,2)))continue;try{const crop=makeCrop(video,.76,.74,.24,.26,3.6);const d1=await ocr(specialWorker,crop,{psm:6,whitelist:'0123456789./-'});const d2=await ocr(specialWorker,threshold(crop,145),{psm:11,whitelist:'0123456789./-'});for(const tx of [d1.text||'',d2.text||'']){const dv=extractDate(tx);if(dv)dateVotes.push(dv);}clearCanvas(crop);}catch{}}
    const date=dateVote(dateVotes);if(date)timestamps.date=bannerTime;const missing=[];if(!idV?.value)missing.push('Ziel-ID');if(!reasonV?.value)missing.push('Grund');if(!server)missing.push('Server');if(!date)missing.push('Datum');if(online&&!sc)missing.push('SC');onProgress?.(100,idV?.value&&reasonV?.value?`Ban von ${BAN_ADMIN_NAME} [${BAN_ADMIN_ID}] erkannt`:'Ban erkannt, Angaben fehlen');
    return {targetId:/^\d{1,6}$/.test(idV?.value||'')?idV.value:'',reason:reasonV?.value||'',sc:online?(sc||''):'',server,date,offline:!online,missing,complete:missing.length===0,timestamps,confidence:{id:idV?idV.votes/Math.max(1,frames.length):0,reason:reasonV?reasonV.votes/Math.max(1,frames.length):0,sc:sc?1:0,server:1,date:date?1:0,ban:anchor.ban.score||0,admin:1}};
  }
  async function openManualPicker(entry, field){
    if(!entry)return;
    try{
      const id=entry.id;
      const file=entry.file||await getVideo(id);
      if(!file){toast('POV-Datei ist nicht verfügbar.');return;}
      await putVideo(id,file);
      const t=Number(entry.result?.timestamps?.[field]||entry.result?.timestamps?.banner||0)||0;
      const target=new URL('manual.html',location.href);
      target.searchParams.set('job',id);
      target.searchParams.set('field',field);
      target.searchParams.set('t',String(t));
      const w=window.open(target.href,'_blank');
      if(!w){toast('Pop-up blockiert. Bitte Pop-ups für die Website erlauben.');return;}
    }catch(err){console.error(err);toast('Manuelle Auswahl konnte nicht geöffnet werden: '+err.message);}
  }
  function applyManualField(field,value,time){
    const ctx=state.editing;if(!ctx)return;
    const target=ctx.item?.result||ctx.entry||{};
    let v=String(value||'').trim();
    if(field==='targetId')v=clampId(v);
    else if(field==='reason'){const r=classifyReasonStrong(v)||canonicalReason(v);v=r?.value||r||'';if(v&&typeof v!=='string')v=r.value||'';}
    else if(field==='sc'){v=normalizeHexLoose(v);if(v.length!==40)v='';}
    else if(field==='server'){const m=v.match(/[1-4]/);v=m?m[0]:'3';}
    else if(field==='date'){v=extractDate(v)||v;}
    else if(field==='discordId'){v=v.replace(/[^0-9]/g,'');}
    if(ctx.item){ctx.item.result={...ctx.item.result,[field]:v};ctx.item.result.timestamps={...(ctx.item.result.timestamps||{}),[field]:Number(time)||ctx.item.result.timestamps?.banner||0};if(field==='sc'&&v)ctx.item.result.offline=false;renderQueue();setEditorValues({...ctx.item.result,proof:ctx.item.youtube?.url||ctx.item.result.proof||''});setFieldStatus(ctx.item);}
    if(ctx.entry){ctx.entry[field]=v;ctx.entry.result={...(ctx.entry.result||{}),[field]:v};ctx.entry.timestamps={...(ctx.entry.timestamps||{}),[field]:Number(time)||ctx.entry.timestamps?.banner||0};if(field==='sc'&&v){ctx.entry.offline=false;ctx.entry.result.offline=false;}setEditorValues(ctx.entry);setFieldStatus({result:ctx.entry});}
    if(field==='reason'||field==='targetId'||field==='date')renderTitlePreview();
    toast(`${field==='sc'?'SC':field==='server'?'Server':field==='reason'?'Grund':field==='targetId'?'Ziel-ID':field==='date'?'Datum':'Discord ID'} übernommen.`);
  }
  async function openVideoNewTab(entry,seconds=0){
    if(!entry)return;
    try{
      const file=entry.file||await getVideo(entry.id); if(!file){toast('POV-Datei ist nicht verfügbar.');return;}
      await putVideo(entry.id,file);
      const target=new URL('manual.html',location.href);target.searchParams.set('job',entry.id);target.searchParams.set('field','view');target.searchParams.set('t',String(Number(seconds)||0));
      const w=window.open(target.href,'_blank','noopener'); if(!w)toast('Pop-up blockiert. Bitte Pop-ups für die Website erlauben.');
    }catch(err){console.error(err);toast('POV konnte nicht geöffnet werden: '+err.message);}
  }
  const PHOTO_ROIS={banner:[0,.005,.98,.54],targetId:[0,.015,.78,.18],reason:[0,.12,.78,.18],sc:[0,.10,.90,.32],server:[.80,0,.20,.20],date:[.70,.72,.30,.28],discordId:[0,.06,.86,.30]};
  async function showInfoPhoto(field='banner'){
    const panel=$('#infoPhotoPanel'),canvas=$('#infoPhotoCanvas'),label=$('#infoPhotoLabel'),meta=$('#infoPhotoMeta');if(!panel||!canvas)return;
    const ctx=state.editing;const entry=ctx?.item||ctx?.entry;if(!entry)return;
    let file=entry.file||null;if(!file){try{file=await getVideo(entry.id);if(file)entry.file=file;}catch{}}
    if(!file){panel.classList.add('hidden');return;}
    const r=entry.result||entry;const t=Number(r.timestamps?.[field]??r.timestamps?.banner??0)||0;
    panel.classList.remove('hidden');label.textContent=`Info-Foto · ${field==='targetId'?'Ziel-ID':field==='reason'?'Grund':field==='sc'?'SC / RID':field==='server'?'Server':field==='date'?'Datum':field==='discordId'?'Discord ID':'Bannblock'}`;meta.textContent=`Zeitpunkt ${t.toFixed(2)} s`;
    for(const b of $$('.photo-field'))b.classList.toggle('active',b.dataset.field===field);
    let media=null;
    try{
      media=await openLocalVideo(file,'Info-Foto');
      if(!(await safeSeek(media.video,t,2)))throw new Error('Zeitpunkt konnte nicht geladen werden.');
      const maxW=1280,maxH=720,scale=Math.min(1,maxW/media.video.videoWidth,maxH/media.video.videoHeight);canvas.width=Math.max(1,Math.round(media.video.videoWidth*scale));canvas.height=Math.max(1,Math.round(media.video.videoHeight*scale));
      const c=canvas.getContext('2d');c.drawImage(media.video,0,0,canvas.width,canvas.height);const roi=PHOTO_ROIS[field]||PHOTO_ROIS.banner;c.save();c.fillStyle='rgba(255,47,139,.10)';c.strokeStyle='#ff2f8b';c.lineWidth=Math.max(2,canvas.width/800);c.fillRect(canvas.width*roi[0],canvas.height*roi[1],canvas.width*roi[2],canvas.height*roi[3]);c.strokeRect(canvas.width*roi[0],canvas.height*roi[1],canvas.width*roi[2],canvas.height*roi[3]);c.restore();
    }catch(err){canvas.width=1;canvas.height=1;meta.textContent=`Foto konnte nicht geladen werden: ${err.message}`;}finally{closeLocalVideo(media);}
  }
  function setEditorValues(v={}){
    const r=v?.result||v||{};
    const val=(x)=>x==null?'':String(x);
    $('#targetId').value=val(r.targetId);
    $('#reason').value=ALLOWED_REASONS.includes(val(r.reason))?val(r.reason):'';
    $('#sc').value=val(r.sc);
    $('#server').value=/^[1-4]$/.test(val(r.server))?val(r.server):'3';
    $('#date').value=validDate(r.date)?val(r.date):'';
    $('#discordId').value=val(r.discordId);
    $('#proof').value=val(r.proof);
    $('#perma').checked=!!r.perma;
    $('#notBanned').checked=!!r.notBanned;
    renderTitlePreview();
  }
  function setFieldStatus(item){
    const r=item?.result||item||{};
    const missing=new Set(Array.isArray(r.missing)?r.missing:[]);
    const statuses=[
      ['ID','Ziel-ID',!!r.targetId&&!missing.has('Ziel-ID')],
      ['Grund','Grund',!!r.reason&&!missing.has('Grund')],
      ['SC','SC',!!r.offline||!!r.sc&&!missing.has('SC')],
      ['Server','Server',/^[1-4]$/.test(String(r.server||''))&&!missing.has('Server')],
      ['Datum','Datum',!!r.date&&!missing.has('Datum')]
    ];
    const box=$('#fieldStatus');
    if(box) box.innerHTML=statuses.map(([short,label,ok])=>`<div class="status-chip ${ok?'ok':'warn'}">${ok?'✓':'⚠'} ${esc(label)}</div>`).join('');
    const editorState=state.editing;
    const result=editorState?.item?.result||editorState?.entry||r;
    $$('.jump').forEach(btn=>{
      const field=btn.dataset.field;
      let show=!result?.[field];
      // Always provide manual correction for SC and Discord ID. These fields
      // are commonly misread by OCR and must be manually selectable even
      // when an automatic value already exists. Server is also always selectable.
      if(field==='sc' || field==='discordId' || field==='server') show=true;
      btn.classList.toggle('hidden',!show);
    });
    const warning=$('#ocrWarning');
    if(warning){
      const miss=statuses.filter(x=>!x[2]).map(x=>x[1]);
      warning.textContent=miss.length?`⚠ Bitte prüfen: ${miss.join(' · ')}`:'';
      warning.classList.toggle('hidden',miss.length===0);
    }
  }
  function renderTitlePreview(){
    const id=clampId($('#targetId').value);
    const reason=ALLOWED_REASONS.includes($('#reason').value)?$('#reason').value:'';
    const date=formatDateDE($('#date').value);
    $('#titlePreview').value=(id&&reason&&date)?`${id}, ${reason}, ${date}.mp4`:'';
  }
  function openEditor(item){state.editing={item};$('#modalFile').textContent=item.finalName||item.file.name;setEditorValues({...item.result,discordId:item.result?.discordId||'',proof:item.result?.proof||'',perma:false,notBanned:false});state.selectedTypes=new Set(item.result?.types||[]);$$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));setFieldStatus(item);$('#editorModal').classList.remove('hidden');showInfoPhoto('banner');}
  async function openEditorFromEntry(entry){const file=entry.file||await getVideo(entry.id);if(file)entry.file=file;state.editing={entry};$('#modalFile').textContent=entry.finalName||entry.originalName;setEditorValues(entry);state.selectedTypes=new Set(entry.types||[]);$$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));setFieldStatus({result:entry});$('#editorModal').classList.remove('hidden');showInfoPhoto('banner');}
  function closeEditor(){state.editing=null;$('#editorModal').classList.add('hidden');}
  async function saveEditor(e){
    e.preventDefault(); const ctx=state.editing; if(!ctx)return;
    const targetId=clampId($('#targetId').value), reason=$('#reason').value, sc=normalizeHexLoose($('#sc').value), server=$('#server').value||'3', date=$('#date').value;
    // A manually entered SC is authoritative. Never let an old OCR "offline" flag overwrite it on save.
    const offlineFlag=!!(ctx.item?.result?.offline||ctx.entry?.offline);
    const offline=sc.length===40?false:offlineFlag;
    const missing=[]; if(!/^\d{1,6}$/.test(targetId))missing.push('Ziel-ID'); if(!ALLOWED_REASONS.includes(reason))missing.push('Grund'); if(!/^[1-4]$/.test(server))missing.push('Server'); if(!validDate(date))missing.push('Datum'); if(!offline && sc.length!==40)missing.push('SC');
    if(missing.length){toast('Bitte fehlende Angaben prüfen: '+missing.join(', '));return;}
    const base=ctx.item||ctx.entry; const types=[...state.selectedTypes]; if(reason.startsWith('PC'))types.push('pccheck'); if(reason==='Cheating')types.push('cheater'); const finalTypes=[...new Set(types)];
    const finalName=`${targetId}, ${reason}, ${formatDateDE(date)}.mp4`;
    const namedFile=new File([base.file],finalName,{type:base.file.type||'video/mp4',lastModified:base.file.lastModified||Date.now()}); if(namedFile.size!==base.file.size)throw new Error('Die Dateigröße hat sich beim Umbenennen verändert. Speicherung abgebrochen.');
    const yt=base.youtube||ctx.item?.youtube||ctx.entry?.youtube||null;
    const record={id:base.id||crypto.randomUUID(),originalName:base.originalName||base.file.name,finalName,targetId,reason,sc:offline?'':sc,server,date,types:finalTypes,perma:$('#perma').checked,notBanned:$('#notBanned').checked,discordId:$('#discordId').value.trim(),proof:yt?.url||$('#proof').value.trim(),complete:true,saved:true,videoStored:true,offline,sourceSize:namedFile.size,sourceType:namedFile.type||'video/mp4',timestamps:base.result?.timestamps||base.timestamps||{},infoPhotoField:'banner',missing:[],file:namedFile,youtube:yt};
    await putVideo(record.id,namedFile);
    // YouTube must receive the exact final filename (including .mp4). The title update
    // is completed and verified before the saved POV is finalized in the UI.
    if(yt?.id){
      try{
        await updateYoutubeTitle(yt.id,finalName,state.accessToken||'');
        record.youtubeTitle=finalName;
      }catch(err){
        console.error(err);
        if(err?.code==='YT_SCOPE_REQUIRED'){
          toast('YouTube-Titel braucht einmalig die neue Berechtigung „Berechtigung erneut“.');
        }else{
          toast('YouTube-Titel konnte nicht aktualisiert werden: '+(err?.message||err));
        }
        throw err;
      }
    }
    state.entries=[record,...state.entries.filter(x=>x.id!==record.id)]; saveMeta();
    if(ctx.item){ctx.item.file=namedFile;ctx.item.finalName=finalName;ctx.item.result={...ctx.item.result,...record};ctx.item.status='Gespeichert';ctx.item.progress=100;renderQueue();}
    closeEditor(); renderArchive(); renderCases(); renderCsv(); toast('Gespeichert. YouTube-Titel und Dateiname sind identisch.');
  }
  window.addEventListener('message',e=>{if(e.data?.type==='grandrp-manual-field'){applyManualField(e.data.field,e.data.value,e.data.time);}});

  function setupEditor(){
    $('#closeModal').onclick=closeEditor;$('#cancelBtn').onclick=closeEditor;$('#entryForm').addEventListener('submit',saveEditor);['#targetId','#date'].forEach(s=>$(s).addEventListener('input',renderTitlePreview));$('#reason').addEventListener('change',renderTitlePreview);$('#targetId').addEventListener('input',()=>{$('#targetId').value=clampId($('#targetId').value)});
    $$('.chip').forEach(c=>c.onclick=()=>{const v=c.dataset.value;c.classList.toggle('active');if(c.classList.contains('active'))state.selectedTypes.add(v);else state.selectedTypes.delete(v);});
    $$('.photo-field').forEach(b=>b.onclick=()=>showInfoPhoto(b.dataset.field));
    $('#photoRefresh')?.addEventListener('click',()=>{const active=$('.photo-field.active');showInfoPhoto(active?.dataset.field||'banner');});
    $$('#targetId,#reason,#sc,#server,#date,#discordId').forEach(el=>el.addEventListener('focus',()=>showInfoPhoto(el.id==='targetId'?'targetId':el.id)));
    $('#reanalyzeBtn')?.addEventListener('click',async()=>{const x=state.editing?.item;if(x){closeEditor();await retryLocalOCR(x);}});
    // Manual picker buttons: use the user click directly to open the same-origin
    // picker page. This was missing in earlier builds, so SC/Discord-ID buttons
    // looked clickable but did nothing.
    $$('.jump').forEach(btn=>btn.addEventListener('click',async()=>{
      const ctx=state.editing;
      if(!ctx){toast('Kein POV zur manuellen Prüfung geöffnet.');return;}
      const entry=ctx.item||ctx.entry;
      if(!entry){toast('POV-Eintrag nicht verfügbar.');return;}
      await showInfoPhoto(btn.dataset.field);await openManualPicker(entry,btn.dataset.field);
    }));
  }

  async function runOcrForUploadedItem(item,sourceSize,storedCopy,remoteSize=0){
    if(!item)return;
    let media=null;
    try{
      item.status='OCR startet · YouTube-Upload bereits vollständig abgeschlossen';
      item.progress=60;renderQueue();
      media=await openLocalVideo(item.file,`POV ${item.file.name}`,storedCopy);
      item.progress=62;renderQueue();
      item.result=await analyzeVideo(media.video,p=>{item.progress=62+Math.round(p*.38);item.status=`OCR ${p}%`;renderQueue();});
      item.result.originalName=item.file.name;
      item.result.sourceSize=sourceSize;
      item.result.remoteSize=remoteSize||0;
      item.result.sourceType=item.file.type||'video/mp4';
      item.result.types=[];
      item.result.proof=item.youtube.url;
      item.result.youtube=item.youtube;
      item.status=item.result.complete?'OCR fertig · Prüfung offen':'OCR unvollständig · Prüfung nötig';
      item.progress=100;
      renderQueue();
      if(!state.editing)openEditor(item);
    }catch(err){
      console.error('OCR item failed',err);
      item.status='Fehler: '+(err?.message||err);
      item.progress=0;
      renderQueue();
    }finally{
      if(media)closeLocalVideo(media);
      item.processing=false;
      item.ocrProcessing=false;
      renderQueue();
    }
  }

  async function processQueue(){
    if(state.queueRunner)return;
    state.queueRunner=true;
    try{
      // Uploads stay serial so only one large source is transmitted at a time.
      // Once a YouTube upload is completely accepted, OCR starts in the background
      // and the next POV is uploaded immediately instead of waiting for OCR/review.
      for(const item of state.queue){
        if(item.uploadStarted||item.editingDone||item.status==='Gespeichert')continue;
        if(!state.accessToken||!state.clientId){item.status='YouTube zuerst verbinden';renderQueue();continue;}
        item.uploadStarted=true;
        item.processing=true;
        try{
          await ensureYoutubeTokenFresh();
          const sourceSize=await verifyLocalFile(item.file,0,'Ausgewählte POV');
          await putVideo(item.id,item.file);
          const storedCopy=await getVideo(item.id);
          if(!storedCopy)throw new Error('Lokale Kopie der POV konnte nicht gelesen werden.');
          if(Number(storedCopy.size)!==sourceSize)throw new Error(`Lokale Speicherung beschädigt: Quelle ${formatBytesExact(sourceSize)} · Archiv ${formatBytesExact(storedCopy.size)}.`);
          if(!(await compareFileEdges(item.file,storedCopy)))throw new Error('Lokale Speicherung stimmt am Anfang/Ende nicht mit der Originaldatei überein.');
          item.status=`YouTube: vollständiger Upload · Quelle ${formatSize(sourceSize)}`;
          item.progress=2;renderQueue();
          item.youtube=await uploadYoutube(item.file,item.file.name,state.accessToken,p=>{
            item.progress=2+Math.round(p*.58);
            item.status=`YouTube-Upload ${p}% · ${formatSize(sourceSize)} (${formatBytesExact(sourceSize)})`;
            renderQueue();
          });
          item.progress=60;
          item.status='YouTube-Upload vollständig abgeschlossen · OCR startet';
          renderQueue();

          // IMPORTANT: Do not wait for YouTube transcoding here. The resumable upload
          // returned success only after all source bytes were accepted. This is the
          // exact point at which OCR may start, and it also frees the queue to upload
          // the next POV immediately.
          item.ocrProcessing=true;
          item.ocrPromise=runOcrForUploadedItem(item,sourceSize,storedCopy,0);
          // Intentionally NOT awaited: next POV upload begins immediately.
        }catch(err){
          console.error('Queue item failed',err);
          item.status='Fehler: '+(err?.message||err);
          item.progress=0;
          item.processing=false;
          item.uploadStarted=false;
          renderQueue();
        }
      }
    }finally{
      state.queueRunner=false;
      // A file may have been added while this pass was uploading another item.
      // Start a new pass without waiting for any running OCR jobs.
      if(state.queue.some(i=>!i.uploadStarted&&!i.editingDone&&i.status!=='Gespeichert')){
        queueMicrotask(()=>processQueue());
      }
    }
  }

  function validClientId(clientId){
    return /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(String(clientId||'').trim());
  }

  function setYoutubeButton(text, disabled=false){
    const btn=$('#connectYoutube');
    if(btn){btn.disabled=disabled;btn.textContent=text;}
  }

  function showYoutubeHelp(text, kind=''){ 
    const help=$('#ytConnectHelp');
    if(help){help.textContent=text;help.style.color=kind==='error'?'#ff8ebd':kind==='good'?'#69e1af':'';}
  }

  function persistYoutubeToken(token,expiresIn=0){
    state.accessToken=String(token||'');
    if(state.accessToken){
      localStorage.setItem('yt_access_token',state.accessToken);
      sessionStorage.setItem('yt_access_token',state.accessToken);
      if(Number(expiresIn)>0){
        state.tokenExpiresAt=Date.now()+Math.max(60,Number(expiresIn)-30)*1000;
        localStorage.setItem('yt_access_expires_at_v50',String(state.tokenExpiresAt));
      }
      updateYtStatus(true);
    }
    return state.accessToken;
  }
  function clearYoutubeToken(){
    state.accessToken=''; state.tokenExpiresAt=0;
    localStorage.removeItem('yt_access_token');sessionStorage.removeItem('yt_access_token');
    localStorage.removeItem('yt_access_expires_at_v50');
    updateYtStatus(false);
  }
  async function waitForGoogleGIS(){
    if(window.google?.accounts?.oauth2)return true;
    const started=Date.now();
    while(Date.now()-started<8000){
      await new Promise(r=>setTimeout(r,100));
      if(window.google?.accounts?.oauth2)return true;
    }
    return false;
  }
  async function refreshYoutubeToken(silent=true){
    if(state.tokenRefreshPromise)return state.tokenRefreshPromise;
    state.tokenRefreshPromise=(async()=>{
      const ready=await waitForGoogleGIS();
      if(!ready)throw new Error('Google Identity Services konnte nicht geladen werden. Bitte Seite neu laden und YouTube erneut verbinden.');
      const clientId=String(state.clientId||localStorage.getItem('yt_client_id')||'').trim();
      if(!validClientId(clientId))throw new Error('Google OAuth Client-ID fehlt oder ist ungültig.');
      return await new Promise((resolve,reject)=>{
        let finished=false;
        const done=(fn,val)=>{if(finished)return;finished=true;fn(val);};
        const callback=(resp)=>{
          if(resp?.error){
            const detail=resp.error_description||resp.error||'Unbekannter OAuth-Fehler';
            done(reject,new Error(`YouTube-Zugriff konnte nicht erneuert werden: ${detail}`));
            return;
          }
          if(!resp?.access_token){done(reject,new Error('Google hat beim Erneuern kein Zugriffstoken geliefert.'));return;}
          persistYoutubeToken(resp.access_token,Number(resp.expires_in||3600));
          showYoutubeHelp('YouTube-Zugriff automatisch erneuert.','good');
          done(resolve,state.accessToken);
        };
        try{
          // Recreate the token client for every renewal so the current callback is
          // guaranteed to be used by GIS. This also avoids stale callback state
          // after a long-running multi-POV queue.
          state.tokenClient=window.google.accounts.oauth2.initTokenClient({
            client_id:clientId,
            scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl',
            include_granted_scopes:true,
            callback,
            error_callback:(err)=>{
              const type=err?.type||'oauth_error';
              const detail=err?.message||'';
              let msg='Google konnte den YouTube-Zugriff nicht automatisch erneuern.';
              if(type==='popup_failed_to_open') msg='Google-Popup konnte zur Token-Erneuerung nicht geöffnet werden.';
              else if(type==='popup_closed') msg='Google-Anmeldung zur Token-Erneuerung wurde geschlossen.';
              else if(detail) msg+=` ${detail}`;
              done(reject,new Error(msg));
            }
          });
          // An empty prompt is the GIS-supported silent/returning-user mode:
          // Google only asks for consent the first time a scope is requested.
          // `prompt: 'none'` is stricter and can fail when an interactive step is
          // needed, which previously caused the 15-second timeout during queues.
          state.tokenClient.requestAccessToken({prompt:silent?'':'consent'});
        }catch(err){done(reject,err instanceof Error?err:new Error(String(err)));}
        setTimeout(()=>done(reject,new Error('Zeitüberschreitung beim Erneuern des YouTube-Zugriffs. Bitte YouTube einmal erneut verbinden.')),12000);
      });
    })();
    try{return await state.tokenRefreshPromise;}finally{state.tokenRefreshPromise=null;}
  }
  async function ensureYoutubeTokenFresh(){
    if(!state.accessToken)throw new Error('YouTube nicht verbunden.');
    if(state.tokenExpiresAt>0 && Date.now()>state.tokenExpiresAt-2*60*1000){
      try{await refreshYoutubeToken(true);}catch(err){
        // Do not kill the whole queue before the API actually rejects the token.
        console.warn('Stille Token-Erneuerung fehlgeschlagen:',err);
      }
    }
    return state.accessToken;
  }
  function configureYoutubeClient(clientId){
    const id=String(clientId||'').trim();
    state.clientId=id;
    if(!id){state.tokenClient=null;return false;}
    if(!validClientId(id)) throw new Error('Die Google OAuth Client-ID sieht ungültig aus.');
    if(!(window.google?.accounts?.oauth2)) throw new Error('Google OAuth ist noch nicht geladen. Bitte Seite neu laden.');
    state.tokenClient=window.google.accounts.oauth2.initTokenClient({
      client_id:id,
      scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl',
      include_granted_scopes:true,
      callback:(resp)=>{
        clearTimeout(state.oauthTimeout);
        if(resp?.error){
          const detail=resp.error_description||resp.error||'Unbekannter OAuth-Fehler';
          showYoutubeHelp(`YouTube OAuth: ${detail}`,'error');
          toast(`YouTube OAuth: ${detail}`);
          state.accessToken='';
          updateYtStatus(false);
          setYoutubeButton('Mit YouTube verbinden',false);
          return;
        }
        if(!resp?.access_token){
          const msg='Google hat kein Zugriffstoken zurückgegeben.';
          showYoutubeHelp(msg,'error');
          toast(msg);
          setYoutubeButton('Mit YouTube verbinden',false);
          return;
        }
        persistYoutubeToken(resp.access_token,Number(resp.expires_in||3600));
        updateYtStatus(true);
        showYoutubeHelp('YouTube ist verbunden.','good');
        toast('YouTube verbunden.');
        setYoutubeButton('YouTube verbunden',false);
      },
      error_callback:(err)=>{
        clearTimeout(state.oauthTimeout);
        const type=err?.type||'oauth_error';
        const detail=err?.message||'';
        let msg='Google OAuth wurde nicht abgeschlossen.';
        if(type==='popup_failed_to_open') msg='Google-Popup wurde vom Browser blockiert. Erlaube Popups für felixsp2003.github.io und klicke erneut.';
        else if(type==='popup_closed') msg='Google-Anmeldung wurde geschlossen.';
        else if(detail) msg=`Google OAuth: ${detail}`;
        showYoutubeHelp(msg,'error');
        toast(msg);
        setYoutubeButton('Mit YouTube verbinden',false);
      }
    });
    return true;
  }

  function oauthRedirectUri(){
    return `${location.origin}${location.pathname}`;
  }
  function randomState(){
    const bytes=new Uint8Array(24);
    crypto.getRandomValues(bytes);
    return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');
  }
  function handleOAuthRedirect(){
    const hash=String(location.hash||'').replace(/^#/,'');
    if(!hash)return false;
    const p=new URLSearchParams(hash);
    const stateValue=p.get('state')||'';
    const expected=sessionStorage.getItem('grandrp_oauth_state')||'';
    const token=p.get('access_token');
    const expiresIn=Number(p.get('expires_in')||0);
    const error=p.get('error');
    const desc=p.get('error_description')||'';
    if(!token && !error)return false;
    history.replaceState(null,document.title,location.pathname+location.search);
    sessionStorage.removeItem('grandrp_oauth_state');
    if(expected && stateValue!==expected){
      showYoutubeHelp('Google OAuth abgebrochen: Sicherheitsprüfung fehlgeschlagen. Bitte erneut verbinden.','error');
      return true;
    }
    if(error){
      const msg=desc||error;
      showYoutubeHelp(`Google OAuth: ${msg}`,'error');
      toast(`Google OAuth: ${msg}`);
      setYoutubeButton('Mit YouTube verbinden',false);
      return true;
    }
    persistYoutubeToken(token,expiresIn||3600);
    updateYtStatus(true);
    showYoutubeHelp('YouTube ist verbunden.','good');
    toast('YouTube verbunden.');
    setYoutubeButton('YouTube verbunden',false);
    return true;
  }
  function startRedirectOAuth(clientId,forceConsent=false){
    const stateValue=randomState();
    sessionStorage.setItem('grandrp_oauth_state',stateValue);
    const params=new URLSearchParams({
      client_id:clientId,
      redirect_uri:oauthRedirectUri(),
      response_type:'token',
      scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl',
      include_granted_scopes:'true',
      state:stateValue
    });
    if(forceConsent) params.set('prompt','consent');
    location.assign('https://accounts.google.com/o/oauth2/v2/auth?'+params.toString());
  }
  function initYoutube(){
    const help=$('#ytConnectHelp');
    const entered=String($('#clientId')?.value||'').trim();
    if(entered){state.clientId=entered;localStorage.setItem('yt_client_id',entered);}
    const clientId=String(state.clientId||'').trim();
    if(!clientId){
      showYoutubeHelp('Bitte zuerst die Google OAuth Client-ID in Einstellungen eintragen.','error');
      toast('Bitte zuerst die Google OAuth Client-ID eintragen.');
      return;
    }
    if(!validClientId(clientId)){
      showYoutubeHelp('Die Google OAuth Client-ID sieht ungültig aus.','error');
      return;
    }
    setYoutubeButton('Google wird geöffnet…',true);
    if(help) help.textContent='Google-Anmeldung wird geöffnet…';
    // Robust fallback for browsers that block GIS popups: use Google's legacy browser redirect flow.
    // The token is returned in the URL fragment and handled immediately on return.
    try{
      startRedirectOAuth(clientId,false);
    }catch(err){
      const msg=err?.message||String(err);
      showYoutubeHelp(msg,'error');
      setYoutubeButton('Mit YouTube verbinden',false);
      toast(msg);
    }
  }

  function reauthorizeYoutube(){
    const entered=String($('#clientId')?.value||'').trim();
    if(entered){state.clientId=entered;localStorage.setItem('yt_client_id',entered);}
    const clientId=String(state.clientId||'').trim();
    if(!clientId){showYoutubeHelp('Bitte zuerst die Google OAuth Client-ID eintragen.','error');return;}
    try{
      setYoutubeButton('Berechtigung wird geöffnet…',true);
      showYoutubeHelp('Google fragt die YouTube-Berechtigung erneut ab…');
      startRedirectOAuth(clientId,true);
    }catch(err){
      const msg=err?.message||String(err);
      showYoutubeHelp(msg,'error');
      setYoutubeButton('Mit YouTube verbinden',false);
      toast(msg);
    }
  }
  window.connectYouTubeNow=initYoutube;
  window.reauthorizeYouTube=reauthorizeYoutube;
  function updateYtStatus(){const connected=!!state.accessToken;const el=$('#ytStatus');if(!el)return;el.textContent=connected?'● Verbunden':'● Nicht verbunden';el.style.color=connected?'#69e1af':'#7f7488';}
  async function waitForYoutubeProcessing(videoId,token,onProgress,expectedSize=0){
    if(!videoId||!token) throw new Error('YouTube-Video-ID oder Zugriffstoken fehlt.');
    const started=Date.now();
    const maxWaitMs=60*60*1000;
    const pollMs=3000;
    while(Date.now()-started<maxWaitMs){
      const currentToken=state.accessToken||token;
      const url=`https://www.googleapis.com/youtube/v3/videos?part=processingDetails,status,fileDetails&id=${encodeURIComponent(videoId)}`;
      const r=await fetch(url,{headers:{Authorization:`Bearer ${currentToken}`}});
      if(!r.ok){
        const body=(await r.text()).slice(0,900);
        if(r.status===401){
          try{await refreshYoutubeToken(true);continue;}catch(err){throw new Error(`${err.message} Die YouTube-Sitzung ist abgelaufen.`);}
        }
        if(r.status===403 && /insufficient|scope/i.test(body)){
          throw new Error('YouTube-Berechtigung für die Verarbeitungsprüfung fehlt. Bitte „Berechtigung erneut“ drücken und den neuen YouTube-Zugriff bestätigen. OCR bleibt bis dahin gesperrt.');
        }
        throw new Error(`YouTube-Verarbeitungsstatus konnte nicht gelesen werden: ${body}`);
      }
      const data=await r.json();
      const item=data.items?.[0];
      if(!item) throw new Error('YouTube-Video wurde nach dem Upload nicht gefunden.');
      const pd=item.processingDetails||{};
      const status=pd.processingStatus||'';
      const prog=pd.processingProgress;
      if(status==='succeeded'){
        const remoteSize=Number(item.fileDetails?.fileSize||0);
        if(expectedSize>0 && remoteSize>0 && remoteSize!==Number(expectedSize)){
          throw new Error(`YouTube-Dateigröße stimmt nicht überein: Quelle ${expectedSize} Byte · YouTube ${remoteSize} Byte.`);
        }
        onProgress?.(100);
        return item;
      }
      if(status==='failed') throw new Error(`YouTube-Verarbeitung fehlgeschlagen${pd.processingFailureReason?`: ${pd.processingFailureReason}`:''}.`);
      let percent=0;
      if(prog?.partsTotal>0)percent=Math.max(0,Math.min(100,Math.round((Number(prog.partsProcessed||0)/Number(prog.partsTotal))*100)));
      onProgress?.(percent);
      await new Promise(r=>setTimeout(r,pollMs));
    }
    throw new Error('Zeitüberschreitung: YouTube hat die Verarbeitung nicht innerhalb von 60 Minuten abgeschlossen.');
  }

  async function uploadYoutube(file,title,token,onProgress){
    if(!file)throw new Error('YouTube-Upload: Datei fehlt.');
    const expectedSize=await verifyLocalFile(file,0,'Upload-Quelle');
    const safeTitle=String(title||file.name||'Grand RP POV').replace(/\.[^.]+$/,'').slice(0,100);
    const meta={snippet:{title:safeTitle,description:'Grand RP POV Checker',categoryId:'20'},status:{privacyStatus:'unlisted',selfDeclaredMadeForKids:false}};
    const contentType=file.type||'video/mp4';
    let accessToken=state.accessToken||token;
    if(!accessToken)throw new Error('YouTube nicht verbunden.');

    async function createSession(){
      const doInit=async(t)=>await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Length':String(expectedSize),'X-Upload-Content-Type':contentType},body:JSON.stringify(meta)});
      let init=await doInit(accessToken);
      if(init.status===401){accessToken=await refreshYoutubeToken(true);init=await doInit(accessToken);}
      if(!init.ok)throw new Error((await init.text()).slice(0,700));
      const loc=init.headers.get('Location');if(!loc)throw new Error('YouTube Upload-URL fehlt.');
      return loc;
    }

    let loc=await createSession();
    const queryOffset=async()=>{
      const doQuery=async(t)=>await fetch(loc,{method:'PUT',headers:{Authorization:`Bearer ${t}`,'Content-Range':`bytes */${expectedSize}`}});
      let q=await doQuery(accessToken);
      if(q.status===401){accessToken=await refreshYoutubeToken(true);q=await doQuery(accessToken);}
      if(q.status===308){const range=q.headers.get('Range')||'';const m=range.match(/\d+-(\d+)$/);return m?Number(m[1])+1:0;}
      if(q.status>=200&&q.status<300)return expectedSize;
      throw new Error((await q.text()).slice(0,700)||`YouTube Upload-Status HTTP ${q.status}`);
    };

    const chunkSize=8*1024*1024;
    let offset=0,lastResponse=null,attempts=0,authRefreshes=0;
    while(offset<expectedSize){
      const liveSize=Number(file.size)||0;
      if(liveSize!==expectedSize)throw new Error(`Upload abgebrochen: Quelldatei hat ihre Größe verändert (${formatBytesExact(expectedSize)} → ${formatBytesExact(liveSize)}).`);
      const end=Math.min(expectedSize,offset+chunkSize);
      const chunk=file.slice(offset,end);
      if(Number(chunk.size)!==(end-offset))throw new Error(`Upload abgebrochen: Chunk-Größe stimmt nicht (${formatBytesExact(end-offset)} erwartet, ${formatBytesExact(chunk.size)} gelesen).`);
      let resp;
      try{
        resp=await new Promise((resolve,reject)=>{
          const xhr=new XMLHttpRequest();
          xhr.open('PUT',loc,true);
          xhr.setRequestHeader('Authorization',`Bearer ${accessToken}`);
          xhr.setRequestHeader('Content-Type',contentType);
          xhr.setRequestHeader('Content-Range',`bytes ${offset}-${end-1}/${expectedSize}`);
          xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress?.(Math.round((offset+e.loaded)/expectedSize*100));else onProgress?.(Math.round(offset/expectedSize*100));};
          xhr.onload=()=>resolve(xhr);xhr.onerror=()=>reject(new Error('Netzwerkfehler beim YouTube-Upload.'));xhr.ontimeout=()=>reject(new Error('Zeitüberschreitung beim YouTube-Upload.'));
          xhr.timeout=10*60*1000;xhr.send(chunk);
        });
      }catch(err){
        if(++attempts>5)throw err;
        await new Promise(r=>setTimeout(r,1000*Math.min(8,attempts)));
        offset=await queryOffset();
        continue;
      }
      attempts=0;
      if(resp.status>=200&&resp.status<300){lastResponse=resp;offset=expectedSize;onProgress?.(100);break;}
      if(resp.status===401){
        if(++authRefreshes>3)throw new Error('YouTube-Anmeldung ist abgelaufen und konnte nicht automatisch erneuert werden.');
        accessToken=await refreshYoutubeToken(true);
        offset=await queryOffset();
        continue;
      }
      if(resp.status===308){
        const range=resp.getResponseHeader('Range')||'';
        const m=range.match(/\d+-(\d+)$/);
        if(m) offset=Math.min(expectedSize,Number(m[1])+1);
        else offset=await queryOffset();
        onProgress?.(Math.round(offset/expectedSize*100));
        continue;
      }
      if(resp.status===408||resp.status===429||resp.status>=500){
        if(++attempts>5)throw new Error(resp.responseText?.slice(0,700)||`YouTube Upload HTTP ${resp.status}`);
        await new Promise(r=>setTimeout(r,1000*Math.min(8,attempts)));
        offset=await queryOffset();
        continue;
      }
      throw new Error(resp.responseText?.slice(0,700)||`YouTube Upload HTTP ${resp.status}`);
    }
    if(offset!==expectedSize||!lastResponse?.responseText)throw new Error(`YouTube-Upload unvollständig: ${formatBytesExact(offset)} von ${formatBytesExact(expectedSize)} übertragen.`);
    if(Number(file.size)!==expectedSize)throw new Error(`Quelldatei wurde während des Uploads verändert (${formatBytesExact(file.size)} statt ${formatBytesExact(expectedSize)}).`);
    let data;try{data=JSON.parse(lastResponse.responseText);}catch{throw new Error('YouTube hat keine gültige Upload-Antwort geliefert.');}
    if(!data.id)throw new Error('YouTube hat keine Video-ID zurückgegeben.');
    return {id:data.id,url:`https://youtu.be/${data.id}`,sourceSize:expectedSize,sourceType:contentType};
  }
  async function updateYoutubeTitle(videoId,title,token){
    if(!videoId)return;
    const desiredTitle=String(title||'POV').trim();
    if(!desiredTitle)throw new Error('YouTube-Titel ist leer.');
    if(desiredTitle.length>100)throw new Error(`YouTube-Titel ist zu lang (${desiredTitle.length}/100 Zeichen).`);
    let accessToken=state.accessToken||token||'';
    if(!accessToken)throw new Error('YouTube nicht verbunden.');

    const api=async(path,options={})=>{
      const res=await fetch(path,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${accessToken}`}});
      if(res.status===401){
        accessToken=await refreshYoutubeToken(true);
        return fetch(path,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${accessToken}`}});
      }
      return res;
    };

    // Read the current snippet first so we only change the title and do not
    // accidentally wipe tags/default language/description metadata.
    let get=await api(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`);
    if(!get.ok){
      const body=await get.text();
      if(get.status===403 && /insufficient|scope/i.test(body)){const e=new Error('YouTube benötigt die Berechtigung „youtube.force-ssl“. Bitte einmal „Berechtigung erneut“ ausführen.');e.code='YT_SCOPE_REQUIRED';throw e;}
      throw new Error(`YouTube-Video konnte nicht gelesen werden: ${body.slice(0,500)}`);
    }
    const data=await get.json();
    const current=data.items?.[0];
    if(!current?.snippet)throw new Error('YouTube-Video für Titel-Update nicht gefunden.');
    const oldSnippet=current.snippet;
    const meta={id:videoId,snippet:{
      title:desiredTitle,
      description:String(oldSnippet.description||''),
      categoryId:String(oldSnippet.categoryId||'20')
    }};
    if(Array.isArray(oldSnippet.tags))meta.snippet.tags=oldSnippet.tags;
    if(oldSnippet.defaultLanguage)meta.snippet.defaultLanguage=oldSnippet.defaultLanguage;

    let put=await api('https://www.googleapis.com/youtube/v3/videos?part=snippet',{method:'PUT',headers:{'Content-Type':'application/json'},body:JSON.stringify(meta)});
    if(!put.ok){
      const body=await put.text();
      if(put.status===403 && /insufficient|scope/i.test(body)){const e=new Error('YouTube benötigt die Berechtigung „youtube.force-ssl“. Bitte einmal „Berechtigung erneut“ ausführen.');e.code='YT_SCOPE_REQUIRED';throw e;}
      throw new Error(`YouTube-Titel konnte nicht gespeichert werden: ${body.slice(0,500)}`);
    }

    // Verify the title by reading it back. This prevents the UI from claiming a rename
    // succeeded when YouTube accepted another/stale metadata state.
    let verify=await api(`https://www.googleapis.com/youtube/v3/videos?part=snippet&id=${encodeURIComponent(videoId)}`);
    if(!verify.ok)throw new Error(`YouTube-Titel konnte nicht verifiziert werden: ${(await verify.text()).slice(0,500)}`);
    const verified=await verify.json();
    const actual=verified.items?.[0]?.snippet?.title||'';
    if(actual!==desiredTitle)throw new Error(`YouTube-Titel weicht ab: erwartet „${desiredTitle}“ · erhalten „${actual}“`);
  }

  function setupSettings(){
    state.settings.frames=Number(localStorage.getItem('v44_frames')||24);
    state.settings.window=Number(localStorage.getItem('v44_window')||4.5);
    state.settings.step=Number(localStorage.getItem('v44_step')||.5);
    $('#frameCount').value=state.settings.frames;
    $('#refineWindow').value=state.settings.window;
    $('#refineStep').value=state.settings.step;
    $('#frameCount').onchange=e=>{state.settings.frames=Math.max(18,Math.min(28,Number(e.target.value)||24));localStorage.setItem('v44_frames',state.settings.frames)};
    $('#refineWindow').onchange=e=>{state.settings.window=Math.max(3,Math.min(7,Number(e.target.value)||4.5));localStorage.setItem('v44_window',state.settings.window)};
    $('#refineStep').onchange=e=>{state.settings.step=Math.max(.4,Math.min(1.0,Number(e.target.value)||.5));localStorage.setItem('v44_step',state.settings.step)};
    $('#clientId').addEventListener('input',e=>{state.clientId=String(e.target.value||'').trim();localStorage.setItem('yt_client_id',state.clientId);});
    $('#clientId').addEventListener('change',e=>{state.clientId=String(e.target.value||'').trim();localStorage.setItem('yt_client_id',state.clientId);});
    // YouTube buttons use the inline full-page redirect in index.html, so OAuth never depends on app.js loading.
    if($('#disconnectYoutube')) $('#disconnectYoutube').addEventListener('click',()=>{if(window.grandrpDisconnectYouTube)window.grandrpDisconnectYouTube();else{clearYoutubeToken();}});
    $('#clearLocal').onclick=async()=>{if(!confirm('Lokales Archiv wirklich löschen?'))return;state.entries=[];state.queue=[];saveMeta();await clearDB();renderArchive();renderCases();renderCsv();renderQueue();toast('Lokale Daten gelöscht.');};
    updateYtStatus();
  }

  window.addEventListener('beforeunload' ,()=>{try{state.worker?.terminate();}catch{};try{state.specialWorker?.terminate();}catch{}});
  setupNav();setupUpload();setupEditor();setupSettings();renderQueue();updateYtStatus();loadMeta().then(()=>{renderArchive();renderCases();renderCsv();}).catch(err=>{console.error('Archiv konnte nicht geladen werden',err);renderArchive();renderCases();renderCsv();});
})();
