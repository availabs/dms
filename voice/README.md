# Voice: how a DMS site's text should read

These files are for **agents and people writing user-facing text**: page copy, section titles, dialog
titles, buttons, empty states, errors. No code imports them, so none of it is bundled or sent to the
browser. Keep it that way: never `import` from a voice folder.

The convention generalizes [`src/themes/lab_brand/`](../../themes/lab_brand/README.md), which started it for
the AVAIL lab sites. That folder is the worked example.

## Where voice lives

Voice belongs to a **brand**, and a brand can span several themes. AVAIL's lab brand covers FUSION,
Community Indicators, the AVAIL site and Tessera. When one theme is the whole brand, as with WCDB, the
brand folder sits inside it.

| Layer | Path | Holds |
|---|---|---|
| Library default | `src/dms/voice/` (this folder) | the **tool** register every DMS admin gets |
| Brand | `src/themes/<theme>/voice/`, or a shared brand folder such as `src/themes/lab_brand/` | the brand's registers, preferences and references |

**Finding a site's voice:**
1. Find the theme the page's pattern uses.
2. If `src/themes/<theme>/voice/README.md` exists, read it. It names its registers and may point to a
   shared brand folder with `Brand: ../../lab_brand/`.
3. Otherwise check the brand table in [`skills/writing-site-copy.md`](../skills/writing-site-copy.md). It
   lists the shared brand folders and the themes each one covers.
4. Nothing found: use this folder's tool register for admin text, and ask before inventing an
   editorial voice.

## The files in a brand folder (the `lab_brand` set)

| File | Holds | Rule |
|---|---|---|
| `README.md` | what the brand covers, the **pattern → register** map, how to use the folder | keep it short |
| `writing_style.md` | the rules, grouped by **register**, each marked **Proposed** or **Agreed**; before→after tables; checks to run on a draft; a change log | edit a rule only alongside the preference entry that changed it |
| `preferences.md` | what each person has said, dated, in their own words, with what it was about (a path or URL) | add an entry **the day it is said**; record it, don't interpret it |
| `references.md` (optional) | examples to follow or avoid, each with who raised it and their opinion | a reference with no opinion attached is not useful |

## Registers

A **register** is a way of writing that fits one kind of surface. In `writing_style.md` each one is a
`## Register: <name>` section, listing the surfaces it applies to.

- **tool**: admin pages, editors, dialogs, forms, buttons, errors. The library default is
  [`writing_style.md`](./writing_style.md) here. A brand that says nothing about the tool register inherits it,
  and a brand that has its own `## Register: tool` section replaces it entirely. Rules are not merged.
- **editorial**: public pages, features, posts, profiles. There is no library default, because every brand
  differs. Each brand writes its own.
- Brands add others as they need them. `lab_brand` notes three for Eric: reports, essays and prompts.

The README's pattern map says which register a page gets:

```
station_admin → tool
wcdb_main     → editorial
```

Skill: [`src/dms/skills/writing-site-copy.md`](../skills/writing-site-copy.md).
