import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';

// Single source of truth for every taxonomy value the model may assign.
// TAG_PROMPT is built from these instead of hardcoding the lists inline,
// and auditCatalog.js imports the same arrays to diff against
// frontend/src/constants/taxonomy.js — verified case: the prompt used to
// allow content_warnings/plot_tropes values the frontend had no label or
// filter for (torture, suicide-self-harm, addiction,
// tournament-competition, prophecy, quest), so a correctly-tagged book
// would silently render with an ugly fallback label and be unfilterable.
export const SERIES_STATUS_VALUES = [
  'standalone',
  'series-complete',
  'series-ongoing',
  'duology-complete',
  'duology-ongoing',
];
export const AGE_CATEGORY_VALUES = ['young-adult', 'new-adult', 'adult'];
export const PUBLISHER_TYPE_VALUES = [
  'traditional-major',
  'traditional-indie',
  'self-published',
  'kindle-unlimited-exclusive',
];
export const SUBGENRE_VALUES = [
  'fae-high-fantasy',
  'dragon-riders',
  'vampire-dark-fantasy',
  'witch-academy',
  'gods-mythology',
  'shifters-werewolves',
  'urban-fantasy',
  'epic-fantasy',
  'historical-fantasy',
  'dark-romance-fantasy',
  'gothic',
  'dystopian',
];
export const ROMANCE_TROPE_VALUES = [
  'enemies-to-lovers',
  'forced-proximity',
  'slow-burn',
  'fated-mates',
  'forbidden-love',
  'chosen-one',
  'fake-dating',
  'bodyguard-protector',
  'touch-her-and-die',
  'grumpy-sunshine',
  'age-gap',
  'second-chance',
  'morally-gray-mmc',
  'reverse-harem',
  'banter',
];
export const PLOT_TROPE_VALUES = [
  'weak-to-strong-fmc',
  'hidden-discovered-power',
  'lost-heir-identity',
  'corrupt-system-overthrown',
  'political-intrigue',
  'war-military',
  'tournament-competition',
  'prophecy',
  'quest',
  'revenge-plot',
];
export const SPICE_LEVEL_VALUES = ['clean', 'low', 'medium', 'high', 'very-high'];
// A separate axis from spice — content darkness (violence, trauma, bleakness)
// is independent of romantic-content intensity: a book can be very dark with
// low spice, or high spice with a light overall tone. Requested after
// noticing BookTok reviewers consistently discuss this as its own dimension.
export const DARKNESS_LEVEL_VALUES = ['light', 'moderate', 'dark', 'very-dark'];
export const LGBTQ_VALUES = ['yes', 'no', 'unknown'];
export const CONTENT_WARNING_VALUES = [
  'sexual-violence',
  'graphic-violence',
  'torture',
  'child-abuse-trauma',
  'suicide-self-harm',
  'addiction',
  'major-character-death',
  'cliffhanger-ending',
];
export const EMOTIONAL_TONE_VALUES = [
  'dark-intense',
  'angsty',
  'hopeful',
  'humorous',
  'bittersweet',
  'comfort-read',
  'emotionally-devastating',
];
export const PACING_VALUES = [
  'fast-action-driven',
  'slow-burn-character-focused',
  'balanced',
  'epic-long',
  'quick-read',
];

