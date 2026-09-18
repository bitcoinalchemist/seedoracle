// seedoracle-hexagrams.js : the Seed Oracle's hexagram + element
// renderers. Distinct from iching-hexagrams.js (that file owns the
// I Ching page's reference grid + popup + trigrams). This one is just
// the SVG figures + the four-element mapping used by the seed oracle's
// journey chapters.
//
// Two SVG figures that both mirror iching.html's geometry (thin
// compact bars: lineH 5, gap 4, w 36, segW 14, rx 1.5 : all × size):
//   • hexagramSVG(val, size)  : draws a full 6-bit value
//   • slotHexSVG(spec, size)  : draws a partial figure from a spec
//                               array (BOTTOM-UP: { bit, cls }),
//                               used by the chapter I line-by-line
//                               build and the seal diagram
//
// The four elements are mapped from a hexagram's BOTTOM TWO lines
// (bottom = MSB in this project's convention).
//
// Pure math + SVG string builders, zero DOM state.
//
// Public API on window.SeedOracleHex:
//   VAL_TO_KW      : 64-entry binary → King Wen bijection (mirrors iching.html)
//   ELEMENTS       : { water, fire, earth, air } → { name, cls }
//   ELEMENT_ORDER  : fixed display order
//   hexagramSVG(val, size)
//   slotHexSVG(spec, size)
//   elementOf(val) : 'water' | 'fire' | 'earth' | 'air'

(function () {
  'use strict';

  // Binary value (bit5=line1/bottom … bit0=line6/top) → King Wen : same
  // constant used by iching.html; captured in the golden test so any
  // accidental divergence between the two pages trips.
  var VAL_TO_KW = [
    2,23,8,20,16,35,45,12,15,52,39,53,62,56,31,33,
    7,4,29,59,40,64,47,6,46,18,48,57,32,50,28,44,
    24,27,3,42,51,21,17,25,36,22,63,37,55,30,49,13,
    19,41,60,61,54,38,58,10,11,26,5,9,34,14,43,1
  ];

  // Hexagram SVG from a 6-bit value : same renderer/bit-order as
  // iching.html so both pages draw the same figures.
  function hexagramSVG(val, size) {
    size = size || 1;
    var lineH = 5*size, gap = 4*size, w = 36*size, segW = 14*size, rx = 1.5*size;
    var svgH = 6*lineH + 5*gap, paths = [];
    for (var i = 0; i < 6; i++) {            // i=0 bottom (line1) … i=5 top (line6)
      var bit = (val >> (5 - i)) & 1;
      var y = svgH - lineH - i*(lineH + gap);
      if (bit === 1) {
        paths.push('<rect data-line="'+i+'" x="0" y="'+y+'" width="'+w+'" height="'+lineH+'" rx="'+rx+'" fill="var(--yang)"/>');
      } else {
        paths.push('<rect data-line="'+i+'" x="0" y="'+y+'" width="'+segW+'" height="'+lineH+'" rx="'+rx+'" fill="var(--yang)"/>');
        paths.push('<rect data-line="'+i+'" x="'+(w-segW)+'" y="'+y+'" width="'+segW+'" height="'+lineH+'" rx="'+rx+'" fill="var(--yang)"/>');
      }
    }
    return '<svg width="'+w+'" height="'+svgH+'" viewBox="0 0 '+w+' '+svgH+'" aria-hidden="true">'+paths.join('')+'</svg>';
  }

  // A hexagram drawn from a SPEC rather than a value : for figures that
  // are partly cast (chapter I line-by-line) or partly unknowable (the
  // seal diagram, the locked 22nd slot). spec = array of up to 6 entries,
  // BOTTOM-UP: { bit: 0|1|null, cls: ''|'free'|'cs' }. null bits draw as
  // dashed slots; classes colour via CSS (.so-l-free/.so-l-cs/.so-l-slot*).
  function slotHexSVG(spec, size) {
    size = size || 1;
    var lineH = 5*size, gap = 4*size, w = 36*size, segW = 14*size, rx = 1.5*size;
    var svgH = 6*lineH + 5*gap, paths = [];
    for (var i = 0; i < 6; i++) {
      var s = spec[i] || { bit: null, cls: '' };
      var y = svgH - lineH - i*(lineH + gap);
      var cls = s.cls ? (s.bit === null ? 'so-l-slot-'+s.cls : 'so-l-'+s.cls) : (s.bit === null ? 'so-l-slot' : '');
      var attrs = 'data-line="'+i+'"'+(cls ? ' class="'+cls+'"' : '');
      if (s.bit === null) {
        paths.push('<rect '+attrs+' x="0.75" y="'+(y+0.75)+'" width="'+(w-1.5)+'" height="'+(lineH-1.5)+'" rx="'+rx+'" fill="none" stroke-width="1.2"/>');
      } else if (s.bit === 1) {
        paths.push('<rect '+attrs+' x="0" y="'+y+'" width="'+w+'" height="'+lineH+'" rx="'+rx+'" fill="var(--yang)"/>');
      } else {
        paths.push('<rect '+attrs+' x="0" y="'+y+'" width="'+segW+'" height="'+lineH+'" rx="'+rx+'" fill="var(--yang)"/>');
        paths.push('<rect '+attrs+' x="'+(w-segW)+'" y="'+y+'" width="'+segW+'" height="'+lineH+'" rx="'+rx+'" fill="var(--yang)"/>');
      }
    }
    return '<svg width="'+w+'" height="'+svgH+'" viewBox="0 0 '+w+' '+svgH+'" aria-hidden="true">'+paths.join('')+'</svg>';
  }

  // The bottom two lines of the final hexagram pick one of four elements.
  // Read bottom-first: yin-yin → Water, yin-yang → Fire,
  // yang-yin → Earth, yang-yang → Air.
  var ELEMENTS = {
    water: { name:'Water', cls:'element-water' },
    fire:  { name:'Fire',  cls:'element-fire'  },
    earth: { name:'Earth', cls:'element-earth' },
    air:   { name:'Air',   cls:'element-air'   }
  };
  var ELEMENT_ORDER = ['water','fire','earth','air'];

  function elementOf(val) {            // from the bottom two lines (bottom = MSB)
    var bottom = (val >> 5) & 1, second = (val >> 4) & 1;
    return bottom ? (second ? 'air' : 'earth') : (second ? 'fire' : 'water');
  }

  window.SeedOracleHex = {
    VAL_TO_KW: VAL_TO_KW,
    ELEMENTS: ELEMENTS,
    ELEMENT_ORDER: ELEMENT_ORDER,
    hexagramSVG: hexagramSVG,
    slotHexSVG: slotHexSVG,
    elementOf: elementOf,
  };
})();
