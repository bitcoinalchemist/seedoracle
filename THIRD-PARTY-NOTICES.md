# Third-party notices

This project contains or refers to the following third-party material. These
notices do not change the license of the rest of the project.

## HYG star catalogue

`js/stardata.js` contains an adapted bright-star subset of the HYG Database by
David Nash / Astronexus, licensed under CC BY-SA 4.0. The adaptation excludes
Sol, limits the catalogue by magnitude and declination, and rounds fields for
the decorative fixed-sky background.

Sources:

- <https://github.com/astronexus/HYG-Database>
- <https://creativecommons.org/licenses/by-sa/4.0/>

## BIP39 and BIP84

The Seed Oracle refers to the Bitcoin Improvement Proposal standards BIP39
and BIP84. BIP39 states that the proposal falls under the MIT License. The
site's implementation and educational presentation remain separate from the
Bitcoin project and are not a wallet.

Sources:

- <https://github.com/bitcoin/bips/blob/master/bip-0039.mediawiki>
- <https://github.com/bitcoin/bips/blob/master/bip-0084.mediawiki>

The Seed Oracle also links to Ian Coleman's BIP39 project, whose MIT notice is
shown in the Seed Oracle interface.

Source: <https://github.com/iancoleman/bip39>

## Zhou Yi judgment translations

`js/ichingjudgments.js` contains direct English translations of the original
Zhou Yi judgment text supplied for this project. They are presented separately
from the project's original teaching and interface copy.

## Hosted fonts

The page requests Inter and Lora from Google Fonts rather than bundling font
files in this repository. Both families are distributed under the SIL Open
Font License 1.1.

- Inter: <https://github.com/google/fonts/tree/main/ofl/inter>
- Lora: <https://github.com/google/fonts/tree/main/ofl/lora>

## Fu Xi / King Wen reference

The interactive reference chart is adapted from the user-supplied I Ching page
at mysticscards.space. It reuses the same 64-entry binary-to-King Wen mapping
already present in Seed Oracle, with sequence rearrangement adapted for this
project. The original site’s other oracle, card, and trigram features are not
included.