const TAG_PROMPT = ({ title, author, description }) => `You are tagging a romantasy book for a discovery tool. The book is "${title}" by ${author}. Based on the description below AND your own general knowledge of this specific book (most titles in this catalog are well-known bestsellers), assign tags from the provided taxonomy. Return JSON only.

DESCRIPTION: ${description}

TAG TAXONOMY:
Series status: [${SERIES_STATUS_VALUES.join(', ')}]
Age category: [${AGE_CATEGORY_VALUES.join(', ')}] — the book's actual publishing/marketing category, not just its content's spice level. YA romantasy (e.g. Six of Crows, City of Bones, Strange the Dreamer) typically has teenage protagonists and closed-door or fade-to-black romance; New Adult and Adult skew toward college-age-or-older protagonists and can have any spice level. Use your knowledge of how the book is actually marketed/shelved, not a guess from genre alone.
Publisher type: [${PUBLISHER_TYPE_VALUES.join(', ')}] — traditional-major for Big 5 imprints (Bloomsbury, Del Rey, Berkley, Ace, Wednesday Books, etc.); traditional-indie for smaller specialty presses (e.g. Entangled/Red Tower Books); self-published for indie/self-pub authors whose books are available broadly (Amazon, Barnes & Noble, etc., not locked to one platform); kindle-unlimited-exclusive for self-pub/indie titles you know are enrolled in KDP Select and only readable via Kindle/KU, not other retailers. Use your knowledge of this specific title's actual publishing history. If you genuinely don't know, use null rather than guessing.
Subgenre: [${SUBGENRE_VALUES.join(', ')}]
Romance tropes (select all that apply): [${ROMANCE_TROPE_VALUES.join(', ')}]
Plot tropes (select all that apply): [${PLOT_TROPE_VALUES.join(', ')}]
Spice level: [${SPICE_LEVEL_VALUES.join(', ')}]
Darkness level: [${DARKNESS_LEVEL_VALUES.join(', ')}] — a separate axis from spice level: how dark/heavy the content itself is (violence, trauma, bleakness, morally grim themes), independent of romantic content intensity. light = low-stakes, comedic, or fluffy; moderate = some real stakes or serious themes but not heavy; dark = violence, trauma, morally complex/grim content; very-dark = grimdark, sustained trauma/violence, bleak tone throughout.
LGBTQ+: [${LGBTQ_VALUES.join(', ')}]
Content warnings (select all that apply): [${CONTENT_WARNING_VALUES.join(', ')}]
Emotional tone: [${EMOTIONAL_TONE_VALUES.join(', ')}]
Pacing: [${PACING_VALUES.join(', ')}]

Series length (series_position, series_total): use whatever the description states explicitly (e.g. "the second book in this complete series") combined with your own knowledge of this specific title and series. Rules:
- standalone -> series_position: 1, series_total: 1
- duology-complete / duology-ongoing -> series_total: 2 (unless you're confident it's actually longer, then use the real number)
- series-complete / series-ongoing -> series_position and series_total are this book's actual position and the series' actual total book count, if you know them or the description states them
- If you genuinely don't know a value, use null for it rather than guessing. Do not default to 1 for a book you know is part of a longer series.

series_name: the canonical name of the series this book belongs to, so that every book in the same series can be matched by this exact string — precision and consistency matter here since each book is tagged independently. Rules:
- If the series has its own widely-known name, use that exact name (e.g. "The Empyrean", "Throne of Glass", "The Folk of the Air").
- If the series is only known by its first book's title (no separate series name), use the exact title of book 1 (e.g. the ACOTAR series -> "A Court of Thorns and Roses").
- null for true standalones (series_status "standalone").

Synopsis and praise: publisher descriptions usually mix the actual plot summary together with review blurbs, award mentions, and pull-quotes ("'Utterly captivating' —NYT", "#1 bestseller", "Winner of the X Prize") with no separation. Split the description into two pieces — don't discard anything, just sort it:
- synopsis: only the sentences that describe the story itself (plot, characters, setting). Preserve the original wording/voice.
- praise: every blurb, pull-quote, award mention, and bestseller-list claim, verbatim, as a list of short strings. Empty array if the description has none.
If you can't cleanly separate something, leave it in synopsis rather than dropping it.

Return format:
{
  "series_status": "",
  "series_position": 0,
  "series_total": 0,
  "series_name": "",
  "age_category": "",
  "publisher_type": "",
  "synopsis": "",
  "praise": [],
  "subgenre": "",
  "romance_tropes": [],
  "plot_tropes": [],
  "spice_level": "",
  "darkness_level": "",
  "lgbtq": "",
  "content_warnings": [],
  "emotional_tone": "",
  "pacing": "",
  "confidence": "high|medium|low"
}`;

export async function tagBook({ title, author, description, editorialReview }) {
  const combinedDescription = [description, editorialReview].filter(Boolean).join('\n\n');
  if (!combinedDescription.trim()) {
    return null;
  }

  const anthropic = getClaudeClient();
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    // See claudeSynthesis.js for why this isn't 2048 — same failure mode
    // (thinking tokens can consume the entire budget, leaving none for
    // the JSON answer) applies to any call on this model.
    max_tokens: 8192,
    messages: [{ role: 'user', content: TAG_PROMPT({ title, author, description: combinedDescription }) }],
  });

  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  return extractJson(text);
}
