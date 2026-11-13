# Writing site copy: find the brand's voice before you write

**Read this before writing any user-facing text on a DMS site.** That covers page copy, section and dialog
titles, buttons, placeholders, empty states and errors, whether in a seed script, a component or a lexical
section.

Voice lives in plain markdown **brand folders** that no code imports, so it costs nothing on the wire. The
convention is in [`src/dms/voice/README.md`](../voice/README.md). The worked example is
[`src/themes/lab_brand/`](../../themes/lab_brand/README.md).

## 1. Find the brand folder

| Site / themes | Brand folder |
|---|---|
| WCDB (`wcdb`) | `src/themes/wcdb/voice/` |
| Weather & Climate Analytics, UAlbany COE (`weather_analytics`) | `src/themes/weather_analytics/voice/` |
| AVAIL lab sites: FUSION, Community Indicators, the AVAIL site, Tributary, Tessera, MitigateNY guides | `src/themes/lab_brand/` |
| anything else | `src/themes/<theme>/voice/` if it exists, otherwise the library default only |

When you start a voice folder for another brand, add a row here.

## 2. Pick the register

The brand README maps **patterns → registers**. Admin and editor patterns are usually **tool**, and public
patterns **editorial**.
- **tool**: use the brand's `## Register: tool` section if it has one. Otherwise use the library default,
  [`src/dms/voice/writing_style.md`](../voice/writing_style.md).
- **editorial** and others: use the brand's `writing_style.md`. If there is none, ask; don't invent a
  brand voice.

## 3. Write, then run the checks

Each register lists checks to run on a draft (the squint test, the seam test, the skeptic test…). Run them.
Where `preferences.md` lists an open disagreement, show both options. Don't settle it yourself.

## 4. Record what people say

When someone reacts to text ("too editorial", "too salesy"):
1. Add it to the brand's `preferences.md` **the same day**: date, what it was about, their own words.
2. If it changes a rule, edit `writing_style.md` in the same pass. Add a before→after row, and a line to
   its change log.
3. New rules start **Proposed**. Only the owner marks them **Agreed**.

## Gotchas

- **Never `import` a voice file**, not even with `?raw`. It would ship to every visitor for nothing.
- **Don't put voice in the theme object.** The theme ships to the client and does no work there.
- **Visual rules can constrain copy.** WCDB's red is reserved for live broadcast, so error text is ink, not
  red. Read the design-system README's brand intent alongside the voice folder.
