import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';

const TAG_PROMPT = (description) => `You are tagging a romantasy book for a discovery tool. Based on the description below, assign tags from the provided taxonomy. Return JSON only.

DESCRIPTION: ${description}

TAG TAXONOMY:
Series status: [standalone, series-complete, series-ongoing, duology-complete, duology-ongoing]
Subgenre: [fae-high-fantasy, dragon-riders, vampire-dark-fantasy, witch-academy, gods-mythology, shifters-werewolves, urban-fantasy, epic-fantasy, historical-fantasy, dark-romance-fantasy]
Romance tropes (select all that apply): [enemies-to-lovers, forced-proximity, slow-burn, fated-mates, forbidden-love, chosen-one, fake-dating, bodyguard-protector, touch-her-and-die, grumpy-sunshine, age-gap, second-chance, morally-gray-mmc, reverse-harem]
Plot tropes (select all that apply): [weak-to-strong-fmc, hidden-discovered-power, lost-heir-identity, corrupt-system-overthrown, political-intrigue, war-military, tournament-competition, prophecy, quest, revenge-plot]
Spice level: [clean, low, medium, high, very-high]
LGBTQ+: [yes, no, unknown]
Content warnings (select all that apply): [sexual-violence, graphic-violence, torture, child-abuse-trauma, suicide-self-harm, addiction, major-character-death, cliffhanger-ending]
Emotional tone: [dark-intense, angsty, hopeful, humorous, bittersweet, comfort-read, emotionally-devastating]
Pacing: [fast-action-driven, slow-burn-character-focused, balanced, epic-long, quick-read]

Return format:
{
  "series_status": "",
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

export async function tagBook(description, editorialReview) {
  const combinedDescription = [description, editorialReview].filter(Boolean).join('\n\n');
  if (!combinedDescription.trim()) {
    return null;
  }

  const anthropic = getClaudeClient();
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 1024,
    messages: [{ role: 'user', content: TAG_PROMPT(combinedDescription) }],
  });

  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  return extractJson(text);
}
