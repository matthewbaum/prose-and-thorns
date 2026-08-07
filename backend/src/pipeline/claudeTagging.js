import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';

const TAG_PROMPT = ({ title, author, description }) => `You are tagging a romantasy book for a discovery tool. The book is "${title}" by ${author}. Based on the description below AND your own general knowledge of this specific book (most titles in this catalog are well-known bestsellers), assign tags from the provided taxonomy. Return JSON only.

DESCRIPTION: ${description}

TAG TAXONOMY:
Series status: [standalone, series-complete, series-ongoing, duology-complete, duology-ongoing]
Age category: [young-adult, new-adult, adult] — the book's actual publishing/marketing category, not just its content's spice level. YA romantasy (e.g. Six of Crows, City of Bones, Strange the Dreamer) typically has teenage protagonists and closed-door or fade-to-black romance; New Adult and Adult skew toward college-age-or-older protagonists and can have any spice level. Use your knowledge of how the book is actually marketed/shelved, not a guess from genre alone.
Publisher type: [traditional-major, traditional-indie, self-published, kindle-unlimited-exclusive] — traditional-major for Big 5 imprints (Bloomsbury, Del Rey, Berkley, Ace, Wednesday Books, etc.); traditional-indie for smaller specialty presses (e.g. Entangled/Red Tower Books); self-published for indie/self-pub authors whose books are available broadly (Amazon, Barnes & Noble, etc., not locked to one platform); kindle-unlimited-exclusive for self-pub/indie titles you know are enrolled in KDP Select and only readable via Kindle/KU, not other retailers. Use your knowledge of this specific title's actual publishing history. If you genuinely don't know, use null rather than guessing.
Subgenre: [fae-high-fantasy, dragon-riders, vampire-dark-fantasy, witch-academy, gods-mythology, shifters-werewolves, urban-fantasy, epic-fantasy, historical-fantasy, dark-romance-fantasy]
Romance tropes (select all that apply): [enemies-to-lovers, forced-proximity, slow-burn, fated-mates, forbidden-love, chosen-one, fake-dating, bodyguard-protector, touch-her-and-die, grumpy-sunshine, age-gap, second-chance, morally-gray-mmc, reverse-harem]
Plot tropes (select all that apply): [weak-to-strong-fmc, hidden-discovered-power, lost-heir-identity, corrupt-system-overthrown, political-intrigue, war-military, tournament-competition, prophecy, quest, revenge-plot]
Spice level: [clean, low, medium, high, very-high]
LGBTQ+: [yes, no, unknown]
Content warnings (select all that apply): [sexual-violence, graphic-violence, torture, child-abuse-trauma, suicide-self-harm, addiction, major-character-death, cliffhanger-ending]
Emotional tone: [dark-intense, angsty, hopeful, humorous, bittersweet, comfort-read, emotionally-devastating]
Pacing: [fast-action-driven, slow-burn-character-focused, balanced, epic-long, quick-read]

Series length (series_position, series_total): use whatever the description states explicitly (e.g. "the second book in this complete series") combined with your own knowledge of this specific title and series. Rules:
- standalone -> series_position: 1, series_total: 1
- duology-complete / duology-ongoing -> series_total: 2 (unless you're confident it's actually longer, then use the real number)
- series-complete / series-ongoing -> series_position and series_total are this book's actual position and the series' actual total book count, if you know them or the description states them
- If you genuinely don't know a value, use null for it rather than guessing. Do not default to 1 for a book you know is part of a longer series.

Synopsis and praise: publisher descriptions usually mix the actual plot summary together with review blurbs, award mentions, and pull-quotes ("'Utterly captivating' —NYT", "#1 bestseller", "Winner of the X Prize") with no separation. Split the description into two pieces — don't discard anything, just sort it:
- synopsis: only the sentences that describe the story itself (plot, characters, setting). Preserve the original wording/voice.
- praise: every blurb, pull-quote, award mention, and bestseller-list claim, verbatim, as a list of short strings. Empty array if the description has none.
If you can't cleanly separate something, leave it in synopsis rather than dropping it.

Return format:
{
  "series_status": "",
  "series_position": 0,
  "series_total": 0,
  "age_category": "",
  "publisher_type": "",
  "synopsis": "",
  "praise": [],
  "subgenre": "",
  "romance_tropes": [],
  "plot_tropes": [],
  "spice_level": "",
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
    max_tokens: 2048,
    messages: [{ role: 'user', content: TAG_PROMPT({ title, author, description: combinedDescription }) }],
  });

  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  return extractJson(text);
}
