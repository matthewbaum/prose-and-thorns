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

## Status: 1 / 126 authors checked

- [x] Caroline Peckham (5 remaining after cleanup) — 4 of original 9 were
      hallucinated and removed 2026-08-14 (see above). Remaining 5
      (Ruthless Fae, Shadow Princess, Cursed Fates, Heartless Sky, and
      whichever else survived) — NOT yet individually re-verified beyond
      what today's fix touched; worth a quick pass too since we know this
      author's cluster was compromised.

### Unchecked — ordered by entry count (highest risk first)

- [ ] Sarah J. Maas (16)
- [ ] Jennifer L. Armentrout (12)
- [ ] Scarlett St. Clair (7)
- [ ] Leigh Bardugo (7)
- [ ] Stephanie Garber (6)
- [ ] Richelle Mead (6)
- [ ] Carissa Broadbent (6)
- [ ] V.E. Schwab (5)
- [ ] Naomi Novik (5)
- [ ] Juliette Cross (5)
- [ ] Elise Kova (5)
- [ ] Danielle L. Jensen (5)
- [ ] Tahereh Mafi (4)
- [ ] Stephenie Meyer (4)
- [ ] Samantha Shannon (4)
- [ ] Sabaa Tahir (4)
- [ ] Renee Ahdieh (4)
- [ ] Rebecca Ross (4)
- [ ] R.F. Kuang (4)
- [ ] Laini Taylor (4)
- [ ] Kerri Maniscalco (4)
- [ ] Katee Robert (4)
- [ ] Julie Kagawa (4)
- [ ] Hannah Whitten (4)
- [ ] Travis Baldree (3)
- [ ] Tracy Wolff (3)
- [ ] Shelby Mahurin (3)
- [ ] Rosaria Munda (3)
- [ ] Rebecca Yarros (3)
- [ ] Rachel Gillig (3)
- [ ] Olivie Blake (3)
- [ ] Namina Forna (3)
- [ ] Katherine Arden (3)
- [ ] Joe Abercrombie (3)
- [ ] Jay Kristoff (3)
- [ ] Holly Black (3)
- [ ] Heather Fawcett (3)
- [ ] Hannah Nicole Maehrer (3)
- [ ] Freya Marske (3)
- [ ] Erin Sterling (3)
- [ ] Devney Perry (3)
- [ ] Deborah Harkness (3)
- [ ] Cassandra Clare (3)
- [ ] Andrea Stewart (3)
- [ ] Amanda Foody (3)
- [ ] Alex Aster (3)
- [ ] Adalyn Grace (3)
- [ ] Victoria Aveyard (2)
- [ ] Tracy Deonn (2)
- [ ] Tomi Adeyemi (2)
- [ ] Thea Guanzon (2)
- [ ] Tamsyn Muir (2)
- [ ] TJ Klune (2)
- [ ] Sarah A. Parker (2)
- [ ] Marissa Meyer (2)
- [ ] Margaret Rogerson (2)
- [ ] Madeline Miller (2)
- [ ] Lauren Roberts (2)
- [ ] Kristen Ciccarelli (2)
- [ ] Jennifer Saint (2)
- [ ] Heather Walter (2)
- [ ] Erin Morgenstern (2)
- [ ] Elizabeth Lim (2)
- [ ] Chloe Gong (2)
- [ ] Charlie N. Holmberg (2)
- [ ] Callie Hart (2)
- [ ] Brandon Sanderson (2)
- [ ] Ava Reid (2)
- [ ] Analeigh Sbrana (2)
- [ ] Adrienne Young (2)
- [ ] Zoraida Cordova (1)
- [ ] Xiran Jay Zhao (1)
- [ ] Virginia Boecker (1)
- [ ] Tricia Levenseller (1)
- [ ] Tasha Suri (1)
- [ ] Simon Jimenez (1)
- [ ] Silvia Moreno-Garcia (1)
- [ ] Sherrilyn Kenyon (1)
- [ ] Shannon Chakraborty (1)
- [ ] Sarah Rees Brennan (1)
- [ ] Sarah Beth Durst (1)
- [ ] Sangu Mandanna (1)
- [ ] Roshani Chokshi (1)
- [ ] Raven Kennedy (1)
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
