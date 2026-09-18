// seedoracle-bitcoin.js : the Bitcoin math for the Seed Oracle:
// SHA-256 (compact public-domain implementation for the BIP39 checksum),
// BIP39 word ↔ bit conversion + validation, and PBKDF2-HMAC-SHA512 seed
// derivation via Web Crypto.
//
// Seam pattern: pure math + one narrow Web Crypto
// call, zero DOM state except the target element for deriveSeed's async
// write. Everything else in seedoracle.js reads through window.SeedOracleBitcoin.
//
// Load order in seedoracle.html: AFTER js/bip39-words.js (needs
// window.BIP39_WORDS) and BEFORE js/seedoracle.js (which reads
// window.SeedOracleBitcoin at IIFE entry).
//
// Public API on window.SeedOracleBitcoin:
//   bits(n, width)             : zero-padded binary string
//   sha256Bytes(bytes)         : Uint8Array → Uint8Array(32) SHA-256 digest
//   entropyToMnemonic(entBytes): entropy Uint8Array → space-joined 12/24 words
//   phraseToBits(words)        : array of words → concatenated 11-bit strings
//   checkPhrase(words)         : { ok, reason, entBytes? }; verifies BIP39 checksum
//   phraseToVals(words)        : array of words → array of 6-bit hexagram values
//   valsToWords(vals)          : array of 6-bit values → array of BIP39 words
//   deriveSeed(mnemonic, outEl, passphrase?): async: writes 64-byte seed hex to outEl.textContent
//                                (or the "needs a secure context" message)
//   WL                         : the BIP39 word list (window.BIP39_WORDS mirror)
//   IDX                        : reverse map: word → 0..2047

