/* End-to-end encryption for saved data. Loaded before cloud.js and app.js.
   Each account has a random 256-bit key that is created on the person's device and never sent anywhere. Data is
   compressed and encrypted (AES-256-GCM) on the device before it is saved, so the database only ever holds
   unreadable ciphertext — the app's developer, Google and Cloudflare can't read anyone's health data.
   The key is kept on each signed-in device and shown once as a recovery key, which the person types in to open
   their data on a new device. Without it the data can't be recovered by anyone. */
'use strict';
const vault = (() => {
  const B32 = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';       // Crockford base32: no I, L, O, U (easy to read and type)
  const te = new TextEncoder(), td = new TextDecoder();
  const b64 = bytes => { let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000)); return btoa(s); };
  const unb64 = s => Uint8Array.from(atob(s), c => c.charCodeAt(0));
  const storeKey = uid => 'healthspan-key:' + uid;

  /** 32 bytes → "ABCD-EFGH-…" (52 characters in groups of 4). */
  function toCode(bytes) {
    let bits = 0, val = 0, out = '';
    for (const b of bytes) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } val &= (1 << bits) - 1; }
    if (bits) out += B32[(val << (5 - bits)) & 31];
    return out.match(/.{1,4}/g).join('-');
  }
  /** A typed recovery key → 32 bytes, or null if it isn't a valid key. Ignores case, spaces and dashes; reads O as 0 and I/L as 1. */
  function fromCode(code) {
    const s = String(code || '').toUpperCase().replace(/[\s-]/g, '').replace(/O/g, '0').replace(/[IL]/g, '1');
    if (s.length !== 52 || [...s].some(c => !B32.includes(c))) return null;
    const out = new Uint8Array(32); let bits = 0, val = 0, i = 0;
    for (const c of s) { val = (val << 5) | B32.indexOf(c); bits += 5; if (bits >= 8) { if (i < 32) out[i++] = (val >>> (bits - 8)) & 255; bits -= 8; } val &= (1 << bits) - 1; }
    return i === 32 ? out : null;
  }
  const aesKey = raw => crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
  async function pipe(bytes, stream) { return new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(stream)).arrayBuffer()); }
  const canZip = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function';

  return {
    toCode, fromCode,
    newKey: () => crypto.getRandomValues(new Uint8Array(32)),
    /** The key kept on this device for an account (or null). */
    load(uid) { try { const s = localStorage.getItem(storeKey(uid)); return s ? unb64(s) : null; } catch (e) { return null; } },
    keep(uid, raw) { localStorage.setItem(storeKey(uid), b64(raw)); },
    forget(uid) { try { localStorage.removeItem(storeKey(uid)); } catch (e) { } },
    /** text → { data, iv } (base64). The first byte inside says whether the text was compressed. */
    async encrypt(raw, text) {
      const body = te.encode(text), zipped = canZip ? await pipe(body, new CompressionStream('gzip')) : body;
      const plain = new Uint8Array(zipped.length + 1); plain[0] = canZip ? 1 : 0; plain.set(zipped, 1);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const ct = new Uint8Array(await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(raw), plain));
      return { data: b64(ct), iv: b64(iv) };
    },
    /** { data, iv } → text. Throws if the key is wrong or the data was changed. */
    async decrypt(raw, { data, iv }) {
      const plain = new Uint8Array(await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(iv) }, await aesKey(raw), unb64(data)));
      const body = plain.subarray(1);
      return td.decode(plain[0] === 1 ? await pipe(body, new DecompressionStream('gzip')) : body);
    },
  };
})();
if (typeof window !== 'undefined') window.vault = vault;
