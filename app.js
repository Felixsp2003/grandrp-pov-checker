/* Grand RP DC Checker V138
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
  const BUILD='V139';
  const META_KEY='grandrp_pov_meta_v42';
  const DB_NAME='grandrp_pov_db_v42';
  const STORE='videos';
  const BAN_ADMIN_NAME='Adam Byers';
  const BAN_ADMIN_ID='15340';
  const PC_CHECKER_POOL=['Hunter Sanchez','Mark Weber','Christoph Contro','John Koo','Fugo Weezy','Tony Shy','Jason Azul','Memo Savage'];
  const PC_CHECKER_LEAD='Adam Byers';
  const PC_CUSTOM_KEY='grandrp_pc_checker_custom_v1';
  const YT_RETRY_DELAY_MS=30*60*1000;
  const YT_RETRY_KEY='grandrp_yt_quota_retry_at_v89';
  const YT_CONNECTIONS_KEY='grandrp_youtube_connections_v89';
  const YT_CONNECTIONS_DB_KEY='__grandrp_youtube_connections_v89__';
  const YT_OAUTH_PENDING_KEY='grandrp_youtube_oauth_pending_v89';
  const YT_MAX_CONNECTIONS=3;
  const DRIVE_OAUTH_PENDING_KEY='grandrp_drive_oauth_pending_v130';
  const DRIVE_STATE_KEY='grandrp_drive_oauth_state_v130';
  const DRIVE_RESULT_KEY='grandrp_drive_oauth_result_v130';
  const DRIVE_FOLDER_NAME='GrandRP DC Checker';
  const DRIVE_MANIFEST_NAME='grandrp-archive-manifest.json';
  const DRIVE_FOLDER_MIME='application/vnd.google-apps.folder';
  const DRIVE_SCOPE='https://www.googleapis.com/auth/drive.file';
  const LOCAL_CLEAR_MARKER_KEY='grandrp_local_clear_marker_v120';
  let driveSyncInProgress=false;
  let youtubeRetryTimer=0;
  let youtubeConnectionSaveTimer=0;
  const pcCheckerCustom=new Set();
  try{const saved=JSON.parse(localStorage.getItem(PC_CUSTOM_KEY)||'[]');if(Array.isArray(saved))saved.filter(Boolean).forEach(v=>pcCheckerCustom.add(String(v)));}catch{}

  const ALLOWED_REASONS=[
    'PC-Check Verweigerung',
    'PC-Check Verweigerung - Trolling',
    'PC-Check Positiv 4.1 (Discord)',
    'PC-Check Positiv',
    'PC-Check Positiv 4.1 (Redux)',
    'PC-Check Positiv - Cleaning',
    'Event 1.7 (NoPov in PC Check)',
    'PC Check Positiv (Banevading)',
    'PC Check Positiv (Covering Cheater)',
    'Cheater',
    'Acc 1.4 (Twink)',
    'Acc 1.4 (Main)'
  ];
  const REASON_ALIASES={
    'PC-Check Verweigerung':['pc check verweigerung','pc-check verweigerung','pc check verweigert','pc-check verweigert','pc che k rwelg nn','pc che k verweig','pc check yerweigerung','pc-check yerweigerung','po-check verweigerung','c-check verweigerung','pc check verweigern'],
    'PC-Check Verweigerung - Trolling':['pc check verweigerung trolling','pc-check verweigerung trolling','pc check verweigert trolling','pc-check verweigert trolling','pc check trolling verweigerung','pc-check trolling verweigerung','pc check trolling','pc-check trolling','trolling in pc check','trolling im pc check'],
    'PC-Check Positiv 4.1 (Discord)':['pc check positiv 4.1 discord','pc-check positiv 4.1 discord','pccheck positiv 4.1 discord','pc check positiv 4 1 discord'],
    'PC-Check Positiv':['pc check positiv','pc-check positiv','pccheck positiv','pccheckpositiv'],
    'PC-Check Positiv 4.1 (Redux)':['pc check positiv 4.1 redux','pc-check positiv 4.1 redux','pccheck positiv 4.1 redux','pc check positiv 4 1 redux'],
    'PC-Check Positiv - Cleaning':['pc check positiv cleaning','pc-check positiv cleaning','pccheck positiv cleaning','pc-check positiv - cleaning'],
    'Event 1.7 (NoPov in PC Check)':['event 1.7 nopov in pc check','event1.7 nopov in pc check','event 17 nopov in pc check','event 1.7 no pov in pc check','event1.7 nopov'],
    'PC Check Positiv (Banevading)':['pc check positiv banevading','pc-check positiv banevading','pccheck positiv banevading','pc check posiv banevading'],
    'PC Check Positiv (Covering Cheater)':['pc check positiv covering cheater','pc-check positiv covering cheater','pc check covering cheater','covering cheater'],
    'Cheater':['cheater','cheating','cheater ban','cheating ban'],
    'Acc 1.4 (Twink)':['acc 1.4 twink','acc1.4 twink','acc 14 twink','acc 1.4 (twink)','acc 14 twinkk'],
    'Acc 1.4 (Main)':['acc 1.4 main','acc1.4 main','acc 14 main','acc 1.4 (main)','acc1.4']
  };
  const AUTO_PERMA_TRUE=new Set([
    'PC-Check Verweigerung - Trolling',
    'PC-Check Positiv',
    'PC Check Positiv (Banevading)',
    'Acc 1.4 (Twink)'
  ]);
  const AUTO_PERMA_FALSE=new Set([
    'PC-Check Positiv 4.1 (Discord)',
    'PC-Check Positiv 4.1 (Redux)',
    'PC-Check Positiv - Cleaning',
    'Event 1.7 (NoPov in PC Check)',
    'PC Check Positiv (Covering Cheater)',
    'Acc 1.4 (Main)'
  ]);


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
    const raw=cleanText(text);
    if(!raw)return null;
    const flat=raw.replace(/\s+/g,' ').trim();
    const norm=flat
      .replace(/[\u2500-\u257f]/g,' ')
      .replace(/[„“”]/g,'"').replace(/[’]/g,"'");

    // We do not parse arbitrary numbers. First find the real admin anchor and only
    // then inspect the short text segment after it. This prevents HUD/player IDs from
    // being selected as the banned player's ID.
    const adminIdRe=/\[\s*15340\s*\]/i;
    const adminIdPos=norm.search(adminIdRe);
    if(adminIdPos<0)return null;
    const beforeAdmin=norm.slice(Math.max(0,adminIdPos-120),adminIdPos+120);
    if(!hasAdamByersAnchor(beforeAdmin))return null;

    const adminTail=norm.slice(adminIdPos); const adminMatch=adminTail.match(adminIdRe); const adminLen=adminMatch?adminMatch[0].length:7; const afterAdmin=norm.slice(adminIdPos+adminLen, adminIdPos+700);
    const fullSegment=(beforeAdmin+' '+afterAdmin).trim();

    // OCR frequently turns "hat" into h at / ha1 / ha7 / haI. Accept these only
    // in the short admin->ban segment.
    const hatMatch=afterAdmin.match(/\b(?:hat|ha[dt7l1i]|h[a4][t7]|ha\s*t)\b/i);
    if(!hatMatch)return null;
    const afterHat=afterAdmin.slice(hatMatch.index+hatMatch[0].length);

    // The target ID is the last short bracketed numeric token before the duration.
    const dur=afterHat.match(/\b(?:für|fur|fiir|fuer|f[uü]r|for|fuer)\s*[0-9OQILSZGBT]{1,3}\s*(?:tage|tagen|tag|days|day)\b/i)
      || afterHat.match(/\b[0-9OQILSZGBT]{1,3}\s*(?:tage|tagen|tag|days|day)\b/i);
    if(!dur)return null;
    const pre=afterHat.slice(0,dur.index);
    const bracketed=[...pre.matchAll(/\[\s*([0-9A-Za-z]{1,8})\s*\]/g)]
      .map(m=>normalizeIdToken(m[1])).filter(v=>/^\d{1,6}$/.test(v)&&v!==BAN_ADMIN_ID);
    const speakerTarget=[...pre.matchAll(/(?:spieler|player|user|an|auf)\s*[^\d]{0,40}([0-9A-Za-z]{1,8})/ig)]
      .map(m=>normalizeIdToken(m[1])).filter(v=>/^\d{1,6}$/.test(v)&&v!==BAN_ADMIN_ID);
    let target=bracketed.at(-1)||speakerTarget.at(-1)||'';
    if(!target)return null;

    const tail=afterHat.slice(dur.index, Math.min(afterHat.length, dur.index+420));
    const banWord=/\b(?:gebannt|gebanntt|gebant|banned|bannt|bann(?:ed)?)\b/i.test(tail);
    if(!banWord)return null;

    // Reason: the line beginning with Grund is authoritative. Never feed the whole
    // flattened chat into the reason parser first, because earlier PC-check chatter
    // can otherwise outrank the actual ban reason.
    const rawReasonLine=raw.split('\n').find(line=>/(?:grund|grun[dti]|gru[nm]d)\s*[:.\-]/i.test(line));
    const reasonText=rawReasonLine?rawReasonLine.replace(/^(?:.*?)(?:grund|grun[dti]|gru[nm]d)\s*[:.\-]?\s*/i,''):'';
    const reason=extractReasonStrict(reasonText)||parseReason(reasonText)||extractReasonStrict(tail)||parseReason(tail)||'';

    let score=reason?90:72;
    if(/administrator/i.test(fullSegment))score+=3;
    if(/adam\s*[_-]?\s*byers/i.test(fullSegment))score+=8;
    if(rawReasonLine)score+=8;
    if(target!==BAN_ADMIN_ID)score+=5;
    return {
      targetId:target,
      adminId:BAN_ADMIN_ID,
      adminNameMatched:true,
      reason:typeof reason==='string'?reason:reason.value,
      reasonScore:(typeof reason==='object'&&reason?.score)||1,
      score,
      text:norm
    };
  }
  function parseTargetId(text){
    // Strict parser: a target ID is valid only when the actual ban event is
    // anchored to Adam Byers / administrator ID 15340. No generic numeric fallback.
    const ban=extractBanEvent(text);
    return ban?.targetId&&/^\d{1,6}$/.test(ban.targetId)?ban.targetId:'';
  }
  function reasonOcrNormalize(text){
    return String(text||'').toLowerCase()
      .replace(/[‐‑‒–—]/g,'-')
      .replace(/[°º¤]/g,'p')
      .replace(/[|¦]/g,'i')
      .replace(/\byerweigerung\b/g,'verweigerung')
      .replace(/\byerweiger[a-z0-9]*\b/g,'verweigerung')
      .replace(/\bverweigerunq\b/g,'verweigerung')
      .replace(/\bverweigerun[a-z0-9]*\b/g,'verweigerung')
      .replace(/\bweiger[a-z0-9]*\b/g,'verweigerung')
      .replace(/\brefus[a-z0-9]*\b/g,'verweigerung')
      .replace(/\breject[a-z0-9]*\b/g,'verweigerung')
      .replace(/\b(?:po|0|o|c)[\s\-_]*check\b/g,'pc check')
      .replace(/\bpchek\b/g,'pc check')
      .replace(/\bpcchec\b/g,'pc check')
      .replace(/\bpc\s*[-_]??\s*chek\b/g,'pc check')
      .replace(/\bverweigerung\b/g,'verweigerung')
      .replace(/\bposi(?:t|v)[a-z0-9]*\b/g,'positiv')
      .replace(/\bdiscor[a-z0-9]*\b/g,'discord')
      .replace(/\bredu[cx][a-z0-9]*\b/g,'redux')
      .replace(/\bclean[a-z0-9]*\b/g,'cleaning')
      .replace(/\btrol[a-z0-9]*\b/g,'trolling')
      .replace(/\bcover[a-z0-9]*\b/g,'covering')
      .replace(/\bbane[a-z0-9]*vad[a-z0-9]*\b/g,'banevading')
      .replace(/\bn[o0]p[o0]v[a-z0-9]*\b/g,'nopov')
      .replace(/\s+/g,' ').trim();
  }
  function reasonCompact(text){return reasonOcrNormalize(text).replace(/[^a-z0-9]+/g,'');}
  function classifyReasonStrong(text){
    const raw=String(text||'');
    const c=reasonOcrNormalize(raw);
    const n=reasonCompact(raw);
    if(!n)return '';
    // Fix OCR forms such as "°C-Check Yerweigerung", "PO-Check Verweigerung"
    // and "Trolling in PC Check" before applying the semantic flags below.
    let nn=n.replace(/^(?:0|o|c)?check/,'pccheck').replace(/^(?:po|0|o|c)check/,'pccheck');
    nn=nn.replace(/yerweigerung/g,'verweigerung').replace(/yerweiger/g,'verweig');
    const cc=nn;
    const hasPc=/pccheck|pcchec|pcck|pchek/.test(cc);
    const hasTroll=/troll|trol/.test(cc);
    const hasVerweig=/verweig|weiger|refus|reject/.test(cc);
    const hasPosit=/posit|posiv/.test(cc);
    const hasDiscord=/discord|discor/.test(cc);
    const hasRedux=/redux|reduc/.test(cc);
    const hasClean=/clean|cleaning/.test(cc);
    const hasBane=/banevad|banvad/.test(cc);
    const hasCover=/covering|cheater/.test(cc);
    const hasNoPov=/nopov|no[pv]ov/.test(cc);
    const has41=/(?:41|4i|4l)/.test(cc);
    const hasAcc14=/acc\s*1?4|acc14/.test(c) || /acc14/.test(cc);
    if((hasTroll&&/(?:pccheck|pcheck|trollinginpc|trollingimpccheck)/.test(cc)) || (hasPc&&hasVerweig&&hasTroll)) return 'PC-Check Verweigerung - Trolling';
    if(hasPosit&&hasDiscord&&has41) return 'PC-Check Positiv 4.1 (Discord)';
    if(hasPosit&&hasRedux&&has41) return 'PC-Check Positiv 4.1 (Redux)';
    if(hasPosit&&hasBane) return 'PC Check Positiv (Banevading)';
    if(hasPosit&&hasCover) return 'PC Check Positiv (Covering Cheater)';
    if(hasCover && !hasPosit) return 'Cheater';
    if(hasPosit&&hasClean) return 'PC-Check Positiv - Cleaning';
    if(/event\s*1\s*[\.:_-]?\s*7/.test(c.replace(/[^a-z0-9.:-]/g,'')) && hasNoPov) return 'Event 1.7 (NoPov in PC Check)';
    if(hasPosit) return 'PC-Check Positiv';
    if(hasVerweig) return 'PC-Check Verweigerung';
    if(/acc\s*1[\.,_-]?\s*4\s*twink|acc14twink/.test(c)||/acc14twink/.test(cc)) return 'Acc 1.4 (Twink)';
    if(/acc\s*1[\.,_-]?\s*4\s*main|acc14main/.test(c)||/acc14main/.test(cc)||hasAcc14) return 'Acc 1.4 (Main)';

    // Final fuzzy pass: reason-only OCR may contain one or two character errors.
    const candidates=ALLOWED_REASONS.flatMap(r=>[r,...(REASON_ALIASES[r]||[])]);
    let best='',bestScore=0;
    for(const cand of candidates){
      const sig=reasonCompact(cand);
      if(!sig)continue;
      const score=similarity(cc,sig);
      if(score>bestScore){bestScore=score;best=cand;}
    }
    if(bestScore>=0.82){
      for(const r of ALLOWED_REASONS){if(r===best|| (REASON_ALIASES[r]||[]).includes(best)) return r;}
      const compactBest=reasonCompact(best);
      const hit=ALLOWED_REASONS.find(r=>reasonCompact(r)===compactBest); if(hit)return hit;
    }
    return '';
  }
  function extractReasonStrict(text){
    const raw=cleanText(text);
    if(!raw)return '';
    const lines=raw.split('\n').map(x=>x.trim()).filter(Boolean);
    const priority=[];
    for(const line of lines){
      const gm=line.match(/(?:grund|grun[dti]|gru[nm]d)\s*[:.\-]?\s*(.*)$/i);
      if(gm&&gm[1]) priority.push(gm[1]);
    }
    for(const p of priority){
      const strong=classifyReasonStrong(p);
      if(strong)return strong;
      const can=canonicalReason(p); if(can?.value)return can.value;
    }
    const windows=[];
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(/pc\s*-?\s*che|cheat|acc\s*1|event|verweig|troll|banevad|clean|redux|discord|covering|nopov/i.test(line)){
        windows.push(line);
        if(lines[i+1])windows.push(`${line} ${lines[i+1]}`);
      }
    }
    const joined=raw.replace(/\s+/g,' ');
    windows.push(joined);
    for(const w of windows){
      const normalized=String(w).replace(/[|¦]/g,' ').replace(/\s+/g,' ').trim();
      const strong=classifyReasonStrong(normalized);
      if(strong)return strong;
      const can=canonicalReason(normalized); if(can?.value)return can.value;
    }
    return '';
  }
  function parseReason(text){
    const raw=cleanText(text);
    if(!raw)return '';
    const exact=extractReasonStrict(raw);
    if(exact)return exact;
    const lines=raw.split('\n');
    for(let i=0;i<lines.length;i++){
      const line=lines[i];
      if(/\b(pc|cheat|acc|event)\b/i.test(line)){
        const strong=classifyReasonStrong(line+(lines[i+1]||''));
        if(strong)return strong;
      }
    }
    return '';
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
  function extractDate(text){
    let s=String(text||'').replace(/[OoQq]/g,'0').replace(/[IlL|]/g,'1').replace(/\s+/g,' ').trim();
    let m=s.match(/\b(0?[1-9]|[12]\d|3[01])\s*[\/\.\-]\s*(0?[1-9]|1[0-2])\s*[\/\.\-]\s*(20\d{2})\b/);
    if(!m)m=s.match(/\b(20\d{2})\s*[\/\.\-]\s*(0?[1-9]|1[0-2])\s*[\/\.\-]\s*(0?[1-9]|[12]\d|3[01])\b/);
    if(!m)return '';
    let yyyy,mm,dd;
    if(String(m[1]).length===4){yyyy=m[1];mm=String(m[2]).padStart(2,'0');dd=String(m[3]).padStart(2,'0');}
    else{dd=String(m[1]).padStart(2,'0');mm=String(m[2]).padStart(2,'0');yyyy=m[3];}
    const d=new Date(Number(yyyy),Number(mm)-1,Number(dd));
    if(d.getFullYear()!==Number(yyyy)||d.getMonth()!==Number(mm)-1||d.getDate()!==Number(dd))return '';
    return `${yyyy}-${mm}-${dd}`;
  }
  function clampId(s){const v=normalizeIdToken(s);return /^\d{1,6}$/.test(v)?v:'';}
  function validDate(v){return /^\d{4}-\d{2}-\d{2}$/.test(String(v||''));}
  function dateFromFilename(filename){
    const name=String(filename||'').trim();
    if(!name)return '';
    // POV naming convention: YYYY-MM-DD HH-MM-SS.mp4. Accept the date portion
    // even when the timestamp separator differs or extra text surrounds it.
    const m=name.match(/(?:^|\D)(20\d{2})[-_.](0?[1-9]|1[0-2])[-_.](0?[1-9]|[12]\d|3[01])(?:\D|$)/);
    if(!m)return '';
    const yyyy=m[1], mm=String(m[2]).padStart(2,'0'), dd=String(m[3]).padStart(2,'0');
    const d=new Date(Number(yyyy),Number(mm)-1,Number(dd));
    if(d.getFullYear()!==Number(yyyy)||d.getMonth()!==Number(mm)-1||d.getDate()!==Number(dd))return '';
    return `${yyyy}-${mm}-${dd}`;
  }
  function consensusString(values, minVotes=2){const m=uniqueVote(values.filter(Boolean));return m&&m.votes>=minVotes?m.value:'';}
  if(isNode){module.exports={ALLOWED_REASONS,compact,similarity,normalizeHexLoose,normalizeIdToken,canonicalReason,reasonOcrNormalize,reasonCompact,classifyReasonStrong,extractReasonStrict,parseTargetId,parseReason,extractBanEvent,extractScOrdered,extractScCandidatesFromString,extractHexCandidateAnyText,consensusHex,extractServerFromOcr,extractDate,serverVote,dateVote,clampId,validDate,dateFromFilename};return;}

  const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];
  function blankYoutubeConnection(slot){return {slot:Number(slot)||1,clientId:'',accessToken:'',tokenExpiresAt:0,blockedUntil:0,blockedReason:'',lastError:'',connected:false,updatedAt:0};}
  function normalizeYoutubeConnections(raw,allowLegacy=true){
    const input=Array.isArray(raw)?raw:[];
    const legacyToken=localStorage.getItem('yt_access_token')||sessionStorage.getItem('yt_access_token')||'';
    const legacyClient=localStorage.getItem('yt_client_id')||'';
    const legacyExpires=Number(localStorage.getItem('yt_access_expires_at_v50')||0)||0;
    const list=[];
    for(let i=1;i<=YT_MAX_CONNECTIONS;i++){
      const x=input.find(v=>Number(v?.slot)===i)||{};
      const c={...blankYoutubeConnection(i),...x,slot:i};
      c.clientId=String(c.clientId||'').trim();
      c.accessToken=String(c.accessToken||'');
      c.tokenExpiresAt=Number(c.tokenExpiresAt)||0;
      c.blockedUntil=Number(c.blockedUntil)||0;
      c.connected=!!(c.clientId&&c.accessToken);
      list.push(c);
    }
    const hasAny=list.some(c=>c.clientId||c.accessToken);
    if(allowLegacy && !hasAny && (legacyClient||legacyToken)){
      list[0].clientId=legacyClient;
      list[0].accessToken=legacyToken;
      list[0].tokenExpiresAt=legacyExpires;
      list[0].connected=!!(legacyClient&&legacyToken);
      list[0].updatedAt=Date.now();
    }
    return list;
  }
  function loadYoutubeConnectionsLocal(){
    try{
      const raw=JSON.parse(localStorage.getItem(YT_CONNECTIONS_KEY)||'null');
      if(raw?.connections)return normalizeYoutubeConnections(raw.connections);
      return normalizeYoutubeConnections(raw);
    }catch{return normalizeYoutubeConnections([]);}
  }
  function connection(slot){return state.ytConnections.find(c=>Number(c.slot)===Number(slot))||null;}
  function connectionHasClientId(slot){return !!String(connection(slot)?.clientId||'').trim();}
  function saveYoutubeConnections(){
    state.ytConnections=normalizeYoutubeConnections(state.ytConnections,false);
    const payload={version:1,updatedAt:Date.now(),connections:state.ytConnections.map(c=>({...c}))};
    try{localStorage.setItem(YT_CONNECTIONS_KEY,JSON.stringify(payload));}catch(err){console.warn('YouTube-Verbindungen konnten nicht in localStorage gesichert werden',err);}
    clearTimeout(youtubeConnectionSaveTimer);
    youtubeConnectionSaveTimer=setTimeout(()=>{
      youtubeConnectionSaveTimer=0;
      try{
        void (async()=>{const db=await openDB();await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(payload,YT_CONNECTIONS_DB_KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});})();
      }catch(err){console.warn('YouTube-Verbindungen konnten nicht in IndexedDB gesichert werden',err);}
    },120);
  }
  async function loadYoutubeConnections(){
    let local=loadYoutubeConnectionsLocal();
    try{
      const db=await openDB();
      const data=await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(YT_CONNECTIONS_DB_KEY);tx.oncomplete=()=>res(r.result||null);tx.onerror=()=>rej(tx.error);});
      if(data?.connections && Number(data.updatedAt||0)>Number(JSON.parse(localStorage.getItem(YT_CONNECTIONS_KEY)||'{}')?.updatedAt||0)) local=normalizeYoutubeConnections(data.connections);
    }catch{}
    state.ytConnections=normalizeYoutubeConnections(local);
    state.ytConnections.forEach(c=>c.connected=!!(c.clientId&&c.accessToken));
    const first=state.ytConnections.find(c=>c.accessToken&&c.clientId);
    state.activeYoutubeSlot=first?.slot||1;
    const active=connection(state.activeYoutubeSlot);
    state.clientId=active?.clientId||'';
    state.accessToken=active?.accessToken||'';
    state.tokenExpiresAt=Number(active?.tokenExpiresAt||0);
    saveYoutubeConnections();
  }
  function setYoutubeConnectionClientId(slot,value){
    const c=connection(slot);if(!c)return;
    const id=String(value||'').trim();
    if(c.clientId!==id){
      c.clientId=id;
      c.accessToken='';c.tokenExpiresAt=0;c.connected=false;c.blockedUntil=0;c.blockedReason='';c.lastError='';
    }
    if(id) state.activeYoutubeSlot=Number(slot);
    if(Number(slot)===1){localStorage.removeItem('yt_client_id');localStorage.removeItem('yt_access_token');localStorage.removeItem('yt_access_expires_at_v50');}
    syncLegacyYoutubeState();
    renderYoutubeConnections();
    saveYoutubeConnections();
  }
  function syncLegacyYoutubeState(slot=state.activeYoutubeSlot){
    const c=connection(slot);
    state.activeYoutubeSlot=Number(slot)||1;
    state.clientId=c?.clientId||'';
    state.accessToken=c?.accessToken||'';
    state.tokenExpiresAt=Number(c?.tokenExpiresAt||0);
  }
  function usableYoutubeConnections(exclude=new Set()){
    const now=Date.now();
    return state.ytConnections.filter(c=>c.clientId&&c.accessToken&&!exclude.has(Number(c.slot))&&Number(c.blockedUntil||0)<=now).sort((a,b)=>Number(a.slot)-Number(b.slot));
  }
  function configuredYoutubeConnections(){return state.ytConnections.filter(c=>c.clientId&&c.accessToken);}
  function earliestYoutubeRetry(){
    const values=state.ytConnections.map(c=>Number(c.blockedUntil||0)).filter(v=>v>Date.now());
    return values.length?Math.min(...values):0;
  }
  function markYoutubeConnectionBlocked(slot,reason){
    const c=connection(slot);if(!c)return 0;
    c.blockedUntil=Date.now()+YT_RETRY_DELAY_MS;
    c.blockedReason=String(reason||'YouTube-Limit erreicht');
    c.lastError=c.blockedReason;
    c.connected=!!(c.clientId&&c.accessToken);
    saveYoutubeConnections();
    scheduleYoutubeRetryAt(earliestYoutubeRetry()||Date.now()+YT_RETRY_DELAY_MS);
    renderYoutubeConnections();
    return c.blockedUntil;
  }
  function clearExpiredYoutubeConnectionBlocks(){
    const now=Date.now();let changed=false;
    for(const c of state.ytConnections){if(Number(c.blockedUntil||0)>0&&Number(c.blockedUntil)<=now){c.blockedUntil=0;c.blockedReason='';changed=true;}}
    if(changed){saveYoutubeConnections();renderYoutubeConnections();}
  }
  function renderYoutubeConnections(){
    for(let slot=1;slot<=YT_MAX_CONNECTIONS;slot++){
      const c=connection(slot);if(!c)continue;
      const input=$(`#ytClientId${slot}`);if(input&&document.activeElement!==input)input.value=c.clientId||'';
      const status=$(`#ytStatus${slot}`);const help=$(`#ytHelp${slot}`);const connectBtn=$(`#ytConnect${slot}`);const reauthBtn=$(`#ytReauth${slot}`);
      const blocked=Number(c.blockedUntil||0)>Date.now();
      if(status){
        status.className='connection '+(blocked?'warn':c.connected?'good':'');
        status.textContent=blocked?`● Gesperrt · Retry ${formatRetryClock(c.blockedUntil-Date.now())}`:c.connected?'● Verbunden':'● Nicht verbunden';
      }
      if(help){help.textContent=c.lastError||(!c.clientId?'Leer · wird nicht verwendet':'');help.style.color=c.lastError?'#f0ca70':'';}
      if(connectBtn){connectBtn.textContent=c.connected?'Erneut verbinden':'Mit YouTube verbinden';connectBtn.disabled=false;}
      if(reauthBtn)reauthBtn.disabled=false;
    }
    const global=$('#ytConnectHelp');
    if(global){const count=usableYoutubeConnections().length;global.textContent=count?`${count} YouTube-Verbindung${count===1?'':'en'} verfügbar. Leere Felder werden ignoriert.`:'Keine nutzbare YouTube-Verbindung vorhanden.';}
  }
  const state={entries:[],queue:[],archiveSelected:new Set(),filter:'all',editing:null,worker:null,specialWorker:null,fastWorker:null,accessToken:'',tokenClient:null,clientId:'',activeYoutubeSlot:1,ytConnections:loadYoutubeConnectionsLocal(),settings:{frames:30,window:5,step:0.4},selectedTypes:new Set(),queueRunner:false,uploadRunner:false,localFallbackRunner:false,youtubeUploadBlocked:false,tokenExpiresAt:0,tokenRefreshPromise:null,tokenRefreshPromises:new Map()};
  let archiveReadyPromise=Promise.resolve();
  const views={archive:['Archiv','POV-Fälle, Bans, PC-Checks und CSV-Export'],cases:['Verdachtsfälle','Fehlende oder widersprüchliche OCR-Angaben'],upload:['POVs hochladen','Mehrere Aufnahmen gleichzeitig verarbeiten'],csv:['CSV erstellen','Export für Proof, Datum, ID, SOC, RID, Discord ID, Familie und Grund'],settings:['Einstellungen','OCR und YouTube']};
  // Local authentication: plaintext passwords are never stored; only salted PBKDF2 hashes are persisted in this browser.
  const AUTH_USERS_KEY='grandrp_auth_users_v1';
  const AUTH_SESSION_KEY='grandrp_auth_session_v1';
  const AUTH_ITERATIONS=210000;
  const AUTH_SEED={username:'adam',role:'admin',salt:'DY69sWp+SO0RsyKJxK7D3g==',hash:'M3TR78gYXDBGTs6B5ciKSnQn6o11g82CavmziyWhTUE=',iterations:AUTH_ITERATIONS};
  let authUser=null;
  const authB64=b=>btoa(String.fromCharCode(...new Uint8Array(b)));
  const authFromB64=s=>Uint8Array.from(atob(String(s||'')),c=>c.charCodeAt(0));
  async function authDerive(password,salt,iterations=AUTH_ITERATIONS){const key=await crypto.subtle.importKey('raw',new TextEncoder().encode(String(password||'')),'PBKDF2',false,['deriveBits']);const bits=await crypto.subtle.deriveBits({name:'PBKDF2',salt:authFromB64(salt),iterations,hash:'SHA-256'},key,256);return authB64(bits);}
  const authUsers=()=>{try{return JSON.parse(localStorage.getItem(AUTH_USERS_KEY)||'[]')||[];}catch{return[];}};
  const saveAuthUsers=u=>localStorage.setItem(AUTH_USERS_KEY,JSON.stringify(u));
  function authInit(){let u=authUsers();if(!u.length){u=[{id:crypto.randomUUID(),...AUTH_SEED,createdAt:Date.now()}];saveAuthUsers(u);}return u;}
  function authGate(show){$('#loginGate')?.classList.toggle('hidden',!show);$('.app-shell')?.classList.toggle('auth-locked',show);}
  function authMessage(text,kind=''){const el=$('#authMessage');if(el){el.textContent=text||'';el.className='auth-message '+kind;}}
  function renderAuthUser(){const el=$('#activeUserName');if(el)el.textContent=authUser?`${authUser.username} · ${authUser.role==='admin'?'Administrator':'Benutzer'}`:'';}
  async function authLogin(username,password){const u=authInit().find(x=>x.username.toLowerCase()===String(username||'').trim().toLowerCase());if(!u)throw new Error('Benutzername oder Passwort falsch.');if(await authDerive(password,u.salt,u.iterations||AUTH_ITERATIONS)!==u.hash)throw new Error('Benutzername oder Passwort falsch.');authUser={id:u.id,username:u.username,role:u.role};sessionStorage.setItem(AUTH_SESSION_KEY,JSON.stringify(authUser));return authUser;}
  function authLogout(){authUser=null;sessionStorage.removeItem(AUTH_SESSION_KEY);authGate(true);authMessage('');$('#editorModal')?.classList.add('hidden');setTimeout(()=>$('#loginUsername')?.focus(),50);}
  async function authChangePassword(current,newPw){if(!authUser)throw new Error('Nicht eingeloggt.');if(String(newPw||'').length<8)throw new Error('Das neue Passwort muss mindestens 8 Zeichen haben.');const users=authUsers();const u=users.find(x=>x.id===authUser.id);if(!u)throw new Error('Benutzer nicht gefunden.');if(await authDerive(current,u.salt,u.iterations||AUTH_ITERATIONS)!==u.hash)throw new Error('Aktuelles Passwort ist falsch.');u.salt=authB64(crypto.getRandomValues(new Uint8Array(16)));u.hash=await authDerive(newPw,u.salt,AUTH_ITERATIONS);u.iterations=AUTH_ITERATIONS;saveAuthUsers(users);}
  async function authAddUser(username,password,role){if(authUser?.role!=='admin')throw new Error('Nur Administratoren dürfen Benutzer anlegen.');const name=String(username||'').trim();if(!/^[A-Za-z0-9._-]{2,32}$/.test(name))throw new Error('Benutzername: 2–32 Zeichen, Buchstaben, Zahlen, Punkt, Unterstrich oder Bindestrich.');if(String(password||'').length<8)throw new Error('Passwort muss mindestens 8 Zeichen haben.');const users=authUsers();if(users.some(u=>u.username.toLowerCase()===name.toLowerCase()))throw new Error('Benutzer existiert bereits.');const salt=authB64(crypto.getRandomValues(new Uint8Array(16)));users.push({id:crypto.randomUUID(),username:name,role:role==='admin'?'admin':'user',salt,hash:await authDerive(password,salt),iterations:AUTH_ITERATIONS,createdAt:Date.now()});saveAuthUsers(users);renderAuthUsers();}
  function authDeleteUser(id){if(authUser?.role!=='admin')throw new Error('Nur Administratoren dürfen Benutzer löschen.');if(id===authUser.id)throw new Error('Der aktuell eingeloggte Benutzer kann nicht gelöscht werden.');const users=authUsers();const v=users.find(x=>x.id===id);if(v?.role==='admin'&&users.filter(x=>x.role==='admin').length===1)throw new Error('Der letzte Administrator kann nicht gelöscht werden.');saveAuthUsers(users.filter(x=>x.id!==id));renderAuthUsers();}
  function renderAuthUsers(){const panel=$('#adminUserPanel'),box=$('#authUsersList');if(!panel||!box)return;const admin=authUser?.role==='admin';panel.classList.toggle('hidden',!admin);if(!admin){box.innerHTML='';return;}box.innerHTML=authUsers().map(u=>`<div class="auth-user-row"><div><strong>${esc(u.username)}</strong><small>${u.role==='admin'?'Administrator':'Benutzer'}</small></div><button type="button" class="mini danger" data-auth-delete="${u.id}" ${u.id===authUser.id?'disabled':''}>Löschen</button></div>`).join('');$$('[data-auth-delete]').forEach(b=>b.onclick=()=>{try{authDeleteUser(b.dataset.authDelete);toast('Benutzer gelöscht.');}catch(e){toast(e.message||String(e));}});}
  async function authResume(){authInit();try{const x=JSON.parse(sessionStorage.getItem(AUTH_SESSION_KEY)||'null');const u=x&&authUsers().find(a=>a.id===x.id);if(u){authUser={id:u.id,username:u.username,role:u.role};authGate(false);renderAuthUser();return true;}}catch{}authGate(true);return false;}
  function setupAuthUI(){
    $('#loginForm')?.addEventListener('submit',async e=>{e.preventDefault();const b=$('#loginBtn');b.disabled=true;authMessage('Anmeldung wird geprüft…','working');try{await authLogin($('#loginUsername').value,$('#loginPassword').value);$('#loginPassword').value='';authMessage('');authGate(false);renderAuthUser();await bootApp();}catch(err){authMessage(err.message||String(err),'error');}finally{b.disabled=false;}});
    $('#logoutBtn')?.addEventListener('click',authLogout);
    $('#changePasswordForm')?.addEventListener('submit',async e=>{e.preventDefault();const b=$('#changePasswordBtn');b.disabled=true;try{await authChangePassword($('#currentPassword').value,$('#newPassword').value);e.target.reset();toast('Passwort geändert.');}catch(err){toast(err.message||String(err));}finally{b.disabled=false;}});
    $('#addUserForm')?.addEventListener('submit',async e=>{e.preventDefault();const b=$('#addUserBtn');b.disabled=true;try{await authAddUser($('#newUsername').value,$('#newPassword').value,$('#newRole').value);e.target.reset();toast('Benutzer angelegt.');}catch(err){toast(err.message||String(err));}finally{b.disabled=false;}});
  }

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
  const META_DB_KEY='__grandrp_archive_meta__';
  const PERMA_DB_KEY='__grandrp_perma_archive__';
  const QUEUE_DB_KEY='__grandrp_upload_queue__';
  const QUEUE_STORAGE_KEY='grandrp_pov_queue_v3';
  const META_UPDATED_KEY='grandrp_pov_meta_updated_v1';
  const QUEUE_UPDATED_KEY='grandrp_pov_queue_updated_v1';
  const ARCHIVE_BACKUP_KEY='grandrp_archive_emergency_backup_v1';
  const ARCHIVE_AUTHORITATIVE_KEY='grandrp_archive_authoritative_v132';
  // Explicit POV-Archiv placement is stored separately from archive snapshots.
  // This prevents an older snapshot from moving a POV back to the normal list after refresh.
  const ARCHIVE_PLACEMENT_KEY='grandrp_pov_archive_placement_v133';
  const LEGACY_ARCHIVE_PLACEMENT_KEYS=['grandrp_pov_archive_placement_v132'];
  const PENDING_BACKUP_KEY='grandrp_pending_backup_v122';
  const DIRECT_RESTORE_KEY='grandrp_direct_restore_v122';
  const LEGACY_DIRECT_RESTORE_KEY='grandrp_direct_restore_v118';
  const ARCHIVE_SNAPSHOT_PREFIX='__grandrp_archive_snapshot_v106__';
  const ARCHIVE_ENTRY_PREFIX='__grandrp_archive_entry_v106__';
  const DESTRUCTIVE_TOKEN=Object.freeze({name:'explicit-user-delete'});
  const ARCHIVE_SNAPSHOT_COUNT=20;
  let queuePersistTimer=0;
  let archiveRestoreInProgress=false;
  function sanitizeArchiveEntries(entries){
    return (Array.isArray(entries)?entries:[]).filter(e=>e&&e.id).map(e=>({...e,file:undefined,videoUrl:undefined}));
  }
  function readArchivePlacement(){
    const merged={};
    const keys=[ARCHIVE_PLACEMENT_KEY,...LEGACY_ARCHIVE_PLACEMENT_KEYS];
    for(const key of keys){
      try{
        const raw=localStorage.getItem(key);
        const parsed=raw?JSON.parse(raw):{};
        if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
          for(const [id,value] of Object.entries(parsed)){
            // POV-Archiv is intentionally sticky. Once true, an older snapshot or a stale
            // editor state is never allowed to turn it back into a normal entry.
            if(value===true)merged[String(id)]=true;
          }
        }
      }catch{}
    }
    return merged;
  }
  function saveArchivePlacement(entries=state.entries){
    try{
      const placement=readArchivePlacement();
      for(const e of entries||[]){
        if(e?.id && e.permaArchive===true)placement[String(e.id)]=true;
      }
      localStorage.setItem(ARCHIVE_PLACEMENT_KEY,JSON.stringify(placement));
    }catch(err){console.warn('POV-Archiv-Platzierung konnte nicht gespeichert werden',err);}
  }
  function applyArchivePlacement(entries){
    const placement=readArchivePlacement();
    return (entries||[]).map(e=>{
      const id=String(e?.id||'');
      if(id && placement[id]===true)return {...e,permaArchive:true};
      return e;
    });
  }
  function rememberArchivePlacementFromSources(candidates){
    try{
      const placement=readArchivePlacement();
      for(const source of candidates||[]){
        for(const e of source?.entries||[]){
          if(e?.id && e.permaArchive===true)placement[String(e.id)]=true;
        }
      }
      localStorage.setItem(ARCHIVE_PLACEMENT_KEY,JSON.stringify(placement));
    }catch(err){console.warn('POV-Archiv-Platzierung konnte nicht konsolidiert werden',err);}
  }
  function readDirectRestorePayload(){
    const candidates=[];
    for(const key of [DIRECT_RESTORE_KEY,LEGACY_DIRECT_RESTORE_KEY]){
      try{
        const raw=localStorage.getItem(key);
        if(!raw)continue;
        const payload=JSON.parse(raw);
        const entries=sanitizeArchiveEntries(payload?.entries);
        if(entries.length)candidates.push({key,payload:{...payload,entries},updatedAt:Number(payload?.updatedAt)||0});
      }catch{}
    }
    candidates.sort((a,b)=>b.updatedAt-a.updatedAt);
    return candidates[0]?.payload||null;
  }
  async function getArchiveSnapshotsDb(){
    try{
      const db=await openDB();
      return await new Promise((res,rej)=>{
        const tx=db.transaction(STORE,'readonly');
        const os=tx.objectStore(STORE);
        const keysReq=os.getAllKeys();
        keysReq.onerror=()=>rej(keysReq.error);
        keysReq.onsuccess=()=>{
          const keys=(keysReq.result||[]).filter(k=>String(k).startsWith(ARCHIVE_SNAPSHOT_PREFIX));
          if(!keys.length){res([]);return;}
          const out=[];let left=keys.length;
          for(const key of keys){
            const r=os.get(key);
            r.onsuccess=()=>{const v=r.result;if(v&&Array.isArray(v.entries)&&v.entries.length)out.push({entries:v.entries,updatedAt:Number(v.updatedAt)||0,source:'snapshot:'+key});if(--left===0)res(out);};
            r.onerror=()=>{if(--left===0)res(out);};
          }
        };
        tx.onerror=()=>rej(tx.error);
      });
    }catch{return [];}
  }
  async function trimArchiveSnapshotsDb(){
    // Intentionally disabled: recovery snapshots are never automatically deleted.
    return true;
  }
  async function getMetaDb(){
    try{
      const db=await openDB();
      return await new Promise((res,rej)=>{
        const tx=db.transaction(STORE,'readonly');
        const os=tx.objectStore(STORE);
        const r=os.get(META_DB_KEY);
        const p=os.get(PERMA_DB_KEY);
        const k=os.getAllKeys();
        const entryKeys=[];
        k.onsuccess=()=>{
          for(const key of (k.result||[])){
            if(String(key).startsWith(ARCHIVE_ENTRY_PREFIX))entryKeys.push(key);
          }
        };
        tx.oncomplete=async()=>{
          try{
            const val=r.result;
            const parsed=Array.isArray(val)?{entries:val,updatedAt:0}:((val&&Array.isArray(val.entries))?{entries:val.entries,updatedAt:Number(val.updatedAt)||0}:{entries:[],updatedAt:0});
            const main=Array.isArray(parsed.entries)?parsed.entries:[];
            // Always merge append-only per-entry records with the main index. A damaged or
            // partial main index must never hide older durable records.
            if(entryKeys.length){
              const tx2=db.transaction(STORE,'readonly');
              const os2=tx2.objectStore(STORE);
              const recovered=[...main];
              const byId=new Map(recovered.filter(e=>e&&e.id).map(e=>[String(e.id),e]));
              let remaining=entryKeys.length;
              for(const key of entryKeys){
                const rr=os2.get(key);
                rr.onsuccess=()=>{
                  const wrapper=rr.result;
                  const entry=wrapper?.entry||wrapper;
                  if(entry&&entry.id&&!byId.has(String(entry.id))){byId.set(String(entry.id),entry);recovered.push(entry);}
                  if(!--remaining)finish(recovered);
                };
                rr.onerror=()=>{if(!--remaining)finish(recovered);};
              }
              function finish(rec){
                res({entries:rec,updatedAt:parsed.updatedAt,perma:Array.isArray(p.result)?p.result:[]});
              }
              return;
            }
            res({entries:main,updatedAt:parsed.updatedAt,perma:Array.isArray(p.result)?p.result:[]});
          }catch(err){rej(err);}
        };
        tx.onerror=()=>rej(tx.error);
      });
    }catch{return {entries:[],updatedAt:0,perma:[]};}
  }
  async function saveMetaDb(entries,updatedAt=Date.now(),allowEmpty=false){
    const clean=sanitizeArchiveEntries(entries);
    if(!clean.length && !allowEmpty) return false;
    try{
      const db=await openDB();
      const snapshotKey=`${ARCHIVE_SNAPSHOT_PREFIX}${String(updatedAt).padStart(16,'0')}_${Math.random().toString(36).slice(2,8)}`;
      await new Promise((res,rej)=>{
        const tx=db.transaction(STORE,'readwrite');
        const os=tx.objectStore(STORE);
        // Durable main index + perma subset.
        os.put({version:4,updatedAt,entries:clean},META_DB_KEY);
        os.put(clean.filter(e=>e.permaArchive),PERMA_DB_KEY);
        // Append-only per-entry records: normal saves NEVER delete or replace other entry records.
        for(const entry of clean){
          os.put({version:1,updatedAt,entry},`${ARCHIVE_ENTRY_PREFIX}${entry.id}`);
        }
        // Immutable recovery snapshot.
        if(clean.length) os.put({version:1,updatedAt,entries:clean},snapshotKey);
        tx.oncomplete=res;tx.onerror=()=>rej(tx.error);
      });
      // Recovery snapshots are intentionally NEVER auto-deleted.
      return true;
    }catch(err){console.warn('Archiv-Metadaten konnten nicht in IndexedDB gesichert werden',err);return false;}
  }
  async function getQueueDb(){try{const db=await openDB();return await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(QUEUE_DB_KEY);tx.oncomplete=()=>{const val=r.result;res(Array.isArray(val)?{items:val,updatedAt:0}:((val&&Array.isArray(val.items))?{items:val.items,updatedAt:Number(val.updatedAt)||0}:{items:[],updatedAt:0}));};tx.onerror=()=>rej(tx.error);});}catch{return {items:[],updatedAt:0};}}
  async function saveQueueDb(items,updatedAt=Date.now()){try{const db=await openDB();return await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put({version:2,updatedAt,items},QUEUE_DB_KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch(err){console.warn('Warteschlange konnte nicht in IndexedDB gesichert werden',err);}}
  function queueMetaSnapshot(){
    return state.queue.filter(item=>item && item.id && !item.editingDone && item.status!=='Gespeichert').map(item=>{
      const out={...item};
      delete out.file;
      delete out.ocrPromise;
      if(out.result && typeof out.result==='object'){
        out.result={...out.result};
        delete out.result.file;
        delete out.result.videoUrl;
      }
      return out;
    });
  }
  function persistQueueNow(){
    const items=queueMetaSnapshot();
    const updatedAt=Date.now();
    for(const item of items) item.updatedAt=updatedAt;
    try{localStorage.setItem(QUEUE_STORAGE_KEY,JSON.stringify({version:3,updatedAt,items}));localStorage.setItem(QUEUE_UPDATED_KEY,String(updatedAt));}catch(err){console.warn('Warteschlange konnte nicht in localStorage gesichert werden',err);}
    void saveQueueDb(items,updatedAt);
  }
  function scheduleQueuePersist(){
    persistQueueNow();
    clearTimeout(queuePersistTimer);
    queuePersistTimer=setTimeout(()=>{queuePersistTimer=0;const updatedAt=Number(localStorage.getItem(QUEUE_UPDATED_KEY)||Date.now());void saveQueueDb(queueMetaSnapshot(),updatedAt);},450);
  }
  async function loadQueue(){
    let localItems=[],localUpdatedAt=Number(localStorage.getItem(QUEUE_UPDATED_KEY)||0);
    try{
      const raw=JSON.parse(localStorage.getItem(QUEUE_STORAGE_KEY)||'[]');
      if(Array.isArray(raw)){localItems=raw;}
      else if(raw&&Array.isArray(raw.items)){localItems=raw.items;localUpdatedAt=Math.max(localUpdatedAt,Number(raw.updatedAt)||0);}
    }catch{localItems=[];}
    const dbQueue=await getQueueDb();
    // The upload queue is append/merge persistent. Never let a newer-but-partial
    // localStorage snapshot hide items that are still present in IndexedDB.
    // This is especially important after a page refresh during/after an upload.
    const mergedQueue=new Map();
    for(const item of (Array.isArray(dbQueue.items)?dbQueue.items:[])){if(item?.id)mergedQueue.set(String(item.id),item);}
    for(const item of localItems){
      if(!item?.id)continue;
      const key=String(item.id),prev=mergedQueue.get(key);
      if(!prev || Number(item.updatedAt||0)>=Number(prev.updatedAt||0))mergedQueue.set(key,item);
    }
    let stored=[...mergedQueue.values()];
    if(!stored.length){state.queue=[];return;}
    const restored=[];
    let changed=false;
    for(const meta of stored){
      if(!meta?.id || meta.editingDone || meta.status==='Gespeichert'){changed=true;continue;}
      let file=null;
      try{file=await getVideo(meta.id);}catch{}
      if(!file){changed=true;continue;}
      const item={...meta,file,ocrPromise:null};
      item.cancelled=false;
      item.processing=false;
      item.uploading=false;
      item.ocrProcessing=false;
      if(item.youtube){
        item.uploadStarted=true;
        item.uploadFailed=false;
        if(item.result){
          item.progress=100;
          item.status=item.result.complete?'OCR fertig · Prüfung offen':'OCR unvollständig · Prüfung nötig';
        }else{
          item.progress=Math.max(60,Number(item.progress)||60);
          item.status='Upload fertig · OCR wird nach Seitenaktualisierung fortgesetzt';
        }
      }else if(item.result && item.youtubeLimitBlocked){
        item.uploadStarted=true;
        item.uploadFailed=true;
        item.progress=100;
        item.status=item.result.complete?'YouTube-Limit · OCR fertig · YouTube später erneut':'YouTube-Limit · OCR unvollständig · Prüfung nötig';
      }else if(item.uploadFailed || /^Fehler:/i.test(item.status||'')){
        item.uploadStarted=true;
      }else{
        item.uploadStarted=false;
        item.uploadFailed=false;
        item.progress=0;
        item.status='Upload wird nach Seitenaktualisierung fortgesetzt';
      }
      restored.push(item);
    }
    state.queue=restored;
    if(changed)persistQueueNow();
    else scheduleQueuePersist();
  }
  async function saveDurableAppState(){
    const payload={version:1,updatedAt:Date.now(),youtubeConnections:state.ytConnections,settings:state.settings};
    try{
      const db=await openDB();
      await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(payload,'__grandrp_app_state_v89__');tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
    }catch(err){console.warn('Dauerhafte App-Einstellungen konnten nicht gespeichert werden',err);}
  }
  async function requestPersistentStorage(){try{if(navigator.storage?.persist)await navigator.storage.persist();const persisted=await navigator.storage?.persisted?.();const el=$('#persistentStorageStatus');if(el){el.textContent=persisted?'● Dauerhafter Browser-Speicher aktiv':'● Browser-Speicher nicht garantiert';el.className='connection '+(persisted?'good':'warn');}return !!persisted;}catch{const el=$('#persistentStorageStatus');if(el){el.textContent='● Browser-Speicherstatus nicht verfügbar';el.className='connection warn';}return false;}}
  async function loadMeta(){
    const candidates=[];
    // The authoritative synchronous archive copy is the first local source consulted on every
    // page load. This prevents an empty/stale IndexedDB state from making a valid archive appear
    // to disappear after refresh or a hard reload.
    try{
      const raw=localStorage.getItem(ARCHIVE_AUTHORITATIVE_KEY);
      if(raw){
        const parsed=JSON.parse(raw);
        const rows=sanitizeArchiveEntries(parsed?.entries||parsed);
        if(rows.length)candidates.push({entries:rows,updatedAt:Number(parsed?.updatedAt)||0,source:'AUTHORITATIVE-LOCAL'});
      }
    }catch(err){console.warn('Autoritativer Archivstand konnte nicht gelesen werden',err);}
    // An explicit restore is isolated from normal startup. If a user has just selected
    // a backup, do not allow a concurrent load to replace it with an older store.
    if(archiveRestoreInProgress)return;
    try{
      const direct=readDirectRestorePayload();
      if(direct){
        const directEntries=sanitizeArchiveEntries(direct.entries);
        if(directEntries.length)candidates.push({entries:directEntries,updatedAt:Number(direct.updatedAt)||Date.now(),source:'DIRECT-RESTORE'});
      }
    }catch(err){console.warn('Direkter Archiv-Restore konnte nicht gelesen werden',err);}
    try{
      const dbData=await getMetaDb();
      if(dbData.entries?.length)candidates.push({entries:dbData.entries,updatedAt:Number(dbData.updatedAt)||0,source:'IndexedDB'});
      if(dbData.perma?.length)candidates.push({entries:dbData.perma,updatedAt:Number(dbData.updatedAt)||0,source:'IndexedDB perma'});
      const snaps=await getArchiveSnapshotsDb();
      candidates.push(...snaps);
    }catch(err){console.warn('IndexedDB-Archiv konnte nicht gelesen werden',err);}

    // Read every relevant localStorage archive snapshot. This also recovers data from older builds.
    try{
      for(let i=0;i<localStorage.length;i++){
        const key=localStorage.key(i)||'';
        if(!/grandrp.*(?:pov_meta|archive.*backup|archive.*snapshot)/i.test(key))continue;
        const raw=localStorage.getItem(key);if(!raw)continue;
        let parsed;try{parsed=JSON.parse(raw);}catch{continue;}
        const rows=Array.isArray(parsed)?parsed:(Array.isArray(parsed?.entries)?parsed.entries:[]);
        if(rows.length)candidates.push({entries:rows,updatedAt:Number(parsed?.updatedAt)||Number(localStorage.getItem(META_UPDATED_KEY)||0),source:'localStorage:'+key});
      }
    }catch(err){console.warn('localStorage-Archiv konnte nicht vollständig durchsucht werden',err);}

    // Merge durable sources by ID. A direct restore has explicit precedence so an imported
    // entry cannot be replaced by an older/stale IndexedDB or localStorage copy. Empty sources
    // are ignored and can never wipe a valid archive.
    if(archiveRestoreInProgress)return;
    const directNow=readDirectRestorePayload();
    if(directNow?.entries?.length){
      const directEntries=sanitizeArchiveEntries(directNow.entries);
      candidates.push({entries:directEntries,updatedAt:Number(directNow.updatedAt)||Date.now(),source:'DIRECT-RESTORE'});
    }
    const nonEmpty=candidates.filter(c=>Array.isArray(c.entries)&&c.entries.length);
    nonEmpty.sort((a,b)=>{
      const priority=source=>source==='AUTHORITATIVE-LOCAL'?2:(source==='DIRECT-RESTORE'?1:0);
      return priority(b.source)-priority(a.source) || Number(b.updatedAt||0)-Number(a.updatedAt||0) || b.entries.length-a.entries.length;
    });
    const mergedById=new Map();
    for(const c of [...nonEmpty].reverse()){for(const e of sanitizeArchiveEntries(c.entries)){if(e?.id)mergedById.set(String(e.id),e);}}
    const directFirst=nonEmpty.find(c=>c.source==='DIRECT-RESTORE');
    // Re-apply direct restore last so it wins deterministically for duplicate IDs.
    if(directFirst)for(const e of sanitizeArchiveEntries(directFirst.entries))if(e?.id)mergedById.set(String(e.id),e);
    const recovered=[...mergedById.values()];
    // Any source that ever recorded a POV as archived is treated as proof of permanent
    // placement. This repairs older V132 stores where the main index could contain the same
    // POV with permaArchive:false while the dedicated archive subset still had it.
    rememberArchivePlacementFromSources(nonEmpty);
    // Explicit archive placement always wins over recovered/older snapshots.
    state.entries=applyArchivePlacement(recovered);

    // If anything was recovered, immediately normalize both stores and create a fresh recovery snapshot.
    if(state.entries.length){
      try{
        const clean=sanitizeArchiveEntries(state.entries);const stamp=Math.max(Date.now(),...candidates.map(c=>Number(c.updatedAt)||0));
        localStorage.setItem(ARCHIVE_BACKUP_KEY,JSON.stringify({version:1,updatedAt:stamp,entries:clean}));
        localStorage.setItem(META_KEY,JSON.stringify(clean));
        localStorage.setItem(META_UPDATED_KEY,String(stamp));
        await saveMetaDb(clean,stamp);
      }catch(err){console.warn('Archiv-Recovery konnte nicht vollständig abgeschlossen werden',err);}
    }

    await loadYoutubeConnections();
    renderYoutubeConnections();
    try{
      let changed=false;
      for(const e of state.entries){
        if(!e.id||!e.videoStored)continue;
        const stored=await getVideo(e.id);
        if(!stored)continue;
        if(Number(e.sourceSize)!==Number(stored.size)){e.sourceSize=stored.size;changed=true;}
      }
      if(changed)saveMeta();
    }catch(err){console.warn('Archivgrößen konnten nicht synchronisiert werden',err);}
  }
  function saveMeta(options={}){
    const entries=sanitizeArchiveEntries(state.entries);
    saveArchivePlacement(entries);
    const allowEmpty=!!options.allowEmpty&&options.explicitDelete===true;
    // Hard safety rule: normal code is NEVER allowed to overwrite an existing archive with [].
    if(!entries.length&&!allowEmpty){
      console.warn('Archiv-Schutz: Leerer Archivstand wurde nicht gespeichert. Bestehende Daten bleiben unangetastet.');
      return false;
    }
    const updatedAt=Date.now();
    if(entries.length){
      try{
        localStorage.setItem(ARCHIVE_AUTHORITATIVE_KEY,JSON.stringify({version:1,updatedAt,entries}));
      }catch(err){console.warn('Autoritativer Archivstand konnte nicht lokal gespeichert werden',err);}
      try{
        const previous=localStorage.getItem(META_KEY);
        if(previous && previous!=='[]')localStorage.setItem(ARCHIVE_BACKUP_KEY,JSON.stringify({version:1,updatedAt,raw:previous}));
        localStorage.setItem(META_KEY,JSON.stringify(entries));
        localStorage.setItem(META_UPDATED_KEY,String(updatedAt));
      }catch(err){console.warn('Archiv-Metadaten konnten nicht lokal gespeichert werden',err);}
      void saveMetaDb(entries,updatedAt,allowEmpty);
    }else if(allowEmpty){
      try{
        localStorage.setItem(META_KEY,'[]');
        localStorage.setItem(META_UPDATED_KEY,String(updatedAt));
        localStorage.removeItem(ARCHIVE_AUTHORITATIVE_KEY);
        localStorage.removeItem(DIRECT_RESTORE_KEY);
      }catch{}
      void saveMetaDb([],updatedAt,true);
    }
    void saveDurableAppState();
    scheduleDriveSync();
    return true;
  }
  // Safety invariant: normal application code may never delete a stored POV.
  // Only explicit UI delete actions receive DESTRUCTIVE_TOKEN.
  function assertDestructiveDeleteToken(token){
    if(token!==DESTRUCTIVE_TOKEN)throw new Error('Destruktive Dateilöschung ist nur über eine ausdrücklich bestätigte Benutzeraktion erlaubt.');
  }
  const DB_VERSION=3;
  async function openDB(){return new Promise((res,rej)=>{
    let done=false;
    const finish=db=>{done=true;try{db.onversionchange=()=>{try{db.close();}catch{}};}catch{};res(db);};
    const wire=(req,allowFallback)=>{
      req.onupgradeneeded=()=>{try{const db=req.result;if(!db.objectStoreNames.contains(STORE))db.createObjectStore(STORE);}catch(err){console.error('IndexedDB Upgrade fehlgeschlagen',err);}};
      req.onsuccess=()=>finish(req.result);
      req.onerror=()=>{if(!done&&allowFallback&&req.error?.name==='VersionError'){try{wire(indexedDB.open(DB_NAME),false);}catch(err){rej(err);}}else if(!done)rej(req.error||new Error('IndexedDB konnte nicht geöffnet werden.'));};
    };
    try{wire(indexedDB.open(DB_NAME,DB_VERSION),true);}catch(err){rej(err);}
  });}
  async function putVideo(id,file){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(file,id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  async function getVideo(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const r=tx.objectStore(STORE).get(id);r.onsuccess=()=>res(r.result);r.onerror=()=>rej(r.error);});}
  async function delVideo(id,token){
    assertDestructiveDeleteToken(token);
    const db=await openDB();
    return new Promise((res,rej)=>{
      const tx=db.transaction(STORE,'readwrite');
      const os=tx.objectStore(STORE);
      os.delete(id);
      os.delete(`${ARCHIVE_ENTRY_PREFIX}${id}`);
      tx.oncomplete=res;tx.onerror=()=>rej(tx.error);
    });
  }
  async function buildArchiveThumbnail(entry){
    try{
      const file=await getVideo(entry.id); if(!file)return '';
      const video=document.createElement('video');
      video.muted=true; video.playsInline=true; video.preload='metadata';
      const url=URL.createObjectURL(file); video.src=url;
      await new Promise((resolve,reject)=>{
        let done=false; const finish=(fn)=>{if(done)return;done=true;video.removeEventListener('loadedmetadata',ok);video.removeEventListener('loadeddata',ok);video.removeEventListener('error',bad);fn();};
        const ok=()=>finish(resolve); const bad=()=>finish(()=>reject(new Error('thumbnail video error')));
        video.addEventListener('loadedmetadata',ok); video.addEventListener('loadeddata',ok); video.addEventListener('error',bad);
        setTimeout(()=>finish(()=>reject(new Error('thumbnail timeout'))),7000);
      });
      const duration=Number(video.duration)||Number(entry.duration)||0;
      const wanted=Number(entry.timestamps?.banner??entry.result?.timestamps?.banner??(duration>0?Math.max(0,duration-1):0));
      await new Promise(resolve=>{
        let done=false; const finish=()=>{if(done)return;done=true;resolve();};
        video.addEventListener('seeked',finish,{once:true}); video.currentTime=Math.max(0,Math.min(wanted,Math.max(0,duration-.05))); setTimeout(finish,1800);
      });
      const w=960, h=Math.max(1,Math.round((video.videoHeight||540)*w/Math.max(1,video.videoWidth||960)));
      const canvas=document.createElement('canvas'); canvas.width=Math.min(w,video.videoWidth||w); canvas.height=Math.min(540,video.videoHeight||h);
      const ctx=canvas.getContext('2d'); if(!ctx)throw new Error('canvas unavailable');
      ctx.drawImage(video,0,0,canvas.width,canvas.height);
      const data=canvas.toDataURL('image/jpeg',0.78);
      URL.revokeObjectURL(url); return data;
    }catch(err){ try{if(typeof url!=='undefined')URL.revokeObjectURL(url);}catch{} return ''; }
  }
  async function hydrateArchiveThumbnails(list){
    for(const entry of list){
      const img=document.querySelector(`img[data-thumb-id="${CSS.escape(entry.id)}"]`); if(!img||img.dataset.loaded==='1')continue;
      const src=await buildArchiveThumbnail(entry);
      if(src){img.src=src;img.dataset.loaded='1';img.classList.add('loaded');}
      else{const holder=img.parentElement;if(holder){img.remove();holder.textContent='POV';}}
    }
  }
  async function clearDB(token){
    assertDestructiveDeleteToken(token);
    const db=await openDB();
    return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});
  }
  function persistCurrentView(v){
    const view=views[v]?v:'archive';
    try{sessionStorage.setItem('grandrp_current_view',view);localStorage.setItem('grandrp_current_view',view);}catch{}
    try{
      if(location.hash!==`#${view}`) location.hash=view;
    }catch{
      try{history.replaceState(null,'',`${location.pathname}${location.search}#${view}`);}catch{}
    }
  }
  function restoreSavedView(){
    let saved='';
    try{saved=String(location.hash||'').replace(/^#/,'').trim();}catch{}
    if(!saved){try{saved=localStorage.getItem('grandrp_current_view')||sessionStorage.getItem('grandrp_current_view')||document.documentElement.dataset.initialView||'';}catch{}}
    if(saved&&views[saved])showView(saved,false); else showView('archive',false);
    if(saved&&views[saved])persistCurrentView(saved);
  }
  function showView(v,persist=true){
    if(!views[v])v='archive';
    $$('.view').forEach(x=>x.classList.remove('active'));
    $('#view-'+v)?.classList.add('active');
    $$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===v));
    if($('#pageTitle'))$('#pageTitle').textContent=views[v][0];
    if($('#pageSubtitle'))$('#pageSubtitle').textContent=views[v][1];
    if(persist)persistCurrentView(v);
    if(v==='archive')renderArchive();
    if(v==='cases')renderCases();
    if(v==='csv')renderCsv();
  }
  function duplicateIdMap(entries=state.entries){const map=new Map();for(const e of entries){const id=String(e?.targetId||'').trim();if(/^\d{1,6}$/.test(id))map.set(id,(map.get(id)||0)+1);}return map;}
  function duplicateIdCount(entries=state.entries){let n=0;for(const count of duplicateIdMap(entries).values())if(count>1)n++;return n;}
  function isDuplicateId(entry){const id=String(entry?.targetId||'').trim();return /^\d{1,6}$/.test(id)&&Number(duplicateIdMap().get(id)||0)>1;}
  function updateCounts(){const all=state.entries;const normal=all.filter(e=>!e.permaArchive);const count=k=>normal.filter(e=>e.types?.includes(k)).length;$('#countAll').textContent=normal.length;$('#countBan').textContent=normal.filter(e=>!e.notBanned).length;$('#countPc').textContent=count('pccheck');$('#countSoc').textContent=count('socban');$('#countHard').textContent=count('hardban');$('#countCheat').textContent=count('cheater');$('#countNeg').textContent=count('negativ');$('#countNoVideo').textContent=normal.filter(e=>!e.videoStored).length;$('#countPerma').textContent=all.filter(e=>e.permaArchive).length;if($('#countDuplicates'))$('#countDuplicates').textContent=String(duplicateIdCount(all));}
  function renderArchive(){
    updateCounts();
    const q=($('#search').value||'').toLowerCase().trim();const filter=state.filter;
    const list=state.entries.filter(e=>{
      if(filter==='permaarchive' && !e.permaArchive)return false;
      if(filter==='all' && e.permaArchive)return false;
      if(filter==='duplicates' && !isDuplicateId(e))return false;
      if(filter==='ban'&&e.notBanned)return false;
      if(filter!=='all'&&filter!=='permaarchive'&&filter!=='ban'&&filter!=='duplicates'&&!e.types?.includes(filter))return false;
      if(filter==='novideo'&&e.videoStored)return false;
      if(!q)return true;
      return [e.targetId,e.sc,e.reason,e.manualResult,e.server,e.proof].some(v=>String(v||'').toLowerCase().includes(q));
    });
    state.archiveSelected=new Set([...state.archiveSelected].filter(id=>list.some(e=>e.id===id)));
    const bulk=$('#archiveBulkBar');if(bulk){bulk.classList.toggle('hidden',!list.length);const c=$('#archiveSelectedCount');if(c)c.textContent=String(state.archiveSelected.size);const csvBtn=$('#archiveCsvBtn');if(csvBtn)csvBtn.classList.toggle('hidden',filter!=='permaarchive');}
    const grid=$('#archiveGrid');
    grid.innerHTML=list.map(e=>{const duplicate=isDuplicateId(e);return `<article class="card ${duplicate?'duplicate-id':''}"><div class="thumb archive-thumb" data-thumb-id="${esc(e.id)}">${e.videoStored?`<img alt="POV Vorschau" loading="lazy" data-thumb-id="${esc(e.id)}">`:'OHNE VIDEO'}</div><div class="card-top"><span class="pill">#${esc(String(e.id).slice(-6))}</span><span class="pill ${e.complete?'good':'warn'}">${e.complete?'Vollständig':'Prüfen'}</span>${duplicate?'<span class="pill duplicate-tag">DOPPELTE ID</span>':''}${e.permaArchive?'<span class="pill perma-tag">POV ARCHIV</span>':''}</div><div class="card-body"><div class="card-title">${esc(e.reason||'Unbekannter Grund')}</div><div class="meta"><div><span>ID</span>${esc(e.targetId||'')}</div><div class="rid-cell"><span>SOC</span>${esc(e.sc||'')}</div><div><span>Server</span>${esc(e.server||'')}</div><div><span>Datum</span>${esc(formatDateDE(e.date)||'')}</div>${e.sourceSize?`<div><span>Dateigröße</span>${esc(formatSize(e.sourceSize))}<small class="size-bytes">${esc(formatBytesExact(e.sourceSize))}</small></div>`:''}<div><span>Ergebnis</span>${esc(e.manualResult||'')}</div><div><span>Grund</span>${esc(e.reason||'')}</div></div></div><div class="card-actions"><label class="archive-select"><input type="checkbox" data-archive-select="${esc(e.id)}" ${state.archiveSelected.has(e.id)?'checked':''}><span>Auswählen</span></label><button type="button" class="mini" data-action="open" data-id="${esc(e.id)}">Prüfen</button>${e.youtube?.url||e.proof?`<button type="button" class="mini primary" data-action="youtube" data-url="${esc(e.youtube?.url||e.proof)}">POV öffnen</button>`:''}<button type="button" class="mini ${e.permaArchive?'danger':''}" data-action="perma" data-id="${esc(e.id)}">${e.permaArchive?'Aus Archiv':'POV-Archiv'}</button><button type="button" class="mini danger" data-action="delete" data-id="${esc(e.id)}">Löschen</button></div></article>`}).join('');
    $('#emptyState').classList.toggle('hidden',list.length>0);
    void hydrateArchiveThumbnails(list);
    grid.onclick=async ev=>{
      const sel=ev.target.closest('[data-archive-select]');
      if(sel){if(sel.checked)state.archiveSelected.add(sel.dataset.archiveSelect);else state.archiveSelected.delete(sel.dataset.archiveSelect);const c=$('#archiveSelectedCount');if(c)c.textContent=String(state.archiveSelected.size);return;}
      const b=ev.target.closest('button[data-action]');if(!b)return;const id=b.dataset.id;const e=state.entries.find(x=>x.id===id);if(!e)return;const action=b.dataset.action;
      if(action==='open'){await openEditorFromEntry(e,{});}
      else if(action==='youtube'){const url=String(b.dataset.url||'').trim();if(!url)return;try{const w=window.open(url,'_blank');if(w){try{w.opener=null;}catch{}}else{window.location.href=url;}}catch(err){console.warn('POV öffnen fehlgeschlagen',err);window.location.href=url;}}
      else if(action==='perma'){
        if(!e.permaArchive){
          e.permaArchive=true;
          try{
            const placement=readArchivePlacement();
            placement[String(e.id)]=true;
            localStorage.setItem(ARCHIVE_PLACEMENT_KEY,JSON.stringify(placement));
          }catch(err){console.warn('POV-Archiv-Platzierung konnte nicht gespeichert werden',err);}
          saveMeta();renderArchive();renderCsv();
          toast('POV ins POV-Archiv verschoben.');
        }
      }
      else if(action==='delete'){if(!confirm(`POV „${e.finalName||e.originalName||e.id}“ aus dem Archiv löschen?

Das YouTube-Video wird NICHT gelöscht.`))return;try{await delVideo(e.id,DESTRUCTIVE_TOKEN);state.entries=state.entries.filter(x=>x.id!==e.id);state.archiveSelected.delete(e.id);saveMeta({allowEmpty:state.entries.length===0,explicitDelete:true});renderArchive();renderCases();renderCsv();toast('POV aus dem Archiv gelöscht. YouTube bleibt erhalten.');}catch(err){console.error(err);toast('Löschen fehlgeschlagen: '+(err?.message||err));}}
    };
  }
  function setupArchiveBulk(){
    $('#archiveSelectAll')?.addEventListener('click',()=>{const ids=[...document.querySelectorAll('[data-archive-select]')].map(x=>x.dataset.archiveSelect);ids.forEach(id=>state.archiveSelected.add(id));renderArchive();});
    $('#archiveClearSelection')?.addEventListener('click',()=>{state.archiveSelected.clear();renderArchive();});
    $('#archiveBulkPerma')?.addEventListener('click',()=>{const ids=[...state.archiveSelected];if(!ids.length){toast('Keine POVs ausgewählt.');return;}let n=0;const placement=readArchivePlacement();for(const e of state.entries){if(ids.includes(e.id)&&!e.permaArchive){e.permaArchive=true;placement[String(e.id)]=true;n++;}}try{localStorage.setItem(ARCHIVE_PLACEMENT_KEY,JSON.stringify(placement));}catch{}state.archiveSelected.clear();saveMeta();renderArchive();renderCsv();toast(`${n} POV(s) ins Archiv verschoben.`);});
  }
  function renderCases(){const cases=state.entries.filter(e=>!e.complete);const box=$('#casesList');box.innerHTML=cases.length?cases.map(e=>`<div class="case-row"><div><strong>${esc(e.originalName)}</strong><small>${esc(e.missing.join(' · ')||'Prüfung nötig')}</small></div><button type="button" class="mini" data-action="case-open" data-id="${esc(e.id)}">Prüfen</button></div>`).join(''):'<div class="empty"><div class="empty-icon">✓</div><h2>Keine offenen Fälle</h2><p>Alle gespeicherten Fälle haben die Pflichtangaben.</p></div>';box.onclick=async ev=>{const b=ev.target.closest('[data-action="case-open"]');if(!b)return;const e=state.entries.find(x=>x.id===b.dataset.id);if(e){await openEditorFromEntry(e,{});}};}
  function isPermaBanValue(v){
    if(v===true||v===1)return true;
    if(typeof v==='string'){const n=v.trim().toLowerCase();return ['true','1','yes','ja','perma','perma-ban','permaban'].includes(n);}
    return false;
  }
  function csvRowsBase(entries=state.entries){return entries.filter(e=>e.saved&&!isPermaBanValue(e.permaArchive)).map(e=>{const admins=Array.isArray(e.pcCheckers)?e.pcCheckers.slice(0,5):[];return {_id:e.id,Proof:e.proof||'',Datum:formatDateDE(e.date),ID:e.targetId||'',SOC:e.sc||'',RID:'',DiscordID:'',Familie:'',Ergebnis:e.manualResult||'',Grund:e.reason||'',Perma:isPermaBanValue(e.perma),PermaArchiv:isPermaBanValue(e.permaArchive),Admin1:admins[0]||'',Admin2:admins[1]||'',Admin3:admins[2]||'',Admin4:admins[3]||'',Admin5:admins[4]||''};});}
  function csvRowsArchiveBase(){return state.entries.filter(e=>e.saved&&isPermaBanValue(e.permaArchive)).map(e=>{const admins=Array.isArray(e.pcCheckers)?e.pcCheckers.slice(0,5):[];return {_id:e.id,Proof:e.proof||'',Datum:formatDateDE(e.date),ID:e.targetId||'',SOC:e.sc||'',RID:'',DiscordID:'',Familie:'',Ergebnis:e.manualResult||'',Grund:e.reason||'',Perma:isPermaBanValue(e.perma),PermaArchiv:true,Admin1:admins[0]||'',Admin2:admins[1]||'',Admin3:admins[2]||'',Admin4:admins[3]||'',Admin5:admins[4]||''};});}
  function csvRowsPermaBase(){return csvRowsArchiveBase();}
  function csvRows(){const q=(($('#csvFilterSearch')?.value)||'').toLowerCase().trim();const reason=(($('#csvFilterReason')?.value)||'all');const sc=(($('#csvFilterSc')?.value)||'all');const perma=(($('#csvFilterPerma')?.value)||'all');return csvRowsBase().filter(r=>{if(reason!=='all'&&r.Grund!==reason)return false;if(sc==='present'&&!r.SOC)return false;if(sc==='empty'&&r.SOC)return false;if(perma==='yes'&&r.Perma!==true)return false;if(perma==='no'&&r.Perma===true)return false;if(q&&!([r.Proof,r.Datum,r.ID,r.SOC,r.Ergebnis,r.Grund].some(v=>String(v||'').toLowerCase().includes(q))))return false;return true;});}

  function renderCsv(){
    const all=csvRowsBase();
    const rows=csvRows();
    const perma=csvRowsPermaBase();
    const summary=$('#csvSummary');
    if(summary)summary.textContent=`${rows.length} von ${all.length} Einträgen · ${perma.length} Perma-Archiv`;
    const body=$('#csvPreviewBody');
    if(!body)return;
    body.innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.Proof)}</td><td>${esc(r.Datum)}</td><td>${esc(r.ID)}</td><td>${esc(r.SOC)}</td><td>${esc(r.RID)}</td><td>${esc(r.DiscordID)}</td><td>${esc(r.Familie)}</td><td>${esc(r.Ergebnis)}</td><td>${esc(r.Grund)}</td><td>${esc(r.Admin1)}</td><td>${esc(r.Admin2)}</td><td>${esc(r.Admin3)}</td><td>${esc(r.Admin4)}</td><td>${esc(r.Admin5)}</td><td><button type="button" class="mini" data-csv-open="${esc(r._id)}">Bearbeiten</button></td></tr>`).join(''):'<tr><td colspan=15 class="csv-empty">Keine Einträge passen zum Filter.</td></tr>';
    body.onclick=async ev=>{
      const b=ev.target.closest('[data-csv-open]');
      if(!b)return;
      const entry=state.entries.find(e=>e.id===b.dataset.csvOpen);
      if(entry)await openEditorFromEntry(entry,{});
    };
    $('#csvEmpty')?.classList.toggle('hidden',all.length>0);
  }


  function csvTextFromRows(rows){
    const header=['Proof','Datum','ID','SOC','RID','Discord ID','Familie','Ergebnis','Grund','Admin 1','Admin 2','Admin 3','Admin 4','Admin 5'];
    const line=values=>values.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';');
    const safeRows=Array.isArray(rows)?rows:[];
    return '\uFEFF'+[line(header),...safeRows.map(r=>line([
      r.Proof,r.Datum,r.ID,r.SOC,r.RID,r.DiscordID,r.Familie,r.Ergebnis,r.Grund,
      r.Admin1,r.Admin2,r.Admin3,r.Admin4,r.Admin5
    ]))].join('\r\n');
  }
  function downloadCsv(){
    try{
      const rows=csvRows();
      if(!rows.length){toast('Keine CSV-Einträge für den aktuellen Filter.');return false;}
      const blob=new Blob([csvTextFromRows(rows)],{type:'text/csv;charset=utf-8'});
      const ok=triggerBrowserDownload(blob,`grandrp_bans-${new Date().toISOString().slice(0,10)}.csv`);
      if(ok)toast(`${rows.length} CSV-Einträge exportiert.`);
      return ok;
    }catch(err){console.error('CSV-Download fehlgeschlagen',err);toast('CSV-Download fehlgeschlagen: '+(err?.message||err));return false;}
  }
  function downloadArchiveCsv(){
    try{
      const rows=csvRowsArchiveBase();
      if(!rows.length){toast('Keine POVs im POV-Archiv vorhanden.');return false;}
      const blob=new Blob([csvTextFromRows(rows)],{type:'text/csv;charset=utf-8'});
      const ok=triggerBrowserDownload(blob,`grandrp_pov-archiv-${new Date().toISOString().slice(0,10)}.csv`);
      if(ok)toast(`${rows.length} POV-Archiv-Einträge exportiert.`);
      return ok;
    }catch(err){console.error('POV-Archiv-CSV-Download fehlgeschlagen',err);toast('POV-Archiv-CSV-Download fehlgeschlagen: '+(err?.message||err));return false;}
  }
  function downloadPermaCsv(){
    try{
      const rows=csvRowsBase().filter(r=>r.Perma===true);
      if(!rows.length){toast('Keine Perma-Ban-Einträge vorhanden.');return false;}
      const blob=new Blob([csvTextFromRows(rows)],{type:'text/csv;charset=utf-8'});
      const ok=triggerBrowserDownload(blob,`grandrp_perma-bans-${new Date().toISOString().slice(0,10)}.csv`);
      if(ok)toast(`${rows.length} Perma-Ban-Einträge exportiert.`);
      return ok;
    }catch(err){console.error('Perma-CSV-Download fehlgeschlagen',err);toast('Perma-CSV-Download fehlgeschlagen: '+(err?.message||err));return false;}
  }
  async function copyCsv(){
    try{
      const text=csvTextFromRows(csvRows());
      if(!text || text.split('\r\n').length<2){toast('Keine CSV-Einträge für den aktuellen Filter.');return false;}
      if(navigator.clipboard?.writeText){
        await navigator.clipboard.writeText(text);
      }else{
        const area=document.createElement('textarea');
        area.value=text;area.setAttribute('readonly','');area.style.position='fixed';area.style.left='-99999px';
        document.body.appendChild(area);area.select();
        const ok=document.execCommand('copy');area.remove();
        if(!ok)throw new Error('Kopieren ist in diesem Browser nicht verfügbar.');
      }
      toast('CSV in die Zwischenablage kopiert.');
      return true;
    }catch(err){console.error('CSV-Kopieren fehlgeschlagen',err);toast('CSV-Kopieren nicht verfügbar.');return false;}
  }


  let navDelegationInstalled=false;
  function installNavDelegation(){
    if(navDelegationInstalled)return;
    navDelegationInstalled=true;
    document.addEventListener('click',ev=>{
      const b=ev.target?.closest?.('.nav-item');
      if(!b)return;
      const view=b.dataset.view;
      if(!view)return;
      ev.preventDefault();
      try{showView(view);}catch(err){console.error('Navigation failed',err);}
    });
  }
  function setupNav(){
    installNavDelegation();
    setupArchiveBulk();
    $$('.nav-item').forEach(b=>b.addEventListener('click',e=>{e.preventDefault();showView(b.dataset.view);}));
    $('#headerUploadBtn')?.addEventListener('click',()=>showView('upload'));
    $('#emptyUploadBtn')?.addEventListener('click',()=>showView('upload'));
    $('#headerCsvBtn')?.addEventListener('click',()=>showView('csv'));
    $('#reloadBtn')?.addEventListener('click',()=>renderArchive());
    $('#casesRefresh')?.addEventListener('click',renderCases);
    $('#search')?.addEventListener('input',renderArchive);
    $('#refreshCsvBtn')?.addEventListener('click',renderCsv);
    $('#downloadCsvBtn')?.addEventListener('click',downloadCsv);
    $('#archiveCsvBtn')?.addEventListener('click',downloadArchiveCsv);
    $('#downloadPermaCsvBtn')?.addEventListener('click',downloadPermaCsv);
    $('#copyCsvBtn')?.addEventListener('click',copyCsv);
    ['#csvFilterSearch','#csvFilterReason','#csvFilterSc','#csvFilterPerma'].forEach(s=>{
      const el=$(s);
      if(!el)return;
      el.addEventListener(el.tagName==='SELECT'?'change':'input',renderCsv);
      if(s==='#csvFilterPerma')el.addEventListener('input',renderCsv);
    });
    $('#csvFilterClear')?.addEventListener('click',()=>{
      if($('#csvFilterSearch'))$('#csvFilterSearch').value='';
      if($('#csvFilterReason'))$('#csvFilterReason').value='all';
      if($('#csvFilterSc'))$('#csvFilterSc').value='all';
      if($('#csvFilterPerma'))$('#csvFilterPerma').value='all';
      if($('#csvFilterDiscord'))$('#csvFilterDiscord').value='all';
      renderCsv();
    });
    $$('.filter').forEach(b=>b.addEventListener('click',()=>{
      state.filter=b.dataset.filter;
      $$('.filter').forEach(x=>x.classList.toggle('active',x===b));
      renderArchive();
    }));
    restoreSavedView();
  }


  const dropzone=$('#dropzone'), input=$('#fileInput');
  function setupUpload(){
    $('#chooseBtn').onclick=e=>{e.stopPropagation();input.click();};dropzone.onclick=e=>{if(!e.target.closest('button'))input.click();};input.onchange=e=>{addFiles([...e.target.files]);input.value='';};
    ['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag');}));
    ['dragleave','drop'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag');}));
    dropzone.addEventListener('drop',e=>addFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/i.test(f.name))));
  }
  async function addFiles(files){
    const pending=[];
    for(const file of files){
      const item={id:crypto.randomUUID(),file,status:'Upload wartet',progress:0,result:null,manualResult:'',processing:false,uploading:false,ocrProcessing:false,editingDone:false,youtube:null,youtubeConnectionSlot:0,uploadStarted:false,uploadFailed:false,cancelled:false,youtubeLimitBlocked:false};
      state.queue.push(item);
      pending.push(item);
    }
    renderQueue();
    for(const item of pending){
      try{
        await putVideo(item.id,item.file);
      }catch(err){
        item.status='Fehler: Lokale Speicherung fehlgeschlagen: '+(err?.message||err);
        item.uploadFailed=true;
        item.uploadStarted=true;
        renderQueue();
      }
    }
    scheduleQueuePersist();
    renderQueue();
    await pumpUploads();
  }
  function isYoutubeUploadLimitError(err){
    const m=String(err?.message||err||'').toLowerCase();
    return /uploadlimitexceeded|exceeded the number of videos they may upload|number of videos they may upload/.test(m);
  }
  function isYoutubeQuotaError(err){
    if(err?.code==='YT_QUOTA_429')return true;
    const m=String(err?.message||err||'').toLowerCase();
    return /ratelimitexceeded|quota exceeded|video uploads.*per day|video uploads|resource_exhausted/.test(m) && /429|quota|video uploads|ratelimitexceeded|resource_exhausted/.test(m);
  }
  function youtubeRetryAt(){
    const n=Number(localStorage.getItem(YT_RETRY_KEY)||0);
    return Number.isFinite(n)&&n>0?n:0;
  }
  function formatRetryClock(ms){
    const sec=Math.max(0,Math.ceil(ms/1000));
    const m=Math.floor(sec/60), s=sec%60;
    return `${m}:${String(s).padStart(2,'0')}`;
  }
  function clearYoutubeRetryTimer(){if(youtubeRetryTimer){clearTimeout(youtubeRetryTimer);youtubeRetryTimer=0;}}
  function scheduleYoutubeRetryAt(at){
    clearTimeout(youtubeRetryTimer);
    const target=Math.max(Date.now()+1000,Number(at)||Date.now()+YT_RETRY_DELAY_MS);
    localStorage.setItem(YT_RETRY_KEY,String(target));
    const tick=()=>{
      const left=target-Date.now();
      clearExpiredYoutubeConnectionBlocks();
      if(left<=0){
        localStorage.removeItem(YT_RETRY_KEY);
        youtubeRetryTimer=0;
        clearExpiredYoutubeConnectionBlocks();
        for(const item of state.queue){
          if(item.cancelled||item.editingDone||item.status==='Gespeichert')continue;
          if(item.status?.startsWith('YouTube-Limit')||item.status?.startsWith('YouTube-Verbindungen')){
            item.uploadStarted=false;item.uploadFailed=false;item.processing=false;item.uploading=false;
            if(!item.youtube)item.status='Upload wartet · YouTube-Verbindung erneut versuchen';
          }
        }
        renderQueue();
        void pumpUploads();
        return;
      }
      renderYoutubeConnections();
      for(const item of state.queue){
        if(item.cancelled||item.editingDone||item.status==='Gespeichert')continue;
        if(!item.youtube&& (item.status?.startsWith('YouTube-Limit')||item.status?.startsWith('YouTube-Verbindungen'))){
          item.status=`YouTube-Verbindungen warten · Retry in ${formatRetryClock(left)}`;
        }
      }
      renderQueue();
      youtubeRetryTimer=setTimeout(tick,Math.min(30000,left));
    };
    tick();
  }
  function scheduleYoutubeRetry30(){scheduleYoutubeRetryAt(earliestYoutubeRetry()||Date.now()+YT_RETRY_DELAY_MS);}
  async function retryQueueItem(item){
    if(!item||item.processing)return;
    if(item.youtube){await retryLocalOCR(item);return;}
    item.youtubeLimitBlocked=false;
    item.status='Upload wartet · neuer Versuch';item.progress=0;item.processing=false;item.uploading=false;item.uploadStarted=false;item.uploadFailed=false;renderQueue();await pumpUploads();
  }
  async function runLocalOnlyOcr(item){
    if(!item||item.ocrProcessing)return;
    item.ocrProcessing=true;item.processing=true;item.uploading=false;item.status='YouTube-Limit erreicht · lokale OCR läuft';item.progress=5;renderQueue();
    let media=null;
    try{
      const sourceSize=await verifyLocalFile(item.file,0,'Lokale OCR-Quelle');
      await putVideo(item.id,item.file);
      const storedCopy=await getVideo(item.id);
      if(!storedCopy)throw new Error('Lokale Kopie der POV konnte nicht gespeichert werden.');
      if(Number(storedCopy.size)!==sourceSize)throw new Error(`Lokale Speicherung beschädigt: Quelle ${formatBytesExact(sourceSize)} · Archiv ${formatBytesExact(storedCopy.size)}.`);
      media=await openLocalVideo(item.file,`POV ${item.file.name}`,storedCopy);
      item.result=await analyzeVideo(media.video,p=>{item.progress=5+Math.round(p*.95);item.status=`YouTube-Limit · lokale OCR ${p}%`;renderQueue();},item.file.name,()=>item.cancelled);
      item.result.originalName=item.file.name;item.result.sourceSize=sourceSize;item.result.remoteSize=0;item.result.sourceType=item.file.type||'video/mp4';item.result.types=[];item.result.proof='';item.result.youtube=null;
      item.youtube=null;item.uploadFailed=true;item.uploadStarted=true;item.status=item.result.complete?'YouTube-Limit · OCR fertig · YouTube später erneut':'YouTube-Limit · OCR unvollständig · Prüfung nötig';item.progress=100;renderQueue();
      if(isQueueItemAlive(item)&&!state.editing)openEditor(item);
    }catch(err){
      item.status='Fehler: '+(err?.message||err);item.progress=0;item.uploadFailed=true;item.uploadStarted=true;renderQueue();
    }finally{
      closeLocalVideo(media);item.processing=false;item.ocrProcessing=false;renderQueue();
    }
  }
  async function pumpLocalFallbackQueue(){
    if(state.localFallbackRunner)return;
    state.localFallbackRunner=true;
    try{
      for(const item of state.queue.filter(i=>!i.uploadStarted&&!i.uploadFailed&&!i.editingDone&&i.status!=='Gespeichert'&&!i.youtube)){
        if(item.processing)continue;
        item.youtubeLimitBlocked=true;
        item.uploadStarted=true;
        await runLocalOnlyOcr(item);
      }
    }finally{
      state.localFallbackRunner=false;
      renderQueue();
    }
  }
  function renderQueue(){
    scheduleQueuePersist();const q=$('#uploadQueue');if(!q)return;const active=document.activeElement;const activeId=active?.matches?.('[data-queue-result]')?active.dataset.id:'';const activeValue=activeId?active.value:'';const aStart=activeId?Number(active.selectionStart||activeValue.length):0;const aEnd=activeId?Number(active.selectionEnd||activeValue.length):0;
    $('#queueCount').textContent=`${state.queue.length} ${state.queue.length===1?'Datei':'Dateien'}`;
    q.innerHTML=state.queue.map(item=>{const fileName=item.finalName||item.file?.name||'POV';const fileSize=Number(item.file?.size||item.result?.sourceSize||item.sourceSize||0);const hasError=/^Fehler:/i.test(item.status||'');const retry=(!item.uploading&&!item.ocrProcessing&&((!!item.youtube&&!item.result)||hasError));const canAct=!!item.result&&!item.uploading&&!item.processing&&!item.ocrProcessing;const label=item.youtube?'OCR erneut':'Erneut hochladen';const resultValue=String(item.manualResult||item.result?.manualResult||'');return `<div class="queue-item ${hasError?'has-error':''}"><div class="queue-icon">▶</div><div class="queue-name"><strong>${esc(fileName)}</strong><small>${fileSize?formatSize(fileSize)+' · ':''}${esc(item.status||'Wartet')}</small><div class="queue-result-row"><label>Ergebnis</label><input type="text" class="queue-result-input" data-queue-result data-id="${esc(item.id)}" value="${esc(resultValue)}" placeholder="Ergebnis manuell eintragen"></div><div class="progress"><i style="width:${Number(item.progress)||0}%"></i></div></div><div class="queue-actions">${item.result?`<button type="button" class="mini" data-action="check" data-id="${esc(item.id)}" ${canAct?'':'disabled'}>Prüfen</button><button type="button" class="mini primary" data-action="next" data-id="${esc(item.id)}" ${canAct?'':'disabled'}>Nächste POV</button>`:''}${retry?`<button type="button" class="mini primary" data-action="retry" data-id="${esc(item.id)}">${label}</button>`:''}<button type="button" class="mini" data-action="remove" data-id="${esc(item.id)}">×</button></div></div>`;}).join('');
    $$('[data-queue-result]').forEach(inp=>inp.addEventListener('input',()=>{const x=state.queue.find(i=>i.id===inp.dataset.id);if(!x)return;x.manualResult=String(inp.value||'').trim();if(x.result)x.result.manualResult=x.manualResult;scheduleQueuePersist();}));
    if(activeId){const restored=document.querySelector(`[data-queue-result][data-id="${CSS.escape(activeId)}"]`);if(restored){restored.value=activeValue;restored.focus();try{restored.setSelectionRange(aStart,aEnd);}catch{}}}
    q.onclick=async e=>{const btn=e.target.closest('button[data-action]');if(!btn||!q.contains(btn))return;const id=btn.dataset.id;const x=state.queue.find(i=>i.id===id);if(!x)return;const action=btn.dataset.action;if(action==='check'){if(!x.result){toast('Für diese POV liegen noch keine OCR-Ergebnisse vor.');return;}openEditor(x);setTimeout(()=>{if(state.editing?.item?.id!==x.id)return;const target=clampId(x.result?.targetId||x.targetId||'');if(!/^\d{1,6}$/.test(target)){toast('Zuerst eine gültige Ziel-ID erkennen/eintragen.');return;}if(normalizeHexLoose(x.result?.sc||x.sc||'').length===40)openAcpReasonForCurrentId();else startAcpSequence();},80);return;}if(action==='next'){if(x.uploading){toast('YouTube-Upload läuft noch.');return;}if(x.processing||x.ocrProcessing){toast('Die POV wird noch verarbeitet. Bitte kurz warten.');return;}await nextQueueItem(id);return;}if(action==='retry'){await retryQueueItem(x);return;}if(action==='remove'){if(x.uploading){toast('YouTube-Upload läuft noch.');return;}x.cancelled=true;x.editingDone=true;x.ocrProcessing=false;x.processing=false;try{await delVideo(x.id,DESTRUCTIVE_TOKEN);}catch{}state.queue=state.queue.filter(i=>i.id!==id);persistQueueNow();renderQueue();toast('POV aus der Warteschlange entfernt. OCR wurde gestoppt.');}};
  }
  async function retryLocalOCR(item){
    if(item.processing||item.cancelled)return;
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
      item.result=await analyzeVideo(media.video,p=>{item.progress=60+Math.round(p*.40);item.status=`OCR ${p}% · erneuter Versuch`;renderQueue();},file.name,()=>item.cancelled);
      item.result.originalName=file.name;item.result.sourceSize=sourceSize;item.result.remoteSize=Number(item.result.remoteSize||item.youtube?.remoteSize||0);item.result.sourceType=file.type||'video/mp4';item.result.types=[];item.result.proof=item.youtube?.url||item.result.proof||'';item.result.youtube=item.youtube||item.result.youtube;
      item.status=item.result.complete?`OCR fertig · Prüfung offen`:'OCR unvollständig · Prüfung nötig';item.progress=100;renderQueue();if(isQueueItemAlive(item)){if(!state.editing)openEditor(item);else{item.status+=' · Prüfung wartet';renderQueue();}}
    }catch(err){item.status=item.cancelled?'Aus Warteschlange entfernt':'Fehler: '+(err?.message||err);item.progress=0;renderQueue();}finally{closeLocalVideo(media);item.processing=false;renderQueue();}
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
  async function ensureFastWorker(){
    if(state.fastWorker)return state.fastWorker;
    if(!window.Tesseract)throw new Error('Tesseract konnte nicht geladen werden. Bitte Internetverbindung prüfen.');
    state.fastWorker=await Tesseract.createWorker('eng');
    await state.fastWorker.setParameters({preserve_interword_spaces:'1',tessedit_pageseg_mode:'6'});
    return state.fastWorker;
  }
  const OCR_PARAM_CACHE=new WeakMap();
  async function ocr(worker,canvas,opts={}){
    // Keep Tesseract settings cached per worker. setParameters() is expensive and was
    // previously executed for every single frame, which caused OCR throughput to collapse
    // as a short POV progressed.
    const p={tessedit_pageseg_mode:String(opts.psm||6)};
    if(opts.whitelist) p.tessedit_char_whitelist=String(opts.whitelist);
    else p.tessedit_char_whitelist='';
    if(opts.numeric) p.classify_bln_numeric_mode='1';
    else p.classify_bln_numeric_mode='0';
    if(opts.nodict) {p.load_system_dawg='0';p.load_freq_dawg='0';p.tessedit_enable_dict_correction='0';}
    else {p.load_system_dawg='1';p.load_freq_dawg='1';p.tessedit_enable_dict_correction='1';}
    const key=JSON.stringify(p);
    if(OCR_PARAM_CACHE.get(worker)!==key){
      await worker.setParameters(p);
      OCR_PARAM_CACHE.set(worker,key);
    }
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
  // Unified Grand-RP chat ROI. It intentionally covers the COMPLETE upper-left
  // chat but stops before the right HUD/player list. All automatic and manual OCR uses
  // the same geometry so there is no mismatch between detection and the preview.
  const CHAT_ROI={x:0.00,y:0.00,w:0.82,h:0.60};
  const FAST_BAN_ROI=CHAT_ROI;
  const PHOTO_ROI={x:0.00,y:0.00,w:0.84,h:0.60};

  function makeOcrChatCrop(video,scale=2.6){
    return makeCrop(video,CHAT_ROI.x,CHAT_ROI.y,CHAT_ROI.w,CHAT_ROI.h,scale);
  }
  async function readBanFast(worker,video){
    const chat=makeOcrChatCrop(video,2.2);
    try{
      const variants=[
        grayCanvas(enhancedCanvas(chat,1.50,1.03)),
        orangeMask(chat)
      ];
      const texts=[];
      for(const img of variants){
        try{const r=await ocr(worker,img,{psm:6,nodict:true});if(r?.text)texts.push(cleanText(r.text));}
        finally{clearCanvas(img);}
        if(extractBanEvent(texts.join('\n')))break;
      }
      const merged=[...new Set(texts.filter(Boolean))].join('\n');
      return {text:merged,ban:extractBanEvent(merged),sharp:sharpness(chat)};
    }finally{clearCanvas(chat);}
  }
  async function readBanProbeCanvas(worker,chat){
    try{
      // Single inexpensive colored-text pass. Precision OCR only runs after a signal.
      const mask=orangeMask(chat);
      const r=await ocr(worker,mask,{psm:6,nodict:true});
      const text=cleanText(r?.text||'');
      const ban=extractBanEvent(text);
      clearCanvas(mask);
      return {text,ban,signal:!!ban||/adam|byers|15340|administrator|\bhat\b|grund|gebannt|bann|pc[ -]?check|cheat/i.test(text),sharp:sharpness(chat)};
    }catch{ return {text:'',ban:null,signal:false,sharp:0}; }
  }
  async function readBanProbe(worker,video){
    const chat=makeOcrChatCrop(video,1.55);
    try{return await readBanProbeCanvas(worker,chat);}finally{clearCanvas(chat);}
  }
  const REASON_ROI={x:0.00,y:0.00,w:0.82,h:0.60};
  async function readReasonDirect(worker,video){
    const crop=makeCrop(video,REASON_ROI.x,REASON_ROI.y,REASON_ROI.w,REASON_ROI.h,3.25);
    const texts=[];const votes=new Map();
    try{
      const imgs=[
        [orangeMask(crop),6],[grayCanvas(enhancedCanvas(crop,1.60,1.04)),6],
        [grayCanvas(enhancedCanvas(crop,1.90,1.05)),11],[threshold(crop,150),11],
        [threshold(crop,175),12],[enhancedCanvas(crop,2.10,1.07),7]
      ];
      for(const [img,psm] of imgs){
        try{
          const r=await ocr(worker,img,{psm,nodict:true});
          const txt=cleanText(r?.text||'');
          if(txt)texts.push(txt);
          const rr=extractReasonStrict(txt)||parseReason(txt);
          if(rr)votes.set(rr,(votes.get(rr)||0)+1);
        }catch{} finally{clearCanvas(img);}
      }
      const merged=[...new Set(texts)].join('\n');
      const voteBest=[...votes.entries()].sort((a,b)=>b[1]-a[1])[0]?.[0]||'';
      return {reason:voteBest||extractReasonStrict(merged)||parseReason(merged),text:merged};
    }finally{clearCanvas(crop);}
  }
  async function readBanOnly(worker,video){
    const chat=makeOcrChatCrop(video,3.05);
    const texts=[];let best=null;
    const variants=[
      [orangeMask(chat),6],
      [grayCanvas(enhancedCanvas(chat,1.70,1.04)),6],
      [threshold(chat,150),11],
      [enhancedCanvas(chat,1.90,1.06),11]
    ];
    for(const [img,psm] of variants){
      try{
        const r=await ocr(worker,img,{psm,nodict:true});
        if(r?.text)texts.push(cleanText(r.text));
        if(r && (!best || ocrQuality(r)>ocrQuality(best)))best=r;
      }catch{}
      finally{clearCanvas(img);}
      const candidate=extractBanEvent(texts.join('\n'));
      if(candidate)break;
    }
    let merged=[...new Set(texts.filter(Boolean))].join('\n');
    let ban=extractBanEvent(merged);
    if(ban&&!ban.reason){
      try{const rr=await readReasonDirect(worker,video);if(rr.reason){ban.reason=rr.reason;ban.score=(ban.score||72)+12;merged += `\nGrund: ${rr.reason}`;}}catch{}
    }
    const sharp=sharpness(chat);
    clearCanvas(chat);
    return {text:merged,ban,sharp,data:best||{}};
  }
  async function fastSeek(v,t){
    try{await seek(v,t,2200);return true;}catch{try{v.pause();}catch{}try{await seek(v,t,3000);return true;}catch{return false;}}
  }
  function uniqueTimes(times){return [...new Set(times.map(t=>Math.max(0,Number(t)||0).toFixed(2)))].map(Number).sort((a,b)=>a-b);}

  // Highest priority: the last five seconds. The end-of-POV ban block is what the
  // user actually wants as the verification/photo anchor. Only when that window has
  // no verified Adam Byers [15340] ban do we fall back to the rest of the video.
  async function findVerifiedBanInLastFive(video,cancelCheck=()=>false,onProgress=()=>{}){
    if(!video||!Number.isFinite(video.duration)||video.duration<=0)return null;
    const worker=await ensureWorker();
    const end=Math.max(0,video.duration-.08), start=Math.max(0,end-5);
    // Keep the first pass light and report progress so the queue never appears frozen at 3%.
    const times=uniqueTimes(Array.from({length:7},(_,i)=>start+(end-start)*(i/6)));
    const hits=[];
    onProgress?.(3,`Bannbereich Schnellscan 0/${times.length}`);
    for(let i=0;i<times.length;i++){
      const t=times[i];
      if(cancelCheck())throw new Error('OCR abgebrochen: Fall wurde aus der Warteschlange entfernt.');
      if(!(await fastSeek(video,t)))continue;
      try{
        const read=await readBanFast(worker,video);
        const ban=read.ban||extractBanEvent(read.text);
        if(ban&&ban.adminId===BAN_ADMIN_ID&&ban.targetId)hits.push({time:t,ban,text:read.text,sharp:read.sharp||0});
      }catch{}
      onProgress?.(3+Math.round((i+1)/times.length*7),`Bannbereich Schnellscan ${i+1}/${times.length}`);
    }
    if(!hits.length){onProgress?.(10,'Bannbereich nicht gefunden · Gesamtscan wird gestartet');return null;}
    hits.sort((a,b)=>(b.ban.score-a.ban.score)||(b.sharp-a.sharp));
    const best=hits[0];
    const dense=uniqueTimes(Array.from({length:7},(_,i)=>Math.max(start,best.time-.6+i*.2)));
    const verified=[...hits];
    for(let i=0;i<dense.length;i++){
      const t=dense[i];
      if(cancelCheck())throw new Error('OCR abgebrochen: Fall wurde aus der Warteschlange entfernt.');
      if(!(await fastSeek(video,t)))continue;
      try{
        const read=await readBanOnly(worker,video);const ban=read.ban||extractBanEvent(read.text);
        if(ban&&ban.adminId===BAN_ADMIN_ID&&ban.targetId)verified.push({time:t,ban,text:read.text,sharp:read.sharp||0});
      }catch{}
      onProgress?.(10+Math.round((i+1)/dense.length*8),`Bannbereich Präzisionsscan ${i+1}/${dense.length}`);
    }
    verified.sort((a,b)=>(Number(!!b.ban.reason)-Number(!!a.ban.reason))||(b.ban.score-a.ban.score)||(b.sharp-a.sharp));
    const reasonCandidates=verified.slice(0,4);
    for(let i=0;i<reasonCandidates.length;i++){
      const candidate=reasonCandidates[i];
      if(candidate.ban.reason)continue;
      if(!(await fastSeek(video,candidate.time)))continue;
      try{
        const rr=await readReasonDirect(worker,video);
        if(rr.reason){candidate.ban.reason=rr.reason;candidate.ban.score+=12;candidate.text=(candidate.text||'')+'\nGrund: '+rr.reason;}
      }catch{}
      onProgress?.(18+Math.round((i+1)/Math.max(1,reasonCandidates.length)*7),`Banngrund Präzisionsprüfung ${i+1}/${reasonCandidates.length}`);
    }
    verified.sort((a,b)=>(Number(!!b.ban.reason)-Number(!!a.ban.reason))||(b.ban.score-a.ban.score)||(b.sharp-a.sharp));
    onProgress?.(25,verified[0]?.ban?.reason?'Banngrund erkannt':'Ban erkannt · Grund wird verifiziert');
    return verified[0]||best;
  }
    async function analyzeVideo(video,onProgress,originalName='',cancelCheck=()=>false){
    const worker=await ensureWorker();
    if(cancelCheck())throw new Error('OCR abgebrochen: Fall wurde aus der Warteschlange entfernt.');
    const duration=video.duration;
    if(!Number.isFinite(duration)||duration<=0)throw new Error('Videodauer konnte nicht bestimmt werden.');
    const date=dateFromFilename(originalName||'');

    // 1) ALWAYS check the last five seconds first. This is both faster and more reliable
    // for the final ban message used in the Info-Foto.
    onProgress?.(3,'Prüfe die letzten 5 Sekunden…');
    let anchor=await findVerifiedBanInLastFive(video,cancelCheck,(p,m)=>onProgress?.(p,m));

    // 2) If the final five seconds do not contain the ban, do a fast full-video candidate
    // scan. For short clips we sample every ~1.5s; for long clips we use a bounded number.
    if(!anchor){
      const times=[];
      if(duration<=120){
        for(let t=0;t<=duration-.05;t+=1.4)times.push(t);
      }else if(duration<=300){
        for(let t=0;t<=duration-.05;t+=2.0)times.push(t);
      }else{
        const count=Math.min(90,Math.max(36,Math.ceil(duration/6)));
        for(let i=0;i<count;i++)times.push(duration*(i/Math.max(1,count-1)));
      }
      const scan=uniqueTimes(times);const hits=[];
        for(let i=0;i<scan.length;i++){
        if(cancelCheck())throw new Error('OCR abgebrochen: Fall wurde aus der Warteschlange entfernt.');
        const t=scan[i];
        if(!(await fastSeek(video,t)))continue;
        try{
          const read=await readBanProbe(worker,video);const ban=read.ban||extractBanEvent(read.text);
          if(read.signal||ban)hits.push({time:t,ban,signal:read.signal,sharp:read.sharp||0,text:read.text});
        }catch{}
        onProgress?.(5+Math.round((i+1)/scan.length*35),`Schnellscan ${i+1}/${scan.length}`);
      }
      // Precision only around candidate signals.
      const candidates=hits.filter(x=>x.ban&&x.ban.adminId===BAN_ADMIN_ID&&x.ban.targetId);
      const probes=candidates.length?candidates: hits.filter(x=>x.signal).slice(0,12);
      const checked=[];
      for(const h of probes.slice(0,12)){
        if(cancelCheck())throw new Error('OCR abgebrochen: Fall wurde aus der Warteschlange entfernt.');
        for(const t of uniqueTimes([h.time-.8,h.time-.4,h.time,h.time+.4,h.time+.8])){
          if(cancelCheck())throw new Error('OCR abgebrochen: Fall wurde aus der Warteschlange entfernt.');
          if(!(await fastSeek(video,t)))continue;
          try{const read=await readBanOnly(worker,video);const ban=read.ban||extractBanEvent(read.text);if(ban&&ban.adminId===BAN_ADMIN_ID&&ban.targetId)checked.push({time:t,ban,text:read.text,sharp:read.sharp||0});}catch{}
        }
      }
      const pool=checked.length?checked:candidates;
      if(pool.length){
        pool.sort((a,b)=>(Number(!!b.ban.reason)-Number(!!a.ban.reason))||(b.ban.score-a.ban.score)||(b.sharp-a.sharp));
        for(const candidate of pool.slice(0,8)){
          if(candidate.ban.reason)continue;
          if(!(await fastSeek(video,candidate.time)))continue;
          try{const rr=await readReasonDirect(worker,video);if(rr.reason){candidate.ban.reason=rr.reason;candidate.ban.score+=12;candidate.text=(candidate.text||'')+'\nGrund: '+rr.reason;}}catch{}
        }
        pool.sort((a,b)=>(Number(!!b.ban.reason)-Number(!!a.ban.reason))||(b.ban.score-a.ban.score)||(b.sharp-a.sharp));
        anchor=pool[0];
      }
    }

    if(!anchor){
      onProgress?.(100,`Kein eindeutiger Ban von ${BAN_ADMIN_NAME} [${BAN_ADMIN_ID}]`);
      return {targetId:'',reason:'',sc:'',server:'3',date,offline:true,duration,missing:['Ziel-ID','Grund','SC / ACP'],complete:false,timestamps:{},confidence:{id:0,reason:0,sc:0,server:1,date:date?1:0,ban:0,admin:0}};
    }

    const verified=anchor.ban;
    const bannerTime=Math.max(0,Math.min(duration-.05,anchor.time));
    if(!verified.reason){
      const retryTimes=uniqueTimes([bannerTime-.45,bannerTime,bannerTime+.45]);
      for(const t of retryTimes){
        if(!(await fastSeek(video,t)))continue;
        try{const rr=await readReasonDirect(worker,video);if(rr.reason){verified.reason=rr.reason;break;}}catch{}
      }
    }
    const timestamps={banner:bannerTime,targetId:bannerTime,reason:bannerTime,sc:Math.max(0,duration-5),pcCheck:Math.max(0,Math.min(duration/2,duration-.05))};
    const targetId=/^\d{1,6}$/.test(verified.targetId||'')&&verified.targetId!==BAN_ADMIN_ID?verified.targetId:'';
    const reason=canonicalReason(verified.reason)||verified.reason||'';
    const missing=[];
    if(!targetId)missing.push('Ziel-ID');
    if(!reason)missing.push('Grund');
    missing.push('SC / ACP');
    onProgress?.(100,targetId&&reason?`Ban von ${BAN_ADMIN_NAME} [${BAN_ADMIN_ID}] erkannt`:'Ban erkannt, Angaben fehlen');
    return {targetId,reason,sc:'',server:'3',date,offline:false,duration,missing,complete:false,timestamps,confidence:{id:targetId?1:0,reason:reason?1:0,sc:0,server:1,date:date?1:0,ban:verified.score||0,admin:1}};
  }
  async function openManualPicker(entry, field, secondsOverride){
    if(!entry)return;
    try{
      const id=entry.id;
      const file=entry.file||await getVideo(id);
      if(!file){toast('POV-Datei ist nicht verfügbar.');return;}
      await putVideo(id,file);
      const t=Number(secondsOverride??entry.result?.timestamps?.[field]??entry.result?.timestamps?.banner??0)||0;
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
    else if(field==='discordId'){return;}
    if(ctx.item){ctx.item.result={...ctx.item.result,[field]:v};ctx.item.result.timestamps={...(ctx.item.result.timestamps||{}),[field]:Number(time)||ctx.item.result.timestamps?.banner||0};if(field==='sc'&&v)ctx.item.result.offline=false;renderQueue();setEditorValues({...ctx.item.result,proof:ctx.item.youtube?.url||ctx.item.result.proof||''});setFieldStatus(ctx.item);}
    if(ctx.entry){ctx.entry[field]=v;ctx.entry.result={...(ctx.entry.result||{}),[field]:v};ctx.entry.timestamps={...(ctx.entry.timestamps||{}),[field]:Number(time)||ctx.entry.timestamps?.banner||0};if(field==='sc'&&v){ctx.entry.offline=false;ctx.entry.result.offline=false;}setEditorValues(ctx.entry);setFieldStatus({result:ctx.entry});}
    if(field==='reason'){v=classifyReasonStrong(v)||canonicalReason(v)?.value||v;applyReasonPermaPolicy(v,false);if(ALLOWED_REASONS.includes(v))$('#reason').value=v;}
    if(field==='reason'||field==='targetId'||field==='date'){renderTitlePreview();setTimeout(()=>setFieldStatus(state.editing?.item||state.editing?.entry||{}),0);}
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
  const PHOTO_ROIS={
    banner:[0.00,0.00,0.70,0.46],
    targetId:[0.00,0.00,0.68,0.42],
    reason:[0.00,0.06,0.60,0.37],
    sc:[0.00,0.00,0.70,0.46],
    pcCheck:[0.00,0.00,0.70,0.46]
  };
  async function showInfoPhoto(field='banner'){
    const panel=$('#infoPhotoPanel'),canvas=$('#infoPhotoCanvas'),label=$('#infoPhotoLabel'),meta=$('#infoPhotoMeta');if(!panel||!canvas)return;
    const ctx=state.editing;const entry=ctx?.item||ctx?.entry;if(!entry)return;
    let file=entry.file||null;if(!file){try{file=await getVideo(entry.id);if(file)entry.file=file;}catch{}}
    if(!file){panel.classList.add('hidden');return;}
    const r=entry.result||entry;
    panel.classList.remove('hidden');
    label.textContent=`Info-Foto · ${field==='targetId'?'Ziel-ID':field==='reason'?'Grund':field==='sc'?'SC / RID':field==='pcCheck'?'PC-Check':'Bannblock'}`;
    let media=null;
    try{
      media=await openLocalVideo(file,'Info-Foto');
      const duration=Number(media.video.duration||r.duration||0)||0;
      let t=Number(r.timestamps?.[field]??r.timestamps?.banner??NaN);
      if(field==='banner'){
        // Only the Bannblock button performs the expensive last-5-second verification.
        // All other info-photo buttons reuse this verified timestamp.
        const hit=await findVerifiedBanInLastFive(media.video,()=>false,()=>{});
        if(hit){
          t=hit.time;
          entry.result=entry.result||{};entry.result.timestamps={...(entry.result.timestamps||{}),banner:t,targetId:t,reason:t};
          entry.timestamps={...(entry.timestamps||{}),banner:t,targetId:t,reason:t};
          if(hit.ban.targetId)entry.result.targetId=hit.ban.targetId;
          if(hit.ban.reason)entry.result.reason=hit.ban.reason;
          if(hit.ban.targetId)$('#targetId').value=hit.ban.targetId;
          if(hit.ban.reason&&ALLOWED_REASONS.includes(hit.ban.reason))$('#reason').value=hit.ban.reason;
          renderTitlePreview(); setFieldStatus({result:entry.result});
        }else if(!Number.isFinite(t)) t=Math.max(0,duration-0.4);
      }else if(field==='targetId'||field==='reason'){
        const hit=await findVerifiedBanInLastFive(media.video,()=>false,()=>{});
        if(hit){
          t=hit.time;
          entry.result=entry.result||{}; entry.result.timestamps={...(entry.result.timestamps||{}),banner:t,targetId:t,reason:t};
          entry.timestamps={...(entry.timestamps||{}),banner:t,targetId:t,reason:t};
          if(hit.ban.targetId){entry.result.targetId=hit.ban.targetId;$('#targetId').value=hit.ban.targetId;}
          if(hit.ban.reason){entry.result.reason=hit.ban.reason;if(ALLOWED_REASONS.includes(hit.ban.reason))$('#reason').value=hit.ban.reason;}
          renderTitlePreview(); setFieldStatus({result:entry.result});
        }else if(!Number.isFinite(t)) t=Math.max(0,duration-0.4);
      }else if(field==='sc'){
        t=Math.max(0,duration-0.5);
      }else if(field==='pcCheck'){
        t=Number.isFinite(t)?t:Math.max(0,Math.min(duration/2,duration-.05));
      }
      if(!Number.isFinite(t))t=Math.max(0,duration-.4);
      const tt=Math.max(0,Math.min(t,Math.max(0,duration-.05)));
      await safeSeek(media.video,tt,3);
      meta.textContent=`Zeitpunkt ${tt.toFixed(2)} s · Originalauflösung · Chatbereich links oben`;
      for(const b of $$('.photo-field'))b.classList.toggle('active',b.dataset.field===field);
      const crop=PHOTO_ROIS[field]||PHOTO_ROIS.banner;
      const video=media.video;
      const sx=Math.round(video.videoWidth*crop[0]),sy=Math.round(video.videoHeight*crop[1]),sw=Math.max(1,Math.round(video.videoWidth*crop[2])),sh=Math.max(1,Math.round(video.videoHeight*crop[3]));
      const maxW=1700,maxH=1000,scale=Math.min(1,maxW/sw,maxH/sh);
      canvas.width=Math.max(1,Math.round(sw*scale));canvas.height=Math.max(1,Math.round(sh*scale));
      const c=canvas.getContext('2d');c.imageSmoothingEnabled=true;c.drawImage(video,sx,sy,sw,sh,0,0,canvas.width,canvas.height);
      if(field==='targetId'||field==='reason'||field==='banner'){
        c.save();c.fillStyle='rgba(255,47,139,.10)';c.strokeStyle='#ff2f8b';c.lineWidth=Math.max(2,canvas.width/700);
        const guide=field==='reason'?[0.00,.00,.82,.60]:field==='targetId'?[0.00,.00,.82,.60]:[0.00,.00,.86,.64];
        c.fillRect(canvas.width*guide[0],canvas.height*guide[1],canvas.width*guide[2],canvas.height*guide[3]);c.strokeRect(canvas.width*guide[0],canvas.height*guide[1],canvas.width*guide[2],canvas.height*guide[3]);c.restore();
      }
    }catch(err){canvas.width=1;canvas.height=1;meta.textContent=`Foto konnte nicht geladen werden: ${err.message}`;}
    finally{closeLocalVideo(media);}
  }
  function revokeEditorPreview(){if(state.editorVideoUrl){try{URL.revokeObjectURL(state.editorVideoUrl);}catch{}state.editorVideoUrl=null;}const v=$('#editorVideoPreview');if(v){try{v.pause();}catch{}v.removeAttribute('src');v.load();}}
  function loadEditorPreview(file,t=0){const v=$('#editorVideoPreview');if(!v||!file)return;revokeEditorPreview();state.editorVideoUrl=URL.createObjectURL(file);v.src=state.editorVideoUrl;v.load();const set=()=>{try{v.currentTime=Math.max(0,Math.min(Number(t)||0,Math.max(0,v.duration-.05)));}catch{}};v.addEventListener('loadedmetadata',set,{once:true});} 
  function setEditorValues(v={}){
    const r=v?.result||v||{};
    const val=(x)=>x==null?'':String(x);
    $('#targetId').value=val(r.targetId);
    $('#result').value=val(r.manualResult);
    $('#reason').value=ALLOWED_REASONS.includes(val(r.reason))?val(r.reason):'';
    applyAutomaticResultForReason($('#reason').value,false);
    $('#sc').value=val(r.sc);
    $('#server').value='3';
    const derivedDate=validDate(r.date)?val(r.date):dateFromFilename(r.originalName||r.file?.name||state.editing?.item?.file?.name||state.editing?.entry?.file?.name||'');
    $('#date').value=validDate(derivedDate)?derivedDate:'';
    const discordEl=$('#discordId'); if(discordEl)discordEl.value='';
    const pcTime=Number(r.timestamps?.pcCheck); if(!Number.isFinite(pcTime) && state.editing?.item?.file){/* showInfoPhoto will derive midpoint when opened */}
    $('#proof').value=val(r.proof);
    $('#perma').checked=!!r.perma;
    $('#permaArchive').checked=!!r.permaArchive;
    $('#notBanned').checked=!!r.notBanned;
    $('#documentStatus').value=r.documentStatus==='eingetragen'?'eingetragen':'nicht eingetragen';
    const pcm=Array.isArray(r.pcCheckerManual)?r.pcCheckerManual:[];
    pcCheckerCustom.clear();
    pcm.forEach(v=>{if(v && !PC_CHECKER_POOL.includes(v))pcCheckerCustom.add(String(v));});
    // Eine neue POV bekommt immer nur den Leiter (Adam Byers). Alte Auswahlen
    // aus dem vorherigen Fall dürfen nicht in 2–5 übernommen werden.
    const selectedPc=Array.isArray(r.pcCheckers)&&r.pcCheckers.length ? r.pcCheckers : [PC_CHECKER_LEAD];
    setupPcCheckerUi(selectedPc);
    renderTitlePreview();
  }
  function setFieldStatus(item){
    const r=item?.result||item||{};
    const missing=new Set(Array.isArray(r.missing)?r.missing:[]);
    const uiTarget=clampId($('#targetId')?.value||r.targetId||'');
    const rawReason=String($('#reason')?.value||r.reason||'').trim();
    const normalizedUiReason=String(rawReason||'').trim();
    const uiReason=ALLOWED_REASONS.includes(normalizedUiReason)?normalizedUiReason:(classifyReasonStrong(normalizedUiReason)||canonicalReason(normalizedUiReason)?.value||'');
    const uiSc=normalizeHexLoose($('#sc')?.value||r.sc||'');
    const statuses=[
      ['ID','Ziel-ID',/^\d{1,6}$/.test(uiTarget)],
      ['Grund','Grund',ALLOWED_REASONS.includes(uiReason)],
      ['SC','SOC / SC',uiSc.length===40]
    ];
    const box=$('#fieldStatus');
    if(box) box.innerHTML=statuses.map(([short,label,ok])=>`<div class="status-chip ${ok?'ok':'warn'}">${ok?'✓':'⚠'} ${esc(label)}</div>`).join('');
    const editorState=state.editing;
    const result=editorState?.item?.result||editorState?.entry||r;
    $$('.jump').forEach(btn=>{
      const field=btn.dataset.field;
      let show=true;
      // All editable OCR fields stay selectable so the reviewer can re-read the same field even when a value already exists.
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
  function openEditor(item,options={}){
    if(!item)return false;
    state.editing={item};
    const file=item.file||null;
    if(!file){toast('POV-Datei ist nicht verfügbar.');return false;}
    $('#modalFile').textContent=item.finalName||file.name;
    setEditorValues({...item.result,manualResult:item.result?.manualResult||item.manualResult||'',proof:item.result?.proof||'',perma:!!item.result?.perma,permaArchive:!!item.result?.permaArchive,notBanned:!!item.result?.notBanned});
    state.selectedTypes=new Set(item.result?.types||[]);
    $$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));
    setFieldStatus(item);
    $('#editorModal').classList.remove('hidden');
    loadEditorPreview(file,item.result?.timestamps?.banner||0);
    void showInfoPhoto('banner');
    renderAcpStatus(item.result?.sc?'✓ SC bereits vorhanden':'SC fehlt · über ACP holen',item.result?.sc?'ok':'warn');
    if(options.openSc && !item.result?.sc && /^\d{1,6}$/.test(item.result?.targetId||item.targetId||'')) openAcpForCurrentId(options.scWindow||null);
    return true;
  }
  async function openEditorFromEntry(entry,options={}){
    if(!entry)return false;
    const file=entry.file||await getVideo(entry.id);
    if(!file){toast('POV-Datei ist nicht mehr verfügbar.');return false;}
    entry.file=file;
    state.editing={entry};
    $('#modalFile').textContent=entry.finalName||entry.originalName||file.name;
    setEditorValues(entry);
    state.selectedTypes=new Set(entry.types||[]);
    $$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));
    setFieldStatus({result:entry});
    $('#editorModal').classList.remove('hidden');
    loadEditorPreview(file,entry.timestamps?.banner||0);
    void showInfoPhoto('banner');
    renderAcpStatus(entry.sc?'✓ SC bereits vorhanden':'SC fehlt · über ACP holen',entry.sc?'ok':'warn');
    return true;
  }
  function closeEditor(){revokeEditorPreview();state.editing=null;$('#editorModal').classList.add('hidden');}
  function syncEditorDraftToQueueItem(){
    const ctx=state.editing;if(!ctx?.item)return null;
    const item=ctx.item;
    const current=item.result||{};
    const targetId=clampId($('#targetId')?.value||current.targetId||'');
    const reason=String($('#reason')?.value||current.reason||'').trim();
    const sc=normalizeHexLoose($('#sc')?.value||current.sc||'');
    const server=String($('#server')?.value||current.server||'3').trim()||'3';
    const date=String($('#date')?.value||current.date||'').trim();
    const resultEl=$('#result');
    let manualResult=String(resultEl?.value||current.manualResult||item.manualResult||'').trim();
    const auto=autoResultForReason(reason);
    if(auto) { manualResult=auto; if(resultEl)resultEl.value=auto; }
    item.manualResult=manualResult;
    item.result={...current,targetId,reason,sc,server,date,manualResult};
    item.targetId=targetId;item.reason=reason;item.sc=sc;item.server=server;item.date=date;
    scheduleQueuePersist();
    return item;
  }
  async function deleteEditingCurrent(){
    const ctx=state.editing;const base=ctx?.item||ctx?.entry;if(!base)return false;
    if(ctx.item?.uploading){toast('YouTube-Upload läuft noch.');return false;}
    if(!window.confirm('Diesen POV wirklich löschen? Die lokale Datei wird gelöscht. Das YouTube-Video bleibt erhalten.'))return false;
    try{
      if(ctx.item){ctx.item.cancelled=true;ctx.item.editingDone=true;ctx.item.processing=false;ctx.item.ocrProcessing=false;await delVideo(ctx.item.id,DESTRUCTIVE_TOKEN);state.queue=state.queue.filter(x=>x.id!==ctx.item.id);state.archiveSelected?.delete(ctx.item.id);persistQueueNow();}
      else{await delVideo(ctx.entry.id,DESTRUCTIVE_TOKEN);state.entries=state.entries.filter(x=>x.id!==ctx.entry.id);state.archiveSelected?.delete(ctx.entry.id);saveMeta({allowEmpty:state.entries.length===0,explicitDelete:true});}
      closeEditor();renderQueue();renderArchive();renderCases();renderCsv();toast('POV gelöscht. YouTube bleibt erhalten.');return true;
    }catch(err){console.error('Direktes Löschen fehlgeschlagen',err);toast('Löschen fehlgeschlagen: '+(err?.message||err));return false;}
  }
  async function nextQueueItem(itemId){
    const item=state.queue.find(x=>x.id===itemId);if(!item)return false;
    if(item.uploading||item.processing||item.ocrProcessing){toast('Diese POV wird noch verarbeitet.');return false;}
    if(!item.result){toast('Diese POV hat noch keine OCR-Ergebnisse. Bitte zuerst prüfen.');return false;}
    const wasEditing=state.editing?.item?.id===item.id;
    if(wasEditing)syncEditorDraftToQueueItem();
    const draft=item.result||{};
    const currentTarget=clampId($('#targetId')?.value||draft.targetId||item.targetId||'');
    const currentReason=String($('#reason')?.value||draft.reason||item.reason||'').trim();
    const currentDate=String($('#date')?.value||draft.date||item.date||'').trim();
    if(!/^\d{1,6}$/.test(currentTarget)||!ALLOWED_REASONS.includes(currentReason)||!validDate(currentDate)){
      if(!wasEditing)openEditor(item);
      toast('Nächste POV erst möglich: Ziel-ID, Grund und Datum müssen ausgefüllt sein.');
      return false;
    }
    try{
      if(!wasEditing){
        state.editing={item};
        setEditorValues({...item.result,proof:item.result?.proof||item.youtube?.url||''});
        maybeAskPermaForQueueItem(item,item.result?.reason||'');
        state.selectedTypes=new Set(item.result?.types||[]);
        $$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));
      }
      const saved=await saveEditor({preventDefault(){}});
      const next=state.queue.find(x=>!x.cancelled&&!x.editingDone&&x.status!=='Gespeichert'&&x.id!==item.id);
      if(saved && next){
        const nextFile=next.file||await getVideo(next.id);
        if(nextFile)next.file=nextFile;
        closeEditor();
        openEditor(next);
        toast('POV gespeichert und aus der Warteschlange entfernt. Nächste POV geöffnet.');
      }else if(saved){
        toast('POV gespeichert und aus der Warteschlange entfernt. Keine weitere POV.');
      }
      persistQueueNow();
      return !!saved;
    }catch(err){console.error('Nächste POV fehlgeschlagen',err);toast('Nächste POV: '+(err?.message||err));return false;}
  }

  async function saveEditor(e){
    e.preventDefault(); const ctx=state.editing; if(!ctx)return;
    const targetId=clampId($('#targetId').value), reason=$('#reason').value, sc=normalizeHexLoose($('#sc').value), server=$('#server').value||'3', date=$('#date').value;
    applyAutomaticResultForReason(reason,true);
    const resultText=String($('#result')?.value||'').trim();
    // A manually entered SC is authoritative. Never let an old OCR "offline" flag overwrite it on save.
    const offlineFlag=!!(ctx.item?.result?.offline||ctx.entry?.offline);
    const offline=sc.length===40?false:offlineFlag;
    const missing=[]; if(!/^\d{1,6}$/.test(targetId))missing.push('Ziel-ID'); if(!ALLOWED_REASONS.includes(reason))missing.push('Grund'); if(!resultText)missing.push('Ergebnis'); if(!/^[1-4]$/.test(server))missing.push('Server'); if(!validDate(date))missing.push('Datum'); if(!offline && sc.length!==40)missing.push('SC');
    if(missing.length){toast('Bitte fehlende Angaben prüfen: '+missing.join(', '));return false;}
    const base=ctx.item||ctx.entry; const types=[...state.selectedTypes]; if(reason.startsWith('PC'))types.push('pccheck'); if(reason==='Cheater'||reason==='Cheating')types.push('cheater'); const finalTypes=[...new Set(types)];
    const finalName=`${targetId}, ${reason}, ${formatDateDE(date)}.mp4`;
    const namedFile=new File([base.file],finalName,{type:base.file.type||'video/mp4',lastModified:base.file.lastModified||Date.now()}); if(namedFile.size!==base.file.size)throw new Error('Die Dateigröße hat sich beim Umbenennen verändert. Speicherung abgebrochen.');
    const yt=base.youtube||ctx.item?.youtube||ctx.entry?.youtube||null;
    const timestamps={...(base.result?.timestamps||base.timestamps||{})};
    if(!Number.isFinite(Number(timestamps.pcCheck))){const d=Number(base.result?.duration||base.duration||0);if(d>0)timestamps.pcCheck=Math.max(0,Math.min(d/2,Math.max(0,d-.05)));}
    const stickyArchive=!!base.permaArchive||!!ctx.item?.result?.permaArchive||!!ctx.entry?.permaArchive||!!readArchivePlacement()[String(base.id||'')];
    const record={id:base.id||crypto.randomUUID(),originalName:base.originalName||base.file.name,finalName,targetId,reason,manualResult:resultText,sc:offline?'':sc,server,date,rid:'',types:finalTypes,perma:$('#perma').checked,permaArchive:stickyArchive||$('#permaArchive').checked,notBanned:$('#notBanned').checked,documentStatus:$('#documentStatus').value==='eingetragen'?'eingetragen':'nicht eingetragen',pcCheckers:getPcCheckers(),pcCheckerManual:[...pcCheckerCustom],discordId:'',proof:yt?.url||$('#proof').value.trim(),complete:true,saved:true,videoStored:true,offline,sourceSize:namedFile.size,sourceType:namedFile.type||'video/mp4',duration:Number(base.result?.duration||base.duration||0)||0,timestamps,infoPhotoField:'banner',missing:[],file:namedFile,youtube:yt};
    await putVideo(record.id,namedFile);
    // YouTube must receive the exact final filename (including .mp4). The title update
    // is completed and verified before the saved POV is finalized in the UI.
    if(yt?.id){
      try{
        await updateYoutubeTitle(yt.id,finalName,base.youtubeConnectionSlot||state.activeYoutubeSlot);
        record.youtubeConnectionSlot=Number(base.youtubeConnectionSlot||state.activeYoutubeSlot)||1;
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
    state.entries=[record,...state.entries.filter(x=>x.id!==record.id)];
    saveMeta();
    // Sobald der POV vollständig gespeichert ist, sofort die Cloud-Sicherung anstoßen.
    // Falls Google Drive nicht verbunden ist, bleibt der Aufruf folgenlos; nach dem Verbinden
    // bzw. beim nächsten Upload greift die automatische Sicherung erneut.
    void syncDriveBackup();

    // Ein erfolgreich gespeicherter/geprüfter POV ist kein Warteschlangen-Eintrag mehr.
    // Die IndexedDB-Datei bleibt erhalten, weil sie jetzt vom Archiv verwendet wird.
    if(ctx.item){
      ctx.item.file=namedFile;
      ctx.item.finalName=finalName;
      ctx.item.manualResult=resultText;
      ctx.item.result={...ctx.item.result,...record};
      ctx.item.status='Gespeichert';
      ctx.item.progress=100;
      ctx.item.editingDone=true;
      ctx.item.cancelled=true;
      state.queue=state.queue.filter(x=>x.id!==ctx.item.id);
      renderQueue();
    }

    closeEditor();
    renderArchive();
    renderCases();
    renderCsv();
    toast('Gespeichert. YouTube-Titel und Dateiname sind identisch. POV ins Archiv verschoben.');
    return true;
  }
  window.addEventListener('message',e=>{if(e.data?.type==='grandrp-manual-field'){applyManualField(e.data.field,e.data.value,e.data.time);}});

  const ACP_ORIGIN='https://admin.gta5grand.com';
  const ACP_EXTENSION_TOKEN='grandrp-acp-v93';
  let acpWindow=null;
  let acpTimeout=null;
  let acpReasonWindow=null;
  let acpReasonTimeout=null;
  let acpReasonAfterSc=false;

  function buildAcpNonce(){
    return crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
  function buildAcpUrl(characterId){
    const id=String(characterId||'').replace(/\D/g,'');
    const nonce=buildAcpNonce();
    return `${ACP_ORIGIN}/de/3/logs/authorization?nick=&characterid=${encodeURIComponent(id)}&ip=&socialname=&socialid=&date=&subdate=&grandrpBridge=1&bridgeToken=${encodeURIComponent(nonce)}`;
  }
  function buildAcpReasonUrl(characterId){
    const id=String(characterId||'').replace(/\D/g,'');
    const nonce=buildAcpNonce();
    return `${ACP_ORIGIN}/de/3/character/info/${encodeURIComponent(id)}?grandrpBridge=1&bridgeMode=reason&bridgeToken=${encodeURIComponent(nonce)}`;
  }
  function requestAcpTabOpen(url,bridgeToken,bridgeMode){
    try{window.postMessage({type:'GRANDRP_OPEN_ACP_TAB',url:String(url||''),bridgeToken:String(bridgeToken||''),bridgeMode:String(bridgeMode||'sc')},location.origin);return true;}catch(err){console.warn('ACP-Tab-Bridge nicht verfügbar',err);return false;}
  }
  function openNormalTabFallback(url){
    try{const a=document.createElement('a');a.href=url;a.target='_blank';a.rel='noopener';a.style.display='none';document.body.appendChild(a);a.click();a.remove();return true;}catch{return false;}
  }
  function setScValueFromAcp(sc,characterId){
    const value=normalizeHexLoose(sc);
    if(value.length!==40){toast('ACP-SC ungültig oder unvollständig.');return false;}
    $('#sc').value=value;
    const ctx=state.editing;
    if(ctx?.item){ctx.item.result={...(ctx.item.result||{}),sc:value};ctx.item.sc=value;scheduleQueuePersist();}
    if(ctx?.entry){ctx.entry.result={...(ctx.entry.result||{}),sc:value};ctx.entry.sc=value;}
    renderAcpStatus(`✓ SC aus ACP übernommen · ID ${characterId}`,'ok');
    setFieldStatus(state.editing?.item||state.editing?.entry||{result:{targetId:characterId,sc:value}});
    showInfoPhoto('banner');
    toast('SC aus Adminpanel übernommen. SOC wird damit gefüllt.');
    return true;
  }
  function maybeAskPermaForQueueItem(item,reason){const r=String(reason||'').trim();if(!item||r!=='PC-Check Verweigerung'||item.permaQuestionAsked)return;if(item.result?.perma===true)return;item.permaQuestionAsked=true;const answer=window.confirm('PC-Check Verweigerung: Soll dieser Fall als Permabann markiert werden?');$('#perma').checked=answer;item.perma=answer;item.result={...(item.result||{}),perma:answer};scheduleQueuePersist();}
  function setReasonValueFromAcp(reason,characterId){
    const raw=String(reason||'').replace(/\s+/g,' ').trim();
    if(!raw)return false;
    // Nie zuerst auf den verkürzten canonicalReason-Pfad gehen: Bei
    // „PC-Check Verweigerung - Trolling“ darf „Trolling“ nicht verloren gehen.
    // ACP Sonderfall: Wenn das rote Adminpanel exakt „Admin ban“ meldet,
    // wird dieser Fall automatisch als Cheating/Hardban/Perma behandelt.
    // Das ist absichtlich vor der normalen Reason-Klassifizierung, damit
    // „Admin ban“ niemals als unbekannter Grund im Editor stehen bleibt.
    const isAdminBan=/^admin\s*ban$/i.test(raw);
    const strong=classifyReasonStrong(raw);
    const canonical=isAdminBan?'Cheater':(strong||canonicalReason(raw)?.value||raw);
    const allowed=ALLOWED_REASONS.includes(canonical);
    if(allowed)$('#reason').value=canonical;
    if(allowed)applyAutomaticResultForReason(canonical,true);
    if(isAdminBan){
      state.selectedTypes.add('hardban');
      state.selectedTypes.add('cheater');
      $$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));
      $('#perma').checked=true;
    }
    if(allowed && state.editing?.item)syncEditorDraftToQueueItem();
    if(canonical==='PC-Check Verweigerung' && state.editing?.item){maybeAskPermaForQueueItem(state.editing.item,canonical);}else{applyReasonPermaPolicy(canonical,false);}
    if(isAdminBan){
      if(state.editing?.item){
        state.editing.item.result={...(state.editing.item.result||{}),types:[...state.selectedTypes],perma:true,reason:'Cheater'};
        state.editing.item.types=[...state.selectedTypes];
        state.editing.item.perma=true;
      }
      if(state.editing?.entry){
        state.editing.entry.types=[...state.selectedTypes];
        state.editing.entry.perma=true;
        state.editing.entry.reason='Cheater';
        state.editing.entry.result={...(state.editing.entry.result||{}),types:[...state.selectedTypes],perma:true,reason:'Cheater'};
      }
    }
    renderTitlePreview();
    const ctx=state.editing;
    if(ctx?.item){ctx.item.result={...(ctx.item.result||{}),reason:canonical};ctx.item.reason=canonical;scheduleQueuePersist();}
    if(ctx?.entry){ctx.entry.reason=canonical;ctx.entry.result={...(ctx.entry.result||{}),reason:canonical};}
    setFieldStatus(state.editing?.item||state.editing?.entry||{result:{targetId:characterId,reason:canonical}});
    const status=$('#reasonStatus');
    if(status){status.textContent=allowed?`✓ BannGrund aus rotem Adminpanel übernommen · ID ${characterId}`:`BannGrund aus Adminpanel gelesen: ${raw}`;status.className='acp-status '+(allowed?'ok':'warn');}
    if(allowed)toast(`BannGrund aus Adminpanel übernommen: ${canonical}`); else toast(`BannGrund gelesen: ${raw}`);
    return allowed;
  }
  function closeAcpReasonWindow(){
    clearTimeout(acpReasonTimeout);
    try{if(acpReasonWindow&&!acpReasonWindow.closed)acpReasonWindow.close();}catch{}
    acpReasonWindow=null;
  }
  function openAcpReasonForCurrentId(){
    const id=clampId($('#targetId')?.value||state.editing?.item?.result?.targetId||state.editing?.item?.targetId||state.editing?.entry?.targetId||'');
    if(!/^\d{1,6}$/.test(id)){toast('Zuerst eine gültige Ziel-ID eintragen.');return false;}
    const url=buildAcpReasonUrl(id);
    const token=new URL(url).searchParams.get('bridgeToken')||'';
    const status=$('#reasonStatus');
    if(status){status.textContent=`Adminpanel wird in einem neuen Tab geöffnet · BannGrund für ID ${id} · 2,5 s Ladezeit …`;status.className='acp-status warn';}
    clearTimeout(acpReasonTimeout);acpReasonWindow=null;
    acpReasonTimeout=setTimeout(()=>{if(status){status.textContent='Kein BannGrund im roten Adminpanel-Bereich gefunden.';status.className='acp-status warn';}},45000);
    if(!requestAcpTabOpen(url,token,'reason'))openNormalTabFallback(url);
    return true;
  }
  function startAcpSequence(){
    const id=clampId($('#targetId')?.value||state.editing?.item?.result?.targetId||state.editing?.item?.targetId||'');
    if(!/^\d{1,6}$/.test(id)){toast('Zuerst eine gültige Ziel-ID eintragen.');return false;}
    acpReasonAfterSc=true;
    closeAcpReasonWindow();
    return openAcpForCurrentId();
  }
  function renderAcpStatus(text,kind=''){const el=$('#acpStatus');if(!el)return;el.textContent=text;el.className=`acp-status ${kind}`;}
  function closeAcpWindow(){clearTimeout(acpTimeout);try{if(acpWindow&&!acpWindow.closed)acpWindow.close();}catch{}acpWindow=null;}
  function openAcpForCurrentId(){
    const id=clampId($('#targetId')?.value||state.editing?.item?.result?.targetId||state.editing?.item?.targetId||'');
    if(!/^\d{1,6}$/.test(id)){toast('Zuerst eine gültige Ziel-ID eintragen.');return false;}
    const url=buildAcpUrl(id);
    const token=new URL(url).searchParams.get('bridgeToken')||'';
    renderAcpStatus(`ACP wird in einem neuen Tab geöffnet · SC für ID ${id} …`,'warn');
    clearTimeout(acpTimeout);acpWindow=null;
    acpTimeout=setTimeout(()=>{renderAcpStatus('Kein SC im ACP gefunden.','warn');acpReasonAfterSc=false;},45000);
    if(!requestAcpTabOpen(url,token,'sc'))openNormalTabFallback(url);
    return true;
  }
  window.addEventListener('message',e=>{
    if(e.source!==window||!e.data)return;
    if(e.origin!==location.origin && e.origin!==ACP_ORIGIN)return;
    if(e.data.type==='GRANDRP_ACP_STATUS'){
      const msg=String(e.data.message||'ACP lädt …');
      // Reason status belongs to the reason card; other status messages belong to SC.
      if(e.data.bridgeMode==='reason'||/BannGrund|Reason/i.test(msg)){
        const el=$('#reasonStatus');if(el){el.textContent=msg;el.className='acp-status '+(e.data.kind||'warn');}
      }else renderAcpStatus(msg,e.data.kind||'');
      return;
    }
    if(e.data.type==='GRANDRP_ACP_SC'){
      const id=String(e.data.characterId||'');
      const sc=String(e.data.socialClub||'');
      clearTimeout(acpTimeout);
      const expected=clampId($('#targetId')?.value||state.editing?.item?.result?.targetId||state.editing?.item?.targetId||'');
      if(id&&id===expected&&setScValueFromAcp(sc,id)){
        closeAcpWindow();
        const shouldOpenReason=acpReasonAfterSc;
        acpReasonAfterSc=false;
        if(shouldOpenReason){
          // Let the SC tab disappear first, then open a fresh Character-Info tab.
          setTimeout(()=>openAcpReasonForCurrentId(null),350);
        }
      }
      return;
    }
    if(e.data.type==='GRANDRP_ACP_ERROR'){
      clearTimeout(acpTimeout);
      renderAcpStatus(String(e.data.message||'ACP-Daten nicht gefunden · Fenster wird geschlossen.'),'error');
      toast('ACP konnte die Daten nicht finden.');
      closeAcpWindow();
      if(acpReasonAfterSc){acpReasonAfterSc=false;closeAcpReasonWindow();}
      return;
    }
    if(e.data.type==='GRANDRP_ACP_REASON'){
      const id=String(e.data.characterId||'');
      const reason=String(e.data.reason||'');
      const expected=clampId($('#targetId')?.value||state.editing?.item?.result?.targetId||state.editing?.item?.targetId||state.editing?.entry?.targetId||'');
      if(id&&id===expected){
        clearTimeout(acpReasonTimeout);
        setReasonValueFromAcp(reason,id);
        closeAcpReasonWindow();
      }
    }
  });

  function rebuildPcCheckerOptions(selected=[]){
    const all=[...new Set([...PC_CHECKER_POOL,...pcCheckerCustom])];
    const current=Array.isArray(selected)?selected:[];
    for(let n=2;n<=5;n++){
      const sel=$(`#pcChecker${n}`);if(!sel)continue;
      const keep=sel.value;
      sel.innerHTML='<option value="">Nicht besetzt</option>'+all.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
      // If no value is provided for this case, explicitly clear the old selection.
      const want=current[n-2]??'';
      sel.value=want||'';
    }
    const list=$('#pcCheckerManualList');
    if(list)list.innerHTML=[...pcCheckerCustom].map(name=>`<span class="pc-manual-chip">${esc(name)}<button type="button" data-pc-remove="${esc(name)}">×</button></span>`).join('');
    $$('[data-pc-remove]').forEach(b=>b.onclick=()=>{pcCheckerCustom.delete(b.dataset.pcRemove);localStorage.setItem(PC_CUSTOM_KEY,JSON.stringify([...pcCheckerCustom]));rebuildPcCheckerOptions(getPcCheckers().slice(1));});
  }
  function getPcCheckers(){
    const out=[PC_CHECKER_LEAD];
    for(let n=2;n<=5;n++){const v=$(`#pcChecker${n}`)?.value?.trim();if(v&&!out.includes(v))out.push(v);}
    const manual=(state.editing?.item?.result?.pcCheckerManual||state.editing?.entry?.pcCheckerManual||[]).map(String).filter(Boolean);
    for(const v of manual)if(!out.includes(v))out.push(v);
    return out.slice(0,5);
  }
  function setupPcCheckerUi(initial=[]){
    const arr=Array.isArray(initial)&&initial.length?initial:[PC_CHECKER_LEAD];
    arr.slice(1).forEach(v=>{if(v&&!PC_CHECKER_POOL.includes(v))pcCheckerCustom.add(v);});
    rebuildPcCheckerOptions(arr.slice(1));
    for(let n=2;n<=5;n++){const sel=$(`#pcChecker${n}`);if(sel&&!sel.dataset.bound){sel.dataset.bound='1';sel.addEventListener('change',()=>{const vals=getPcCheckers();if(vals.length>5){sel.value='';toast('Maximal 5 PC Checker.');}});}}
    const input=$('#pcCheckerManual');
    if(input&&!input.dataset.bound){input.dataset.bound='1';input.addEventListener('keydown',e=>{if(e.key!=='Enter')return;e.preventDefault();const name=input.value.trim().replace(/\\s+/g,' ');if(!name)return;if(name===PC_CHECKER_LEAD||PC_CHECKER_POOL.includes(name)||pcCheckerCustom.has(name)){toast('Dieser PC Checker ist bereits vorhanden.');return;}pcCheckerCustom.add(name);input.value='';const vals=getPcCheckers();rebuildPcCheckerOptions(vals.slice(1));toast(`${name} zur PC-Checker-Auswahl hinzugefügt.`);});}
  }

  function autoResultForReason(reason){
    const r=String(reason||'').trim();
    if(r==='PC-Check Verweigerung'||r==='PC-Check Verweigerung - Trolling') return r;
    return '';
  }
  function applyAutomaticResultForReason(reason,clearPositive=true){
    const el=$('#result'); if(!el)return;
    const current=String(el.value||'').trim();
    const auto=autoResultForReason(reason);
    if(auto){el.value=auto;el.dataset.autoResult=auto;}
    else if(clearPositive && /positiv/i.test(String(reason||'')) && (el.dataset.autoResult || current==='PC-Check Verweigerung' || current==='PC-Check Verweigerung - Trolling')){
      el.value=''; delete el.dataset.autoResult;
    } else if(!auto && el.dataset.autoResult){ delete el.dataset.autoResult; }
  }
  function applyReasonPermaPolicy(reason,ask=true){
    const perma=$('#perma'); if(!perma)return;
    if(AUTO_PERMA_TRUE.has(reason)){perma.checked=true;return;}
    if(AUTO_PERMA_FALSE.has(reason)){perma.checked=false;return;}
    if(reason==='PC-Check Verweigerung'){
      if(ask) perma.checked=window.confirm('PC-Check Verweigerung: Soll dieser Fall als Permabann markiert werden?');
      return;
    }
  }
  function setupEditor(){
    $('#closeModal').onclick=closeEditor;$('#cancelBtn').onclick=closeEditor;$('#deleteCurrentBtn')?.addEventListener('click',deleteEditingCurrent);$('#entryForm').addEventListener('submit',saveEditor);$('#nextQueueBtn')?.addEventListener('click',async()=>{const item=state.editing?.item;if(!item){toast('Nächste POV ist nur aus der Verarbeitungswarteschlange verfügbar.');return;}await nextQueueItem(item.id);});['#targetId','#date'].forEach(s=>$(s).addEventListener('input',renderTitlePreview));$('#result')?.addEventListener('input',()=>{delete $('#result').dataset.autoResult;if(state.editing?.item)syncEditorDraftToQueueItem();});$('#reason').addEventListener('change',()=>{applyAutomaticResultForReason($('#reason').value,true);applyReasonPermaPolicy($('#reason').value,true);renderTitlePreview();setFieldStatus(state.editing?.item||state.editing?.entry||{});if(state.editing?.item)syncEditorDraftToQueueItem();});$('#reason').addEventListener('input',()=>{applyAutomaticResultForReason($('#reason').value,true);renderTitlePreview();setFieldStatus(state.editing?.item||state.editing?.entry||{});if(state.editing?.item)syncEditorDraftToQueueItem();});$('#targetId').addEventListener('input',()=>{$('#targetId').value=clampId($('#targetId').value);setFieldStatus(state.editing?.item||state.editing?.entry||{});if(state.editing?.item)syncEditorDraftToQueueItem();});$('#sc').addEventListener('input',()=>{setFieldStatus(state.editing?.item||state.editing?.entry||{});if(state.editing?.item)syncEditorDraftToQueueItem();});
    $$('.chip').forEach(c=>c.onclick=()=>{const v=c.dataset.value;c.classList.toggle('active');if(c.classList.contains('active'))state.selectedTypes.add(v);else state.selectedTypes.delete(v);});
    $$('.photo-field').forEach(b=>b.onclick=()=>{$$('.photo-field').forEach(x=>x.classList.toggle('active',x===b));const field=b.dataset.field;showInfoPhoto(field);});
    $('#photoRefresh')?.addEventListener('click',()=>{const active=$('.photo-field.active');showInfoPhoto(active?.dataset.field||'banner');});
    $('#pcCheckCapture')?.addEventListener('click',()=>{
      const v=$('#editorVideoPreview'),ctx=state.editing;if(!v||!ctx)return;
      const t=Number(v.currentTime)||0; const entry=ctx.item||ctx.entry; if(!entry)return;
      entry.result=entry.result||{}; entry.result.timestamps={...(entry.result.timestamps||{}),pcCheck:t}; entry.timestamps={...(entry.timestamps||{}),pcCheck:t};
      renderQueue();
      showInfoPhoto('pcCheck');
      toast(`PC-Check-Foto auf ${t.toFixed(2)} s gesetzt.`);
    });
    $('#previewPicker')?.addEventListener('click',async()=>{const ctx=state.editing;if(!ctx)return;const entry=ctx.item||ctx.entry;if(entry)await openManualPicker({...entry,file:entry.file},'view',Number($('#editorVideoPreview')?.currentTime||0));});
    $('#previewJumpBack')?.addEventListener('click',()=>{const v=$('#editorVideoPreview');if(v)v.currentTime=Math.max(0,v.currentTime-5);});
    $('#previewJumpForward')?.addEventListener('click',()=>{const v=$('#editorVideoPreview');if(v)v.currentTime=Math.min(v.duration||0,v.currentTime+5);});

    $$('#targetId,#reason,#sc').forEach(el=>el.addEventListener('focus',()=>showInfoPhoto(el.id==='targetId'?'targetId':el.id)));
    $('#reanalyzeBtn')?.addEventListener('click',async()=>{const x=state.editing?.item;if(x){closeEditor();await retryLocalOCR(x);}});
    $('#fetchAcpSc')?.addEventListener('click',()=>{startAcpSequence();});
    $('#openDatePicker')?.addEventListener('click',()=>{const el=$('#date');try{el.showPicker?.();}catch{el.focus();el.click();}});
    $('#addPcCheckerBtn')?.addEventListener('click',()=>{const input=$('#pcCheckerManual');if(!input)return;const name=input.value.trim().replace(/\s+/g,' ');if(!name){input.focus();return;}if(name===PC_CHECKER_LEAD||PC_CHECKER_POOL.includes(name)||pcCheckerCustom.has(name)){toast('Dieser PC Checker ist bereits vorhanden.');return;}if(getPcCheckers().length>=5){toast('Maximal 5 PC Checker.');return;}pcCheckerCustom.add(name);input.value='';rebuildPcCheckerOptions(getPcCheckers().slice(1));toast(`${name} zur PC-Checker-Auswahl hinzugefügt.`);});
    $('#copyAcpSc')?.addEventListener('click',async()=>{const v=$('#sc')?.value?.trim();if(!/^\w{40}$/i.test(v||'')){toast('Kein gültiger SC zum Kopieren.');return;}try{await navigator.clipboard.writeText(v);toast('SC kopiert.');}catch{toast('Zwischenablage nicht verfügbar.');}});
    // Manual picker buttons: use the user click directly to open the same-origin
    // picker page. This was missing in earlier builds, so SC/Discord-ID buttons
    // looked clickable but did nothing.
    $$('.jump').forEach(btn=>btn.addEventListener('click',async()=>{
      const ctx=state.editing;
      if(!ctx){toast('Kein POV zur manuellen Prüfung geöffnet.');return;}
      const entry=ctx.item||ctx.entry;
      if(!entry){toast('POV-Eintrag nicht verfügbar.');return;}
      if(btn.dataset.field==='reason'){
        const id=clampId($('#targetId')?.value||entry.result?.targetId||entry.targetId||'');
        if(!/^\d{1,6}$/.test(id)){toast('Zuerst eine gültige Ziel-ID eintragen.');return;}
        // Grund manuell auswählen öffnet ausschließlich die Character-Info und liest
        // den BannGrund aus dem roten Bannbereich. SC/Authorization ist hierfür nicht nötig.
        startAcpSequence();
        return;
      }
      await showInfoPhoto(btn.dataset.field);await openManualPicker(entry,btn.dataset.field);
    }));
  }

  function isQueueItemAlive(item){return !!item && !item.cancelled && state.queue.includes(item);}
  async function runOcrForUploadedItem(item,sourceSize,storedCopy,remoteSize=0){
    if(!item||item.cancelled)return;
    let media=null;
    try{
      item.status='OCR läuft im Hintergrund · Upload der nächsten POV ist unabhängig';
      item.progress=60;renderQueue();
      media=await openLocalVideo(item.file,`POV ${item.file.name}`,storedCopy);
      item.progress=62;renderQueue();
      item.result=await analyzeVideo(media.video,p=>{item.progress=62+Math.round(p*.38);item.status=`OCR läuft ${p}% · Upload-Warteschlange unabhängig`;renderQueue();},item.file.name,()=>item.cancelled);
      item.result.originalName=item.file.name;
      item.result.sourceSize=sourceSize;
      item.result.remoteSize=remoteSize||0;
      item.result.sourceType=item.file.type||'video/mp4';
      item.result.types=[];
      item.result.proof=item.youtube?.url||'';
      item.result.youtube=item.youtube;
      item.status=item.result.complete?'OCR fertig · Prüfung offen':'OCR unvollständig · Prüfung nötig';
      item.progress=100;
      renderQueue();
      if(isQueueItemAlive(item)&&!state.editing)openEditor(item);
    }catch(err){
      console.error('OCR item failed',err);
      if(item.cancelled){item.status='Aus Warteschlange entfernt';item.progress=0;}else{item.status='Fehler: '+(err?.message||err);item.progress=0;}
      renderQueue();
    }finally{
      if(media)closeLocalVideo(media);
      item.processing=false;
      item.ocrProcessing=false;
      item.uploading=false;
      renderQueue();
    }
  }

  async function pumpUploads(){
    if(state.uploadRunner)return;
    clearExpiredYoutubeConnectionBlocks();
    state.uploadRunner=true;
    try{
      while(true){
        const item=state.queue.find(i=>!i.uploadStarted&&!i.uploadFailed&&!i.editingDone&&i.status!=='Gespeichert'&&!i.youtube);
        if(!item)break;
        const excluded=new Set();
        let uploaded=false;
        while(true){
          const choices=usableYoutubeConnections(excluded);
          if(!choices.length)break;
          const c=choices[0];
          excluded.add(Number(c.slot));
          const slot=Number(c.slot);
          try{
            const token=await ensureYoutubeTokenFresh(slot);
            state.activeYoutubeSlot=slot;syncLegacyYoutubeState(slot);
            item.youtubeConnectionSlot=slot;
            item.uploadStarted=true;item.uploading=true;item.processing=true;item.status=`YouTube-${slot}-Upload wird vorbereitet…`;item.progress=1;renderQueue();
            const sourceSize=await verifyLocalFile(item.file,0,'Ausgewählte POV');
            await putVideo(item.id,item.file);
            const storedCopy=await getVideo(item.id);
            if(!storedCopy)throw new Error('Lokale Kopie der POV konnte nicht gelesen werden.');
            if(Number(storedCopy.size)!==sourceSize)throw new Error(`Lokale Speicherung beschädigt: Quelle ${formatBytesExact(sourceSize)} · Archiv ${formatBytesExact(storedCopy.size)}.`);
            if(!(await compareFileEdges(item.file,storedCopy)))throw new Error('Lokale Speicherung stimmt am Anfang/Ende nicht mit der Originaldatei überein.');
            item.status=`YouTube ${slot}-Upload 0% · ${formatSize(sourceSize)} (${formatBytesExact(sourceSize)})`;item.progress=2;renderQueue();
            item.youtube=await uploadYoutube(item.file,item.file.name,token,p=>{item.progress=2+Math.round(p*.58);item.status=`YouTube ${slot}-Upload ${p}% · ${formatSize(sourceSize)} (${formatBytesExact(sourceSize)})`;renderQueue();},slot);
            item.youtubeConnectionSlot=slot;
            item.youtubeLimitBlocked=false;item.uploadFailed=false;item.progress=60;item.uploading=false;item.processing=false;uploaded=true;
            item.status=item.result?'Upload fertig · OCR bereits vorhanden · Prüfung offen':'Upload fertig · OCR läuft im Hintergrund';renderQueue();
            if(!item.result){item.ocrProcessing=true;item.ocrPromise=runOcrForUploadedItem(item,sourceSize,storedCopy,0);}
            break;
          }catch(err){
            console.error(`Queue upload failed on YouTube ${slot}`,err);
            item.uploading=false;item.processing=false;
            if(isYoutubeQuotaError(err)||isYoutubeUploadLimitError(err)){
              const reason=isYoutubeUploadLimitError(err)?'YouTube-Uploadlimit erreicht':'YouTube-Quota erreicht';
              markYoutubeConnectionBlocked(slot,reason);
              item.uploadStarted=false;item.uploadFailed=false;item.youtube=null;item.youtubeConnectionSlot=0;
              item.status=`${reason} · Verbindung ${slot} wird übersprungen`;item.progress=0;renderQueue();
              continue;
            }
            const msg=err?.message||String(err);
            const cnow=connection(slot);if(cnow){cnow.lastError=msg;cnow.connected=!!cnow.accessToken;saveYoutubeConnections();renderYoutubeConnections();}
            item.status='Fehler: '+msg;item.progress=0;item.uploadStarted=false;item.uploadFailed=true;renderQueue();
            break;
          }
        }
        if(!uploaded){
          const retryAt=earliestYoutubeRetry();
          const configured=configuredYoutubeConnections();
          item.uploadStarted=false;item.uploadFailed=false;item.processing=false;item.uploading=false;item.progress=0;
          if(retryAt){
            item.status=`YouTube-Verbindungen voll/gesperrt · Retry in ${formatRetryClock(retryAt-Date.now())}`;
            scheduleYoutubeRetryAt(retryAt);
          }else if(configured.length===0){
            item.status='Wartet auf YouTube-Verbindung · leere Felder werden ignoriert';
          }else{
            item.status='Wartet auf YouTube-Verbindung';
          }
          renderQueue();
          break;
        }
      }
    }finally{
      state.uploadRunner=false;
      if(state.queue.some(i=>!i.uploadStarted&&!i.uploadFailed&&!i.editingDone&&i.status!=='Gespeichert'&&!i.youtube)&&usableYoutubeConnections().length){queueMicrotask(()=>pumpUploads());}
    }
  }
  // Compatibility wrapper for older UI handlers.
  async function processQueue(){return pumpUploads();}

  function validClientId(clientId){
    return /^[0-9]+-[A-Za-z0-9_-]+\.apps\.googleusercontent\.com$/.test(String(clientId||'').trim());
  }

  function persistYoutubeToken(token,expiresIn=0,slot=state.activeYoutubeSlot){
    const c=connection(slot)||connection(1);if(!c)return '';
    c.accessToken=String(token||'');
    if(Number(expiresIn)>0)c.tokenExpiresAt=Date.now()+Math.max(60,Number(expiresIn)-30)*1000;
    c.connected=!!(c.clientId&&c.accessToken);
    c.blockedUntil=0;c.blockedReason='';c.lastError='';c.updatedAt=Date.now();
    syncLegacyYoutubeState(c.slot);
    saveYoutubeConnections();
    renderYoutubeConnections();
    if(c.accessToken)queueMicrotask(()=>pumpUploads());
    return c.accessToken;
  }
  function clearYoutubeToken(slot=state.activeYoutubeSlot){
    const c=connection(slot);if(!c)return;
    c.accessToken='';c.tokenExpiresAt=0;c.connected=false;c.blockedUntil=0;c.blockedReason='';c.lastError='';c.updatedAt=Date.now();
    if(Number(c.slot)===1){localStorage.removeItem('yt_access_token');localStorage.removeItem('yt_access_expires_at_v50');}
    syncLegacyYoutubeState(c.slot);saveYoutubeConnections();renderYoutubeConnections();
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
  async function refreshYoutubeToken(silent=true,slot=state.activeYoutubeSlot){
    const c=connection(slot);if(!c?.clientId)throw new Error('Google OAuth Client-ID fehlt oder ist ungültig.');
    const existing=state.tokenRefreshPromises.get(Number(slot));if(existing)return existing;
    const promise=(async()=>{
      const ready=await waitForGoogleGIS();
      if(!ready)throw new Error('Google Identity Services konnte nicht geladen werden. Bitte Seite neu laden und YouTube erneut verbinden.');
      return await new Promise((resolve,reject)=>{
        let finished=false;
        const done=(fn,val)=>{if(finished)return;finished=true;fn(val);};
        const callback=(resp)=>{
          if(resp?.error){done(reject,new Error(`YouTube-Zugriff konnte nicht erneuert werden: ${resp.error_description||resp.error}`));return;}
          if(!resp?.access_token){done(reject,new Error('Google hat beim Erneuern kein Zugriffstoken geliefert.'));return;}
          persistYoutubeToken(resp.access_token,Number(resp.expires_in||3600),slot);
          showYoutubeHelp('YouTube-Zugriff automatisch erneuert.','good',slot);
          done(resolve,resp.access_token);
        };
        try{
          const client=window.google.accounts.oauth2.initTokenClient({client_id:c.clientId,scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl',include_granted_scopes:false,callback,error_callback:(err)=>done(reject,new Error(`Google OAuth konnte nicht erneuert werden: ${err?.message||err?.type||'unbekannter Fehler'}`))});
          state.tokenClient=client;state.activeYoutubeSlot=Number(slot);
          client.requestAccessToken({prompt:silent?'':'consent'});
        }catch(err){done(reject,err instanceof Error?err:new Error(String(err)));}
        setTimeout(()=>done(reject,new Error('Zeitüberschreitung beim Erneuern des YouTube-Zugriffs.')),12000);
      });
    })();
    state.tokenRefreshPromises.set(Number(slot),promise);
    try{return await promise;}finally{state.tokenRefreshPromises.delete(Number(slot));}
  }
  async function ensureYoutubeTokenFresh(slot){
    const c=connection(slot);if(!c?.clientId||!c?.accessToken)throw new Error('YouTube-Verbindung nicht verfügbar.');
    if(Number(c.tokenExpiresAt||0)>0 && Date.now()>Number(c.tokenExpiresAt)-2*60*1000){
      try{await refreshYoutubeToken(true,slot);}catch(err){c.lastError=err?.message||String(err);c.connected=!!c.accessToken;saveYoutubeConnections();renderYoutubeConnections();throw err;}
    }
    return c.accessToken;
  }
  function setYoutubeButton(text,disabled=false,slot=state.activeYoutubeSlot){const btn=$(`#ytConnect${slot}`);if(btn){btn.disabled=disabled;btn.textContent=text;}}
  function showYoutubeHelp(text,kind='',slot=state.activeYoutubeSlot){const help=$(`#ytHelp${slot}`)||$('#ytConnectHelp');if(help){help.textContent=text;help.style.color=kind==='error'?'#ff8ebd':kind==='good'?'#69e1af':kind==='warn'?'#f0ca70':'';}}
  function configureYoutubeClient(clientId,slot=state.activeYoutubeSlot){setYoutubeConnectionClientId(slot,clientId);return !!connection(slot)?.clientId;}
  function randomState(){const bytes=new Uint8Array(24);crypto.getRandomValues(bytes);return [...bytes].map(b=>b.toString(16).padStart(2,'0')).join('');}
  async function waitForGoogleGIS(){
    if(window.google?.accounts?.oauth2)return true;
    const started=Date.now();
    while(Date.now()-started<8000){
      await new Promise(r=>setTimeout(r,100));
      if(window.google?.accounts?.oauth2)return true;
    }
    return false;
  }
  function requestYoutubeTokenPopup(slot,prompt){
    const c=connection(slot);
    if(!c?.clientId)throw new Error('Bitte zuerst die Google OAuth Client-ID eintragen.');
    if(!validClientId(c.clientId))throw new Error('Die Google OAuth Client-ID sieht ungültig aus.');
    if(!window.google?.accounts?.oauth2)throw new Error('Google-Anmeldung ist noch nicht geladen. Bitte kurz warten und erneut klicken.');
    return new Promise((resolve,reject)=>{
      let finished=false;
      const done=(fn,v)=>{if(finished)return;finished=true;fn(v);};
      try{
        const client=window.google.accounts.oauth2.initTokenClient({
          client_id:c.clientId,
          scope:'https://www.googleapis.com/auth/youtube.upload https://www.googleapis.com/auth/youtube.readonly https://www.googleapis.com/auth/youtube.force-ssl',
          include_granted_scopes:false,
          callback:resp=>{
            if(resp?.error)return done(reject,new Error(resp.error_description||resp.error));
            if(!resp?.access_token)return done(reject,new Error('Google hat kein YouTube-Zugriffstoken zurückgegeben.'));
            persistYoutubeToken(resp.access_token,Number(resp.expires_in||3600),slot);
            done(resolve,String(resp.access_token));
          },
          error_callback:e=>done(reject,new Error(e?.message||e?.type||'Google YouTube OAuth fehlgeschlagen.'))
        });
        client.requestAccessToken({prompt});
      }catch(err){done(reject,err instanceof Error?err:new Error(String(err)));}
      setTimeout(()=>done(reject,new Error('Zeitüberschreitung bei der YouTube-Anmeldung.')),20000);
    });
  }
  async function startYoutubeOAuth(slot,forceConsent=false){
    const ready=window.google?.accounts?.oauth2 || await waitForGoogleGIS();
    if(!ready)throw new Error('Google-Anmeldung ist nicht verfügbar. Bitte die Seite einmal neu laden.');
    setYoutubeButton('Google wird geöffnet…',true,slot);
    showYoutubeHelp('Google-Anmeldung wird geöffnet…','',slot);
    try{
      await requestYoutubeTokenPopup(Number(slot)||1,forceConsent?'consent':'select_account');
      setYoutubeButton('YouTube verbunden',false,slot);
      showYoutubeHelp(`✓ YouTube-Verbindung ${slot} erfolgreich verbunden.`, 'good', slot);
      toast(`YouTube-Verbindung ${slot} verbunden.`);
    }catch(err){
      const msg=err?.message||String(err);
      showYoutubeHelp(msg,'error',slot);
      toast(msg);
      throw err;
    }finally{
      const c=connection(slot);
      setYoutubeButton(c?.connected?'YouTube verbunden':'Mit YouTube verbinden',false,slot);
    }
  }
  function initYoutube(slot){void startYoutubeOAuth(Number(slot)||1,false).catch(err=>console.warn('YouTube OAuth',err));}
  function reauthorizeYoutube(slot){void startYoutubeOAuth(Number(slot)||1,true).catch(err=>console.warn('YouTube Reauth',err));}
  function disconnectYoutube(slot){clearYoutubeToken(Number(slot)||1);showYoutubeHelp('YouTube-Verbindung entfernt.','good',slot);toast(`YouTube-Verbindung ${slot} entfernt.`);}
  window.grandrpPrepareYouTubeAuth=(slot,force)=>{if(typeof slot==='boolean'){force=slot;slot=1;}return (force?reauthorizeYoutube:initYoutube)(Number(slot)||1);};
  window.grandrpDisconnectYouTube=()=>{for(let i=1;i<=YT_MAX_CONNECTIONS;i++)clearYoutubeToken(i);renderYoutubeConnections();};
  window.grandrpReauthorizeYouTube=(slot)=>reauthorizeYoutube(Number(slot)||1);
  window.connectYouTubeNow=(slot)=>initYoutube(Number(slot)||1);
  window.reauthorizeYouTube=(slot)=>reauthorizeYoutube(Number(slot)||1);

  function loadDriveState(){try{return JSON.parse(localStorage.getItem(DRIVE_STATE_KEY)||'null')||{connected:false,clientId:'',accessToken:'',tokenExpiresAt:0};}catch{return {connected:false,clientId:'',accessToken:'',tokenExpiresAt:0};}}
  function saveDriveState(v){try{localStorage.setItem(DRIVE_STATE_KEY,JSON.stringify({...v,updatedAt:Date.now()}));}catch(err){console.warn('Drive-Status konnte nicht gespeichert werden',err);}}
  function driveState(){return loadDriveState();}
  function renderDriveStatus(){const st=driveState(),el=$('#driveStatus'),help=$('#driveHelp'),connect=$('#driveConnectBtn'),sync=$('#driveSyncBtn'),restore=$('#driveRestoreBtn');const linked=!!(st.clientId&&(st.connected||st.accessToken));const tokenValid=!!(st.accessToken&&Number(st.tokenExpiresAt||0)>Date.now()+15000);if(el){el.className='connection '+(linked?'good':'');el.textContent=linked?(tokenValid?'● Verbunden':'● Verbunden · Erneuerung nötig'):'● Nicht verbunden';}if(connect)connect.textContent=linked?'Google Drive erneut verbinden':'Google Drive verbinden';if(sync)sync.disabled=!tokenValid||driveSyncInProgress;if(restore)restore.disabled=!tokenValid||driveSyncInProgress;if(help&&linked){help.textContent=tokenValid?'Google Drive verbunden. Automatisches Backup nach jedem gespeicherten POV. Es wird nur das Archiv als JSON gesichert – keine POV-Videodateien.':'Google Drive bleibt verbunden. Der aktuelle Zugriff ist abgelaufen; automatische Backups warten, bis du „Google Drive erneut verbinden“ klickst.';}}
  async function driveTokenFresh(forceConsent=false){
    let st=driveState();
    if(st.accessToken&&Number(st.tokenExpiresAt||0)>Date.now()+120000)return st.accessToken;
    // Niemals aus einem Hintergrund-Backup heraus einen OAuth-Popup öffnen.
    // Ein abgelaufener Zugriff beendet die gespeicherte Drive-Verknüpfung nicht.
    throw new Error('Google-Drive-Zugriff ist abgelaufen. Bitte „Google Drive erneut verbinden“ klicken.');
  }
  function startDriveOAuth(){
    const c=state.ytConnections.find(x=>String(x?.clientId||'').trim())||connection(1)||state.ytConnections[0];
    const clientId=String(c?.clientId||'').trim();
    if(!clientId)throw new Error('Bitte zuerst die Google OAuth Client-ID in YouTube-Verbindung 1 eintragen.');
    if(!validClientId(clientId))throw new Error('Die Google OAuth Client-ID sieht ungültig aus.');
    if(!window.google?.accounts?.oauth2)throw new Error('Google-Anmeldung ist noch nicht geladen. Bitte kurz warten und erneut klicken.');
    const st={purpose:'drive',clientId,createdAt:Date.now()};
    return new Promise((resolve,reject)=>{
      let finished=false;const done=(fn,v)=>{if(finished)return;finished=true;fn(v);};
      try{
        const client=window.google.accounts.oauth2.initTokenClient({client_id:clientId,scope:DRIVE_SCOPE,include_granted_scopes:false,callback:resp=>{
          if(resp?.error)return done(reject,new Error(resp.error_description||resp.error));
          const token=String(resp?.access_token||'');if(!token)return done(reject,new Error('Google hat kein Drive-Zugriffstoken zurückgegeben.'));
          const ns={version:4,updatedAt:Date.now(),clientId,accessToken:token,tokenExpiresAt:Date.now()+Math.max(60,Number(resp.expires_in||3600)-30)*1000,connected:true,accountHint:'same-as-youtube-1'};
          saveDriveState(ns);renderDriveStatus();const h=$('#driveHelp');if(h)h.textContent='✓ Google Drive verbunden. Es wird nur das JSON-Archiv gesichert.';toast('Google Drive verbunden.');done(resolve,token);
        },error_callback:e=>done(reject,new Error(e?.message||e?.type||'Google Drive OAuth fehlgeschlagen.'))});
        client.requestAccessToken({prompt:'select_account'});
      }catch(err){done(reject,err instanceof Error?err:new Error(String(err)));}
      setTimeout(()=>done(reject,new Error('Zeitüberschreitung bei der Google-Drive-Anmeldung.')),20000);
    });
  }
  async function driveApi(url,options={}){let token=await driveTokenFresh(false);let r=await fetch(url,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${token}`}});if(r.status===401){throw new Error('Google-Drive-Zugriff ist abgelaufen. Bitte „Google Drive erneut verbinden“ klicken.');}if(!r.ok){const body=(await r.text()).slice(0,1200);throw new Error(`Google Drive API ${r.status}: ${body}`);}return r;}
  async function driveEnsureFolder(){const q=encodeURIComponent(`name='${DRIVE_FOLDER_NAME.replace(/'/g,"\\'")}' and mimeType='${DRIVE_FOLDER_MIME}' and trashed=false`);const r=await driveApi(`https://www.googleapis.com/drive/v3/files?q=${q}&pageSize=10&fields=files(id,name,mimeType)`);const d=await r.json();if(d.files?.[0]?.id)return d.files[0].id;const cr=await driveApi('https://www.googleapis.com/drive/v3/files',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:DRIVE_FOLDER_NAME,mimeType:DRIVE_FOLDER_MIME})});return (await cr.json()).id;}
  async function driveFindFile(name,folderId){const q=encodeURIComponent(`name='${String(name).replace(/'/g,"\\'")}' and '${folderId}' in parents and trashed=false`);const r=await driveApi(`https://www.googleapis.com/drive/v3/files?q=${q}&orderBy=modifiedTime desc&pageSize=20&fields=files(id,name,size,mimeType,modifiedTime,appProperties)`);return (await r.json()).files?.[0]||null;}
  async function driveUploadJson(name,folderId,payload,existingId){const boundary='----grandrpDrive'+Math.random().toString(16).slice(2);const meta=existingId?{name}:{name,parents:[folderId],mimeType:'application/json'};const body=`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${JSON.stringify(meta)}\r\n--${boundary}\r\nContent-Type: application/json\r\n\r\n${JSON.stringify(payload)}\r\n--${boundary}--`;const url=existingId?`https://www.googleapis.com/upload/drive/v3/files/${encodeURIComponent(existingId)}?uploadType=multipart&fields=id,name,modifiedTime`:'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,modifiedTime';return (await driveApi(url,{method:existingId?'PATCH':'POST',headers:{'Content-Type':`multipart/related; boundary=${boundary}`},body})).json();}
  async function syncDriveBackup(options={}){if(driveSyncInProgress)return;driveSyncInProgress=true;renderDriveStatus();const help=$('#driveHelp');const interactive=options.interactive===true;try{
    const st=driveState();
    if(!st?.clientId||!st?.accessToken){return;}
    // Automatische Backups dürfen niemals ungefragt ein Google-OAuth-Popup öffnen.
    // Ist das Token abgelaufen, wird die Sicherung still übersprungen; ein manueller
    // Klick auf „Backup“ darf dagegen die normale OAuth-Erneuerung durchführen.
    let token='';
    if(Number(st.tokenExpiresAt||0)>Date.now()+15000) token=String(st.accessToken||'');
    else if(interactive) token=await driveTokenFresh(false);
    else return;
    if(!token)return;
    const folder=await driveEnsureFolder();
    const entries=sanitizeArchiveEntries(state.entries||[]).map(e=>{const copy={...e};delete copy.driveFileId;delete copy.file;delete copy.videoUrl;return copy;});
    const manifest={format:'grandrp-cloud-archive',version:2,backupType:'metadata-only',createdAt:new Date().toISOString(),note:'Nur Archiv-Metadaten und Proof-/YouTube-Links. Keine POV-Videodateien werden in Google Drive gespeichert.',entries};
    const mf=await driveFindFile(DRIVE_MANIFEST_NAME,folder);
    await driveUploadJson(DRIVE_MANIFEST_NAME,folder,manifest,mf?.id||'');
    saveDriveState({...driveState(),connected:true,clientId:driveState().clientId});
    if(help)help.textContent=`✓ Archiv-Backup gesichert · ${entries.length} Einträge · nur JSON`;
    if(interactive)toast(`Archiv-Backup gesichert · ${entries.length} Einträge.`);
  }catch(err){
    console.error('Google-Drive-Backup fehlgeschlagen',err);
    const msg=String(err?.message||err||'');
    // „Popup window closed“ ist bei Google OAuth kein Daten-/Archivfehler.
    // Bei automatischen Backups wird deshalb keine störende rote Fehlermeldung mehr angezeigt.
    if(interactive){if(help)help.textContent='✕ Cloud-Backup fehlgeschlagen: '+msg;toast('Cloud-Backup fehlgeschlagen: '+msg);}
  }finally{driveSyncInProgress=false;renderDriveStatus();}}
  async function restoreDriveBackup(){if(driveSyncInProgress)return;driveSyncInProgress=true;renderDriveStatus();const help=$('#driveHelp');try{const folder=await driveEnsureFolder();const mf=await driveFindFile(DRIVE_MANIFEST_NAME,folder);if(!mf)throw new Error('Kein Cloud-Archiv gefunden.');const token=await driveTokenFresh(false);const r=await fetch(`https://www.googleapis.com/drive/v3/files/${encodeURIComponent(mf.id)}?alt=media`,{headers:{Authorization:`Bearer ${token}`}});if(!r.ok)throw new Error(`Cloud-Manifest ${r.status}`);const manifest=await r.json();const entries=sanitizeArchiveEntries(manifest?.entries||[]);if(!entries.length)throw new Error('Cloud-Archiv enthält keine Einträge.');const restored=entries.map(e=>{const copy={...e};delete copy.driveFileId;return copy;});state.entries=restored;state.filter='all';state.archiveSelected.clear();if($('#search'))$('#search').value='';const stamp=Date.now();localStorage.setItem(DIRECT_RESTORE_KEY,JSON.stringify({version:8,updatedAt:stamp,name:DRIVE_MANIFEST_NAME,entries:restored}));localStorage.setItem(ARCHIVE_BACKUP_KEY,JSON.stringify({version:8,updatedAt:stamp,entries:restored}));localStorage.setItem(ARCHIVE_AUTHORITATIVE_KEY,JSON.stringify({version:1,updatedAt:stamp,entries:restored}));localStorage.setItem(META_KEY,JSON.stringify(restored));localStorage.setItem(META_UPDATED_KEY,String(stamp));await saveMetaDb(restored,stamp,false);renderArchive();renderCases();renderCsv();renderQueue();showView('archive',false);persistCurrentView('archive');if(help)help.textContent=`✓ Archiv-Backup wiederhergestellt · ${restored.length} Einträge · keine POV-Videos aus Drive`;toast(`Archiv-Backup wiederhergestellt · ${restored.length} Einträge.`);}catch(err){console.error('Cloud-Backup-Wiederherstellung fehlgeschlagen',err);if(help)help.textContent='✕ Cloud-Backup-Wiederherstellung fehlgeschlagen: '+(err?.message||err);toast('Cloud-Backup-Wiederherstellung fehlgeschlagen: '+(err?.message||err));}finally{driveSyncInProgress=false;renderDriveStatus();}}
  function scheduleDriveRecoveryIfEmpty(){
    if(driveSyncInProgress)return;
    try{const st=driveState();const explicitlyCleared=!!localStorage.getItem(LOCAL_CLEAR_MARKER_KEY);const tokenValid=!!(st?.accessToken&&Number(st.tokenExpiresAt||0)>Date.now()+15000);if(!tokenValid||!st?.clientId||state.entries.length||explicitlyCleared)return;}catch{return;}
    setTimeout(()=>{if(!driveSyncInProgress&&!(state.entries||[]).length){void restoreDriveBackup();}},900);
  }
  function updateDriveResult(){try{const r=JSON.parse(localStorage.getItem(DRIVE_RESULT_KEY)||'null');if(r){const h=$('#driveHelp');if(h)h.textContent=r.message||'';localStorage.removeItem(DRIVE_RESULT_KEY);}}catch{}renderDriveStatus();scheduleDriveSync();scheduleDriveRecoveryIfEmpty();}

  let driveSyncTimer=0;
  function scheduleDriveSync(){
    if(driveSyncInProgress)return;
    try{const st=driveState();if(!st?.accessToken||!st?.clientId||!(state.entries||[]).length)return;}catch{return;}
    clearTimeout(driveSyncTimer);
    driveSyncTimer=setTimeout(()=>{driveSyncTimer=0;void syncDriveBackup();},1800);
  }
  function updateYtStatus(){renderYoutubeConnections();}
  async function waitForYoutubeProcessing(videoId,token,onProgress,expectedSize=0,slot=state.activeYoutubeSlot){
    if(!videoId||!token) throw new Error('YouTube-Video-ID oder Zugriffstoken fehlt.');
    const started=Date.now();
    const maxWaitMs=60*60*1000;
    // Adaptive status polling: frequent enough at the beginning, then slower
    // while YouTube is still processing. This does not change OCR accuracy; it
    // only reduces unnecessary videos.list calls while waiting for YouTube.
    const pollDelay=(elapsedMs)=>{
      if(elapsedMs<15_000)return 5_000;
      if(elapsedMs<45_000)return 10_000;
      if(elapsedMs<90_000)return 15_000;
      if(elapsedMs<180_000)return 20_000;
      if(elapsedMs<360_000)return 30_000;
      return 60_000;
    };
    while(Date.now()-started<maxWaitMs){
      const currentToken=connection(slot)?.accessToken||token;
      const url=`https://www.googleapis.com/youtube/v3/videos?part=processingDetails,status,fileDetails&id=${encodeURIComponent(videoId)}`;
      const r=await fetch(url,{headers:{Authorization:`Bearer ${currentToken}`}});
      if(!r.ok){
        const body=(await r.text()).slice(0,900);
        if(r.status===401){
          try{await refreshYoutubeToken(true,slot);continue;}catch(err){throw new Error(`${err.message} Die YouTube-Sitzung ist abgelaufen.`);}
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
      await new Promise(r=>setTimeout(r,pollDelay(Date.now()-started)));
    }
    throw new Error('Zeitüberschreitung: YouTube hat die Verarbeitung nicht innerhalb von 60 Minuten abgeschlossen.');
  }

  async function uploadYoutube(file,title,token,onProgress,slot=state.activeYoutubeSlot){
    if(!file)throw new Error('YouTube-Upload: Datei fehlt.');
    const expectedSize=await verifyLocalFile(file,0,'Upload-Quelle');
    const safeTitle=String(title||file.name||'Grand RP POV').replace(/\.[^.]+$/,'').slice(0,100);
    const meta={snippet:{title:safeTitle,description:'Grand RP POV Checker',categoryId:'20'},status:{privacyStatus:'unlisted',selfDeclaredMadeForKids:false}};
    const contentType=file.type||'video/mp4';
    const c=connection(slot);
    let accessToken=c?.accessToken||token||'';
    if(!accessToken)throw new Error(`YouTube-Verbindung ${slot} nicht verbunden.`);

    async function createSession(){
      const doInit=async(t)=>await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status',{method:'POST',headers:{Authorization:`Bearer ${t}`,'Content-Type':'application/json; charset=UTF-8','X-Upload-Content-Length':String(expectedSize),'X-Upload-Content-Type':contentType},body:JSON.stringify(meta)});
      let init=await doInit(accessToken);
      if(init.status===401){accessToken=await refreshYoutubeToken(true,slot);init=await doInit(accessToken);}
      if(!init.ok){
        const body=(await init.text()).slice(0,1200);
        if(init.status===429 && /ratelimitexceeded|quota exceeded|video uploads|resource_exhausted/i.test(body)){
          const e=new Error('YouTube-Video-Upload-Quota erreicht (HTTP 429). Neuer Versuch in 30 Minuten.');e.code='YT_QUOTA_429';throw e;
        }
        throw new Error(body);
      }
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
        accessToken=await refreshYoutubeToken(true,slot);
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
      if(resp.status===429){
        const body=String(resp.responseText||'');
        if(/ratelimitexceeded|quota exceeded|video uploads|resource_exhausted/i.test(body)){
          const e=new Error('YouTube-Video-Upload-Quota erreicht (HTTP 429). Neuer Versuch in 30 Minuten.');e.code='YT_QUOTA_429';throw e;
        }
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
  async function updateYoutubeTitle(videoId,title,slotOrToken=state.activeYoutubeSlot){
    if(!videoId)return;
    const desiredTitle=String(title||'POV').trim();
    if(!desiredTitle)throw new Error('YouTube-Titel ist leer.');
    if(desiredTitle.length>100)throw new Error(`YouTube-Titel ist zu lang (${desiredTitle.length}/100 Zeichen).`);
    const slot=typeof slotOrToken==='number'?slotOrToken:state.activeYoutubeSlot;
    const c=connection(slot);
    let accessToken=c?.accessToken||'';
    if(!accessToken)throw new Error(`YouTube-Verbindung ${slot} nicht verbunden.`);

    const api=async(path,options={})=>{
      const res=await fetch(path,{...options,headers:{...(options.headers||{}),Authorization:`Bearer ${accessToken}`}});
      if(res.status===401){
        accessToken=await refreshYoutubeToken(true,slot);
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

  async function collectDurableBackupEntries(){
    const merged=new Map();
    const add=rows=>{for(const e of sanitizeArchiveEntries(rows||[])){const id=String(e.id);const old=merged.get(id);const ou=Number(old?.updatedAt||old?.savedAt||0);const eu=Number(e?.updatedAt||e?.savedAt||0);if(!old||eu>=ou)merged.set(id,e);}};
    add(state.entries);
    try{
      const dbData=await getMetaDb();
      add(dbData?.entries);add(dbData?.perma);
      const snaps=await getArchiveSnapshotsDb();
      for(const snap of snaps)add(snap.entries);
    }catch(err){console.warn('Dauerhaftes Archiv konnte für Backup nicht vollständig gelesen werden',err);}
    try{
      const raw=localStorage.getItem(ARCHIVE_BACKUP_KEY);
      if(raw){const parsed=JSON.parse(raw);add(Array.isArray(parsed)?parsed:parsed?.entries);}
    }catch{}
    return [...merged.values()];
  }

  function buildArchiveBackupPayload(entries){
    return {
      format:'grandrp-archive-backup',
      version:4,
      createdAt:new Date().toISOString(),
      entries:sanitizeArchiveEntries(entries),
      youtubeConnections:normalizeYoutubeConnections(state.ytConnections||[]),
      settings:{...state.settings}
    };
  }
  function triggerBrowserDownload(blob,filename){
    const url=URL.createObjectURL(blob);
    try{
      const a=document.createElement('a');
      a.href=url;
      a.download=filename;
      a.rel='noopener';
      a.style.position='fixed';a.style.left='-99999px';a.style.top='-99999px';a.style.width='1px';a.style.height='1px';
      document.body.appendChild(a);
      document.body.appendChild(a);
      a.click();
      setTimeout(()=>{try{a.remove();}catch{};try{URL.revokeObjectURL(url);}catch{};},1500);
      return true;
    }catch(err){
      try{URL.revokeObjectURL(url);}catch{}
      throw err;
    }
  }
  function downloadArchiveBackup(){
    (async()=>{
      try{
        const durable=await collectDurableBackupEntries();
        const current=window.grandrpGetArchiveEntries?.()||[];
        const entries=current.length?current:sanitizeArchiveEntries(durable||[]);
        if(!entries.length){toast('Kein Archiv zum Sichern vorhanden.');return;}
        const payload=buildArchiveBackupPayload(entries);
        const blob=new Blob([JSON.stringify(payload,null,2)],{type:'application/json'});
        const ok=triggerBrowserDownload(blob,`grandrp-archiv-backup-${new Date().toISOString().slice(0,10)}.json`);
        if(ok)toast(`${entries.length} Archiv-Einträge gesichert.`);
      }catch(err){
        console.error('Archiv-Backup-Download fehlgeschlagen',err);
        toast('Backup konnte nicht heruntergeladen werden: '+(err?.message||err));
      }
    })();
  }
  async function parseArchiveBackupFile(file){
    if(!file)throw new Error('Keine Backup-Datei ausgewählt.');
    const name=String(file.name||'').trim();
    if(name && !/\.json$/i.test(name))throw new Error('Bitte eine JSON-Backup-Datei auswählen.');
    let raw=await file.text();
    raw=String(raw||'').replace(/^\uFEFF/,'').trim();
    if(!raw)throw new Error('Die Backup-Datei ist leer.');
    let parsed;
    try{parsed=JSON.parse(raw);}catch(err){throw new Error('Die ausgewählte Datei enthält kein gültiges JSON.');}
    const entries=Array.isArray(parsed)?parsed:(
      Array.isArray(parsed?.entries)?parsed.entries:
      Array.isArray(parsed?.archive)?parsed.archive:
      Array.isArray(parsed?.data?.entries)?parsed.data.entries:[]
    );
    const clean=sanitizeArchiveEntries(entries);
    if(!clean.length)throw new Error('Die Backup-Datei enthält keine gültigen Archiv-Einträge.');
    return {parsed,entries:clean};
  }
  async function forceApplyDirectRestore(options={}){
    try{
      const payload=readDirectRestorePayload();
      if(!payload)return 0;
      let clean=sanitizeArchiveEntries(payload?.entries);
      if(!clean.length)return 0;
      // A direct restore is applied after normal startup. It must obey the same sticky
      // POV-Archiv placement rule; otherwise an older backup can move an archived POV
      // back into "Alle" only after a full page reload.
      clean=applyArchivePlacement(clean);
      rememberArchivePlacementFromSources([{entries:clean}]);
      const activeBefore=document.querySelector('.view.active')?.id?.replace(/^view-/,'');
      // A restore is authoritative: use the selected backup as the complete archive.
      // Do this AFTER normal startup/loading so no older IndexedDB snapshot can replace it.
      state.entries=clean.map(e=>({...e,file:undefined,videoUrl:undefined}));
      try{
        const normalized={...payload,updatedAt:Math.max(Number(payload?.updatedAt)||0,Date.now()),entries:sanitizeArchiveEntries(state.entries)};
        localStorage.setItem(DIRECT_RESTORE_KEY,JSON.stringify(normalized));
      }catch{}
      try{localStorage.removeItem(LOCAL_CLEAR_MARKER_KEY);}catch{}
      state.archiveSelected.clear();
      state.filter='all';
      if($('#search'))$('#search').value='';
      const stamp=Number(payload?.updatedAt)||Date.now();
      localStorage.setItem(ARCHIVE_BACKUP_KEY,JSON.stringify({version:5,updatedAt:stamp,entries:state.entries}));
      localStorage.setItem(ARCHIVE_AUTHORITATIVE_KEY,JSON.stringify({version:1,updatedAt:stamp,entries:state.entries}));
      localStorage.setItem(META_KEY,JSON.stringify(state.entries));
      localStorage.setItem(META_UPDATED_KEY,String(stamp));
      // UI-first restore: IndexedDB persistence must never block the visible restore.
      void saveMetaDb(state.entries,Math.max(Date.now(),stamp),false).catch(err=>console.warn('Backup wurde lokal übernommen; IndexedDB-Sicherung folgt/fehlte:',err));
      if(payload?.youtubeConnections)state.ytConnections=normalizeYoutubeConnections(payload.youtubeConnections);
      if(payload?.settings&&typeof payload.settings==='object')state.settings={...state.settings,...payload.settings};
      saveYoutubeConnections();
      void saveDurableAppState();
      try{renderArchive();}catch(err){console.error('Archiv konnte nach Restore nicht gerendert werden',err);}
      try{renderCases();}catch(err){console.error('Verdachtsfälle konnten nach Restore nicht gerendert werden',err);}
      try{renderCsv();}catch(err){console.error('CSV konnte nach Restore nicht gerendert werden',err);}
      try{renderQueue();}catch(err){console.error('Warteschlange konnte nach Restore nicht gerendert werden',err);}
      try{
        const target=(options.forceArchive===true?'archive':activeBefore);
        if(target&&views[target])showView(target,false);
      }catch(err){console.error('Ansicht konnte nach Restore nicht wiederhergestellt werden',err);}
      if(options.forceArchive===true){try{persistCurrentView('archive');}catch{}}
      const status=$('#archiveBackupFileName');
      if(status && options.showStatus!==false)status.textContent=`✓ Archiv wiederhergestellt · ${state.entries.length} Einträge · ${String(payload?.name||'Backup')}`;
      return state.entries.length;
    }catch(err){
      console.error('Direkter Archiv-Restore fehlgeschlagen',err);
      throw err;
    }
  }

  async function restoreArchiveBackup(file){
    if(archiveRestoreInProgress)return;
    archiveRestoreInProgress=true;
    try{
      const {parsed,entries:clean}=await parseArchiveBackupFile(file);
      const label=String(file?.name||'Backup');
      const nameEl=$('#archiveBackupFileName');
      if(nameEl)nameEl.textContent=`Backup wird übernommen: ${label} · ${clean.length} Einträge …`;
      const importStamp=Date.now();
      const directPayload={version:3,updatedAt:importStamp,name:label,entries:clean,
        youtubeConnections:parsed?.youtubeConnections||undefined,
        settings:parsed?.settings||undefined};
      // Write the authoritative restore record first. It survives reloads and protects the
      // imported archive against concurrent startup reads of stale IndexedDB/localStorage.
      localStorage.removeItem(LOCAL_CLEAR_MARKER_KEY);
      localStorage.setItem(DIRECT_RESTORE_KEY,JSON.stringify(directPayload));
      localStorage.setItem(ARCHIVE_BACKUP_KEY,JSON.stringify({version:6,updatedAt:importStamp,entries:clean}));
      // Apply immediately; never wait for archiveReadyPromise because that promise may still
      // be resolving in parallel with the file-input change event.
      let count=0;
      try{count=window.grandrpSetArchiveEntries?window.grandrpSetArchiveEntries(clean,{replace:true}):0;}catch(err){console.error('Direkter UI-Archivsetter fehlgeschlagen',err);}
      const forced=await forceApplyDirectRestore({showStatus:false,forceArchive:true});
      count=Math.max(count,forced);
      if(count<clean.length)throw new Error(`Restore-Prüfung fehlgeschlagen (${count}/${clean.length} Einträge übernommen).`);
      // Make the UI authoritative as well: clear filters/search and render the exact imported
      // list after persistence has completed.
      state.entries=clean.map(e=>({...e,file:undefined,videoUrl:undefined}));
      state.filter='all';
      state.archiveSelected.clear();
      if($('#search'))$('#search').value='';
      if($('#archiveGrid'))renderArchive();
      if($('#emptyState'))$('#emptyState').classList.add('hidden');
      renderCases();
      renderCsv();
      renderQueue();
      showView('archive',false);
      persistCurrentView('archive');
      const finalNameEl=$('#archiveBackupFileName');
      if(finalNameEl)finalNameEl.textContent=`✓ Archiv wiederhergestellt · ${count} Einträge · ${label}`;
      toast(`Archiv wiederhergestellt · ${count} Einträge.`);
    }catch(err){
      console.error('Archiv-Backup-Wiederherstellung fehlgeschlagen',err);
      toast('Backup konnte nicht wiederhergestellt werden: '+(err?.message||err));
      const el=$('#archiveBackupFileName');if(el)el.textContent='✕ Wiederherstellung fehlgeschlagen: '+(err?.message||err);
    }finally{
      archiveRestoreInProgress=false;
    }
  }

  function setupSettings(){
    // Install the public archive bridge before any optional settings widget can fail.
    window.grandrpGetArchiveEntries=()=>sanitizeArchiveEntries(state.entries||[]);
    window.grandrpSetArchiveEntries=(entries,options={})=>{
      const clean=sanitizeArchiveEntries(entries);
      if(!clean.length)throw new Error('Keine gültigen Archiv-Einträge zum Übernehmen.');
      if(options.replace===true) state.entries=clean;
      else {const byId=new Map(state.entries.map(e=>[String(e.id),e]));for(const e of clean)byId.set(String(e.id),e);state.entries=[...byId.values()];}
      state.filter='all';state.archiveSelected.clear();if($('#search'))$('#search').value='';
      renderArchive();renderCases();renderCsv();
      return state.entries.length;
    };
    window.grandrpDeleteArchiveEntry=async(id)=>{
      const key=String(id||'');const entry=state.entries.find(e=>String(e.id)===key);
      if(!entry)throw new Error('Archiv-Eintrag nicht gefunden.');
      await delVideo(entry.id,DESTRUCTIVE_TOKEN);state.entries=state.entries.filter(e=>String(e.id)!==key);state.archiveSelected.delete(entry.id);
      saveMeta({allowEmpty:state.entries.length===0,explicitDelete:true});renderArchive();renderCases();renderCsv();return true;
    };
    window.grandrpClearLocalData=async()=>{
      state.entries=[];state.queue=[];
      try{localStorage.removeItem(META_KEY);localStorage.removeItem(META_UPDATED_KEY);localStorage.removeItem(ARCHIVE_BACKUP_KEY);localStorage.removeItem(ARCHIVE_AUTHORITATIVE_KEY);localStorage.removeItem(DIRECT_RESTORE_KEY);localStorage.removeItem(LEGACY_DIRECT_RESTORE_KEY);localStorage.removeItem(QUEUE_STORAGE_KEY);localStorage.removeItem(QUEUE_UPDATED_KEY);}catch{}
      await clearDB(DESTRUCTIVE_TOKEN);renderArchive();renderCases();renderCsv();renderQueue();return true;
    };
    window.grandrpForceArchiveRender=()=>{renderArchive();return state.entries.length;};

    state.settings.frames=Number(localStorage.getItem('v44_frames')||24);
    state.settings.window=Number(localStorage.getItem('v44_window')||4.5);
    state.settings.step=Number(localStorage.getItem('v44_step')||.5);
    $('#frameCount').value=state.settings.frames;
    $('#refineWindow').value=state.settings.window;
    $('#refineStep').value=state.settings.step;
    $('#frameCount').onchange=e=>{state.settings.frames=Math.max(18,Math.min(28,Number(e.target.value)||24));localStorage.setItem('v44_frames',state.settings.frames)};
    $('#refineWindow').onchange=e=>{state.settings.window=Math.max(3,Math.min(7,Number(e.target.value)||4.5));localStorage.setItem('v44_window',state.settings.window)};
    $('#refineStep').onchange=e=>{state.settings.step=Math.max(.4,Math.min(1.0,Number(e.target.value)||.5));localStorage.setItem('v44_step',state.settings.step)};
    for(let slot=1;slot<=YT_MAX_CONNECTIONS;slot++){
      const input=$(`#ytClientId${slot}`), connectBtn=$(`#ytConnect${slot}`), reauthBtn=$(`#ytReauth${slot}`), disconnectBtn=$(`#ytDisconnect${slot}`);
      input?.addEventListener('input',e=>setYoutubeConnectionClientId(slot,e.target.value));
      input?.addEventListener('change',e=>setYoutubeConnectionClientId(slot,e.target.value));
      connectBtn?.addEventListener('click',()=>initYoutube(slot));
      reauthBtn?.addEventListener('click',()=>reauthorizeYoutube(slot));
      disconnectBtn?.addEventListener('click',()=>disconnectYoutube(slot));
    }
    try{renderYoutubeConnections();}catch(err){console.error('YouTube-Einstellungen konnten nicht initialisiert werden',err);}
    $('#downloadArchiveBackup')?.addEventListener('click',downloadArchiveBackup);
    $('#driveConnectBtn')?.addEventListener('click',()=>{try{startDriveOAuth();}catch(err){toast(err?.message||String(err));const h=$('#driveHelp');if(h)h.textContent='✕ '+(err?.message||String(err));}});
    $('#driveSyncBtn')?.addEventListener('click',()=>{void syncDriveBackup();});
    $('#driveRestoreBtn')?.addEventListener('click',()=>{void restoreDriveBackup();});
    updateDriveResult();
    const backupFile=$('#archiveBackupFile');
    // Public handlers are assigned even when an optional settings renderer failed.
    window.grandrpRestoreArchiveBackup=restoreArchiveBackup;
    window.grandrpDownloadArchiveBackup=downloadArchiveBackup;
    $('#clearLocal').onclick=async()=>{if(!confirm('Lokales Archiv wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.'))return;clearTimeout(queuePersistTimer);queuePersistTimer=0;state.entries=[];state.queue=[];try{localStorage.setItem(LOCAL_CLEAR_MARKER_KEY,String(Date.now()));localStorage.removeItem(META_KEY);localStorage.removeItem(META_UPDATED_KEY);localStorage.removeItem(ARCHIVE_BACKUP_KEY);localStorage.removeItem(ARCHIVE_AUTHORITATIVE_KEY);localStorage.removeItem(DIRECT_RESTORE_KEY);localStorage.removeItem(LEGACY_DIRECT_RESTORE_KEY);localStorage.removeItem(QUEUE_STORAGE_KEY);localStorage.removeItem(QUEUE_UPDATED_KEY);localStorage.removeItem(YT_CONNECTIONS_KEY);localStorage.removeItem('yt_client_id');localStorage.removeItem('yt_access_token');}catch{}state.ytConnections=normalizeYoutubeConnections([]);state.activeYoutubeSlot=1;syncLegacyYoutubeState(1);await clearDB(DESTRUCTIVE_TOKEN);renderArchive();renderCases();renderCsv();renderQueue();renderYoutubeConnections();toast('Lokale Daten gelöscht.');};
    updateYtStatus();
  }

  async function processPendingArchiveBackup(){
    try{
      const raw=localStorage.getItem(PENDING_BACKUP_KEY);
      if(!raw)return;
      let payload=JSON.parse(raw);
      if(!payload||typeof payload.raw!=='string'||!payload.raw.trim())return;
      const file=new File([payload.raw],String(payload.name||'grandrp-recovery-backup.json'),{type:'application/json'});
      await restoreArchiveBackup(file);
    }catch(err){console.error('Ausstehendes Archiv-Backup konnte nicht verarbeitet werden',err);}
  }

  async function bootApp(){
    if(window.__grandrpAppBooted)return;
    try{const saved=JSON.parse(localStorage.getItem(PC_CUSTOM_KEY)||'[]');if(Array.isArray(saved))saved.filter(Boolean).forEach(v=>pcCheckerCustom.add(String(v)));}catch{}
    window.__grandrpAppBooted=true;
    for(const [name,fn] of [['Navigation',setupNav],['Upload',setupUpload],['Editor',setupEditor],['Einstellungen',setupSettings]]){try{fn();}catch(err){console.error(`${name} konnte nicht initialisiert werden`,err);}}
    try{updateYtStatus();}catch(err){console.error('YouTube-Status konnte nicht initialisiert werden',err);}
    void requestPersistentStorage();
    setInterval(()=>{if(authUser&&state.entries.length)saveMeta();},30000);
    archiveReadyPromise=(async()=>{
      await loadQueue().catch(err=>{console.error('Warteschlange konnte nicht geladen werden',err);state.queue=[];});
      try{await loadMeta();}catch(err){console.error('Archiv konnte nicht geladen werden',err);}
    })();
    await archiveReadyPromise;
    renderYoutubeConnections();
    renderQueue();
    const persistedRetry=youtubeRetryAt();
    if(persistedRetry>0){
      if(persistedRetry>Date.now())scheduleYoutubeRetryAt(persistedRetry);
      else {localStorage.removeItem(YT_RETRY_KEY);state.youtubeUploadBlocked=false;}
    }
    for(const item of state.queue){
      if(item.youtube && !item.result && !item.cancelled){
        try{
          const stored=await getVideo(item.id);
          item.ocrProcessing=true;
          item.processing=true;
          item.uploading=false;
          item.status='Upload fertig · OCR wird fortgesetzt';
          item.progress=Math.max(60,Number(item.progress)||60);
          item.ocrPromise=runOcrForUploadedItem(item,Number(item.sourceSize)||Number(item.file.size)||0,stored,Number(item.remoteSize)||0);
        }catch(err){
          item.status='Fehler: Lokale POV-Datei konnte nach Seitenaktualisierung nicht geladen werden: '+(err?.message||err);
          item.ocrProcessing=false;
          item.processing=false;
          item.uploadFailed=true;
          renderQueue();
        }
      }
    }
    renderQueue();
    void pumpUploads();
    renderArchive();renderCases();renderCsv();renderQueue();renderYoutubeConnections();renderAuthUsers();
    restoreSavedView();
    // Last startup step: an explicitly selected backup is authoritative and is re-applied
    // after every normal loader has finished. This prevents stale/empty stores from winning.
    try{await forceApplyDirectRestore({showStatus:false});}catch(err){console.error('Startup-Restore konnte nicht abgeschlossen werden',err);}
    updateDriveResult();
    scheduleDriveSync();
  }
  function persistActiveViewNow(){try{const active=document.querySelector('.view.active')?.id?.replace(/^view-/,'');if(active&&views[active])persistCurrentView(active);}catch{}}
  document.addEventListener('visibilitychange',persistActiveViewNow);
  window.addEventListener('pagehide',persistActiveViewNow);
  window.addEventListener('hashchange',()=>{try{const v=String(location.hash||'').slice(1);if(views[v]){localStorage.setItem('grandrp_current_view',v);sessionStorage.setItem('grandrp_current_view',v);}}catch{}});
  window.addEventListener('pageshow',()=>{try{if(authUser)restoreSavedView();}catch(err){console.warn('Ansicht nach Reload konnte nicht wiederhergestellt werden',err);}});
  window.addEventListener('beforeunload' ,()=>{persistActiveViewNow();try{const active=document.querySelector('.view.active')?.id?.replace(/^view-/,'');if(active&&views[active])persistCurrentView(active);}catch{};try{persistQueueNow();}catch{};try{saveYoutubeConnections();void saveDurableAppState();}catch{};try{state.worker?.terminate();}catch{};try{state.specialWorker?.terminate();}catch{};try{state.fastWorker?.terminate();}catch{}});
  setupAuthUI();
  authResume().then(ok=>{if(ok)bootApp();});
})();
