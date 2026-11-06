"""Builds the DM Sans cedi sign (U+20B5) the site needs, because DM Sans has none.

DM Sans (SIL OFL 1.1, no Reserved Font Name) ships ₨ ₹ ₺ ₽ but not the Ghana cedi ₵, so without this
the sign falls back to a system font in every price. This script keeps DM Sans's variable outlines for
the capital C and the vertical bar, and adds one composite glyph, ₵ = C + bar centred on it, mapped to
U+20B5. The result is a variable font with DM Sans's own weight and optical-size axes, so the sign
matches the text around it at every weight. styles.css declares it as 'DM Sans' with the same
font-weight range as the other two faces (browsers only combine faces with identical descriptors) and
unicode-range U+20B5; build.mjs fingerprints it into dist/assets.

Dev-time only (the build does not run Python). Needs fontTools and brotli:
    python apps/landing/scripts/make-cedi-font.py
"""
from pathlib import Path

from fontTools.subset import Options, Subsetter
from fontTools.ttLib import TTFont
from fontTools.ttLib.tables._g_l_y_f import Glyph, GlyphComponent
from fontTools.ttLib.tables.TupleVariation import TupleVariation

ROOT = Path(__file__).resolve().parents[3]
SRC = ROOT / 'packages/ui/assets/fonts/dm-sans-latin-wght-v17.woff2'
OUT = ROOT / 'apps/landing/src/assets/fonts/dm-sans-cedi-wght.woff2'


def main() -> None:
    font = TTFont(SRC)
    sub = Subsetter(Options(layout_features=[], name_IDs=['*'], notdef_outline=True, glyph_names=True))
    sub.populate(unicodes=[ord('C'), ord('|')])
    sub.subset(font)
    for tag in ('GSUB', 'GPOS', 'GDEF', 'HVAR'):
        if tag in font:
            del font[tag]  # without HVAR, advances vary through gvar's phantom points

    glyf, hmtx, gvar = font['glyf'], font['hmtx'], font['gvar']
    cmap = font.getBestCmap()
    c_name, bar_name = cmap[ord('C')], cmap[ord('|')]
    c, bar = glyf[c_name], glyf[bar_name]
    c.recalcBounds(glyf)
    bar.recalcBounds(glyf)
    thin = 0.7  # the cedi stroke is lighter than a full stem
    dx = round((c.xMin + c.xMax) / 2 - thin * (bar.xMin + bar.xMax) / 2)

    comp_c = GlyphComponent()
    comp_c.glyphName, comp_c.x, comp_c.y = c_name, 0, 0
    comp_c.flags = 0x4 | 0x200  # ROUND_XY_TO_GRID | USE_MY_METRICS (advance of the C)
    comp_bar = GlyphComponent()
    comp_bar.glyphName, comp_bar.x, comp_bar.y = bar_name, dx, 0
    comp_bar.flags = 0x4 | 0x40  # ROUND_XY_TO_GRID | WE_HAVE_AN_X_AND_Y_SCALE
    comp_bar.transform = [[thin, 0], [0, 1]]
    cedi = Glyph()
    cedi.numberOfContours = -1
    cedi.components = [comp_c, comp_bar]

    order = font.getGlyphOrder() + ['uni20B5']
    font.setGlyphOrder(order)
    glyf.glyphOrder = order
    glyf['uni20B5'] = cedi
    cedi.recalcBounds(glyf)
    hmtx['uni20B5'] = hmtx[c_name]

    # Variations of the composite: keep the bar centred as the C widens (half the difference in advance
    # change of the two glyphs), and carry the C's advance (phantom points) so spacing matches.
    def advance_delta(var):
        pts = var.coordinates
        left, right = pts[-4], pts[-3]
        return (right[0] if right else 0) - (left[0] if left else 0)

    bar_by_axes = {tuple(sorted(v.axes.items())): v for v in gvar.variations.get(bar_name, [])}
    variations = []
    for v in gvar.variations.get(c_name, []):
        key = tuple(sorted(v.axes.items()))
        b = bar_by_axes.get(key)
        shift = round((advance_delta(v) - thin * (advance_delta(b) if b else 0)) / 2)
        phantom = [p if p else (0, 0) for p in v.coordinates[-4:]]
        variations.append(TupleVariation(dict(v.axes), [(0, 0), (shift, 0)] + phantom))
    gvar.variations['uni20B5'] = variations

    for table in font['cmap'].tables:
        table.cmap = {0x20B5: 'uni20B5'}
    font['maxp'].recalc(font)
    os2 = font['OS/2']
    os2.usFirstCharIndex = os2.usLastCharIndex = 0x20B5
    for rec in font['name'].names:
        if rec.nameID in (1, 4, 16):
            rec.string = 'DM Sans'
        elif rec.nameID == 6:
            rec.string = 'DMSans-Cedi'
    font.flavor = 'woff2'
    OUT.parent.mkdir(parents=True, exist_ok=True)
    font.save(OUT)
    print(OUT.relative_to(ROOT), OUT.stat().st_size, 'bytes', 'bar offset', dx)


if __name__ == '__main__':
    main()
