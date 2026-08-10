import 'dotenv/config';
import db from '../db/index.js';
import { synthesizeQuality } from './claudeSynthesis.js';
import { getReviewsForBook, saveQualityProfile } from '../db/pipelineRepo.js';
import { sleep, RATE_LIMIT_DELAY_MS, log } from './util.js';

// One-off pilot: supplement the catalog's thinnest-Hardcover-coverage books
// with real review text found via general (non-targeted) web search, fetched
// directly from independent review blogs — never Goodreads/StoryGraph, per
// the ToS discussion. Each excerpt below was fetched and copied verbatim
// from the cited URL, same discipline as SYNTHESIS_PROMPT requires for
// representative_quote, so the grounding audit can verify it.

const insertReview = db.prepare(
  `INSERT OR IGNORE INTO reviews (book_id, source, subreddit, author, text, score, url, permalink)
   VALUES (@book_id, 'blog_review', NULL, @author, @text, NULL, @url, NULL)`
);

const selectBook = db.prepare(
  'SELECT id, title, author, hardcover_avg_rating, hardcover_ratings_count, avg_rating, ratings_count FROM books WHERE id = ?'
);

const ENTRIES = [
  {
    book_id: 282, // The Songbird and the Heart of Stone — Carissa Broadbent
    reviews: [
      {
        author: 'Coffee Ring Musings',
        url: 'https://coffeeringmusings.wordpress.com/2025/02/17/book-review-the-songbird-and-the-heart-of-stone-by-carissa-broadbent/',
        text: "I devoured Songbird in less than a week; I haven't read something that fast in a long time! She doesn't let her past make her bitter. I love the way Broadbent structures this aspect of Songbird.",
      },
      {
        author: 'Utopia State of Mind',
        url: 'https://utopia-state-of-mind.com/review-the-songbird-and-the-heart-of-stone-by-carissa-broadbent/',
        text: 'At some times, I was kind of waiting for the world, the story, the action to go back to what I was most interested in. The relationship here is a slow burn.',
      },
    ],
  },
  {
    book_id: 284, // The Lion and the Deathless Dark — Carissa Broadbent
    reviews: [
      {
        author: 'FanFiAddict',
        url: 'https://fanfiaddict.com/review-the-lion-and-the-deathless-dark-crowns-of-nyaxia-book-5-by-carissa-broadbent/',
        text: "This book was longer than it needed to be. A LOT goes down, but it also got bogged down by repetitive internal dialogue. Kyrene is a hard character to follow because she's so raw and angry all of the time. She's unafraid, but in a suicidal sense rather than courageous.",
      },
      {
        author: 'The Daily Beast',
        url: 'https://www.thedailybeast.com/obsessed/carissa-broadbents-the-lion-and-the-deathless-dark-is-a-slow-burn-vampire-masterpiece/',
        text: 'Broadbent consistently delivers complex, often morally gray characters that make you consider existential questions outside of their fantasy world, delving into themes of grief, guilt, and pressure.',
      },
    ],
  },
  {
    book_id: 159, // Flameborne — Aimee Lynn
    reviews: [
      {
        author: 'Nerd Girl Loves Books',
        url: 'https://nerdgirllovesbooks.com/2026/02/09/flameborne-chosen-emberquell-academy-1-by-aimee-lynn/',
        text: 'This was a fun book to read and I especially love how big of a role the dragons play in the story. There is plenty of action and I loved the academy setting.',
      },
    ],
  },
  {
    book_id: 367, // Dragon in the Blood — Juliette Cross
    reviews: [
      {
        author: 'Smexy Books',
        url: 'https://smexybooks.com/2016/08/review-dragon-in-the-blood-by-juliette-cross.html',
        text: 'This is such a seductive and enthralling world! Dragon in the Blood is literally, a literary gift.',
      },
    ],
  },
  {
    book_id: 316, // Dreams of Gods and Monsters — Laini Taylor
    reviews: [
      {
        author: "Dear Author (Janine)",
        url: 'https://dearauthor.com/book-reviews/overall-b-reviews/b-minus-reviews/review-dreams-of-gods-and-monsters-by-laini-taylor/',
        text: "I enjoyed and appreciated Dreams of Gods and Monsters, but not as much as the first two books in the series. In this book, multiple things go just exactly right for the characters, and at times the book feels rushed. The chimaera's acceptance of Karou, and Karou's forgiveness of Akiva happen very fast. Tricks and deceptions which could easily have gone awry don't. Jael, who was so menacing in Days of Blood and Starlight is a lot less so here.",
      },
      {
        author: 'Reading the End',
        url: 'https://readingtheend.com/2014/06/25/review-dreams-of-gods-and-monsters-laini-taylor/',
        text: 'During tense moments, Laini Taylor is prone to taking a time-out from the action to think lots of sad thoughts about what the possible outcome of these tense moments will be. This is okay in moderation, but it happens a lot, and sometimes the tense moment resolves itself very quickly, which made me feel that Karou was wasting my time with all that internal wailing about the Death of All Hope.',
      },
    ],
  },
  {
    book_id: 368, // Dragon Heartstring — Juliette Cross
    reviews: [
      {
        author: 'Deanna\'s World',
        url: 'https://www.deannasworld.com/2016/10/review-dragon-heartstring-vale-of-stars.html?m=0',
        text: "This was a novella so the romance starts off fairly quickly, but I liked this couple together. Shakara's softness and fragility was a nice complement to Demetrius' stoic and serious demeanor. There was good chemistry and the perfect amount of steam and suspense to advance the story at a good pace.",
      },
      {
        author: 'Coffee and Wine Book Blog',
        url: 'https://coffeeandwinebookblog.com/2016/10/26/dragon-heartstring-juliette-cross/',
        text: "Cross has done such an amazing job of world-building that each time I pick up a Morgon book, I know exactly where I am and fall back into the pace of that world. Demetrious is one of the characters that has always been around, but I never quite figured out how his drastic change occurred. This book answered every question, and more.",
      },
    ],
  },
  {
    book_id: 369, // Dragon Fire — Juliette Cross
    reviews: [
      {
        author: 'The Reading Cafe (Sandy)',
        url: 'https://www.thereadingcafe.com/dragon-fire-vale-of-stars-3-by-juliette-cross-dual-review-and-excerpt/',
        text: 'DRAGON FIRE is a story of power and control; destruction and obsession; family, friendship, and fated love. Liana struggles with the death of her father, and the revenge that forced our heroine into a life with the Sisters. Kieren knows it is only a matter time before his enemies discover his whereabouts but our hero has no idea that betrayal was but a dragon\'s flight away.',
      },
      {
        author: "Angel's Book Nook",
        url: 'https://angelsbooknook.com/2019/11/11/review-dragon-fire-vale-of-stars-3-by-juliette-cross/',
        text: "The romance is a nice slow burn. Kieran knows what Liana is to him, but he's decided that he won't be the reason she forsakes her vows as a Sister. Their's more to Liana, her history, and why she's a Sister. We soon learn her past as events unfold and both, Kieran and Liana's, futures change.",
      },
    ],
  },
  {
    book_id: 370, // Hunt of the Dragon — Juliette Cross
    reviews: [
      {
        author: 'LitBuzz',
        url: 'https://thelitbuzz.com/2021/06/hunt-dragon-vale-stars-book-4-juliette-cross/',
        text: "Bowen and Krissa's romance is simply perfect for any type of reader. Krissa is smart, fierce, fearless, and kind to everyone she meets. Bowen is her perfect counterpoint. He's renowned for his tracking skills, his ability to pick up the slightest change in the wind or someone's countenance makes him a fierce Morgon and also the kind of male that is so addicting to read because it makes him intuitively attuned to the needs of his love interest.",
      },
    ],
  },
  {
    book_id: 362, // Lore of the Tides — Analeigh Sbrana
    reviews: [
      {
        author: 'The Nora Theory',
        url: 'https://thenoratheory.com/2025/06/06/lore-of-the-tides-by-analeigh-sbrana-an-atmospheric-fantasy-with-an-impeccable-vibe/',
        text: 'Lore of the Tides, like its predecessor, is atmospheric, with a gorgeous and compelling vibe. The general mood and feeling of this story is absolutely exceptional, with rich, detailed descriptions to add depth to the feelings the author evokes.',
      },
      {
        author: 'Annotate with Sara',
        url: 'https://annotatewithsara.com/2025/04/02/review-of-lore-of-the-tides-by-analeigh-sbrana/',
        text: "Seeing Lore's character in a state of grief was difficult, but necessary. For the record, Analeigh Sbrana never lets Lore's sense of joy completely wither. Her love for her friends, books, and good food never disappears. Lore just gets stuck in grief and focused on justice. Which means we see her exasperated, we see her spiral, we see her desperate for relief. Her character expands a lot in book two.",
      },
    ],
  },
];

