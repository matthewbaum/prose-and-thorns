import { log, sleep, RATE_LIMIT_DELAY_MS } from './util.js';

const SUBREDDITS = ['Romantasy', 'RomanceBooks', 'Fantasy'];
const MAX_REVIEWS = 20;
const POSTS_PER_SUBREDDIT = 10;
const COMMENT_SOURCE_POSTS = 6;
const COMMENTS_PER_POST = 5;

let cachedToken = null;
let cachedTokenExpiry = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiry) return cachedToken;

  const { REDDIT_CLIENT_ID, REDDIT_CLIENT_SECRET, REDDIT_USERNAME, REDDIT_PASSWORD, REDDIT_USER_AGENT } =
    process.env;

  if (!REDDIT_CLIENT_ID || !REDDIT_CLIENT_SECRET || !REDDIT_USERNAME || !REDDIT_PASSWORD) {
    throw new Error('Reddit API credentials are not fully set');
  }

  const basicAuth = Buffer.from(`${REDDIT_CLIENT_ID}:${REDDIT_CLIENT_SECRET}`).toString('base64');
  const res = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${basicAuth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': REDDIT_USER_AGENT || 'prose-and-thorns/0.1',
    },
    body: new URLSearchParams({
      grant_type: 'password',
      username: REDDIT_USERNAME,
      password: REDDIT_PASSWORD,
    }),
  });

  if (!res.ok) {
    throw new Error(`Reddit auth failed ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  cachedTokenExpiry = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

async function redditGet(path) {
  const token = await getAccessToken();
  const res = await fetch(`https://oauth.reddit.com${path}`, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': process.env.REDDIT_USER_AGENT || 'prose-and-thorns/0.1',
    },
  });
  if (!res.ok) {
    throw new Error(`Reddit API error ${res.status} for ${path}: ${await res.text()}`);
  }
  return res.json();
}

function lastName(author) {
  const parts = author.trim().split(/\s+/);
  return parts[parts.length - 1];
}

export async function fetchRedditReviews(title, author) {
  const query = `"${title}" "${lastName(author)}"`;
  const posts = [];

  for (const subreddit of SUBREDDITS) {
    try {
      const path = `/r/${subreddit}/search?q=${encodeURIComponent(query)}&restrict_sr=true&sort=top&limit=${POSTS_PER_SUBREDDIT}&type=link`;
      const data = await redditGet(path);
      for (const child of data.data?.children || []) {
        const d = child.data;
        const text = [d.title, d.selftext].filter(Boolean).join('\n\n').trim();
        if (!text) continue;
        posts.push({
          source: 'reddit',
          subreddit,
          author: d.author,
          text,
          score: d.score ?? 0,
          url: `https://reddit.com${d.permalink}`,
          permalink: d.permalink,
        });
      }
    } catch (err) {
      log(`Reddit search failed for r/${subreddit}, "${title}": ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  posts.sort((a, b) => b.score - a.score);
  const topPosts = posts.slice(0, COMMENT_SOURCE_POSTS);

  const comments = [];
  for (const post of topPosts) {
    try {
      const data = await redditGet(`${post.permalink}.json?limit=${COMMENTS_PER_POST}&sort=top`);
      const commentListing = data[1]?.data?.children || [];
      for (const child of commentListing) {
        if (child.kind !== 't1') continue;
        const d = child.data;
        if (!d.body || d.body === '[deleted]' || d.body === '[removed]') continue;
        comments.push({
          source: 'reddit',
          subreddit: post.subreddit,
          author: d.author,
          text: d.body,
          score: d.score ?? 0,
          url: `https://reddit.com${d.permalink || post.permalink}`,
          permalink: d.permalink || post.permalink,
        });
      }
    } catch (err) {
      log(`Reddit comment fetch failed for "${title}": ${err.message}`);
    }
    await sleep(RATE_LIMIT_DELAY_MS);
  }

  const all = [...posts, ...comments];
  const seen = new Set();
  const deduped = all.filter((r) => {
    const key = r.url;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  deduped.sort((a, b) => b.score - a.score);
  return deduped.slice(0, MAX_REVIEWS);
}
