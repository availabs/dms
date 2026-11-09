# DMS writing style (library default)

**Status:** Proposed, 2026-11-08. Every rule is Proposed until a site owner agrees it; then mark it
**Agreed (date, who)**. A brand's own `writing_style.md` overrides a register here by having a section of the
same name. See [`README.md`](./README.md).

## Register: tool

**Applies to:** admin pages, editors, dialogs, forms, buttons, empty states and errors.

The reader is in the middle of a job. Text should help them finish it and then get out of the way. It
should feel like a tool, not a publication.

1. **Titles are verb + noun, in sentence case, with no full stop.** Do: *Add a show*, *Edit airing*,
   *New version*. Don't: *Put a show in this hour.*
2. **No eyebrows or kickers on tool surfaces.** A dialog has a title and fields. A second line of framing
   above the title is editorial chrome.
3. **Buttons are one verb, or a verb and a noun.** *Add*, *Save*, *Remove*, *Publish v22*. The confirm step
   of a destructive action repeats the verb: *Remove* → *Confirm remove*.
4. **Status is one line of facts, not a sentence.** *SUN 06:00–10:00 (+1 day)*, *12 airings placed · 140
   hours open*. Leave out "this will…" and "note that…".
5. **Errors say what is wrong in about eight words or fewer, and name the conflict.** *Overlaps Jazz Encore
   (10:00–14:00).* *End must be after start.* Don't apologise, and don't explain the system.
6. **Don't explain the data model in the UI.** "The show's name is shared by every airing of it" belongs in
   docs, or in a field's help text when it is genuinely surprising. It doesn't belong in every dialog.
7. **Placeholders name the action.** *Search shows*, not *Search shows by name, department or id*.
8. **Use the user's nouns, not the schema's.** Prefer *show*, *airing*, *version* to *row*, *record*,
   *view_id*. An id appears only to tell two things apart (*Jazz · 585*).
9. **Loading and empty states are short.** *Loading…*, *No airings yet*. Never write *Oops*.
10. **Don't repeat what the screen already shows.** Leave out labels that restate a button's destination,
    and units or badges the context already makes clear. (Adam's density preference, `lab_brand/preferences.md`,
    2026-11-03.)
11. **No exclamation marks, no marketing adjectives, no emoji.**

### Before → after (WCDB admin schedule, 2026-11-08)

| Before | After | Rule |
|---|---|---|
| eyebrow *ADD TO THE SCHEDULE* + title *Put a show in this hour.* | *Add a show* | 1, 2 |
| *Ends at the hour it starts — pick a later end.* | *End must be after start.* | 5 |
| *…runs past midnight into the next day; the grid draws it to midnight.* | *(+1 day)* | 4 |
| *Remove from schedule* / *Yes, remove it* | *Remove* / *Confirm remove* | 3 |
| *Add to the schedule* (button) | *Add* | 3 |
| *Search shows by name, department or id* | *Search shows* | 7 |

### Checks to run on a draft

- **The squint test.** Cover the body text and read only the title and buttons. Can you tell what the dialog
  does and how to leave it?
- **The word count.** If a title runs past four words, or an error past eight, cut it.
- **The schema test.** Does any visible word only make sense if you know the database? Replace it.

## Change log

- 2026-11-08: created, with the tool register, from Alex's review of the WCDB admin schedule dialog
  (recorded in `src/themes/wcdb/voice/preferences.md`).