// Investigated but yielded nothing usable — logged for the record, not
// silently skipped: Reckless (Mallory Crowe, id 304 — only retailer/audiobook
// pages, no independent review blog); Kingdom of Spirit and Shadow (Scarlett
// St. Clair, id 313 — only retail/inventory listings); Seven and the Swift
// (Devney Perry, id 281 — unpublished as of this run, no reviews exist yet);
// Waking the Dragon (Juliette Cross, id 366 — two candidate blogs both
// returned server errors on fetch).

async function main() {
  let totalRows = 0;
  const touchedBookIds = [];

  for (const entry of ENTRIES) {
    for (const r of entry.reviews) {
      const info = insertReview.run({ book_id: entry.book_id, author: r.author, text: r.text, url: r.url });
      if (info.changes > 0) totalRows += 1;
    }
    touchedBookIds.push(entry.book_id);
  }
  log(`Inserted ${totalRows} blog review row(s) across ${ENTRIES.length} book(s).`);

  for (const bookId of touchedBookIds) {
    const book = selectBook.get(bookId);
    if (!book) {
      log(`No book with id ${bookId} — skipping synthesis`);
      continue;
    }
    const reviews = getReviewsForBook(bookId);
    const anchorRating = book.hardcover_avg_rating ?? book.avg_rating;
    const anchorRatingsCount = book.hardcover_avg_rating != null ? book.hardcover_ratings_count : book.ratings_count;
    log(`Synthesizing "${book.title}" from ${reviews.length} review row(s)...`);
    try {
      const profile = await synthesizeQuality({
        title: book.title,
        author: book.author,
        avgRating: anchorRating,
        ratingsCount: anchorRatingsCount,
        reviews,
      });
      if (profile) {
        saveQualityProfile(bookId, profile);
        log(`Saved quality profile for "${book.title}" — confidence: ${profile.confidence}, review_count_used: ${profile.review_count_used}`);
      } else {
        log(`Synthesis returned nothing for "${book.title}"`);
      }
    } catch (err) {
      log(`Synthesis failed for "${book.title}": ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  db.pragma('wal_checkpoint(TRUNCATE)');
  log('WAL checkpointed. Done.');
}

main();
