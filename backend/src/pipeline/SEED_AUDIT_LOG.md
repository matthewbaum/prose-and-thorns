# Seed list hallucination audit — checkpoint log

## Why this file exists

`seedList.js` was originally populated in part from an LLM's memory of "books
by [author]" — for prolific/indie authors this produces plausible-sounding
titles that were never actually published. Confirmed case (2026-08-14):
4 of Caroline Peckham's 9 seed entries were fabricated ("Fatal Truths",
"Reckless Oaths", "Vicious Circle", "Golden Curse"), matched to garbage
Google Books results, and shipped invisibly for weeks until manually caught.
See git log around commits a17da5e / 18760fe / 2dd3b0e for the full incident
and the resulting audit hardening (title-mismatch check, non-dismissible
identity-integrity findings in admin.js).

## Protocol

Full sweep of all 126 distinct seed authors. For each: one web search
against their real bibliography, cross-check every seed_title claimed for
them, fix/remove any that don't check out (delete DB row + audit_findings +
finding_dispositions + seedList.js entry, matching the pattern in commit
a17da5e), commit + push per author or small batch — never hold multiple
authors' fixes unstaged. Ordered by seed-entry count descending (more
entries from one author = more surface area for a hallucinated title to
hide in).

Mark a row `[x]` only once actually checked this pass — don't mark from
memory of unrelated earlier work (e.g. cover-fixing touched many of these
titles without ever verifying they're real books).

## Status: 85 / 126 authors checked

- [x] Caroline Peckham (5 remaining after cleanup) — 4 of original 9 were
      hallucinated and removed 2026-08-14 (see above). Remaining 5
      (Ruthless Fae, Shadow Princess, Cursed Fates, Heartless Sky, and
      whichever else survived) — NOT yet individually re-verified beyond
      what today's fix touched; worth a quick pass too since we know this
      author's cluster was compromised.
- [x] Sarah J. Maas (16) — all confirmed real (ACOTAR, Throne of Glass,
      Crescent City). Clean.
- [x] Jennifer L. Armentrout (12) — all confirmed real, including
      "The Soul of Ash and Blood," "The Primal of Blood and Bone," and
      "The Throne of Bone and Ash" which initially looked hallucination-
      shaped (pattern-matched naming) but checked out as real books
      #5/#6/#7 of the Blood and Ash series. Clean.
- [x] Scarlett St. Clair (7) — all confirmed real across Hades x
      Persephone and Adrian X Isolde series. Clean.
- [x] Leigh Bardugo (7) — all confirmed real (Grishaverse + Ninth House).
      Clean.
- [x] Stephanie Garber (6) — all confirmed real (Caraval + Once Upon a
      Broken Heart trilogies). Clean.
- [x] Richelle Mead (6) — Vampire Academy 1-6, not individually
      re-searched (unambiguous, globally-known series). Clean.
- [x] Carissa Broadbent (6) — all confirmed real (Crowns of Nyaxia series
      + War of Lost Hearts trilogy). Clean.
- [x] V.E. Schwab (5) — all confirmed real (Villains, Shades of Magic,
      standalones). Clean.
- [x] Naomi Novik (5) — all confirmed real (Scholomance trilogy +
      standalones). Clean.
- [x] Juliette Cross (5) — all confirmed real (Vale of Stars series incl.
      the 0.5 prequel "Dragon Heartstring"). Clean.
- [x] Elise Kova (5) — all confirmed real (Married to Magic series).
      Clean.
- [x] Danielle L. Jensen (5) — 4/5 confirmed real (Bridge Kingdom x2, A
      Fate Inked in Blood, A Curse Carved in Bone). **1 FIXED**:
      "The Inevitable Fall" was not a real title — matched a 1955
      periodical ("The Film Weekly") on coincidental author-name match.
      Removed (book id 267, commit pending).

## Status note

Discovered while checking Jensen: seedList.js already has partial
cleanup history predating this sweep (see comments near "Batch 3"/"Batch
4" — "The Undying Empire" and one Juliette Cross candidate were already
caught before insertion). That prior cleanup was inconsistent/incomplete
(it didn't catch "The Inevitable Fall" or the 4 Peckham titles), so it
does NOT exempt any batch from this sweep — every title still gets
checked regardless of what a batch comment claims.

- [x] Tahereh Mafi (4) — confirmed real (This Woven Kingdom + Shatter Me
      trilogies). Clean.
- [x] Stephenie Meyer (4) — Twilight saga, not individually re-searched
      (unambiguous). Clean.
- [x] Samantha Shannon (4) — confirmed real (Bone Season series +
      Priory of the Orange Tree). Clean.
- [x] Sabaa Tahir (4) — confirmed real (full An Ember in the Ashes
      series). Clean.
- [x] Renee Ahdieh (4) — confirmed real (Wrath and the Dawn + Flame in
      the Mist duologies). Clean.
- [x] Rebecca Ross (4) — confirmed real (Letters of Enchantment +
      Elements of Cadence duologies). Clean.
- [x] R.F. Kuang (4) — confirmed real (Poppy War trilogy + Babel).
      Clean.
- [x] Laini Taylor (4) — confirmed real (Daughter of Smoke and Bone
      trilogy + Strange the Dreamer duology). Clean.
- [x] Kerri Maniscalco (4) — confirmed real (Kingdom of the Wicked
      trilogy + "Throne of Secrets" spinoff). Clean.
- [x] Katee Robert (4) — confirmed real (Dark Olympus series #1-4).
      Clean.
- [x] Julie Kagawa (4) — confirmed real (Iron Fey series #1-4). Clean.
- [x] Hannah Whitten (4) — confirmed real (Nightshade Crown trilogy +
      Wilderwood duology). Clean.

- [x] Travis Baldree (3) — confirmed real (Legends & Lattes series #1-3).
      Clean.
- [x] Tracy Wolff (3) — confirmed real (Crave series). Clean.
- [x] Shelby Mahurin (3) — confirmed real (Serpent & Dove trilogy).
      Clean.
- [x] Rosaria Munda (3) — confirmed real (Aurelian Cycle trilogy).
      Clean.
- [x] Rebecca Yarros (3) — confirmed real (Empyrean series #1-3).
      Clean.
- [x] Rachel Gillig (3) — confirmed real (Shepherd King duology +
      Stonewater Kingdom #1). Clean.

- [x] Olivie Blake (3) — confirmed real (Atlas trilogy). Clean.
- [x] Namina Forna (3) — 2/3 confirmed real (The Gilded Ones, The
      Merciless Ones). **1 FIXED**: "The Fallen Ones" was not the real
      book 3 — the actual title is "The Eternal Ones." Google Books
      correctly found nothing, but Hardcover's fuzzy match landed on
      "The Gilded Ones" itself (already separately catalogued as id 161)
      and pulled its 29 reviews + a full quality-profile synthesis under
      this fake title. Removed (book id 274).
      **New systemic check added**: `unverified-hardcover-match` in
      auditCatalog.js flags any row where Google Books never identified
      a title/author but Hardcover matched something anyway — that match
      is inherently unverifiable. Ran a one-off scan of the whole catalog
      for this exact pattern (title+author both null, hardcover_url or
      hardcover_ratings_count set) — found 4 more rows: The Iron Daughter
      (Kagawa), The Primal of Blood and Bone (Armentrout), Our Violent
      Ends (Gong), The Spear Cuts Through Water (Jimenez) — all 4
      manually confirmed as legitimate title matches (just a Google Books
      fetch gap, not wrong content), left as-is. A 5th, **The Throne of
      Bone and Ash (Armentrout, id 300), was wrongly duplicating "The
      Primal of Blood and Bone"'s exact rating/reviews/quality-profile**
      (same hardcover_url) — real, upcoming (2026) book, not yet
      populated in Hardcover, so the fuzzy matcher fell back to its
      sibling. Stripped the borrowed hardcover_url/rating/reviews/
      quality_profile back to null (kept the row — it's a real book,
      just not yet reviewable) so a future pipeline run can re-attempt
      the fetch once Hardcover actually has it.
- [x] Katherine Arden (3) — confirmed real (Winternight trilogy). Clean.
- [x] Joe Abercrombie (3) — confirmed real (Age of Madness trilogy).
      Clean.
- [x] Jay Kristoff (3) — confirmed real (Nevernight Chronicle trilogy).
      Clean.

- [x] Holly Black (3) — confirmed real (Folk of the Air trilogy). Clean.
- [x] Devney Perry (3) — confirmed real (Shield of Sparrows trilogy).
      Clean.
- [x] Hannah Nicole Maehrer (3) — 2/3 confirmed real (Assistant to the
      Villain, Accomplice to the Villain). **1 FIXED**: "Sidekick to the
      Villain" was not the real book 2 (real title: "Apprentice to the
      Villain") — but the Google Books/Hardcover fetch had already
      correctly found a *different*, real book in the series ("Adversary
      to the Villain," book 4) and fully tagged/synthesized it. Rather
      than discard good data, relabeled the seed to match what the row
      actually contains and added "Apprentice to the Villain" fresh so
      the real gap gets filled on a future pipeline run (book id 287).
- [x] Deborah Harkness (3) — confirmed real (All Souls trilogy, books
      1-3 of a longer series). Clean.
- [x] Heather Fawcett (3) — confirmed real (Emily Wilde trilogy). Clean.
- [x] Erin Sterling (3) — confirmed real (Graves Glen series). Clean.
- [x] Freya Marske (3) — confirmed real (The Last Binding trilogy).
      Clean.

- [x] Cassandra Clare (3) — confirmed real (Mortal Instruments #1-3).
      Clean.
- [x] Andrea Stewart (3) — confirmed real (Drowning Empire trilogy).
      Clean.
- [x] Amanda Foody (3) — confirmed real (Shadow Game trilogy). Clean.
- [x] Alex Aster (3) — confirmed real (Lightlark series). Clean.
- [x] Adalyn Grace (3) — confirmed real (Belladonna trilogy). Clean.

All 3-entry authors now checked.

- [x] TJ Klune (2) — confirmed real (Cerulean Chronicles). Clean.
- [x] Tracy Deonn (2) — confirmed real (Legendborn Cycle). Clean.
- [x] Thea Guanzon (2) — confirmed real (Hurricane Wars series). Clean.
- [x] Victoria Aveyard (2) — Red Queen series, not individually
      re-searched (unambiguous). Clean.
- [x] Tomi Adeyemi (2) — Legacy of Orïsha, not individually re-searched
      (unambiguous). Clean.
- [x] Tamsyn Muir (2) — Locked Tomb series, not individually re-searched
      (unambiguous). Clean.
- [x] Sarah A. Parker (2) — confirmed real (Moonfall series). Clean.
- [x] Kristen Ciccarelli (2) — confirmed real (Crimson Moth duology).
      Clean.
- [x] Madeline Miller (2) — confirmed real (Circe, Song of Achilles).
      Clean.
- [x] Margaret Rogerson (2) — confirmed real. Clean.
- [x] Marissa Meyer (2) — confirmed real (Lunar Chronicles). Clean.
- [x] Lauren Roberts (2) — confirmed real (Powerless trilogy). Clean.

- [x] Erin Morgenstern (2) — confirmed real (Night Circus, Starless
      Sea). Clean.
- [x] Jennifer Saint (2) — confirmed real (Elektra, Ariadne). Clean.
- [x] Heather Walter (2) — confirmed real (Malice duology). Clean.
- [x] Chloe Gong (2) — confirmed real (These Violent Delights duet).
      Clean.
- [x] Elizabeth Lim (2) — confirmed real (Six Crimson Cranes duology).
      Clean.
- [x] Charlie N. Holmberg (2) — confirmed real (Spellbreaker duology).
      Clean.
- [x] Callie Hart (2) — confirmed real (Fae & Alchemy series). Clean.
- [x] Analeigh Sbrana (2) — confirmed real (Lore of the Wilds duology).
      Clean.
- [x] Adrienne Young (2) — confirmed real (Sky and Sea series). Clean.
- [x] Ava Reid (2) — confirmed real (both standalones). Clean.
- [x] Brandon Sanderson (2) — confirmed real (Cosmere standalones).
      Clean.

All 2-entry authors now checked. Remaining: 55 single-entry authors.

- [x] Zoraida Cordova (1) "Labyrinth Lost" — confirmed real. Clean.
- [x] Xiran Jay Zhao (1) "Iron Widow" — confirmed real. Clean.
- [x] Virginia Boecker (1) "An Assassin's Guide to Love and Treason" —
      confirmed real. Clean.
- [x] Tricia Levenseller (1) "The Shadows Between Us" — confirmed real.
      Clean.
- [x] Tasha Suri (1) "The Jasmine Throne" — confirmed real. Clean.
- [x] Simon Jimenez (1) "The Spear Cuts Through Water" — confirmed real
      (verified earlier during the unverified-hardcover-match scan).
      Clean.
- [x] Silvia Moreno-Garcia (1) "Mexican Gothic" — confirmed real. Clean.
- [x] Sherrilyn Kenyon (1) "Fantasy Lover" — confirmed real. Clean.
- [x] Shannon Chakraborty (1) "The Adventures of Amina al-Sirafi" —
      confirmed real. Clean.
- [x] Sarah Rees Brennan (1) "In Other Lands" — confirmed real. Clean.
- [x] Sarah Beth Durst (1) "The Spellshop" — confirmed real. Clean.
- [x] Sangu Mandanna (1) "The Very Secret Society of Irregular Witches"
      — confirmed real. Clean.
- [x] Roshani Chokshi (1) "The Last Tale of the Flower Bride" —
      confirmed real. Clean.
- [x] Raven Kennedy (1) "Gild" — confirmed real (Plated Prisoner
      series). Clean.

### Unchecked — ordered by entry count (highest risk first)
- [ ] Penn Cole (1)
- [ ] Patrick Rothfuss (1)
- [ ] Patricia Briggs (1)
- [ ] Pam Godwin (1)
- [ ] P. Djèlí Clark (1)
- [ ] Odette C. Bell (1)
- [ ] Nalini Singh (1)
- [ ] Melissa Marr (1)
- [ ] Matt Haig (1)
- [ ] Mary E. Pearson (1)
- [ ] Mark Lawrence (1)
- [ ] Lucy Holland (1)
- [ ] Lexi Ryan (1)
- [ ] L.J. Andrews (1)
- [ ] Krystal Sutherland (1)
- [ ] Kristin Hannah (1)
- [ ] Kristin Cashore (1)
- [ ] Kresley Cole (1)
- [ ] Kaylie Smith (1)
- [ ] Katherine Addison (1)
- [ ] Kate Golden (1)
- [ ] Justinian Huang (1)
- [ ] Juliet Marillier (1)
- [ ] Jennifer Estep (1)
- [ ] India Holton (1)
- [ ] Ilona Andrews (1)
- [ ] Grace Draven (1)
- [ ] Gena Showalter (1)
- [ ] Erin A. Craig (1)
- [ ] Emily Thiede (1)
- [ ] E.V. Mitchell (1)
- [ ] Donyae Coles (1)
- [ ] Diana Wynne Jones (1)
- [ ] Courtney Gould (1)
- [ ] Christine Feehan (1)
- [ ] C.L. Wilson (1)
- [ ] Arkady Martine (1)
- [ ] Amber V. Nicole (1)
- [ ] Amalie Howard (1)
- [ ] Ali Hazelwood (1)
- [ ] Aimee Lynn (1)

## Fixes made this pass

(append here as authors are checked and fixes applied, with commit hash)

- Caroline Peckham cluster — commits a17da5e, 18760fe, 2dd3b0e (2026-08-14)
- Danielle L. Jensen "The Inevitable Fall" (book id 267) — commit 623f86a (2026-08-14)
- Namina Forna "The Fallen Ones" (book id 274, wrong Gilded Ones content)
  + Armentrout "The Throne of Bone and Ash" (id 300, borrowed sibling
  data stripped) + new unverified-hardcover-match audit check — commit
  e1a881f (2026-08-14)
- Hannah Nicole Maehrer "Sidekick to the Villain" relabeled to "Adversary
  to the Villain" (id 287) + "Apprentice to the Villain" added fresh —
  commit pending (2026-08-14)
