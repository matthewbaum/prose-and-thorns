import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';

const MAX_REVIEW_CHARS = 8000 * 4; // ~8000 tokens, rough 4-chars-per-token heuristic

const SYNTHESIS_PROMPT = ({ title, author, rating, ratingsCount, reviewsText }) => `You are synthesizing reader reviews for a book recommendation tool. Based on the reviews below, score this book on each quality dimension and provide a one-sentence synthesis plus one representative quote (under 15 words, paraphrased not quoted verbatim) for each dimension.

BOOK: ${title} by ${author}
AGGREGATE READER RATING: ${rating ?? 'unknown'}/5 (from ${ratingsCount ?? 0} total ratings)

The sample of reviews below is a small subset selected to span the rating distribution (critical, mixed, and positive) — it is NOT necessarily representative on its own, especially if it skews more negative or more positive than the aggregate rating above. Treat the aggregate rating as the primary signal for overall reception, and use the review text to explain *why* readers feel that way and to differentiate between dimensions (e.g. a book can have a high aggregate rating despite a vocal minority criticizing pacing). Do not let a handful of outlier reviews drag scores below what the aggregate rating would suggest without good reason.

READER REVIEWS (sampled across ratings, not just top-liked):
${reviewsText}

Score each dimension 1-5 where:
1 = Poor, consistently criticized
2 = Below average, mixed with more negatives
3 = Average, mixed reviews
4 = Good, mostly praised
5 = Excellent, consistently praised

Also flag three specific craft signals readers often care about independently of the overall prose score — a book can have decent prose quality overall while still having noticeably clunky dialogue or grammar issues, and vice versa:
- writing_style: the closest single label for how the prose reads — one of "accessible", "literary", "lyrical", "sparse", "purple" (ornate/overwrought), or "conversational". This is descriptive, not a quality judgment — pick whichever fits even for a well-liked book.
- grammar_technical: "clean", "minor_issues", or "notable_issues" — only base this on reviews that actually comment on grammar, typos, or technical writing correctness. If no reviews mention it, use null.
- dialogue_realism: "natural", "mixed", or "stilted" — only base this on reviews that actually comment on how dialogue reads. If no reviews mention it, use null.

Return JSON only:
{
  "prose_quality": { "score": 0, "synthesis": "", "representative_quote": "" },
  "romance_quality": { "score": 0, "synthesis": "", "representative_quote": "" },
  "world_building": { "score": 0, "synthesis": "", "representative_quote": "" },
  "pacing_quality": { "score": 0, "synthesis": "", "representative_quote": "" },
  "emotional_payoff": { "score": 0, "synthesis": "", "representative_quote": "" },
  "character_depth": { "score": 0, "synthesis": "", "representative_quote": "" },
  "writing_style": { "style": "", "note": "" },
  "grammar_technical": { "flag": null, "note": "" },
  "dialogue_realism": { "flag": null, "note": "" },
  "review_count_used": 0,
  "confidence": "high|medium|low"
}

If fewer than 5 reviews are available for a dimension, set confidence to "low" and note it in the synthesis.`;

function buildReviewsText(reviews) {
  let text = '';
  for (const review of reviews) {
    const entry = `[${review.source}${review.subreddit ? ` · r/${review.subreddit}` : ''}, score ${review.score}]\n${review.text}\n\n`;
    if (text.length + entry.length > MAX_REVIEW_CHARS) break;
    text += entry;
  }
  return text.trim();
}

export async function synthesizeQuality({ title, author, avgRating, ratingsCount, reviews }) {
  const reviewsText = buildReviewsText(reviews);
  if (!reviewsText) {
    return null;
  }

  const anthropic = getClaudeClient();
  const message = await anthropic.messages.create({
    model: CLAUDE_MODEL,
    max_tokens: 2048,
    messages: [
      {
        role: 'user',
        content: SYNTHESIS_PROMPT({ title, author, rating: avgRating, ratingsCount, reviewsText }),
      },
    ],
  });

  const text = message.content.map((block) => (block.type === 'text' ? block.text : '')).join('');
  return extractJson(text);
}