(function () {
  'use strict';

  var WL = window.BIP39_WORDS || [];
  var IDX = {}; WL.forEach(function (w, i) { IDX[w] = i; });

  function bits(n, w) { var s = n.toString(2); while (s.length < w) s = '0' + s; return s; }

  // ── compact SHA-256 (public domain, for the BIP39 checksum) ──
  function sha256Bytes(bytes) {
    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    var K = [
      0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2
    ];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var l = bytes.length, withOne = l + 1, k = (56 - withOne % 64 + 64) % 64, total = withOne + k + 8;
    var m = new Uint8Array(total); m.set(bytes); m[l] = 0x80;
    var bitLen = l * 8; for (var i = 0; i < 4; i++) { m[total - 1 - i] = (bitLen >>> (8 * i)) & 0xff; }
    var w = new Int32Array(64);
    for (var off = 0; off < total; off += 64) {
      for (var t = 0; t < 16; t++) { w[t] = (m[off+t*4]<<24)|(m[off+t*4+1]<<16)|(m[off+t*4+2]<<8)|(m[off+t*4+3]); }
      for (t = 16; t < 64; t++) {
        var s0 = rotr(7, w[t-15]) ^ rotr(18, w[t-15]) ^ (w[t-15] >>> 3);
        var s1 = rotr(17, w[t-2]) ^ rotr(19, w[t-2]) ^ (w[t-2] >>> 10);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) | 0;
      }
      var a=H[0], b=H[1], c=H[2], d=H[3], e=H[4], f=H[5], g=H[6], h=H[7];
      for (t = 0; t < 64; t++) {
        var S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
        var ch = (e & f) ^ (~e & g);
        var t1 = (h + S1 + ch + K[t] + w[t]) | 0;
        var S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = b; b = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0]+a)|0; H[1] = (H[1]+b)|0; H[2] = (H[2]+c)|0; H[3] = (H[3]+d)|0;
      H[4] = (H[4]+e)|0; H[5] = (H[5]+f)|0; H[6] = (H[6]+g)|0; H[7] = (H[7]+h)|0;
    }
    var out = new Uint8Array(32);
    for (i = 0; i < 8; i++) {
      out[i*4]   = (H[i] >>> 24) & 0xff;
      out[i*4+1] = (H[i] >>> 16) & 0xff;
      out[i*4+2] = (H[i] >>>  8) & 0xff;
      out[i*4+3] =  H[i]         & 0xff;
    }
    return out;
  }

  // ── BIP39 core ──
  function entropyToMnemonic(entBytes) {
    var b = ''; for (var i = 0; i < entBytes.length; i++) b += bits(entBytes[i], 8);
    var cs = entBytes.length * 8 / 32, h = sha256Bytes(entBytes);
    b += bits(h[0], 8).slice(0, cs);
    var words = [];
    for (i = 0; i < b.length; i += 11) words.push(WL[parseInt(b.slice(i, i + 11), 2)]);
    return words.join(' ');
  }
  function phraseToBits(words) {
    return words.map(function (w) { return bits(IDX[w], 11); }).join('');
  }
  function checkPhrase(words) {
    if (words.some(function (w) { return !(w in IDX); })) return { ok: false, reason: 'unknown word' };
    var n = words.length;
    if ([12, 18, 24].indexOf(n) === -1) return { ok: false, reason: n + ' words : use 12 or 24' };
    var b = phraseToBits(words), ent = Math.floor(b.length / 33) * 32, cs = b.length - ent;
    var eb = b.slice(0, ent), cb = b.slice(ent), bytes = [];
    for (var i = 0; i < ent; i += 8) bytes.push(parseInt(eb.slice(i, i + 8), 2));
    var h = sha256Bytes(new Uint8Array(bytes));
    return { ok: bits(h[0], 8).slice(0, cs) === cb, reason: 'checksum', entBytes: new Uint8Array(bytes) };
  }
  // 11-bit word ↔ 6-bit hexagram bridge (the bit-tongue of the whole page).
  function phraseToVals(words) {
    var b = phraseToBits(words), v = [];
    for (var i = 0; i < b.length; i += 6) v.push(parseInt(b.slice(i, i + 6), 2));
    return v;
  }
  function valsToWords(vals) {
    var b = vals.map(function (v) { return bits(v, 6); }).join(''), w = [];
    for (var i = 0; i + 11 <= b.length; i += 11) w.push(WL[parseInt(b.slice(i, i + 11), 2)]);
    return w;
  }

  // ── PBKDF2-HMAC-SHA512 seed (via Web Crypto; graceful if unavailable) ──
  // Async write into the target text element : matches the pre-extraction
  // shape (previously read #soSeed directly; now takes it as an argument so
  // it can be null-checked and the module stays DOM-lite).
  function deriveSeed(mnemonic, outEl, passphrase) {
    if (!outEl) return Promise.resolve();
    if (!(window.crypto && crypto.subtle)) {
      outEl.textContent = '(seed derivation needs a secure context : open via https/localhost)';
      return Promise.resolve();
    }
    var enc = new TextEncoder();
    passphrase = passphrase || '';
    return crypto.subtle.importKey('raw', enc.encode(mnemonic.normalize('NFKD')), { name: 'PBKDF2' }, false, ['deriveBits'])
      .then(function (key) {
        return crypto.subtle.deriveBits({ name: 'PBKDF2', salt: enc.encode(('mnemonic' + passphrase).normalize('NFKD')), iterations: 2048, hash: 'SHA-512' }, key, 512);
      })
      .then(function (buf) {
        var a = new Uint8Array(buf), h = '';
        for (var i = 0; i < a.length; i++) h += ('0' + a[i].toString(16)).slice(-2);
        outEl.textContent = h;
      })
      .catch(function () { outEl.textContent = '(seed derivation unavailable here)'; });
  }

  window.SeedOracleBitcoin = {
    WL: WL, IDX: IDX,
    bits: bits,
    sha256Bytes: sha256Bytes,
    entropyToMnemonic: entropyToMnemonic,
    phraseToBits: phraseToBits,
    checkPhrase: checkPhrase,
    phraseToVals: phraseToVals,
    valsToWords: valsToWords,
    deriveSeed: deriveSeed,
  };
})();
