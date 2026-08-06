import { getClaudeClient, CLAUDE_MODEL } from './claudeClient.js';
import { extractJson } from './util.js';

const MAX_REVIEW_CHARS = 8000 * 4; // ~8000 tokens, rough 4-chars-per-token heuristic

const SYNTHESIS_PROMPT = ({ title, author, rating, ratingsCount, reviewsText }) => `You are synthesizing reader reviews for a book recommendation tool. Based on the reviews below, score this book on each quality dimension and provide a one-sentence synthesis plus one representative quote (under 15 words, paraphrased not quoted verbatim) for each dimension.

BOOK: ${title} by ${author}
GOOGLE BOOKS RATING: ${rating ?? 'unknown'}/5 (${ratingsCount ?? 0} ratings)

READER REVIEWS:
${reviewsText}

Score each dimension 1-5 where:
1 = Poor, consistently criticized
2 = Below average, mixed with more negatives
3 = Average, mixed reviews
4 = Good, mostly praised
5 = Excellent, consistently praised

Return JSON only:
{
  "prose_quality": { "score": 0, "synthesis": "", "representative_quote": "" },
  "romance_quality": { "score": 0, "synthesis": "", "representative_quote": "" },
  "world_building": { "score": 0, "synthesis": "", "representative_quote": "" },
  "pacing_quality": { "score": 0, "synthesis": "", "representative_quote": "" },
  "emotional_payoff": { "score": 0, "synthesis": "", "representative_quote": "" },
  "character_depth": { "score": 0, "synthesis": "", "representative_quote": "" },
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
