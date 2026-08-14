import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';

// Verified case (2026-08-14): 6 seed titles across this catalog's ~305-entry
// seedList.js were hallucinated — plausible-sounding titles for a real
// author that were never actually published (e.g. "Fatal Truths" by
// Caroline Peckham, "The Fallen Ones" by Namina Forna). Each one got a
// wrong Google Books/Hardcover match that then silently populated a full
// catalog row — cover, reviews, quality synthesis — under a book that
// doesn't exist, undetected until 126 authors were individually
// web-searched by hand. This is that same check, automated: runs once per
// never-before-seen seed, with live web search (not just the model's own
// training-data recall, which is exactly what produced the hallucinations
// in the first place).
const VERIFICATION_PROMPT = ({ title, author }) => `You are verifying whether a book title is genuinely real before it enters a romantasy catalog's ingestion pipeline. This check exists because a prior version of this catalog had 6 hallucinated seed titles slip through undetected for weeks — plausible-sounding titles that were never actually published by the stated author, which then matched the wrong real book on Google Books/Hardcover and silently populated a full catalog entry under a fake title.

Title to verify: "${title}"
Author: ${author}

Use web search to check real bibliographic sources (Goodreads, the author's own website or publisher page, Amazon, a books-in-order site, etc.) — do not rely on your own memory alone, since that's exactly the failure mode this check exists to catch.

Return JSON only, no other text:
{
  "exists": true or false,
  "confidence": "high" | "medium" | "low",
  "note": "one sentence on what you found"
}

Guidance:
- exists: true only with genuine corroborating evidence (multiple sources, or one clearly authoritative one — the author's own site or publisher page) that this exact title is a real published, announced, or upcoming work by this specific author.
- If search turns up evidence the title belongs to a different author, or no such title appears anywhere despite a real search, set exists: false.
- If search is thin or ambiguous (a genuinely obscure/self-published title with little web presence, for instance), set confidence to "low" rather than guessing either way — flagging a real obscure book for a human to double-check is a far better failure mode than silently trusting a hallucination.`;

export async function verifySeedTitle(title, author) {
  const anthropic = getClaudeClient();
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 4096,
    tools: [{ type: 'web_search_20260209', name: 'web_search', max_uses: 3 }],
    messages: [{ role: 'user', content: VERIFICATION_PROMPT({ title, author }) }],
  });

  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  return extractJson(text);
}
