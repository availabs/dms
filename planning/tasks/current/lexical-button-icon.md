# Lexical button: author-selectable icon

## Status: DONE 2026-08-27 (ButtonNode field + dialog input + style icon key, BC)

## Change
The lexical Button node gained an optional **`icon`** field (a registered Icon
name, e.g. `Download`) threaded through the full node lifecycle: payload /
serialized shape / constructor / clone / importJSON / exportJSON / exportDOM
(`data-lexical-button-icon`) / DOM conversion / decorate. Authors set it in the
Insert Button dialog ("Icon" text input). Absent → byte-identical render (BC).

Rendering: the icon draws BEFORE the label inside the themed Button (and the
no-UI span fallback). Its classes come from the button STYLE's optional
**`icon`** key (`theme.button.styles[].icon`, resolved via getComponentTheme so
non-default styles inherit styles[0]'s); themes without one get a plain
`inline-block size-3.5 shrink-0` default.

## Motivating use
mny theme's new **`pillWhite`** button style (the dashboard mockup's white
table-chrome pill: mny-200 hairline → mny-400 on hover, 13px/600 sentence-case,
14px icon) — the Actions Dashboard's "Download CSV" setParam button. Registered
in the mny design-system components page (Buttons → Pill White).
