import db from './index.js';

const insertSubmission = db.prepare(
  `INSERT INTO submissions (
     type, name, email, message, book_title, book_id, category, rating,
     prose_quality, romance_quality, world_building, pacing_quality, emotional_payoff, character_depth,
     channel_url
   )
   VALUES (
     @type, @name, @email, @message, @book_title, @book_id, @category, @rating,
     @prose_quality, @romance_quality, @world_building, @pacing_quality, @emotional_payoff, @character_depth,
     @channel_url
   )`
);

export function createSubmission(data) {
  const info = insertSubmission.run({
    type: data.type,
    name: data.name,
    email: data.email,
    message: data.message,
    book_title: data.book_title ?? null,
    book_id: data.book_id ?? null,
    category: data.category ?? null,
    rating: data.rating ?? null,
    prose_quality: data.prose_quality ?? null,
    romance_quality: data.romance_quality ?? null,
    world_building: data.world_building ?? null,
    pacing_quality: data.pacing_quality ?? null,
    emotional_payoff: data.emotional_payoff ?? null,
    character_depth: data.character_depth ?? null,
    channel_url: data.channel_url ?? null,
  });
  return info.lastInsertRowid;
}
