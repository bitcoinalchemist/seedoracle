#!/usr/bin/env node
/*
 * Seed Oracle cryptographic vectors. Dependency-free: loads the shipped
 * browser scripts in a VM and checks them against published BIP39/BIP84
 * vectors plus the project's 126 + 2 + 4 element-seal construction.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { webcrypto } = require('crypto');
const { TextEncoder } = require('util');

const root = path.resolve(__dirname, '..');
const context = {
  crypto: webcrypto,
  TextEncoder,
  Uint8Array,
  ArrayBuffer,
  Promise,
  setTimeout,
  clearTimeout
};
context.window = context;
vm.createContext(context);

function load(rel) {
  vm.runInContext(fs.readFileSync(path.join(root, rel), 'utf8'), context, { filename: rel });
}

function equal(actual, expected, label) {
  if (actual !== expected) throw new Error(`${label}: ${actual} != ${expected}`);
}

function ok(value, label) {
  if (!value) throw new Error(label);
}

load('js/bip39-words.js');
load('js/seedoracle-bitcoin.js');
load('js/seedoracle-hexagrams.js');
load('js/bip84.js');

const B39 = context.SeedOracleBitcoin;
const HEX = context.SeedOracleHex;
const BTC = context.BTC;
const ZERO_MNEMONIC = 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
const TREZOR_SEED = 'c55257c360c07c72029aebc1b53c05ed0362ada38ead3e3e9efa3708e53495531f09a6987599d18264c1e1c92f2cf141630c7a3c4ab7c81b2f001698e7463b04';

const checks = [];
function check(name, fn) { checks.push({ name, fn }); }

check('BIP39 zero-entropy vector produces and validates the official mnemonic', () => {
  const mnemonic = B39.entropyToMnemonic(new Uint8Array(16));
  equal(mnemonic, ZERO_MNEMONIC, 'mnemonic');
  ok(B39.checkPhrase(mnemonic.split(' ')).ok, 'official mnemonic should validate');
  const changed = mnemonic.split(' '); changed[11] = 'abandon';
  ok(!B39.checkPhrase(changed).ok, 'changed checksum should be rejected');
});

check('BIP39 PBKDF2 vector derives the published TREZOR seed', async () => {
  const out = { textContent: '-' };
  await B39.deriveSeed(ZERO_MNEMONIC, out, 'TREZOR');
  equal(out.textContent, TREZOR_SEED, 'BIP39 seed');
});

check('BIP84 official first receiving-address vector matches', async () => {
  const out = { textContent: '-' };
  await B39.deriveSeed(ZERO_MNEMONIC, out);
  const seed = Uint8Array.from(out.textContent.match(/../g).map((byte) => parseInt(byte, 16)));
  const first = BTC.derive('bip84', seed, 0, 0);
  equal(first.path, "m/84'/0'/0'/0/0", 'path');
  equal(first.address, 'bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu', 'address');
  equal(first.pubkey, '0330d54fd0dd420a6e5f8d3624f5f3482cae350f79d5f0753bf5beef9c2d91af3c', 'public key');
  equal(first.wif, 'KyZpNDKnfs94vbrwhJneDi77V6jF64PWPF8x5cdJb8ifgg2DUc9d', 'private key');
});

check('Seed Oracle 126-bit prefix yields exactly one valid seal per element', () => {
  const entropy = Uint8Array.from({ length: 16 }, (_, i) => i);
  const mnemonic = B39.entropyToMnemonic(entropy);
  const vals = B39.phraseToVals(mnemonic.split(' '));
  equal(vals.length, 22, 'hexagram count');
  equal(B39.valsToWords(vals).join(' '), mnemonic, 'hexagram round trip');

  const prefix = vals.slice(0, 21);
  const seals = [];
  for (let value = 0; value < 64; value += 1) {
    const words = B39.valsToWords(prefix.concat(value));
    if (B39.checkPhrase(words).ok) seals.push(value);
  }
  equal(seals.length, 4, 'valid seal count');
  equal(seals.map(HEX.elementOf).sort().join(','), 'air,earth,fire,water', 'seal elements');
  equal(
    seals.map((value) => {
      const element = HEX.elementOf(value);
      return `${element}:${HEX.ELEMENTS[element].name}`;
    }).sort().join(','),
    'air:Air,earth:Earth,fire:Fire,water:Water',
    'seal elements'
  );
});

(async () => {
  let failed = 0;
  for (const item of checks) {
    try {
      await item.fn();
      console.log(`ok - ${item.name}`);
    } catch (error) {
      failed += 1;
      console.error(`not ok - ${item.name}`);
      console.error(`  ${error.message}`);
    }
  }
  if (failed) {
    console.error(`\n${failed} failed, ${checks.length - failed} passed`);
    process.exit(1);
  }
  console.log(`\n${checks.length} passed`);
})().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
