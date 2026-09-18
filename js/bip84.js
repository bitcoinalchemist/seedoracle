/* bip84.js — minimal, dependency-free BIP32 → BIP84 (P2WPKH, "bc1q…") derivation.
 *
 * Pure JS. Self-contained: SHA-256, SHA-512, HMAC-SHA512, RIPEMD-160,
 * secp256k1 (BigInt), bech32, Base58Check. No external libraries, no build step.
 * Verified against the official BIP84 first-address vector
 * (dev/tests/seedoracle-vectors.cjs).
 *
 * The heavy PBKDF2 (mnemonic → seed) is done by the caller (Web Crypto on the
 * page); this module takes the 64-byte seed and returns address + keys.
 *
 *   window.BIP84.fromSeed(seedBytes, change, index)
 *     -> { path, address, pubkey, wif, privhex }
 *
 * NOT for real funds — this site is a divination curiosity. See seedoracle.html.
 */
(function () {
  'use strict';

  // ── byte helpers ───────────────────────────────────────────────
  function hex(b) { var s = ''; for (var i = 0; i < b.length; i++) s += ('0' + b[i].toString(16)).slice(-2); return s; }
  function concat() { var n = 0, i, a; for (i = 0; i < arguments.length; i++) n += arguments[i].length;
    var out = new Uint8Array(n), o = 0; for (i = 0; i < arguments.length; i++) { out.set(arguments[i], o); o += arguments[i].length; } return out; }
  function strBytes(s) { var b = new Uint8Array(s.length); for (var i = 0; i < s.length; i++) b[i] = s.charCodeAt(i); return b; }

  // ── SHA-256 (32-bit) ───────────────────────────────────────────
  function sha256(bytes) {
    function rotr(n, x) { return (x >>> n) | (x << (32 - n)); }
    var K = [0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
      0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
      0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
      0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
      0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
      0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
      0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
      0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
    var H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
    var l = bytes.length, withOne = l + 1, k = (56 - withOne % 64 + 64) % 64, total = withOne + k + 8;
    var m = new Uint8Array(total); m.set(bytes); m[l] = 0x80;
    var bitLen = l * 8, i; for (i = 0; i < 4; i++) m[total - 1 - i] = (bitLen >>> (8 * i)) & 0xff;
    var w = new Int32Array(64), off, t;
    for (off = 0; off < total; off += 64) {
      for (t = 0; t < 16; t++) w[t] = (m[off+t*4]<<24)|(m[off+t*4+1]<<16)|(m[off+t*4+2]<<8)|m[off+t*4+3];
      for (t = 16; t < 64; t++) { var s0=rotr(7,w[t-15])^rotr(18,w[t-15])^(w[t-15]>>>3); var s1=rotr(17,w[t-2])^rotr(19,w[t-2])^(w[t-2]>>>10); w[t]=(w[t-16]+s0+w[t-7]+s1)|0; }
      var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (t = 0; t < 64; t++) { var S1=rotr(6,e)^rotr(11,e)^rotr(25,e); var ch=(e&f)^(~e&g); var t1=(h+S1+ch+K[t]+w[t])|0; var S0=rotr(2,a)^rotr(13,a)^rotr(22,a); var maj=(a&b)^(a&c)^(b&c); var t2=(S0+maj)|0; h=g;g=f;f=e;e=(d+t1)|0;d=c;c=b;b=a;a=(t1+t2)|0; }
      H[0]=(H[0]+a)|0;H[1]=(H[1]+b)|0;H[2]=(H[2]+c)|0;H[3]=(H[3]+d)|0;H[4]=(H[4]+e)|0;H[5]=(H[5]+f)|0;H[6]=(H[6]+g)|0;H[7]=(H[7]+h)|0;
    }
    var out = new Uint8Array(32); for (i = 0; i < 8; i++) { out[i*4]=(H[i]>>>24)&0xff;out[i*4+1]=(H[i]>>>16)&0xff;out[i*4+2]=(H[i]>>>8)&0xff;out[i*4+3]=H[i]&0xff; } return out;
  }

  // ── SHA-512 (BigInt, 64-bit lanes) ─────────────────────────────
  var MASK64 = (1n << 64n) - 1n;
  var K512 = ['428a2f98d728ae22','7137449123ef65cd','b5c0fbcfec4d3b2f','e9b5dba58189dbbc','3956c25bf348b538','59f111f1b605d019','923f82a4af194f9b','ab1c5ed5da6d8118','d807aa98a3030242','12835b0145706fbe','243185be4ee4b28c','550c7dc3d5ffb4e2','72be5d74f27b896f','80deb1fe3b1696b1','9bdc06a725c71235','c19bf174cf692694','e49b69c19ef14ad2','efbe4786384f25e3','0fc19dc68b8cd5b5','240ca1cc77ac9c65','2de92c6f592b0275','4a7484aa6ea6e483','5cb0a9dcbd41fbd4','76f988da831153b5','983e5152ee66dfab','a831c66d2db43210','b00327c898fb213f','bf597fc7beef0ee4','c6e00bf33da88fc2','d5a79147930aa725','06ca6351e003826f','142929670a0e6e70','27b70a8546d22ffc','2e1b21385c26c926','4d2c6dfc5ac42aed','53380d139d95b3df','650a73548baf63de','766a0abb3c77b2a8','81c2c92e47edaee6','92722c851482353b','a2bfe8a14cf10364','a81a664bbc423001','c24b8b70d0f89791','c76c51a30654be30','d192e819d6ef5218','d69906245565a910','f40e35855771202a','106aa07032bbd1b8','19a4c116b8d2d0c8','1e376c085141ab53','2748774cdf8eeb99','34b0bcb5e19b48a8','391c0cb3c5c95a63','4ed8aa4ae3418acb','5b9cca4f7763e373','682e6ff3d6b2b8a3','748f82ee5defb2fc','78a5636f43172f60','84c87814a1f0ab72','8cc702081a6439ec','90befffa23631e28','a4506cebde82bde9','bef9a3f7b2c67915','c67178f2e372532b','ca273eceea26619c','d186b8c721c0c207','eada7dd6cde0eb1e','f57d4f7fee6ed178','06f067aa72176fba','0a637dc5a2c898a6','113f9804bef90dae','1b710b35131c471b','28db77f523047d84','32caab7b40c72493','3c9ebe0a15c9bebc','431d67c49c100d4c','4cc5d4becb3e42b6','597f299cfc657e2a','5fcb6fab3ad6faec','6c44198c4a475817'].map(function (s) { return BigInt('0x' + s); });
  function rotr64(x, n) { return ((x >> n) | (x << (64n - n))) & MASK64; }
  function sha512(msg) {
    var H = ['6a09e667f3bcc908','bb67ae8584caa73b','3c6ef372fe94f82b','a54ff53a5f1d36f1','510e527fade682d1','9b05688c2b3e6c1f','1f83d9abfb41bd6b','5be0cd19137e2179'].map(function (s) { return BigInt('0x' + s); });
    var l = msg.length, k = (112 - (l + 1) % 128 + 128) % 128, total = l + 1 + k + 16;
    var m = new Uint8Array(total); m.set(msg); m[l] = 0x80;
    var bitLen = BigInt(l) * 8n, i; for (i = 0; i < 8; i++) m[total - 1 - i] = Number((bitLen >> BigInt(8 * i)) & 0xffn);
    var w = new Array(80), off, t, j;
    for (off = 0; off < total; off += 128) {
      for (t = 0; t < 16; t++) { var x = 0n; for (j = 0; j < 8; j++) x = (x << 8n) | BigInt(m[off + t*8 + j]); w[t] = x; }
      for (t = 16; t < 80; t++) {
        var s0 = rotr64(w[t-15],1n) ^ rotr64(w[t-15],8n) ^ (w[t-15] >> 7n);
        var s1 = rotr64(w[t-2],19n) ^ rotr64(w[t-2],61n) ^ (w[t-2] >> 6n);
        w[t] = (w[t-16] + s0 + w[t-7] + s1) & MASK64;
      }
      var a=H[0],b=H[1],c=H[2],d=H[3],e=H[4],f=H[5],g=H[6],h=H[7];
      for (t = 0; t < 80; t++) {
        var S1 = rotr64(e,14n) ^ rotr64(e,18n) ^ rotr64(e,41n);
        var ch = (e & f) ^ ((~e & MASK64) & g);
        var t1 = (h + S1 + ch + K512[t] + w[t]) & MASK64;
        var S0 = rotr64(a,28n) ^ rotr64(a,34n) ^ rotr64(a,39n);
        var maj = (a & b) ^ (a & c) ^ (b & c);
        var t2 = (S0 + maj) & MASK64;
        h=g;g=f;f=e;e=(d+t1)&MASK64;d=c;c=b;b=a;a=(t1+t2)&MASK64;
      }
      H[0]=(H[0]+a)&MASK64;H[1]=(H[1]+b)&MASK64;H[2]=(H[2]+c)&MASK64;H[3]=(H[3]+d)&MASK64;H[4]=(H[4]+e)&MASK64;H[5]=(H[5]+f)&MASK64;H[6]=(H[6]+g)&MASK64;H[7]=(H[7]+h)&MASK64;
    }
    var out = new Uint8Array(64); for (i = 0; i < 8; i++) for (j = 0; j < 8; j++) out[i*8+j] = Number((H[i] >> BigInt(56 - 8*j)) & 0xffn); return out;
  }
  function hmacSha512(key, data) {
    var B = 128; if (key.length > B) key = sha512(key);
    var kp = new Uint8Array(B); kp.set(key);
    var ip = new Uint8Array(B), op = new Uint8Array(B), i;
    for (i = 0; i < B; i++) { ip[i] = kp[i] ^ 0x36; op[i] = kp[i] ^ 0x5c; }
    return sha512(concat(op, sha512(concat(ip, data))));
  }

  // ── RIPEMD-160 ─────────────────────────────────────────────────
  function ripemd160(bytes) {
    function rol(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
    var rl=[0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,7,4,13,1,10,6,15,3,12,0,9,5,2,14,11,8,3,10,14,4,9,15,8,1,2,7,0,6,13,11,5,12,1,9,11,10,0,8,12,4,13,3,7,15,14,5,6,2,4,0,5,9,7,12,2,10,14,1,3,8,11,6,15,13];
    var rr=[5,14,7,0,9,2,11,4,13,6,15,8,1,10,3,12,6,11,3,7,0,13,5,10,14,15,8,12,4,9,1,2,15,5,1,3,7,14,6,9,11,8,12,2,10,0,4,13,8,6,4,1,3,11,15,0,5,12,2,13,9,7,10,14,12,15,10,4,1,5,8,7,6,2,13,14,0,3,9,11];
    var sl=[11,14,15,12,5,8,7,9,11,13,14,15,6,7,9,8,7,6,8,13,11,9,7,15,7,12,15,9,11,7,13,12,11,13,6,7,14,9,13,15,14,8,13,6,5,12,7,5,11,12,14,15,14,15,9,8,9,14,5,6,8,6,5,12,9,15,5,11,6,8,13,12,5,12,13,14,11,8,5,6];
    var sr=[8,9,9,11,13,15,15,5,7,7,8,11,14,14,12,6,9,13,15,7,12,8,9,11,7,7,12,7,6,15,13,11,9,7,15,11,8,6,6,14,12,13,5,14,13,13,7,5,15,5,8,11,14,14,6,14,6,9,12,9,12,5,15,8,8,5,12,9,12,5,14,6,8,13,6,5,15,13,11,11];
    var KL=[0x00000000,0x5a827999,0x6ed9eba1,0x8f1bbcdc,0xa953fd4e];
    var KR=[0x50a28be6,0x5c4dd124,0x6d703ef3,0x7a6d76e9,0x00000000];
    var h0=0x67452301,h1=0xefcdab89,h2=0x98badcfe,h3=0x10325476,h4=0xc3d2e1f0;
    var l = bytes.length, withOne = l + 1, k = (56 - withOne % 64 + 64) % 64, total = withOne + k + 8;
    var m = new Uint8Array(total); m.set(bytes); m[l] = 0x80;
    var bitLen = l * 8, i; for (i = 0; i < 4; i++) m[l + 1 + k + i] = (bitLen >>> (8 * i)) & 0xff;
    var X = new Int32Array(16), off, j;
    for (off = 0; off < total; off += 64) {
      for (j = 0; j < 16; j++) X[j] = (m[off+j*4]) | (m[off+j*4+1]<<8) | (m[off+j*4+2]<<16) | (m[off+j*4+3]<<24);
      var al=h0,bl=h1,cl=h2,dl=h3,el=h4, ar=h0,br=h1,cr=h2,dr=h3,er=h4, t;
      for (j = 0; j < 80; j++) {
        var rnd = j >> 4, fl, fr;
        if (rnd===0){fl=bl^cl^dl;} else if(rnd===1){fl=(bl&cl)|(~bl&dl);} else if(rnd===2){fl=(bl|~cl)^dl;} else if(rnd===3){fl=(bl&dl)|(cl&~dl);} else {fl=bl^(cl|~dl);}
        if (rnd===0){fr=br^(cr|~dr);} else if(rnd===1){fr=(br&dr)|(cr&~dr);} else if(rnd===2){fr=(br|~cr)^dr;} else if(rnd===3){fr=(br&cr)|(~br&dr);} else {fr=br^cr^dr;}
        t = (rol((al + (fl>>>0) + (X[rl[j]]>>>0) + KL[rnd]) >>> 0, sl[j]) + el) >>> 0;
        al=el; el=dl; dl=rol(cl,10); cl=bl; bl=t;
        t = (rol((ar + (fr>>>0) + (X[rr[j]]>>>0) + KR[rnd]) >>> 0, sr[j]) + er) >>> 0;
        ar=er; er=dr; dr=rol(cr,10); cr=br; br=t;
      }
      t = (h1 + cl + dr) >>> 0; h1 = (h2 + dl + er) >>> 0; h2 = (h3 + el + ar) >>> 0; h3 = (h4 + al + br) >>> 0; h4 = (h0 + bl + cr) >>> 0; h0 = t;
    }
    var out = new Uint8Array(20), hs = [h0,h1,h2,h3,h4]; for (i = 0; i < 5; i++) { out[i*4]=hs[i]&0xff;out[i*4+1]=(hs[i]>>>8)&0xff;out[i*4+2]=(hs[i]>>>16)&0xff;out[i*4+3]=(hs[i]>>>24)&0xff; } return out;
  }
  function hash160(b) { return ripemd160(sha256(b)); }

  // ── secp256k1 (affine, BigInt) ─────────────────────────────────
  var P = 0xfffffffffffffffffffffffffffffffffffffffffffffffffffffffefffffc2fn;
  var N = 0xfffffffffffffffffffffffffffffffebaaedce6af48a03bbfd25e8cd0364141n;
  var Gx = 0x79be667ef9dcbbac55a06295ce870b07029bfcdb2dce28d959f2815b16f81798n;
  var Gy = 0x483ada7726a3c4655da4fbfc0e1108a8fd17b448a68554199c47d08ffb10d4b8n;
  var G = { x: Gx, y: Gy };
  function mod(a, m) { a %= m; return a >= 0n ? a : a + m; }
  function modPow(b, e, m) { b = mod(b, m); var r = 1n; while (e > 0n) { if (e & 1n) r = r * b % m; e >>= 1n; b = b * b % m; } return r; }
  function inv(a, m) { return modPow(mod(a, m), m - 2n, m); }
  function ptDouble(Pt) { if (!Pt) return null; if (Pt.y === 0n) return null;
    var s = mod(3n * Pt.x * Pt.x * inv(2n * Pt.y, P), P);
    var xr = mod(s * s - 2n * Pt.x, P); return { x: xr, y: mod(s * (Pt.x - xr) - Pt.y, P) }; }
  function ptAdd(A, B) { if (!A) return B; if (!B) return A;
    if (A.x === B.x) { if (mod(A.y + B.y, P) === 0n) return null; return ptDouble(A); }
    var s = mod((B.y - A.y) * inv(B.x - A.x, P), P);
    var xr = mod(s * s - A.x - B.x, P); return { x: xr, y: mod(s * (A.x - xr) - A.y, P) }; }
  function ptMul(k, Pt) { var r = null, a = Pt; k = mod(k, N); while (k > 0n) { if (k & 1n) r = ptAdd(r, a); a = ptDouble(a); k >>= 1n; } return r; }
  function to32(n) { var b = new Uint8Array(32); for (var i = 31; i >= 0; i--) { b[i] = Number(n & 0xffn); n >>= 8n; } return b; }
  function from32(b, off) { var n = 0n; for (var i = 0; i < 32; i++) n = (n << 8n) | BigInt(b[off + i]); return n; }
  function pubkey(priv) { var Pt = ptMul(priv, G); var out = new Uint8Array(33); out[0] = (Pt.y & 1n) === 0n ? 0x02 : 0x03; out.set(to32(Pt.x), 1); return out; }

  // ── BIP32 (private-key derivation only) ────────────────────────
  function ckdPriv(kpar, cpar, index) {
    var data = new Uint8Array(37);
    if (index >= 0x80000000) { data[0] = 0; data.set(to32(kpar), 1); }
    else { data.set(pubkey(kpar), 0); }
    data[33] = (index >>> 24) & 0xff; data[34] = (index >>> 16) & 0xff; data[35] = (index >>> 8) & 0xff; data[36] = index & 0xff;
    var I = hmacSha512(cpar, data);
    return { k: mod(from32(I, 0) + kpar, N), c: I.slice(32, 64) };
  }

  // ── Base58Check + bech32 ───────────────────────────────────────
  var B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
  function base58(bytes) { var n = 0n, i; for (i = 0; i < bytes.length; i++) n = (n << 8n) | BigInt(bytes[i]);
    var s = ''; while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
    for (i = 0; i < bytes.length && bytes[i] === 0; i++) s = '1' + s; return s; }
  function base58check(payload) { var chk = sha256(sha256(payload)).slice(0, 4); return base58(concat(payload, chk)); }
  function toWIF(priv) { return base58check(concat(new Uint8Array([0x80]), to32(priv), new Uint8Array([0x01]))); }

  var CH = 'qpzry9x8gf2tvdw0s3jn54khce6mua7l';
  var GEN = [0x3b6a57b2, 0x26508e6d, 0x1ea119fa, 0x3d4233dd, 0x2a1462b3];
  function polymod(values) { var chk = 1, i, j; for (i = 0; i < values.length; i++) { var top = chk >>> 25; chk = ((chk & 0x1ffffff) << 5) ^ values[i]; for (j = 0; j < 5; j++) if ((top >>> j) & 1) chk ^= GEN[j]; } return chk; }
  function hrpExpand(hrp) { var r = [], i; for (i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) >>> 5); r.push(0); for (i = 0; i < hrp.length; i++) r.push(hrp.charCodeAt(i) & 31); return r; }
  function createChecksum(hrp, data, constv) { var values = hrpExpand(hrp).concat(data).concat([0,0,0,0,0,0]); var m = polymod(values) ^ constv; var r = [], i; for (i = 0; i < 6; i++) r.push((m >>> (5 * (5 - i))) & 31); return r; }
  function convertBits(data, from, to, pad) { var acc = 0, bits = 0, ret = [], maxv = (1 << to) - 1, i; for (i = 0; i < data.length; i++) { acc = (acc << from) | data[i]; bits += from; while (bits >= to) { bits -= to; ret.push((acc >>> bits) & maxv); } } if (pad && bits) ret.push((acc << (to - bits)) & maxv); return ret; }
  // witver 0 → bech32 (const 1); witver ≥ 1 → bech32m (const 0x2bc830a3, used by Taproot v1).
  function segwitAddr(hrp, witver, program) { var spec = witver === 0 ? 1 : 0x2bc830a3; var data = [witver].concat(convertBits(Array.prototype.slice.call(program), 8, 5, true)); var combined = data.concat(createChecksum(hrp, data, spec)); var s = hrp + '1', i; for (i = 0; i < combined.length; i++) s += CH[combined[i]]; return s; }

  // ── Taproot (BIP340/BIP341) key tweak for BIP86 ────────────────
  function taggedHash(tag, msg) { var t = sha256(strBytes(tag)); return sha256(concat(t, t, msg)); }
  function liftX(x) { if (x <= 0n || x >= P) return null; var c = mod(x * x * x + 7n, P); var y = modPow(c, (P + 1n) / 4n, P); if (mod(y * y, P) !== c) return null; if (y & 1n) y = P - y; return { x: x, y: y }; }
  function taprootOutput(pub) { var ix = pub.slice(1); var Pt = liftX(from32(ix, 0)); var t = mod(from32(taggedHash('TapTweak', ix), 0), N); var Q = ptAdd(Pt, ptMul(t, G)); return to32(Q.x); }

  // ── address encoders per scheme ────────────────────────────────
  function p2pkh(pub) { return base58check(concat(new Uint8Array([0x00]), hash160(pub))); }                       // BIP44, "1…"
  function p2shP2wpkh(pub) { var redeem = concat(new Uint8Array([0x00, 0x14]), hash160(pub)); return base58check(concat(new Uint8Array([0x05]), hash160(redeem))); } // BIP49, "3…"
  function p2wpkh(pub) { return segwitAddr('bc', 0, hash160(pub)); }                                              // BIP84, "bc1q…"
  function p2tr(pub) { return segwitAddr('bc', 1, taprootOutput(pub)); }                                          // BIP86, "bc1p…"

  // ── derivation node for a purpose (account 0) ──────────────────
  // seedBytes: Uint8Array(64). Path m/purpose'/0'/0'/change/index.
  function deriveKey(seedBytes, purpose, change, index) {
    var I = hmacSha512(strBytes('Bitcoin seed'), seedBytes);
    var node = { k: from32(I, 0), c: I.slice(32, 64) };
    var path = [0x80000000 + purpose, 0x80000000 + 0, 0x80000000 + 0, change, index];
    for (var p = 0; p < path.length; p++) node = ckdPriv(node.k, node.c, path[p]);
    return node.k;
  }

  // ── the four common address schemes ────────────────────────────
  var SCHEMES = [
    { id: 'bip84', purpose: 84, label: 'Native SegWit · BIP84', prefix: 'bc1q…', addr: p2wpkh },
    { id: 'bip49', purpose: 49, label: 'Nested SegWit · BIP49', prefix: '3…',   addr: p2shP2wpkh },
    { id: 'bip44', purpose: 44, label: 'Legacy · BIP44',        prefix: '1…',   addr: p2pkh },
    { id: 'bip86', purpose: 86, label: 'Taproot · BIP86',       prefix: 'bc1p…', addr: p2tr }
  ];
  function schemeById(id) { for (var i = 0; i < SCHEMES.length; i++) if (SCHEMES[i].id === id) return SCHEMES[i]; return SCHEMES[0]; }

  // derive(schemeId, seedBytes, change, index) -> {scheme,label,path,address,pubkey,wif,privhex}
  function derive(id, seedBytes, change, index) {
    change = change || 0; index = index || 0; var sc = schemeById(id);
    var k = deriveKey(seedBytes, sc.purpose, change, index), pub = pubkey(k);
    return {
      scheme: sc.id, label: sc.label,
      path: "m/" + sc.purpose + "'/0'/0'/" + change + '/' + index,
      address: sc.addr(pub), pubkey: hex(pub), wif: toWIF(k), privhex: hex(to32(k))
    };
  }
  function fromSeed(seedBytes, change, index) { return derive('bip84', seedBytes, change, index); } // back-compat

  var api = {
    derive: derive, fromSeed: fromSeed,
    schemes: function () { return SCHEMES.map(function (s) { return { id: s.id, label: s.label, prefix: s.prefix }; }); },
    // exposed for tests
    _hash160: hash160, _sha512: sha512, _sha256: sha256, _ripemd160: ripemd160, _hmacSha512: hmacSha512, _pubkey: pubkey, _toWIF: toWIF, _segwitAddr: segwitAddr, _p2tr: p2tr
  };
  if (typeof window !== 'undefined') { window.BTC = api; window.BIP84 = api; }
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})();
