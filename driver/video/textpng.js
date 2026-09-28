#!/usr/bin/osascript -l JavaScript
// Render a title/level card to a PNG.
//
// The ffmpeg on this machine has no drawtext and no subtitles filter: it ships drawbox and
// overlay but no text renderer, and it is built without --enable-libfreetype and
// --enable-libass. There is no ImageMagick and python3 has no PIL. AppKit draws the text,
// so this needs nothing installed.
//
//   ./textpng.js <out.png> <width> <height> <bgHex> <ruleHex> <line>...
//
// bgHex and ruleHex are accepted for interface symmetry and currently unused.
//
//   <line> is  text|size|align|colourHex     e.g.  CAT GORIC|88|center|e6edf3
//   align is  center or left
//
// Output is a full-frame transparent PNG; cards.sh overlays it on a color source.
//
// Three JXA details this is written around, each found the hard way on this build:
// osascript does not forward argv to NSProcessInfo, so the entry point is the run()
// handler it calls with the argument array; the mangled selector names for arguments past
// the second are missing for these AppKit selectors, so multi-argument calls go through the
// full "part:part:" selector string; and `init` is not exposed on an alloc'd
// NSMutableDictionary, so it is created with initWithCapacity:.

ObjC.import('Cocoa');
ObjC.import('AppKit');

function fail(msg) {
  throw new Error(msg);
}

function hexColor(hex, alpha) {
  const c = $.NSColor['colorWithSRGBRed:green:blue:alpha:'](
    parseInt(hex.slice(0, 2), 16) / 255,
    parseInt(hex.slice(2, 4), 16) / 255,
    parseInt(hex.slice(4, 6), 16) / 255,
    alpha
  );
  if (!c) fail('bad colour ' + hex);
  return c;
}

function run(argv) {
  const a = Array.prototype.slice.call(argv);
  if (a.length < 5) {
    fail('usage: textpng.js <out.png> <w> <h> <bgHex> <ruleHex> <line>...');
  }

  const out = a[0];
  const W = parseInt(a[1], 10);
  const H = parseInt(a[2], 10);
  const lines = a.slice(5).map((spec) => {
    const p = spec.split('|');
    if (p.length < 4) fail('bad line spec: ' + spec);
    return {
      text: p[0],
      size: parseInt(p[1], 10),
      align: p[2],
      color: hexColor(p[3], 1),
    };
  });

  const rep = $.NSBitmapImageRep['alloc']['initWithBitmapDataPlanes:pixelsWide:pixelsHigh:bitsPerSample:samplesPerPixel:hasAlpha:isPlanar:colorSpaceName:bytesPerRow:bitsPerPixel:'](
    null, W, H, 8, 4, true, false, $.NSDeviceRGBColorSpace, 0, 0
  );
  if (!rep) fail('could not allocate bitmap');

  const ctx = $.NSGraphicsContext['graphicsContextWithBitmapImageRep:'](rep);
  if (!ctx) fail('could not create graphics context');
  $.NSGraphicsContext['setCurrentContext:'](ctx);

  // -[NSColor set] is not reachable from JXA on this build, so no background is drawn
  // here. The PNG is transparent and cards.sh composites it over an ffmpeg color source.

  // Cocoa's origin is bottom-left. Lines stack upward from the anchor, in the order given,
  // so the list reads top-down on screen.
  const GAP = 26;
  // anchorY is the baseline the text block stacks up from. 0.21 puts the block's centre on
  // the frame's centre for a three-line card, measured off the rendered alpha bbox.
  const ruleY = Math.round(H * 0.21);

  const laid = lines.map((ln) => {
    const font = $.NSFont['fontWithName:size:']('Menlo-Bold', ln.size);
    if (!font) fail('font unavailable');
    const attrs = $.NSMutableDictionary.alloc.initWithCapacity(2);
    attrs['setObject:forKey:'](font, $.NSFontAttributeName);
    attrs['setObject:forKey:'](ln.color, $.NSForegroundColorAttributeName);
    const s = $.NSString.stringWithString(ln.text);
    return { s: s, attrs: attrs, h: Math.round(s['sizeWithAttributes:'](attrs).height) };
  });

  let y = ruleY + 34 + laid.reduce((acc, l) => acc + l.h + GAP, 0) - GAP;
  for (const ln of laid) {
    const w = ln.s['sizeWithAttributes:'](ln.attrs).width;
    const x = ln.align === 'left' ? Math.round(W * 0.08) : Math.round((W - w) / 2);
    ln.s['drawAtPoint:withAttributes:']($.NSMakePoint(x, y), ln.attrs);
    y -= ln.h + GAP;
  }

  const data = rep['representationUsingType:properties:'](4, $.NSDictionary.dictionary);
  if (!data) fail('PNG encode failed');
  if (!data['writeToFile:atomically:'](out, true)) fail('could not write ' + out);
}
