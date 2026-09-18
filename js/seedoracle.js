// Seed Oracle: casting and live weave, Fu Xi / King Wen reference, elemental seal, and proof.
(function () {
  'use strict';
  // Bitcoin math (BIP39, SHA-256, PBKDF2 seed) lives in
  // js/seedoracle-bitcoin.js : window.SeedOracleBitcoin. Aliased
  // here so the many call sites downstream read unchanged.
  var _btc = window.SeedOracleBitcoin || {};
  var WL = _btc.WL || (window.BIP39_WORDS || []);
  var IDX = _btc.IDX || {};
  var sha256Bytes = _btc.sha256Bytes;
  var bits = _btc.bits;
  var entropyToMnemonic = _btc.entropyToMnemonic;
  var phraseToBits = _btc.phraseToBits;
  var checkPhrase = _btc.checkPhrase;
  var phraseToVals = _btc.phraseToVals;
  var valsToWords = _btc.valsToWords;
  // deriveSeed keeps its old single-arg shape (writes to #soSeed) so
  // the two callers in this file don't change.
  function deriveSeed(mnemonic) { _btc.deriveSeed(mnemonic, document.getElementById('soSeed')); }

  // Hexagram SVG renderers + element mapping live in
  // js/seedoracle-hexagrams.js : window.SeedOracleHex. Aliased
  // here so the renderers, mapping, and King Wen lookup remain local aliases.
  var _hex = window.SeedOracleHex || {};
  var VAL_TO_KW = _hex.VAL_TO_KW || [];
  var hexagramSVG = _hex.hexagramSVG;
  var slotHexSVG = _hex.slotHexSVG;
  var ELEMENTS = _hex.ELEMENTS || {};
  var ELEMENT_ORDER = _hex.ELEMENT_ORDER || ['water','fire','earth','air'];
  var elementOf = _hex.elementOf;

  var JD = window.ICHING_JUDGMENTS || {};   // direct Zhou Yi judgment translations, by King Wen


  // ── SHA-256 + BIP39 + deriveSeed MOVED to js/seedoracle-bitcoin.js
  // and hexagram SVG + element mapping MOVED to js/seedoracle-hexagrams.js
  // (2026-07-08). Both aliased above so every call site in this file
  // reads unchanged.

  // ══════════════════════════════════════════════════════════════════
  // Journey state
  //   state       : the COMMITTED (sealed) reading, as before.
  //   _lineBits   : chapter I's first hexagram, built line by line (bottom-up).
  //   _hexVals    : the cast in progress (hexagram 1 arrives from chapter I).
  //   _sealed     : a valid phrase is committed (element chosen / oracle / pasted).
  // ══════════════════════════════════════════════════════════════════
  var state={ len:12, vals:[], focus:0 };
  var _lineBits=[], _hexVals=[], _sealed=false;
  var elPhrase=document.getElementById('soPhrase'), elPhraseDisplay=document.getElementById('soPhraseDisplay'), elStack=document.getElementById('soStack'),
      elStatus=document.getElementById('soStatus');
  var RM = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;

  function setStatus(ok, msg){ elStatus.className='so-status '+(ok?'valid':'invalid'); elStatus.querySelector('.msg').textContent=msg; }
  function escapeHtml(s){ return String(s).replace(/[&<>"]/g,function(c){ return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]; }); }

  function hexCount(){ return state.len*11/6; }          // 22 : the reading's own count
  function entropyBitCount(){ return state.len/3*32; }          // 128 entropy bits
  // How many hexagrams the visitor casts FREELY. The 22nd belongs to the seal
  // (2 free lines + 4 checksum lines : chapter II).
  function castFree(){ return state.len===12 ? hexCount()-1 : hexCount(); }

  // Casts REQUIRE crypto.getRandomValues : no Math.random fallback. This page
  // derives real keys from what it casts; a browser too old to have Web Crypto
  // gets a plain refusal (see init) rather than silently predictable entropy.
  var CRYPTO_OK = !!(window.crypto && window.crypto.getRandomValues);
  function hexRand(){ var u=new Uint8Array(1); window.crypto.getRandomValues(u); return u[0]&63; }   // one hexagram = 6 bits
  function bitRand(){ var u=new Uint8Array(1); window.crypto.getRandomValues(u); return u[0]&1; }    // one line = 1 bit

  // The bits laid down so far (cast surface), and the committed bits (sealed).
  function castBits(){ return _hexVals.map(function(v){ return bits(v,6); }).join('') + (_lineBits.length<6 ? _lineBits.join('') : ''); }
  function currentWords(){ return elPhrase.value.trim().toLowerCase().split(/\s+/).filter(Boolean); }

  // ══ Gating : the chapters and their unlock tiers ══
  var CHAPTERS=[
    { id:'firstline', label:'The Cast', lvl:0 },
    { id:'seal', label:'The Seal', lvl:3 },
    { id:'underhood', label:'The Proof', lvl:4 }
  ];
  // Chapter unlock tier (0..4). Persistence lives in js/seedoracle-store.js;
  // this file never touches browser storage directly (storage lives in SeedStore :
  // it should have zero hits after all the extractions land).
  var _unlock = 0; // A fresh page has no cast; unlocks follow this reading.

  function chapterEl(c){ return document.getElementById(c.id); }
  function announce(msg){ var a=document.getElementById('soAnnounce'); if(a) a.textContent=msg; }

  function applyGates(openNew){
    CHAPTERS.forEach(function(c){
      var sec=chapterEl(c); if(!sec) return;
      if(c.lvl===0){
        var openBtn=sec.querySelector(':scope > .section-heading > .section-toggle, :scope > .section-toggle');
        var openBody=sec.querySelector('.section-bodymin');
        sec.classList.remove('so-locked');
        if(openBtn) openBtn.disabled=false;
        if(openBody) openBody.inert=!sec.classList.contains('section-open');
        return;
      }
      var locked = c.lvl>_unlock;
      var btn=sec.querySelector(':scope > .section-heading > .section-toggle, :scope > .section-toggle');
      var body=sec.querySelector('.section-bodymin');
      sec.classList.toggle('so-locked', locked);
      if(btn) btn.disabled=locked;
      if(body) body.inert=locked;
      if(locked){
        sec.classList.remove('section-open');
        if(btn) btn.setAttribute('aria-expanded','false');
      } else if(openNew && openNew.indexOf(c.id)>-1 && !sec.classList.contains('section-start-closed')){
        sec.classList.add('section-open');
        if(btn) btn.setAttribute('aria-expanded','true');
      }
    });
  }
  function raiseUnlock(n, msg){
    if(n<=_unlock) return;
    var fresh=CHAPTERS.filter(function(c){ return c.lvl>_unlock && c.lvl<=n; }).map(function(c){ return c.id; });
    _unlock=n;
    if (window.SeedStore) window.SeedStore.setUnlock(n);
    applyGates(fresh);
    if(msg) announce(msg);
  }
  function scrollToChapter(id){
    var sec=document.getElementById(id); if(!sec) return;
    if(!sec.classList.contains('section-open') && sec.querySelector(':scope > .section-heading > .section-toggle, :scope > .section-toggle') && !sec.classList.contains('so-locked')){
      window.toggleSection && window.toggleSection(id);
    }
    sec.scrollIntoView({ behavior: RM?'auto':'smooth', block:'start' });
  }
  // ══ Chapter I : the cast ══
  var elLineFig=document.getElementById('soLineFig'), elLineBits=document.getElementById('soLineBits'),
      elLineStat=document.getElementById('soLineStat'), elLineKw=document.getElementById('soLineKw'),
      elLineCast=document.getElementById('soLineCast');

  function renderLine(){
    var spec=[];
    for(var i=0;i<6;i++) spec.push({ bit:(i<_lineBits.length?_lineBits[i]:null), cls:'' });
    elLineFig.innerHTML=slotHexSVG(spec, 2);
    elLineBits.innerHTML=Array.apply(null,Array(6)).map(function(_,i){
      var has=i<_lineBits.length;
      return '<span class="so-line-bit'+(has?'':' is-empty')+'">'+(has?_lineBits[i]:'0')+'</span>';
    }).join('');
    if(_lineBits.length<6){ elLineStat.textContent='hexagram '+(_hexVals.length+1); }
    var done=_lineBits.length>=6;
    elLineCast.disabled = _sealed || _hexVals.length>=castFree() || !CRYPTO_OK;
    if(done){
      elLineStat.textContent='hexagram '+_hexVals.length+' complete';
    }
    var current=done ? _hexVals[_hexVals.length-1] : null;
    elLineKw.textContent=current===null ? 'King Wen —' : 'King Wen '+VAL_TO_KW[current];
  }
  elLineCast.addEventListener('click', function(){
    if(_sealed || _hexVals.length>=castFree()) return;
    if(_lineBits.length>=6) _lineBits=[];
    _lineBits.push(bitRand());
    if(_lineBits.length>=6){
      var val=parseInt(_lineBits.join(''),2);
      _hexVals.push(val);
      afterCastProgress();
    } else {
      renderLine(); renderAll();
    }
  });
  // Stack of 22 slots.
  var elHexStat=document.getElementById('soHexStat');

  function renderHexStat(){
    var n=castBits().length;
    elHexStat.textContent=_sealed ? '132 / 132 bits · sealed' : n>=126 ? '126 / 128 entropy bits · two remain' : n+' / 128 entropy bits';
  }

  function renderStack(){
    var N=hexCount(), free=castFree(), bands=['',''];
    var offsets=Array.from(elStack.querySelectorAll('.so-weave-scroll')).map(function(el){return el.scrollLeft;});
    for(var i=0;i<N;i++){
      var isSealSlot = (state.len===12 && i===N-1 && !_sealed);
      var cast = _sealed ? (i<state.vals.length) : (i<_hexVals.length && i<free);
      var v = _sealed ? state.vals[i] : _hexVals[i];
      var inner, cls='so-hex', attrs='';
      if(cast){
        var kw=VAL_TO_KW[v], d=JD[kw]||{};
        inner=hexagramSVG(v,0.72)+'<div class="so-hex-kw">KW '+kw+'</div>';
        if(_sealed && i===N-1 && state.len===12) cls+=' is-sealed';
        if(_sealed){
          attrs=' role="button" tabindex="0" data-i="'+i+'" data-hex="'+i+'" aria-label="Hexagram '+(i+1)+' of '+N+': '+(d.name||'')+', King Wen '+kw+'. Opens its judgment."';
        } else {
          attrs=' aria-label="Hexagram '+(i+1)+': '+(d.name||'')+', King Wen '+kw+'"';
        }
      } else if(i===_hexVals.length && _lineBits.length>0 && _lineBits.length<6){
        cls+=' is-active';
        inner=slotHexSVG(_lineBits.map(function(bit){ return {bit:bit,cls:''}; }),0.85)+'<div class="so-hex-kw">'+_lineBits.length+'/6</div>';
        attrs=' aria-label="Hexagram '+(i+1)+', '+_lineBits.length+' lines cast"';
      } else if(isSealSlot){
        var ready=_hexVals.length>=free;
        cls+=' is-seal-slot'+(ready?' is-ready':'');
        inner=slotHexSVG([{bit:null,cls:'free'},{bit:null,cls:'free'},{bit:null,cls:'cs'},{bit:null,cls:'cs'},{bit:null,cls:'cs'},{bit:null,cls:'cs'}],0.72)+
              '<div class="so-hex-kw">seal</div>';
        attrs=ready
          ? ' role="button" tabindex="0" data-act="to-seal" aria-label="The twenty-second hexagram, the seal. Opens the seal."'
          : ' aria-label="The twenty-second hexagram, the seal. Cast the first twenty-one to reach it." title="the seal, cast the first twenty-one"';
      } else {
        cls+=' is-slot';
        inner='';
        attrs=' aria-hidden="true"';
      }
      bands[Math.floor(i/11)]+='<div class="so-cell" data-hex="'+i+'"><div class="so-ord">'+(i+1)+'</div><div class="'+cls+'"'+attrs+'>'+inner+'</div></div>';
    }
    elStack.innerHTML=bands.map(function(cells, band){
      return '<div class="so-weave-scroll" tabindex="0" role="region" aria-label="Weave band '+(band+1)+', scroll horizontally on small screens"><div class="so-weave-band" data-band="'+band+'">'+
        '<div class="so-stack-grid">'+cells+'</div><div class="so-band-bits" aria-label="Binary bits"></div>'+ 
        '<div class="so-band-words" aria-label="Seed words in progress"></div></div></div>';
    }).join('');
    elStack.querySelectorAll('.so-weave-scroll').forEach(function(el,i){el.scrollLeft=offsets[i]||0;});
  }

  function stackActivate(el){
    if(el.getAttribute('data-act')==='to-seal'){ scrollToChapter('seal'); return; }
    var i=+el.getAttribute('data-i');
    if(isNaN(i)) return;
    if(_sealed) openHexPopup(state.vals[i]);
  }
  elStack.addEventListener('click', function(e){
    var el=e.target.closest('.so-hex[role="button"]'); if(el) stackActivate(el);
  });
  elStack.addEventListener('keydown', function(e){
    if(e.key!=='Enter' && e.key!==' ') return;
    var el=e.target.closest('.so-hex[role="button"]'); if(!el) return;
    e.preventDefault(); stackActivate(el);
  });

  function finishHex(){
    if(_lineBits.length>=6) _lineBits=[];
    while(_lineBits.length<6) _lineBits.push(bitRand());
    _hexVals.push(parseInt(_lineBits.join(''),2));
  }
  function hexCastOne(){
    if(_sealed || _hexVals.length>=castFree() || !CRYPTO_OK) return;
    finishHex(); afterCastProgress();
  }
  function hexCastAll(){
    if(_sealed || !CRYPTO_OK) return;
    while(_hexVals.length<castFree()) finishHex();
    afterCastProgress();
  }
  function afterCastProgress(){
    renderLine(); renderAll();
    if(_hexVals.length>=castFree()){
      raiseUnlock(3, 'Your cast is ready. Choose your elemental seal.');
      window.requestAnimationFrame(function(){
        var weave=document.getElementById('weave');
        if(weave) weave.scrollIntoView({ behavior:RM?'auto':'smooth', block:'start' });
      });
    }
  }
  document.getElementById('soHexOne').addEventListener('click', hexCastOne);
  document.getElementById('soHexAll').addEventListener('click', hexCastAll);

  // ══ Chapter I : the weave (live ribbon, partial while casting) ══
  function renderWeave(){
    var bands=elStack.querySelectorAll('.so-weave-band'); if(!bands.length) return;
    var ENT=entropyBitCount(), isTwelve=state.len===12;
    var have = _sealed ? phraseToBits(currentWords()) : castBits().slice(0, castFree()*6);
    bands.forEach(function(bandEl, band){
      var bitHtml='', bandStart=band*66;
      for(var local=0;local<66;local++){
        var idx=bandStart+local, word=Math.floor(idx/11), wordBit=idx%11,
            isCS=idx>=ENT, isFree=isTwelve && (idx===ENT-2 || idx===ENT-1), has=idx<have.length;
        var cls='so-track-bit '+(word%2?'is-word-b':'is-word-a')+
          (wordBit===0?' is-word-start':'')+(wordBit===10?' is-word-end':'')+
          (isCS?' is-cs':'')+(isFree?' is-free':'')+(has?'':' is-empty');
        bitHtml+='<span class="'+cls+'" data-word="'+word+'" data-bit-hex="'+Math.floor(idx/6)+'">'+(has?have[idx]:'')+'</span>';
      }
      bandEl.querySelector('.so-band-bits').innerHTML=bitHtml;
      var wordHtml='';
      for(var localWord=0;localWord<6;localWord++){
        var w=band*6+localWord, start=w*11, available=Math.max(0,Math.min(11,have.length-start)), label='-';
        if(available===11) label='<strong>'+WL[parseInt(have.slice(start,start+11),2)]+'</strong>';
        else if(available>0) label='<span class="is-starving">'+available+'/11 bits</span>';
        wordHtml+='<span class="so-word-chip '+(w%2?'is-word-b':'is-word-a')+'" data-word="'+w+'" tabindex="0" aria-label="Word '+(w+1)+', composed from the eleven bits above"><span class="so-word-num">'+(w+1)+'</span><span class="so-word-label">'+label+'</span></span>';
      }
      bandEl.querySelector('.so-band-words').innerHTML=wordHtml;
    });
  }

  // Trace one BIP39 word across its eleven source bits without changing the
  // six-bit hexagram grouping. Delegation keeps this safe across live renders.
  function highlightWord(word){
    elStack.querySelectorAll('[data-word]').forEach(function(el){
      el.classList.toggle('is-word-highlight', word!==null && el.getAttribute('data-word')===word);
    });
  }
  elStack.addEventListener('pointerover', function(e){
    var chip=e.target.closest('.so-word-chip[data-word]');
    if(chip) highlightWord(chip.getAttribute('data-word'));
  });
  elStack.addEventListener('pointerout', function(e){
    var chip=e.target.closest('.so-word-chip[data-word]');
    if(chip && !chip.contains(e.relatedTarget)) highlightWord(null);
  });
  elStack.addEventListener('focusin', function(e){
    var chip=e.target.closest('.so-word-chip[data-word]');
    if(chip) highlightWord(chip.getAttribute('data-word'));
  });
  elStack.addEventListener('focusout', function(e){
    var chip=e.target.closest('.so-word-chip[data-word]');
    if(chip && !chip.contains(e.relatedTarget)) highlightWord(null);
  });

  function highlightHex(hex){
    elStack.querySelectorAll('[data-bit-hex]').forEach(function(el){
      el.classList.toggle('is-hex-highlight', hex!==null && el.getAttribute('data-bit-hex')===hex);
    });
    elStack.querySelectorAll('.so-cell[data-hex]').forEach(function(el){
      el.classList.toggle('is-hex-highlight', hex!==null && el.getAttribute('data-hex')===hex);
    });
  }
  elStack.addEventListener('pointerover', function(e){
    var cell=e.target.closest('.so-cell[data-hex]');
    if(cell) highlightHex(cell.getAttribute('data-hex'));
  });
  elStack.addEventListener('pointerout', function(e){
    var cell=e.target.closest('.so-cell[data-hex]');
    if(cell && !cell.contains(e.relatedTarget)) highlightHex(null);
  });
  elStack.addEventListener('focusin', function(e){
    var cell=e.target.closest('.so-cell[data-hex]');
    if(cell) highlightHex(cell.getAttribute('data-hex'));
  });
  elStack.addEventListener('focusout', function(e){
    var cell=e.target.closest('.so-cell[data-hex]');
    if(cell && !cell.contains(e.relatedTarget)) highlightHex(null);
  });

  // ══ Chapter II : the seal ══
  function renderSealFig(){
    var box=document.getElementById('soSealFig'), cap=document.getElementById('soSealFigCap');
    if(!box) return;
    if(_sealed && state.len===12){
      var v=state.vals[state.vals.length-1], kw=VAL_TO_KW[v], d=JD[kw]||{};
      var spec=[];
      for(var i=0;i<6;i++) spec.push({ bit:(v>>(5-i))&1, cls:(i<2?'element':'cs') });
      box.innerHTML=slotHexSVG(spec, 2);
      var sealedElement=ELEMENTS[elementOf(v)];
      cap.innerHTML='Your final hexagram: <strong>'+escapeHtml(d.name||'')+'</strong>, King Wen '+kw+'. '+
        '<span class="so-key-free">'+sealedElement.name+'</span>: chosen lines. '+
        '<span class="so-key-cs">Gold</span>: SHA-256 checksum.';
    } else {
      box.innerHTML=slotHexSVG([{bit:null,cls:'free'},{bit:null,cls:'free'},{bit:null,cls:'cs'},{bit:null,cls:'cs'},{bit:null,cls:'cs'},{bit:null,cls:'cs'}], 2);
      cap.innerHTML='The twenty-second hexagram: <span class="so-key-free">bottom two</span> yours, <span class="so-key-cs">top four</span> checksum.';
    }
  }
  // ── final-hexagram (checksum) calculator : the hexagram-native sibling ──
  // Brute-force all 64 possible last hexagrams; keep those whose full bit-string
  // (prefix + this hexagram) carries a valid BIP39 checksum. Twelve-word
  // reading only.
  function finalHexagrams(prefixVals){
    var totalHex = prefixVals.length + 1, n = totalHex*6/11;
    if (n !== 12) return { error: 'Need the first ' + (state.len*11/6 - 1) + ' hexagrams.' };
    var ENT = n*11*32/33, CS = ENT/32;
    var pbits = prefixVals.map(function(v){ return bits(v,6); }).join('');
    var out = [];
    for (var v=0; v<64; v++){
      var full = pbits + bits(v,6), entBits = full.slice(0,ENT), csBits = full.slice(ENT), bytes = [];
      for (var i=0; i<ENT; i+=8) bytes.push(parseInt(entBits.slice(i,i+8),2));
      var h = sha256Bytes(new Uint8Array(bytes));
      if (bits(h[0],8).slice(0,CS) === csBits) out.push(v);
    }
    return { vals: out };
  }

  // ══ Chapter II : the element seal (the climax) ══
  var elFhOut=document.getElementById('soFhOut');
  function elementSealHexHTML(v){
    var spec=[];
    for(var i=0;i<6;i++) spec.push({ bit:(v>>(5-i))&1, cls:(i<2?'element':'cs') });
    return slotHexSVG(spec,1.35);
  }
  function renderElementSeals(){
    if(!elFhOut) return;
    if(state.len!==12){
      elFhOut.innerHTML='<p class="so-fw-count">No element choice at this length.</p>';
      document.getElementById('soOracle').hidden=true;
      return;
    }
    document.getElementById('soOracle').hidden=false;
    if(_hexVals.length<castFree()){
      elFhOut.innerHTML='<p class="so-fw-count">Cast the first twenty-one hexagrams and the four seals appear here.</p>';
      return;
    }
    var r=finalHexagrams(_hexVals.slice(0,castFree()));
    if(r.error || !r.vals || r.vals.length!==4){
      elFhOut.innerHTML='<p class="so-fw-count warn">'+(r.error||'No four-seal result. Start a new reading and try again.')+'</p>';
      return;
    }
    var cur=_sealed ? state.vals[state.vals.length-1] : null;
    var vals=r.vals.slice().sort(function(a,b){ return ELEMENT_ORDER.indexOf(elementOf(a)) - ELEMENT_ORDER.indexOf(elementOf(b)); });
    var opts=vals.map(function(v){
      var kw=VAL_TO_KW[v], d=JD[kw]||{}, key=elementOf(v), element=ELEMENTS[key];
      return '<button type="button" class="so-hex so-fh-opt '+element.cls+(v===cur?' is-cur':'')+'" data-v="'+v+'" '+
        'aria-pressed="'+(v===cur)+'" aria-label="Seal with '+element.name+': '+(d.name||'')+', hexagram '+kw+(v===cur?', your chosen seal':'')+'">'+
        elementSymbol(key)+'<div class="so-element"><span class="so-element-name">'+element.name+'</span></div>'+ 
        '<div class="so-fh-hex">'+elementSealHexHTML(v)+'</div><div class="so-hex-name">'+(d.name||'-')+'</div>'+ 
        '<div class="so-hex-kw">King Wen '+kw+'</div></button>';
    }).join('');
    elFhOut.innerHTML='<div class="so-fh-opts">'+opts+'</div>';
  }
  if(elFhOut){
    elFhOut.addEventListener('click', function(e){
      var b=e.target.closest('.so-fh-opt'); if(!b) return;
      sealWith(+b.getAttribute('data-v'));
    });
  }
  document.getElementById('soOracle').addEventListener('click', function(){
    if(state.len!==12 || _hexVals.length<castFree()) return;
    var r=finalHexagrams(_hexVals.slice(0,castFree()));
    if(!r.vals || r.vals.length!==4) return;
    var toss=hexRand()&3;   // the oracle throws the two free lines
    var pick=r.vals.filter(function(v){ return ((v>>4)&3)===toss; })[0];
    if(pick!=null) sealWith(pick, true);
  });

  function sealWith(v, byOracle){
    state.vals=_hexVals.slice(0,castFree()).concat(v);
    _sealed=true;
    setChosenElement(elementOf(v));
    syncFromVals();
    raiseUnlock(4, 'Sealed. The proof is ready.');
    // the payoff cascade: 22nd hexagram assembles → seal cells fill → twelfth
    // word resolves → the phrase breathes in (pure CSS, skipped under reduced motion)
    if(!RM){
      document.body.classList.add('so-just-sealed');
      setTimeout(function(){ document.body.classList.remove('so-just-sealed'); }, 1600);
    }
    var chosen=ELEMENTS[elementOf(v)];
    document.getElementById('soChosenElement').textContent='Sealed with '+chosen.name;
    announce(byOracle
      ? 'The oracle threw '+chosen.name+'. Sealed.'
      : 'Sealed with '+chosen.name+'.');
    document.getElementById('soShaOut').hidden=true;
    document.getElementById('soShaErr').textContent='';
    elPhraseDisplay.focus({preventScroll:true});
    elPhraseDisplay.scrollIntoView({ behavior:RM?'auto':'smooth', block:'center' });
  }

  function renderJourneyActions(){
    var complete=_hexVals.length>=castFree();
    ['soHexOne','soHexAll'].forEach(function(id){
      var b=document.getElementById(id); if(b) b.disabled=_sealed || complete || !CRYPTO_OK;
    });
    var oracle=document.getElementById('soOracle');
    if(oracle) oracle.disabled=_sealed || !complete || !CRYPTO_OK;
    var fresh=document.getElementById('soNewReading');
    if(fresh) fresh.hidden=!_sealed;
    document.getElementById('soToSeal').hidden=!complete || _sealed;
    document.getElementById('soPhraseReveal').hidden=!_sealed;
    document.getElementById('soFhOut').classList.toggle('has-sealed',_sealed);
  }

  // (commitOracle + hexBitsToSeed retired 2026-07-08 alongside the
  // 24-word path : the twelve-word reading always leaves the seal to
  // sealWith() via the element chooser.)

  // ══ Sync (words ↔ hexagrams) ══
  function syncFromVals(){          // hexagrams → words (reverse direction)
    var words=valsToWords(state.vals);
    elPhrase.value=words.join(' ');
    elPhraseDisplay.innerHTML=words.map(function(word,i){
      return '<li><span class="so-phrase-num">'+(i+1)+'</span><strong>'+escapeHtml(word)+'</strong></li>';
    }).join('');
    var r=checkPhrase(words);
    setStatus(r.ok, r.ok?'Valid checksum':'Checksum mismatch');
    refreshDisplays(r);
  }
  function refreshDisplays(r){
    renderLine(); renderStack(); renderHexStat(); renderWeave(); renderSealFig(); renderElementSeals();
    renderEntropy(); renderAddresses(); renderJourneyActions(); updateCipher();
    if(r && r.ok){ deriveSeed(elPhrase.value.trim()); }
    else document.getElementById('soSeed').textContent='-';
  }
  function renderAll(){ renderStack(); renderHexStat(); renderWeave(); renderSealFig(); renderElementSeals(); renderJourneyActions(); updateCipher(); }

  // ══ Chapter III · The proof : proof ══
  // The bits under the words: raw entropy (hex + binary) and the checksum,
  // split so entropy + checksum = words × 11. Mirrors iancoleman's entropy view.
  function renderEntropy(){
    var box=document.getElementById('soEntOut'); if(!box) return;
    var words=currentWords();
    var r=checkPhrase(words);
    if(!(r.ok && r.entBytes)){ box.innerHTML='<p class="so-note">Seal a reading above to see its entropy.</p>'; return; }
    var eb=r.entBytes, hex=''; for(var i=0;i<eb.length;i++) hex+=('0'+eb[i].toString(16)).slice(-2);
    var all=phraseToBits(words), entLen=eb.length*8, entBin=all.slice(0,entLen), csBin=all.slice(entLen);
    function grp(s,n){ return s.replace(new RegExp('(.{'+n+'})','g'),'$1 ').trim(); }
    box.innerHTML=
      '<div class="so-ent-row"><span class="so-ent-k">Entropy · hex</span><span class="so-ent-v">'+hex+'</span></div>'+
      '<div class="so-ent-row"><span class="so-ent-k">Entropy · '+entLen+' bits</span><span class="so-ent-v">'+grp(entBin,8)+'</span></div>'+
      '<div class="so-ent-row"><span class="so-ent-k">Checksum · '+csBin.length+' bits</span><span class="so-ent-v so-ent-cs">'+csBin+'</span></div>';
  }

  // The SHA instrument : hash any hex bytes; highlight the first CS bits so the
  // seal can be checked by hand against the final hexagram's gold lines.
  (function(){
    var inp=document.getElementById('soShaIn'), err=document.getElementById('soShaErr'),
        out=document.getElementById('soShaOut');
    if(!inp) return;
    function entropyHex(){
      var r=checkPhrase(currentWords());
      if(!(r.ok&&r.entBytes)) return '';
      var h=''; for(var i=0;i<r.entBytes.length;i++) h+=('0'+r.entBytes[i].toString(16)).slice(-2);
      return h;
    }
    document.getElementById('soShaFrom').addEventListener('click', function(){
      var h=entropyHex();
      if(h){ inp.value=h; err.textContent=''; } else err.textContent='seal a reading first';
    });
    document.getElementById('soShaGo').addEventListener('click', function(){
      var v=inp.value.trim().toLowerCase().replace(/\s+/g,'');
      if(!v || !/^[0-9a-f]+$/.test(v) || v.length%2){ err.textContent='hex bytes only, even count of 0-9 a-f'; out.hidden=true; return; }
      err.textContent='';
      var bytes=new Uint8Array(v.length/2);
      for(var i=0;i<v.length;i+=2) bytes[i/2]=parseInt(v.slice(i,i+2),16);
      var h=sha256Bytes(bytes), hex='';
      for(i=0;i<h.length;i++) hex+=('0'+h[i].toString(16)).slice(-2);
      var cs=state.len/3;   // 4 checksum bits for the twelve-word reading
      var firstHex=hex.charAt(0), checksumBits=bits(parseInt(firstHex,16),cs);
      document.getElementById('soShaHex').innerHTML='<span class="so-sha-first">'+firstHex+'</span>'+hex.slice(1);
      document.getElementById('soShaBits').innerHTML='<span class="so-sha-first">'+firstHex+'</span><span class="so-sha-base"> hex</span><span class="so-sha-arrow" aria-hidden="true">→</span><span class="so-sha-hl">'+checksumBits+'</span><span class="so-sha-base"> binary</span>';
      var match=document.getElementById('soShaMatch');
      if(_sealed && v===entropyHex()){
        match.innerHTML='<span class="so-sha-hl">'+checksumBits+'</span> matches the four checksum lines in the seal.';
      } else {
        match.textContent='The first hex digit is exactly four bits, so it supplies the complete checksum for 128-bit entropy.';
      }
      out.hidden=false;
    });
  })();

  // ══ Chapter III · The proof : derived addresses (lazy) ══
  // Progressive: show the first receiving address; "See more" lists the first 10
  // (index + truncated address); selecting one loads its full keys into the detail
  // panel. The 64-byte seed is PBKDF2'd once and cached, so the 10 children are
  // cheap to derive and re-derive.
  var _addrToken = 0;
  var _addr = { key:'', buf:null, sel:0, shown:false, off:0 };   // key = phrase|scheme; off = list start index
  var ADDR_COUNT = 10;
  var ADDR_MAX = 2147483647 - ADDR_COUNT;   // BIP32 non-hardened index ceiling
  function addrRow(k,v){ return '<div class="so-addr-row"><span class="so-addr-k">'+k+'</span><span class="so-addr-v">'+v+'</span></div>'; }
  function addrTrunc(s){ return s.length > 30 ? s.slice(0,16)+'…'+s.slice(-8) : s; }
  function addrDetailHTML(a, idx){
    return '<p class="so-note">Receiving address #'+idx+' · '+a.label+' · <code>'+a.path+'</code>. Never fund it.</p>'+ 
      addrRow('Address', a.address)+addrRow('Public key', a.pubkey)+
      '<div class="so-private-block">'+
        addrRow('Private key (WIF)', a.wif)+
        '<p class="so-note so-private-note">Unsafe private material: anyone with this key controls this address.</p></div>';
  }
  function paintAddr(box){
    if(!_addr.buf) return;
    var scheme=(document.getElementById('soAddrType')||{}).value || 'bip84';
    var a=window.BTC.derive(scheme, _addr.buf, 0, _addr.sel);
    var html=addrDetailHTML(a, _addr.sel);
    html+='<button type="button" class="so-addr-more" data-act="'+(_addr.shown?'less':'more')+'">'+
          (_addr.shown?'Show less ↑':'See more addresses ↓')+'</button>';
    if(_addr.shown){
      var off=_addr.off, rows='';
      for(var i=off;i<off+ADDR_COUNT;i++){
        var ai=window.BTC.derive(scheme, _addr.buf, 0, i);
        rows+='<button type="button" class="so-addr-item'+(i===_addr.sel?' is-sel':'')+'" data-i="'+i+'" aria-pressed="'+(i===_addr.sel?'true':'false')+'">'+
          '<span class="so-addr-idx">'+i+'</span><span class="so-addr-mono">'+addrTrunc(ai.address)+'</span></button>';
      }
      html+='<div class="so-addr-listhead">Receiving addresses. Select one to load its keys.</div>'+
            '<div class="so-addr-list">'+rows+'</div>'+
            '<div class="so-addr-nav">'+
              '<button type="button" class="so-addr-pg" data-d="-10" aria-label="Previous 10"'+(off<=0?' disabled':'')+'>‹ 10</button>'+
              '<span class="so-addr-range">#'+off+'–#'+(off+ADDR_COUNT-1)+'</span>'+
              '<button type="button" class="so-addr-pg" data-d="10" aria-label="Next 10"'+(off>=ADDR_MAX?' disabled':'')+'>10 ›</button>'+
              '<label class="so-addr-jump">go to #<input type="number" id="soAddrJump" min="0" max="'+ADDR_MAX+'" value="'+off+'" inputmode="numeric" aria-label="Jump to address index"></label>'+
            '</div>';
    }
    box.innerHTML=html;
  }
  function renderAddresses(){
    var det=document.getElementById('soAddrFold'), box=document.getElementById('soAddrOut');
    if(!det || !box || !det.open) return;            // derive only when expanded
    var words=currentWords();
    if(!checkPhrase(words).ok){ box.innerHTML='<p class="so-note">Seal or paste a valid seed to derive its addresses.</p>'; return; }
    if(!window.BTC){ box.innerHTML='<p class="so-note">Derivation module not loaded.</p>'; return; }
    if(!(window.crypto && crypto.subtle)){ box.innerHTML='<p class="so-note">Address derivation needs a secure context (https or localhost).</p>'; return; }
    var scheme=(document.getElementById('soAddrType')||{}).value || 'bip84';
    var phrase=words.join(' '), key=phrase+'|'+scheme;
    if(_addr.key!==key){ _addr.key=key; _addr.sel=0; _addr.shown=false; _addr.buf=null; _addr.off=0; }   // reset on phrase/type change
    if(_addr.buf){ paintAddr(box); return; }                                                  // seed cached → repaint sync
    box.innerHTML='<p class="so-note">Deriving...</p>';
    var token=++_addrToken, enc=new TextEncoder();
    crypto.subtle.importKey('raw', enc.encode(phrase.normalize('NFKD')), {name:'PBKDF2'}, false, ['deriveBits'])
      .then(function(k){ return crypto.subtle.deriveBits({name:'PBKDF2', salt:enc.encode('mnemonic'), iterations:2048, hash:'SHA-512'}, k, 512); })
      .then(function(buf){ if(token!==_addrToken) return; _addr.buf=new Uint8Array(buf); paintAddr(box); })
      .catch(function(){ box.innerHTML='<p class="so-note">Couldn’t derive addresses here.</p>'; });
  }
  (function(){
    var det=document.getElementById('soAddrFold'); if(det) det.addEventListener('toggle', function(){ if(det.open) renderAddresses(); });
    var sel=document.getElementById('soAddrType'); if(sel) sel.addEventListener('change', renderAddresses);
    var box=document.getElementById('soAddrOut');
    function clampOff(n){ return Math.max(0, Math.min(ADDR_MAX, n)); }
    if(box){
      box.addEventListener('click', function(e){
        var act=e.target.closest('[data-act]');
        if(act){
          var a=act.getAttribute('data-act');
          if(a==='more'){ _addr.shown=true; _addr.off=0; }
          else if(a==='less'){ _addr.shown=false; }
          paintAddr(box); return;
        }
        var pg=e.target.closest('.so-addr-pg');
        if(pg && !pg.disabled){ _addr.off=clampOff(_addr.off + (+pg.getAttribute('data-d'))); paintAddr(box); return; }
        var item=e.target.closest('.so-addr-item');
        if(item){ _addr.sel=+item.getAttribute('data-i'); paintAddr(box); }
      });
      box.addEventListener('change', function(e){
        var jump=e.target.closest('#soAddrJump'); if(!jump) return;
        var n=parseInt(jump.value,10); if(isNaN(n)) n=0;
        n=clampOff(n); _addr.off=n; _addr.sel=n; paintAddr(box);
      });
    }
  })();

  // ══ hexagram detail popup (shared chrome; shows the judgment) ══
  var _hxLast=null;
  function openHexPopup(val){
    var kw=VAL_TO_KW[val], d=JD[kw]||{};
    document.getElementById('hxFig').innerHTML=hexagramSVG(val,1.75);
    document.getElementById('hxFigNum').textContent=val+' · '+bits(val,6);
    document.getElementById('hxKw').textContent='King Wen '+kw;
    document.getElementById('hxName').innerHTML=escapeHtml(d.name||'')+(d.pinyin?' <span class="hx-pin">'+escapeHtml(d.pinyin)+'</span>':'');
    document.getElementById('hxTrig').textContent=d.trig||'';
    document.getElementById('hxContent').innerHTML='<p class="hx-judgment">'+escapeHtml(d.judgment||'')+'</p>';
    document.getElementById('hxContent').scrollTop=0;
    var ov=document.getElementById('hxOverlay');
    if(!ov.classList.contains('open')){ _hxLast=document.activeElement; ov.classList.add('open'); document.getElementById('hxPopup').focus(); }
  }
  function closeHexPopup(){ document.getElementById('hxOverlay').classList.remove('open'); if(_hxLast&&document.contains(_hxLast))_hxLast.focus(); _hxLast=null; }
  document.getElementById('hxClose').addEventListener('click', closeHexPopup);
  document.getElementById('hxOverlay').addEventListener('click', function(e){ if(e.target===this) closeHexPopup(); });
  document.addEventListener('keydown', function(e){ if(e.key==='Escape' && document.getElementById('hxOverlay').classList.contains('open')) closeHexPopup(); });

  // ══ controls ══
  function resetReading(){
    state.len=12; state.vals=[]; state.focus=0;
    _lineBits=[]; _hexVals=[]; _sealed=false;
    _unlock=0;
    if(window.SeedStore) window.SeedStore.setUnlock(0);
    _addrToken++;
    _addr={ key:'', buf:null, sel:0, shown:false, off:0 };
    elPhrase.value='';
    elPhraseDisplay.innerHTML='';
    elStatus.className='so-status'; elStatus.querySelector('.msg').textContent='-';
    document.body.classList.remove('so-just-sealed');
    setChosenElement(null);
    var seed=document.getElementById('soSeed'); if(seed) seed.textContent='-';
    var shaIn=document.getElementById('soShaIn'); if(shaIn) shaIn.value='';
    var shaErr=document.getElementById('soShaErr'); if(shaErr) shaErr.textContent='';
    var shaOut=document.getElementById('soShaOut'); if(shaOut) shaOut.hidden=true;
    applyGates();
    renderLine(); refreshDisplays(null);
    announce('New reading ready.');
    scrollToChapter('firstline');
    elLineCast.focus({preventScroll:true});
  }
  var newReading=document.getElementById('soNewReading');
  if(newReading) newReading.addEventListener('click', resetReading);

  var caveatLink = document.getElementById('soCaveatLink');
  if (caveatLink) {
    caveatLink.addEventListener('click', function(e){
      e.preventDefault();
      raiseUnlock(4);   // the caution must always be reachable: safety outranks ceremony
      var sec=document.getElementById('learn');
      if(sec && !sec.classList.contains('section-open')) window.toggleSection && window.toggleSection('learn');
      scrollToChapter('learn');
    });
  }

  // Element symbols are the four familiar alchemical triangle marks.
  function elementSymbol(key){
    var down=key==='water'||key==='earth';
    var triangle=down?'M16 22 L64 22 L40 65 Z':'M16 62 L64 62 L40 19 Z';
    var bar=key==='earth'||key==='air' ? '<path d="M12 43 H68"/>' : '';
    return '<svg class="so-element-symbol" viewBox="0 0 80 80" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><circle cx="40" cy="40" r="38"/><path d="'+triangle+'"/>'+bar+'</svg>';
  }

  function setChosenElement(key){
    ELEMENT_ORDER.forEach(function(name){ document.body.classList.remove('so-chosen-'+name); });
    if(key) document.body.classList.add('so-chosen-'+key);
  }

  document.getElementById('soToSeal').addEventListener('click',function(){ scrollToChapter('seal'); document.querySelector('.so-fh-opt').focus({preventScroll:true}); });
  document.getElementById('soToProof').addEventListener('click',function(){ scrollToChapter('underhood'); document.querySelector('#underhood .section-toggle').focus({preventScroll:true}); });

  // Adapted from mysticscards.space's I Ching reference: the figures retain
  // their binary identity while the reference order changes independently.
  var chart=document.getElementById('soChart'), chartSeq='fuxi';
  function buildChart(){
    var html='';
    for(var v=0;v<64;v++){
      var kw=VAL_TO_KW[v];
      html+='<button type="button" class="so-chart-cell" data-val="'+v+'" aria-label="Binary '+bits(v,6)+', decimal '+v+', King Wen '+kw+'. Read judgment."><span class="so-chart-kw">KW '+kw+'</span>'+hexagramSVG(v,0.8)+'<span class="so-chart-bits">'+bits(v,6)+'</span><span class="so-chart-dec">'+v+'</span></button>';
    }
    chart.innerHTML=html;
  }
  function updateCipher(){
    var v=_hexVals.length ? _hexVals[_hexVals.length-1] : null;
    chart.querySelectorAll('[data-val]').forEach(function(cell){
      var current=+cell.dataset.val===v;
      cell.classList.toggle('is-current',current);
      if(current) cell.setAttribute('aria-current','true'); else cell.removeAttribute('aria-current');
    });
  }
  document.querySelector('.so-sequence').addEventListener('click',function(e){
    var btn=e.target.closest('[data-seq]'); if(!btn || btn.dataset.seq===chartSeq) return;
    chartSeq=btn.dataset.seq;
    var cells=Array.from(chart.children), rects={};
    cells.forEach(function(cell){ rects[cell.dataset.val]=cell.getBoundingClientRect(); });
    cells.sort(function(a,b){ return chartSeq==='fuxi' ? +a.dataset.val-b.dataset.val : VAL_TO_KW[a.dataset.val]-VAL_TO_KW[b.dataset.val]; });
    cells.forEach(function(cell){ chart.appendChild(cell); });
    if(!RM) cells.forEach(function(cell){
      var old=rects[cell.dataset.val], now=cell.getBoundingClientRect();
      cell.animate([{transform:'translate('+(old.left-now.left)+'px,'+(old.top-now.top)+'px)'},{transform:'translate(0,0)'}],{duration:500,easing:'cubic-bezier(.22,1,.36,1)'});
    });
    document.querySelectorAll('[data-seq]').forEach(function(b){ b.setAttribute('aria-pressed',b===btn?'true':'false'); });
  });
  chart.addEventListener('click',function(e){ var cell=e.target.closest('[data-val]'); if(cell) openHexPopup(+cell.dataset.val); });
  buildChart();

  // ══ init ══
  function init(){
    applyGates();
    var cast=document.getElementById('firstline');
    if(cast){
      cast.classList.remove('section-open');
      var castToggle=cast.querySelector(':scope > .section-heading > .section-toggle');
      var castBody=cast.querySelector('.section-bodymin');
      if(castToggle) castToggle.setAttribute('aria-expanded','false');
      if(castBody) castBody.inert=true;
    }
    renderLine(); renderAll();
    if(WL.length!==2048){ setStatus(false,'word list failed to load'); }
    else if(!CRYPTO_OK){
      setStatus(false,'Casting needs secure randomness. Please use a current browser.');
      ['soLineCast','soHexOne','soHexAll','soOracle'].forEach(function(id){ var b=document.getElementById(id); if(b) b.disabled=true; });
    }
  }
  // Run AFTER site.js's _restoreSections (registered earlier, so it fires first):
  // the gates must win over any saved open/closed section state.
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
