/* Grand RP DC Checker V88
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
  const BUILD='V88';
  const META_KEY='grandrp_pov_meta_v42';
  const DB_NAME='grandrp_pov_db_v42';
  const STORE='videos';
  const BAN_ADMIN_NAME='Adam Byers';
  const BAN_ADMIN_ID='15340';
  const PC_CHECKER_POOL=['Hunter Sanchez','Mark Weber','Christoph Contro','John Koo','Fugo Weezy','Tony Shy','Jason Azul','Memo Savage'];
  const PC_CHECKER_LEAD='Adam Byers';
  const PC_CUSTOM_KEY='grandrp_pc_checker_custom_v1';
  const YT_RETRY_DELAY_MS=30*60*1000;
  const YT_RETRY_KEY='grandrp_yt_quota_retry_at_v84';
  let youtubeRetryTimer=0;
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
  const state={entries:[],queue:[],filter:'all',editing:null,worker:null,specialWorker:null,fastWorker:null,accessToken:localStorage.getItem('yt_access_token')||sessionStorage.getItem('yt_access_token')||'',tokenClient:null,clientId:localStorage.getItem('yt_client_id')||'',settings:{frames:30,window:5,step:0.4},selectedTypes:new Set(),queueRunner:false,uploadRunner:false,localFallbackRunner:false,youtubeUploadBlocked:false,tokenExpiresAt:Number(localStorage.getItem('yt_access_expires_at_v50')||0),tokenRefreshPromise:null};
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
  async function getMetaDb(){try{const db=await openDB();return await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readonly');const os=tx.objectStore(STORE);const r=os.get(META_DB_KEY);const p=os.get(PERMA_DB_KEY);tx.oncomplete=()=>res({entries:Array.isArray(r.result)?r.result:[],perma:Array.isArray(p.result)?p.result:[]});tx.onerror=()=>rej(tx.error);});}catch{return {entries:[],perma:[]};}}
  async function saveMetaDb(entries){try{const db=await openDB();return await new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');const os=tx.objectStore(STORE);os.put(entries,META_DB_KEY);os.put(entries.filter(e=>e.permaArchive),PERMA_DB_KEY);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}catch(err){console.warn('Archiv-Metadaten konnten nicht in IndexedDB gesichert werden',err);}}
  async function requestPersistentStorage(){try{if(navigator.storage?.persist)await navigator.storage.persist();const persisted=await navigator.storage?.persisted?.();const el=$('#persistentStorageStatus');if(el){el.textContent=persisted?'● Dauerhafter Browser-Speicher aktiv':'● Browser-Speicher nicht garantiert';el.className='connection '+(persisted?'good':'warn');}return !!persisted;}catch{const el=$('#persistentStorageStatus');if(el){el.textContent='● Browser-Speicherstatus nicht verfügbar';el.className='connection warn';}return false;}}
  async function loadMeta(){
    try{
      const dbData=await getMetaDb();
      const dbEntries=Array.isArray(dbData)?dbData:(dbData.entries||[]);
      const dbPerma=Array.isArray(dbData?.perma)?dbData.perma:[];
      let raw=localStorage.getItem(META_KEY);
      if(!raw) raw=localStorage.getItem('grandrp_pov_meta_v27')||localStorage.getItem('grandrp_pov_meta_v26')||localStorage.getItem('grandrp_pov_meta_v25')||'[]';
      const localEntries=JSON.parse(raw)||[];
      state.entries=Array.isArray(dbEntries)&&dbEntries.length?dbEntries:localEntries;
      if(!state.entries.length && dbPerma.length) state.entries=dbPerma;
      else if(dbPerma.length){const ids=new Set(state.entries.map(e=>e.id));for(const e of dbPerma) if(!ids.has(e.id)) state.entries.push(e);}
      if(Array.isArray(dbEntries)&&dbEntries.length)try{localStorage.setItem(META_KEY,JSON.stringify(dbEntries.map(e=>({...e,file:undefined,videoUrl:undefined}))));}catch{}
    }catch{state.entries=[];}
    state.clientId=localStorage.getItem('yt_client_id')||'';$('#clientId').value=state.clientId;
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
  function saveMeta(){
    const entries=state.entries.map(e=>({...e,file:undefined,videoUrl:undefined}));
    try{localStorage.setItem(META_KEY,JSON.stringify(entries));}catch(err){console.warn('Archiv-Metadaten konnten nicht lokal gespeichert werden',err);}
    void saveMetaDb(entries);
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
  async function delVideo(id){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(id);tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  async function clearDB(){const db=await openDB();return new Promise((res,rej)=>{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).clear();tx.oncomplete=res;tx.onerror=()=>rej(tx.error);});}
  function showView(v,persist=true){if(!views[v])v='archive';$$('.view').forEach(x=>x.classList.remove('active'));$('#view-'+v).classList.add('active');$$('.nav-item').forEach(x=>x.classList.toggle('active',x.dataset.view===v));$('#pageTitle').textContent=views[v][0];$('#pageSubtitle').textContent=views[v][1];if(persist)try{sessionStorage.setItem('grandrp_current_view',v);localStorage.setItem('grandrp_current_view',v);}catch{}if(v==='archive')renderArchive();if(v==='cases')renderCases();if(v==='csv')renderCsv();}
  function updateCounts(){const all=state.entries;const count=k=>all.filter(e=>e.types?.includes(k)).length;$('#countAll').textContent=all.length;$('#countBan').textContent=all.filter(e=>!e.notBanned).length;$('#countPc').textContent=count('pccheck');$('#countSoc').textContent=count('socban');$('#countHard').textContent=count('hardban');$('#countCheat').textContent=count('cheater');$('#countNeg').textContent=count('negativ');$('#countNoVideo').textContent=all.filter(e=>!e.videoStored).length;}
  function renderArchive(){updateCounts();const q=($('#search').value||'').toLowerCase().trim();const filter=state.filter;const list=state.entries.filter(e=>{if(filter==='ban'&&e.notBanned)return false;if(filter!=='all'&&filter!=='ban'&&!e.types?.includes(filter))return false;if(filter==='novideo'&&e.videoStored)return false;if(!q)return true;return [e.targetId,e.sc,e.reason,e.server,e.proof].some(v=>String(v||'').toLowerCase().includes(q));});$('#archiveGrid').innerHTML=list.map(e=>`<article class="card"><div class="thumb">${e.videoStored?'POV':'OHNE VIDEO'}</div><div class="card-top"><span class="pill">#${esc(e.id.slice(-6))}</span><span class="pill ${e.complete?'good':'warn'}">${e.complete?'Vollständig':'Prüfen'}</span>${e.permaArchive?'<span class="pill perma-tag">PERMA</span>':''}</div><div class="card-body"><div class="card-title">${esc(e.reason||'Unbekannter Grund')}</div><div class="meta"><div><span>ID</span>${esc(e.targetId||'')}</div><div class="rid-cell"><span>SOC</span>${esc(e.sc||'')}</div><div><span>Server</span>${esc(e.server||'')}</div><div><span>Datum</span>${esc(formatDateDE(e.date)||'')}</div>${e.sourceSize?`<div><span>Dateigröße</span>${esc(formatSize(e.sourceSize))}<small class="size-bytes">${esc(formatBytesExact(e.sourceSize))}</small></div>`:''}</div></div><div class="card-actions"><button class="mini" data-open="${e.id}">Prüfen</button>${e.youtube?.url||e.proof?`<button class="mini primary" data-youtube="${esc(e.youtube?.url||e.proof)}">POV öffnen</button>`:''}<button class="mini danger" data-delete="${e.id}">Löschen</button></div></article>`).join('');$('#emptyState').classList.toggle('hidden',list.length>0);$$('[data-open]').forEach(b=>b.onclick=async()=>{const e=state.entries.find(x=>x.id===b.dataset.open);if(e)openEditorFromEntry(e);});$$('[data-youtube]').forEach(b=>b.onclick=()=>{const url=b.dataset.youtube;if(url)window.open(url,'_blank','noopener,noreferrer');});$$('[data-delete]').forEach(b=>b.onclick=async()=>{const e=state.entries.find(x=>x.id===b.dataset.delete);if(!e)return;if(!confirm(`POV „${e.finalName||e.originalName||e.id}“ aus dem Archiv löschen?\n\nDas YouTube-Video wird NICHT gelöscht.`))return;try{await delVideo(e.id);state.entries=state.entries.filter(x=>x.id!==e.id);saveMeta();renderArchive();renderCases();renderCsv();toast('POV aus dem Archiv gelöscht. YouTube bleibt erhalten.');}catch(err){console.error(err);toast('Löschen fehlgeschlagen: '+(err?.message||err));}});}
  function renderCases(){const cases=state.entries.filter(e=>!e.complete);$('#casesList').innerHTML=cases.length?cases.map(e=>`<div class="case-row"><div><strong>${esc(e.originalName)}</strong><small>${esc(e.missing.join(' · ')||'Prüfung nötig')}</small></div><button class="mini" data-case="${e.id}">Prüfen</button></div>`).join(''):'<div class="empty"><div class="empty-icon">✓</div><h2>Keine offenen Fälle</h2><p>Alle gespeicherten Fälle haben die Pflichtangaben.</p></div>';$$('[data-case]').forEach(b=>b.onclick=()=>{const e=state.entries.find(x=>x.id===b.dataset.case);if(e)openEditorFromEntry(e);});}
  function csvRowsBase(entries=state.entries){return entries.filter(e=>e.saved).map(e=>{const admins=Array.isArray(e.pcCheckers)?e.pcCheckers.slice(0,5):[];return {Proof:e.proof||'',Datum:formatDateDE(e.date),ID:e.targetId||'',SOC:e.sc||'',RID:'',DiscordID:e.discordId||'',Familie:'',Grund:e.reason||'',Admin1:admins[0]||'',Admin2:admins[1]||'',Admin3:admins[2]||'',Admin4:admins[3]||'',Admin5:admins[4]||'',_entry:e,_admins:admins};});}
  function csvRowsPermaBase(){return csvRowsBase(state.entries.filter(e=>e.permaArchive));}
  function csvEntryMatchesType(e,type){
    const types=Array.isArray(e?.types)?e.types:[];
    const reason=String(e?.reason||'').toLowerCase();
    const isPc=/^pc[- ]?check/.test(reason);
    const isRefusal=/verweiger/i.test(reason);
    const isTrolling=/troll/i.test(reason);
    const isCleaning=/cleaning/i.test(reason);
    const isRedux=/redux/i.test(reason);
    const isDiscordReason=/discord/i.test(reason);
    const isBanevading=/banevading|ban ?evading/i.test(reason);
    const isAcc14=/acc\s*1\.4/i.test(reason);
    const isEvent17=/event\s*1\.7/i.test(reason);
    switch(type){
      case 'ban': return !e?.notBanned;
      case 'hardban': return types.includes('hardban') || /hardban|hardbann/i.test(reason);
      case 'socban': return types.includes('socban') || /soc[- ]?ban/i.test(reason);
      case 'cheater': return types.includes('cheater') || /cheat/i.test(reason);
      case 'negativ': return types.includes('negativ');
      case 'verweigert': return types.includes('verweigert') || isRefusal;
      case 'pccheck': return types.includes('pccheck') || isPc;
      case 'pcPositive': return isPc && !isRefusal;
      case 'pcRefused': return isRefusal;
      case 'trolling': return isTrolling;
      case 'cleaning': return isCleaning;
      case 'redux': return isRedux;
      case 'discordReason': return isDiscordReason;
      case 'banevading': return isBanevading;
      case 'acc14': return isAcc14;
      case 'event17': return isEvent17;
      case 'perma': return !!e?.perma;
      case 'permaArchive': return !!e?.permaArchive;
      case 'notBanned': return !!e?.notBanned;
      case 'video': return !!e?.videoStored;
      case 'novideo': return !e?.videoStored;
      case 'docYes': return e?.documentStatus==='eingetragen';
      case 'docNo': return e?.documentStatus!=='eingetragen';
      case 'complete': return !!e?.complete;
      case 'open': return !e?.complete;
      case 'proof': return !!String(e?.proof||'').trim();
      case 'noProof': return !String(e?.proof||'').trim();
      case 'scPresent': return !!String(e?.sc||'').trim();
      case 'scEmpty': return !String(e?.sc||'').trim();
      case 'discordPresent': return !!String(e?.discordId||'').trim();
      case 'discordEmpty': return !String(e?.discordId||'').trim();
      default: return true;
    }
  }
  function csvPriorityValue(r,key){
    const e=r._entry||{};
    const reason=String(r.Grund||'').toLowerCase();
    const types=Array.isArray(e.types)?e.types:[];
    switch(key){
      case 'hardban': return types.includes('hardban')||/hardban|hardbann/.test(reason)?1:0;
      case 'socban': return types.includes('socban')||/soc[- ]?ban/.test(reason)?1:0;
      case 'cheater': return types.includes('cheater')||/cheat/.test(reason)?1:0;
      case 'pccheck': return types.includes('pccheck')||/^pc[- ]?check/.test(reason)?1:0;
      case 'verweigert': return types.includes('verweigert')||/verweiger/.test(reason)?1:0;
      case 'trolling': return /troll/.test(reason)?1:0;
      case 'cleaning': return /cleaning/.test(reason)?1:0;
      case 'redux': return /redux/.test(reason)?1:0;
      case 'discordReason': return /discord/.test(reason)?1:0;
      case 'banevading': return /banevading|ban ?evading/.test(reason)?1:0;
      case 'perma': return e.perma?1:0;
      case 'complete': return e.complete?1:0;
      case 'docYes': return e.documentStatus==='eingetragen'?1:0;
      case 'proof': return String(r.Proof||'').trim()?1:0;
      case 'sc': return String(r.SOC||'').trim()?1:0;
      case 'discord': return String(r.DiscordID||'').trim()?1:0;
      case 'missing': return Array.isArray(e.missing)&&e.missing.length?1:0;
      default: return 0;
    }
  }
  function csvRows(){
    const q=(($('#csvFilterSearch')?.value)||'').toLowerCase().trim();
    const reason=(($('#csvFilterReason')?.value)||'all');
    const sc=(($('#csvFilterSc')?.value)||'all');
    const discord=(($('#csvFilterDiscord')?.value)||'all');
    const type=(($('#csvFilterType')?.value)||'all');
    const admin=(($('#csvFilterAdmin')?.value)||'all').toLowerCase();
    const sort=(($('#csvFilterSort')?.value)||'date_desc');
    const from=(($('#csvFilterDateFrom')?.value)||'');
    const to=(($('#csvFilterDateTo')?.value)||'');
    const rows=csvRowsBase().filter(r=>{
      const e=r._entry||{};
      if(reason!=='all' && r.Grund!==reason)return false;
      if(sc==='present' && !r.SOC)return false;
      if(sc==='empty' && r.SOC)return false;
      if(discord==='present' && !String(r.DiscordID||'').trim())return false;
      if(discord==='empty' && String(r.DiscordID||'').trim())return false;
      if(type!=='all' && !csvEntryMatchesType(e,type))return false;
      if(admin!=='all' && !r._admins.some(v=>String(v||'').toLowerCase()===admin))return false;
      if(from && String(e.date||'')<from)return false;
      if(to && String(e.date||'')>to)return false;
      if(q && ![r.Proof,r.Datum,r.ID,r.SOC,r.DiscordID,r.Grund,r.Admin1,r.Admin2,r.Admin3,r.Admin4,r.Admin5].some(v=>String(v||'').toLowerCase().includes(q)))return false;
      return true;
    });
    const cmp=(a,b)=>{
      const boolSort=(key,dir)=>{
        const av=csvPriorityValue(a,key),bv=csvPriorityValue(b,key);
        return dir==='last' ? av-bv : bv-av;
      };
      switch(sort){
        case 'date_asc': return String(a._entry?.date||'').localeCompare(String(b._entry?.date||''));
        case 'date_desc': return String(b._entry?.date||'').localeCompare(String(a._entry?.date||''));
        case 'id_asc': return String(a.ID||'').localeCompare(String(b.ID||''),undefined,{numeric:true});
        case 'id_desc': return String(b.ID||'').localeCompare(String(a.ID||''),undefined,{numeric:true});
        case 'reason_asc': return String(a.Grund||'').localeCompare(String(b.Grund||''), 'de');
        case 'reason_desc': return String(b.Grund||'').localeCompare(String(a.Grund||''), 'de');
        case 'sc_asc': return String(a.SOC||'').localeCompare(String(b.SOC||''));
        case 'sc_desc': return String(b.SOC||'').localeCompare(String(a.SOC||''));
        case 'discord_asc': return String(a.DiscordID||'').localeCompare(String(b.DiscordID||''),undefined,{numeric:true});
        case 'discord_desc': return String(b.DiscordID||'').localeCompare(String(a.DiscordID||''),undefined,{numeric:true});
        case 'admin1_asc': return String(a.Admin1||'').localeCompare(String(b.Admin1||''),'de');
        case 'admin1_desc': return String(b.Admin1||'').localeCompare(String(a.Admin1||''),'de');
        case 'hardban_first': return boolSort('hardban','first');
        case 'hardban_last': return boolSort('hardban','last');
        case 'socban_first': return boolSort('socban','first');
        case 'socban_last': return boolSort('socban','last');
        case 'cheater_first': return boolSort('cheater','first');
        case 'cheater_last': return boolSort('cheater','last');
        case 'pccheck_first': return boolSort('pccheck','first');
        case 'pccheck_last': return boolSort('pccheck','last');
        case 'verweigert_first': return boolSort('verweigert','first');
        case 'verweigert_last': return boolSort('verweigert','last');
        case 'trolling_first': return boolSort('trolling','first');
        case 'trolling_last': return boolSort('trolling','last');
        case 'cleaning_first': return boolSort('cleaning','first');
        case 'cleaning_last': return boolSort('cleaning','last');
        case 'redux_first': return boolSort('redux','first');
        case 'redux_last': return boolSort('redux','last');
        case 'discordReason_first': return boolSort('discordReason','first');
        case 'discordReason_last': return boolSort('discordReason','last');
        case 'banevading_first': return boolSort('banevading','first');
        case 'banevading_last': return boolSort('banevading','last');
        case 'perma_first': return boolSort('perma','first');
        case 'perma_last': return boolSort('perma','last');
        case 'complete_first': return boolSort('complete','first');
        case 'complete_last': return boolSort('complete','last');
        case 'docYes_first': return boolSort('docYes','first');
        case 'docYes_last': return boolSort('docYes','last');
        case 'proof_first': return boolSort('proof','first');
        case 'proof_last': return boolSort('proof','last');
        case 'sc_first': return boolSort('sc','first');
        case 'sc_last': return boolSort('sc','last');
        case 'discord_first': return boolSort('discord','first');
        case 'discord_last': return boolSort('discord','last');
        case 'missing_first': return boolSort('missing','first');
        case 'missing_last': return boolSort('missing','last');
        default: return 0;
      }
    };
    return rows.sort(cmp);
  }
  function syncCsvAdminOptions(){
    const sel=$('#csvFilterAdmin'); if(!sel)return;
    const current=sel.value;
    const names=new Set();
    state.entries.forEach(e=>(Array.isArray(e.pcCheckers)?e.pcCheckers:[]).slice(0,5).forEach(v=>{if(String(v||'').trim())names.add(String(v).trim());}));
    const ordered=[...names].sort((a,b)=>a.localeCompare(b,'de'));
    sel.innerHTML='<option value="all">PC-Checker: Alle</option>'+ordered.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('');
    if(ordered.includes(current))sel.value=current;
  }
  function renderCsv(){
    syncCsvAdminOptions();
    const all=csvRowsBase(), rows=csvRows(), perma=csvRowsPermaBase();
    $('#csvSummary').textContent=`${rows.length} von ${all.length} Einträgen · ${perma.length} Perma-Archiv`;
    $('#csvPreviewBody').innerHTML=rows.length?rows.map(r=>`<tr><td>${esc(r.Proof)}</td><td>${esc(r.Datum)}</td><td>${esc(r.ID)}</td><td>${esc(r.SOC)}</td><td></td><td>${esc(r.DiscordID)}</td><td></td><td>${esc(r.Grund)}</td><td>${esc(r.Admin1)}</td><td>${esc(r.Admin2)}</td><td>${esc(r.Admin3)}</td><td>${esc(r.Admin4)}</td><td>${esc(r.Admin5)}</td></tr>`).join(''):'<tr><td colspan=13 class="csv-empty">Keine Einträge passen zum Filter.</td></tr>';
  }
  function csvTextFromRows(rows){const header=['Proof','Datum','ID','SOC','RID','Discord ID','Familie','Grund','Admin 1','Admin 2','Admin 3','Admin 4','Admin 5'];const line=a=>a.map(v=>`"${String(v??'').replace(/"/g,'""')}"`).join(';');return '﻿'+[line(header),...rows.map(r=>line([r.Proof,r.Datum,r.ID,r.SOC,r.RID,r.DiscordID,r.Familie,r.Grund,r.Admin1,r.Admin2,r.Admin3,r.Admin4,r.Admin5]))].join('\r\n');}
  function csvText(){return csvTextFromRows(csvRows());}
  function downloadCsv(){const blob=new Blob([csvText()],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='grandrp_bans.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);}
  function downloadPermaCsv(){const rows=csvRowsPermaBase();if(!rows.length){toast('Noch keine als „Perma eingetragen“ markierten Fälle.');return;}const blob=new Blob([csvTextFromRows(rows)],{type:'text/csv;charset=utf-8'});const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='grandrp_perma_archiv.csv';a.click();setTimeout(()=>URL.revokeObjectURL(a.href),1000);toast(`${rows.length} Perma-Archiv-Einträge exportiert.`);}
  async function copyCsv(){try{await navigator.clipboard.writeText(csvText());toast('CSV in die Zwischenablage kopiert.');}catch{toast('Kopieren nicht verfügbar. CSV herunterladen.');}}

  function setupNav(){
    $$('.nav-item').forEach(b=>b.onclick=()=>showView(b.dataset.view));$('#headerUploadBtn').onclick=()=>showView('upload');$('#emptyUploadBtn').onclick=()=>showView('upload');$('#headerCsvBtn').onclick=()=>showView('csv');$('#reloadBtn').onclick=()=>renderArchive();$('#casesRefresh').onclick=renderCases;$('#search').oninput=renderArchive;$('#refreshCsvBtn').onclick=renderCsv;$('#downloadCsvBtn').onclick=downloadCsv;$('#downloadPermaCsvBtn')?.addEventListener('click',downloadPermaCsv);$('#copyCsvBtn').onclick=copyCsv;['#csvFilterSearch','#csvFilterReason','#csvFilterSc','#csvFilterDiscord','#csvFilterType','#csvFilterAdmin','#csvFilterSort','#csvFilterDateFrom','#csvFilterDateTo'].forEach(s=>$(s)?.addEventListener(['#csvFilterReason','#csvFilterSc','#csvFilterDiscord','#csvFilterType','#csvFilterAdmin','#csvFilterSort'].includes(s)?'change':'input',renderCsv));$('#csvFilterClear')?.addEventListener('click',()=>{['#csvFilterSearch','#csvFilterDateFrom','#csvFilterDateTo'].forEach(id=>{if($(id))$(id).value='';});if($('#csvFilterReason'))$('#csvFilterReason').value='all';if($('#csvFilterSc'))$('#csvFilterSc').value='all';if($('#csvFilterDiscord'))$('#csvFilterDiscord').value='all';if($('#csvFilterType'))$('#csvFilterType').value='all';if($('#csvFilterAdmin'))$('#csvFilterAdmin').value='all';if($('#csvFilterSort'))$('#csvFilterSort').value='date_desc';renderCsv();});
    $$('.filter').forEach(b=>b.onclick=()=>{state.filter=b.dataset.filter;$$('.filter').forEach(x=>x.classList.toggle('active',x===b));renderArchive();});
    const savedView=sessionStorage.getItem('grandrp_current_view')||localStorage.getItem('grandrp_current_view');
    if(savedView&&views[savedView])showView(savedView,false);
  }

  const dropzone=$('#dropzone'), input=$('#fileInput');
  function setupUpload(){
    $('#chooseBtn').onclick=e=>{e.stopPropagation();input.click();};dropzone.onclick=e=>{if(!e.target.closest('button'))input.click();};input.onchange=e=>{addFiles([...e.target.files]);input.value='';};
    ['dragenter','dragover'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.add('drag');}));
    ['dragleave','drop'].forEach(ev=>dropzone.addEventListener(ev,e=>{e.preventDefault();dropzone.classList.remove('drag');}));
    dropzone.addEventListener('drop',e=>addFiles([...e.dataTransfer.files].filter(f=>f.type.startsWith('video/')||/\.(mp4|mov|webm|mkv)$/i.test(f.name))));
  }
  function addFiles(files){for(const file of files){state.queue.push({id:crypto.randomUUID(),file,status:'Upload wartet',progress:0,result:null,processing:false,uploading:false,ocrProcessing:false,editingDone:false,youtube:null,uploadStarted:false,uploadFailed:false,cancelled:false});}renderQueue();pumpUploads();}
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
    clearYoutubeRetryTimer();
    const target=Math.max(Date.now()+1000,Number(at)||Date.now()+YT_RETRY_DELAY_MS);
    localStorage.setItem(YT_RETRY_KEY,String(target));
    state.youtubeUploadBlocked=true;
    const tick=()=>{
      const left=target-Date.now();
      if(left<=0){
        localStorage.removeItem(YT_RETRY_KEY);
        state.youtubeUploadBlocked=false;
        youtubeRetryTimer=0;
        for(const item of state.queue){
          if(!item.youtubeLimitBlocked||item.cancelled||item.editingDone||item.status==='Gespeichert')continue;
          item.youtubeLimitBlocked=false;
          item.uploadStarted=false;
          item.uploadFailed=false;
          item.processing=false;
          item.uploading=false;
          item.status='Upload wartet · 30-Minuten-Retry';
          item.progress=0;
        }
        renderQueue();
        void pumpUploads();
        return;
      }
      for(const item of state.queue){
        if(item.youtubeLimitBlocked&&!item.uploading&&!item.ocrProcessing&&item.status!=='Gespeichert'){
          item.status=`YouTube-Quota erreicht · Retry in ${formatRetryClock(left)}` + (item.result?' · OCR fertig':' · OCR läuft/lokal');
        }
      }
      renderQueue();
      youtubeRetryTimer=setTimeout(tick,Math.min(30000,left));
    };
    tick();
  }
  function scheduleYoutubeRetry30(){scheduleYoutubeRetryAt(Date.now()+YT_RETRY_DELAY_MS);}
  async function retryQueueItem(item){
    if(!item||item.processing)return;
    if(item.youtube){await retryLocalOCR(item);return;}
    item.youtubeLimitBlocked=false;
    state.youtubeUploadBlocked=false;
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
  function renderQueue(){const q=$('#uploadQueue');$('#queueCount').textContent=`${state.queue.length} ${state.queue.length===1?'Datei':'Dateien'}`;q.innerHTML=state.queue.map(item=>{const hasError=/^Fehler:/i.test(item.status||'');const retry=(!item.uploading&&!item.ocrProcessing&&((!!item.youtube&&!item.result)||hasError));const label=item.youtube?'OCR erneut':'Erneut hochladen';return `<div class="queue-item ${hasError?'has-error':''}"><div class="queue-icon">▶</div><div class="queue-name"><strong>${esc(item.finalName||item.file.name)}</strong><small>${formatSize(item.file.size)} · ${esc(item.status)}</small><div class="progress"><i style="width:${item.progress}%"></i></div></div><div class="queue-actions">${item.result?`<button class="mini" data-check="${item.id}">Prüfen</button>`:''}${retry?`<button class="mini primary" data-retry="${item.id}">${label}</button>`:''}<button class="mini" data-remove="${item.id}">×</button></div></div>`}).join('');$$('[data-check]').forEach(b=>b.onclick=()=>{const x=state.queue.find(i=>i.id===b.dataset.check);if(x?.result)openEditor(x);});$$('[data-retry]').forEach(b=>b.onclick=async()=>{const x=state.queue.find(i=>i.id===b.dataset.retry);if(x)await retryQueueItem(x);});$$('[data-remove]').forEach(b=>b.onclick=async()=>{const x=state.queue.find(i=>i.id===b.dataset.remove);if(!x)return;if(x.uploading){toast('YouTube-Upload läuft noch.');return;}x.cancelled=true;x.editingDone=true;x.ocrProcessing=false;x.processing=false;try{await delVideo(x.id);}catch{}state.queue=state.queue.filter(i=>i.id!==b.dataset.remove);renderQueue();toast('POV aus der Warteschlange entfernt. OCR wurde gestoppt.');});}
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
  async function findVerifiedBanInLastFive(video,cancelCheck=()=>false){
    if(!video||!Number.isFinite(video.duration)||video.duration<=0)return null;
    const end=Math.max(0,video.duration-.08), start=Math.max(0,end-5);
    const worker=await ensureWorker();
    const times=uniqueTimes(Array.from({length:11},(_,i)=>start+(end-start)*(i/10)));
    const hits=[];
    for(const t of times){
      if(cancelCheck())throw new Error('OCR abgebrochen: Fall wurde aus der Warteschlange entfernt.');
      if(!(await fastSeek(video,t)))continue;
      try{
        const read=await readBanFast(worker,video);
        const ban=read.ban||extractBanEvent(read.text);
        if(ban&&ban.adminId===BAN_ADMIN_ID&&ban.targetId)hits.push({time:t,ban,text:read.text,sharp:read.sharp||0});
      }catch{}
    }
    if(!hits.length)return null;
    // Densify only around the best candidate: 11 cheap probes + a short, high precision
    // local scan is much faster than rescanning the complete POV.
    hits.sort((a,b)=>(b.ban.score-a.ban.score)||(b.sharp-a.sharp));
    const best=hits[0];
    const dense=uniqueTimes(Array.from({length:9},(_,i)=>Math.max(start,best.time-.8+i*.2)));
    const verified=[...hits];
    for(const t of dense){
      if(!(await fastSeek(video,t)))continue;
      try{
        const read=await readBanOnly(worker,video);const ban=read.ban||extractBanEvent(read.text);
        if(ban&&ban.adminId===BAN_ADMIN_ID&&ban.targetId)verified.push({time:t,ban,text:read.text,sharp:read.sharp||0});
      }catch{}
    }
    verified.sort((a,b)=>(Number(!!b.ban.reason)-Number(!!a.ban.reason))||(b.ban.score-a.ban.score)||(b.sharp-a.sharp));
    for(const candidate of verified.slice(0,6)){
      if(candidate.ban.reason)continue;
      if(!(await fastSeek(video,candidate.time)))continue;
      try{
        const rr=await readReasonDirect(worker,video);
        if(rr.reason){candidate.ban.reason=rr.reason;candidate.ban.score+=12;candidate.text=(candidate.text||'')+'\nGrund: '+rr.reason;}
      }catch{}
    }
    verified.sort((a,b)=>(Number(!!b.ban.reason)-Number(!!a.ban.reason))||(b.ban.score-a.ban.score)||(b.sharp-a.sharp));
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
    let anchor=await findVerifiedBanInLastFive(video,cancelCheck);

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
        const hit=await findVerifiedBanInLastFive(media.video);
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
        const hit=await findVerifiedBanInLastFive(media.video);
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
    $('#reason').value=ALLOWED_REASONS.includes(val(r.reason))?val(r.reason):'';
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
    setupPcCheckerUi(r.pcCheckers||[PC_CHECKER_LEAD]);
    const pcm=r.pcCheckerManual||[];pcCheckerCustom.clear();pcm.forEach(v=>{if(v&& !PC_CHECKER_POOL.includes(v))pcCheckerCustom.add(v);});setupPcCheckerUi(r.pcCheckers||[PC_CHECKER_LEAD]);
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
  function openEditor(item){state.editing={item};$('#modalFile').textContent=item.finalName||item.file.name;setEditorValues({...item.result,proof:item.result?.proof||'',perma:!!item.result?.perma,permaArchive:!!item.result?.permaArchive,notBanned:!!item.result?.notBanned});state.selectedTypes=new Set(item.result?.types||[]);$$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));setFieldStatus(item);$('#editorModal').classList.remove('hidden');loadEditorPreview(item.file,item.result?.timestamps?.banner||0);showInfoPhoto('banner');renderAcpStatus(item.result?.sc?'✓ SC bereits vorhanden':'SC fehlt · über ACP holen',item.result?.sc?'ok':'warn');if(!item.result?.sc&&/^\d{1,6}$/.test(item.result?.targetId||'')){setTimeout(()=>{try{openAcpForCurrentId();}catch{}},350);}}
  async function openEditorFromEntry(entry){const file=entry.file||await getVideo(entry.id);if(file)entry.file=file;state.editing={entry};$('#modalFile').textContent=entry.finalName||entry.originalName;setEditorValues(entry);state.selectedTypes=new Set(entry.types||[]);$$('.chip').forEach(c=>c.classList.toggle('active',state.selectedTypes.has(c.dataset.value)));setFieldStatus({result:entry});$('#editorModal').classList.remove('hidden');loadEditorPreview(entry.file,entry.timestamps?.banner||0);showInfoPhoto('banner');renderAcpStatus(entry.sc?'✓ SC bereits vorhanden':'SC fehlt · über ACP holen',entry.sc?'ok':'warn');}
  function closeEditor(){revokeEditorPreview();state.editing=null;$('#editorModal').classList.add('hidden');}
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
    const timestamps={...(base.result?.timestamps||base.timestamps||{})};
    if(!Number.isFinite(Number(timestamps.pcCheck))){const d=Number(base.result?.duration||base.duration||0);if(d>0)timestamps.pcCheck=Math.max(0,Math.min(d/2,Math.max(0,d-.05)));}
    const record={id:base.id||crypto.randomUUID(),originalName:base.originalName||base.file.name,finalName,targetId,reason,sc:offline?'':sc,server,date,rid:'',types:finalTypes,perma:$('#perma').checked,permaArchive:$('#permaArchive').checked,notBanned:$('#notBanned').checked,documentStatus:$('#documentStatus').value==='eingetragen'?'eingetragen':'nicht eingetragen',pcCheckers:getPcCheckers(),pcCheckerManual:[...pcCheckerCustom],discordId:'',proof:yt?.url||$('#proof').value.trim(),complete:true,saved:true,videoStored:true,offline,sourceSize:namedFile.size,sourceType:namedFile.type||'video/mp4',duration:Number(base.result?.duration||base.duration||0)||0,timestamps,infoPhotoField:'banner',missing:[],file:namedFile,youtube:yt};
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
    state.entries=[record,...state.entries.filter(x=>x.id!==record.id)];
    saveMeta();

    // Ein erfolgreich gespeicherter/geprüfter POV ist kein Warteschlangen-Eintrag mehr.
    // Die IndexedDB-Datei bleibt erhalten, weil sie jetzt vom Archiv verwendet wird.
    if(ctx.item){
      ctx.item.file=namedFile;
      ctx.item.finalName=finalName;
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
  }
  window.addEventListener('message',e=>{if(e.data?.type==='grandrp-manual-field'){applyManualField(e.data.field,e.data.value,e.data.time);}});

  const ACP_ORIGIN='https://admin.gta5grand.com';
  const ACP_EXTENSION_TOKEN='grandrp-acp-v85';
  let acpWindow=null;
  let acpTimeout=null;
  function buildAcpUrl(characterId){
    const id=String(characterId||'').replace(/\D/g,'');
    const nonce=(crypto.randomUUID?.()||`${Date.now()}-${Math.random().toString(36).slice(2)}`);
    return `${ACP_ORIGIN}/de/3/logs/authorization?nick=&characterid=${encodeURIComponent(id)}&ip=&socialname=&socialid=&date=&subdate=&grandrpBridge=1&bridgeToken=${encodeURIComponent(nonce)}`;
  }
  function setScValueFromAcp(sc,characterId){
    const value=normalizeHexLoose(sc);
    if(value.length!==40){toast('ACP-SC ungültig oder unvollständig.');return false;}
    $('#sc').value=value;
    renderAcpStatus(`✓ SC aus ACP übernommen · ID ${characterId}`,'ok');
    setFieldStatus({result:{targetId:characterId,sc:value}});
    showInfoPhoto('banner');
    toast('SC aus Adminpanel übernommen. SOC wird damit gefüllt.');
    return true;
  }
  function renderAcpStatus(text,kind=''){const el=$('#acpStatus');if(!el)return;el.textContent=text;el.className=`acp-status ${kind}`;}
  function closeAcpWindow(){clearTimeout(acpTimeout);try{if(acpWindow&&!acpWindow.closed)acpWindow.close();}catch{}acpWindow=null;}
  function openAcpForCurrentId(){
    const id=clampId($('#targetId')?.value||'');
    if(!/^\d{1,6}$/.test(id)){toast('Zuerst eine gültige Ziel-ID eintragen.');return;}
    const url=buildAcpUrl(id);
    renderAcpStatus('ACP wird in Chrome geöffnet · Lade Daten …');
    try{
      acpWindow=window.open(url,'_blank');
      if(!acpWindow){renderAcpStatus('Popup blockiert · bitte Popups für den Checker erlauben.','error');toast('Chrome-ACP konnte wegen Popup-Blockierung nicht geöffnet werden.');return;}
      const started=Date.now();
      clearTimeout(acpTimeout);
      acpTimeout=setTimeout(()=>{renderAcpStatus('Kein SC im ACP gefunden · Fenster wird geschlossen.','warn');closeAcpWindow();},45000);
    }catch(err){console.error(err);renderAcpStatus('ACP konnte nicht geöffnet werden.','error');}
  }
  window.addEventListener('message',e=>{
    if(e.origin!==ACP_ORIGIN || !e.data)return;
    if(e.data.type==='GRANDRP_ACP_STATUS'){renderAcpStatus(String(e.data.message||'ACP lädt …'),e.data.kind||'');return;}
    if(e.data.type==='GRANDRP_ACP_SC'){
      const id=String(e.data.characterId||'');
      const sc=String(e.data.socialClub||'');
      clearTimeout(acpTimeout);
      if(id && id===clampId($('#targetId')?.value||'') && setScValueFromAcp(sc,id)){
        closeAcpWindow();
      }
    }
    if(e.data.type==='GRANDRP_ACP_ERROR'){clearTimeout(acpTimeout);renderAcpStatus(String(e.data.message||'SC im ACP nicht gefunden · Fenster wird geschlossen.'),'error');toast('ACP konnte den SC für die Ziel-ID nicht finden.');closeAcpWindow();}
  });

  function rebuildPcCheckerOptions(selected=[]){
    const all=[...new Set([...PC_CHECKER_POOL,...pcCheckerCustom])];
    const current=Array.isArray(selected)?selected:[];
    for(let n=2;n<=5;n++){
      const sel=$(`#pcChecker${n}`);if(!sel)continue;
      const keep=sel.value;
      sel.innerHTML='<option value="">Nicht besetzt</option>'+all.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('');
      const want=current[n-2]??keep;
      if(want)sel.value=want;
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
    $('#closeModal').onclick=closeEditor;$('#cancelBtn').onclick=closeEditor;$('#entryForm').addEventListener('submit',saveEditor);['#targetId','#date'].forEach(s=>$(s).addEventListener('input',renderTitlePreview));$('#reason').addEventListener('change',()=>{applyReasonPermaPolicy($('#reason').value,true);renderTitlePreview();setFieldStatus(state.editing?.item||state.editing?.entry||{});});$('#reason').addEventListener('input',()=>{renderTitlePreview();setFieldStatus(state.editing?.item||state.editing?.entry||{});});$('#targetId').addEventListener('input',()=>{$('#targetId').value=clampId($('#targetId').value);setFieldStatus(state.editing?.item||state.editing?.entry||{});});$('#sc').addEventListener('input',()=>setFieldStatus(state.editing?.item||state.editing?.entry||{}));
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
    $('#fetchAcpSc')?.addEventListener('click',openAcpForCurrentId);
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
    // Dedicated upload pump: OCR/review NEVER owns this lock and can never block the
    // next YouTube upload. Only one large video is uploaded at a time.
    if(state.uploadRunner)return;
    if(state.youtubeUploadBlocked){
      await pumpLocalFallbackQueue();
      return;
    }
    state.uploadRunner=true;
    try{
      while(true){
        const item=state.queue.find(i=>!i.uploadStarted&&!i.uploadFailed&&!i.editingDone&&i.status!=='Gespeichert'&&!i.youtube);
        if(!item)break;
        if(!state.accessToken||!state.clientId){
          if(item.status!=='YouTube zuerst verbinden')item.status='YouTube zuerst verbinden';
          renderQueue();
          break;
        }
        item.uploadStarted=true;
        item.uploading=true;
        item.processing=true;
        item.status='YouTube-Upload wird vorbereitet…';
        item.progress=1;
        renderQueue();
        try{
          await ensureYoutubeTokenFresh();
          const sourceSize=await verifyLocalFile(item.file,0,'Ausgewählte POV');
          await putVideo(item.id,item.file);
          const storedCopy=await getVideo(item.id);
          if(!storedCopy)throw new Error('Lokale Kopie der POV konnte nicht gelesen werden.');
          if(Number(storedCopy.size)!==sourceSize)throw new Error(`Lokale Speicherung beschädigt: Quelle ${formatBytesExact(sourceSize)} · Archiv ${formatBytesExact(storedCopy.size)}.`);
          if(!(await compareFileEdges(item.file,storedCopy)))throw new Error('Lokale Speicherung stimmt am Anfang/Ende nicht mit der Originaldatei überein.');
          item.status=`YouTube-Upload 0% · ${formatSize(sourceSize)} (${formatBytesExact(sourceSize)})`;
          item.progress=2;
          renderQueue();

          item.youtube=await uploadYoutube(item.file,item.file.name,state.accessToken,p=>{
            item.progress=2+Math.round(p*.58);
            item.status=`YouTube-Upload ${p}% · ${formatSize(sourceSize)} (${formatBytesExact(sourceSize)})`;
            renderQueue();
          });

          // The resumable upload is finished here. Do NOT wait for YouTube processing,
          // OCR, editor/review, title changes, or any other work before moving on.
          item.youtubeLimitBlocked=false;
          item.uploadFailed=false;
          item.progress=60;
          item.uploading=false;
          item.processing=false;
          if(item.result){
            item.result.sourceSize=sourceSize;
            item.result.youtube=item.youtube;
            item.result.proof=item.youtube?.url||item.result.proof||'';
            item.status='Upload fertig · OCR bereits vorhanden · Prüfung offen';
            item.progress=100;
            renderQueue();
          }else{
            item.status='Upload fertig · OCR läuft im Hintergrund';
            renderQueue();
            // Start OCR completely detached from the upload pump. Its promise is kept only
            // for diagnostics/retry handling; it is NEVER awaited by pumpUploads().
            item.ocrProcessing=true;
            item.ocrPromise=runOcrForUploadedItem(item,sourceSize,storedCopy,0);
          }
        }catch(err){
          console.error('Queue upload failed',err);
          if(isYoutubeQuotaError(err)){
            state.youtubeUploadBlocked=true;
            item.youtubeLimitBlocked=true;
            item.processing=false;
            item.uploading=false;
            item.uploadFailed=true;
            item.uploadStarted=true;
            item.status='YouTube-Quota erreicht · Retry in 30:00 · OCR läuft lokal';
            item.progress=0;
            renderQueue();
            scheduleYoutubeRetry30();
            await runLocalOnlyOcr(item);
            break;
          }
          if(isYoutubeUploadLimitError(err)){
            state.youtubeUploadBlocked=true;
            item.youtubeLimitBlocked=true;
            item.processing=false;
            item.uploading=false;
            item.uploadFailed=true;
            item.uploadStarted=true;
            item.status='YouTube-Uploadlimit erreicht · OCR läuft lokal';
            item.progress=0;
            renderQueue();
            scheduleYoutubeRetry30();
            await runLocalOnlyOcr(item);
            break;
          }
          item.status='Fehler: '+(err?.message||err);
          item.progress=0;
          item.processing=false;
          item.uploading=false;
          item.uploadStarted=false;
          item.uploadFailed=true;
          renderQueue();
        }
      }
    }finally{
      state.uploadRunner=false;
      // A new file may have been added while this pump was uploading the previous one.
      // Start another pump without touching any OCR promises.
      if(state.youtubeUploadBlocked){
        queueMicrotask(()=>pumpLocalFallbackQueue());
      }else if(state.queue.some(i=>!i.uploadStarted&&!i.uploadFailed&&!i.editingDone&&i.status!=='Gespeichert'&& !i.youtube)){
        queueMicrotask(()=>pumpUploads());
      }
    }
  }

  // Compatibility wrapper for older UI handlers.
  async function processQueue(){return pumpUploads();}

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
      queueMicrotask(()=>pumpUploads());
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

  async function bootApp(){
    if(window.__grandrpAppBooted)return;
    try{const saved=JSON.parse(localStorage.getItem(PC_CUSTOM_KEY)||'[]');if(Array.isArray(saved))saved.filter(Boolean).forEach(v=>pcCheckerCustom.add(String(v)));}catch{}
    window.__grandrpAppBooted=true;
    setupNav();setupUpload();setupEditor();setupSettings();renderQueue();updateYtStatus();void requestPersistentStorage();setInterval(()=>{if(authUser&&state.entries.length)saveMeta();},15000);
    const persistedRetry=youtubeRetryAt();
    if(persistedRetry>0){
      if(persistedRetry>Date.now())scheduleYoutubeRetryAt(persistedRetry);
      else {localStorage.removeItem(YT_RETRY_KEY);state.youtubeUploadBlocked=false;}
    }
    loadMeta().then(()=>{renderArchive();renderCases();renderCsv();}).catch(err=>{console.error('Archiv konnte nicht geladen werden',err);renderArchive();renderCases();renderCsv();});
    renderAuthUsers();
  }
  window.addEventListener('beforeunload' ,()=>{try{state.worker?.terminate();}catch{};try{state.specialWorker?.terminate();}catch{};try{state.fastWorker?.terminate();}catch{}});
  setupAuthUI();
  authResume().then(ok=>{if(ok)bootApp();});
})();
