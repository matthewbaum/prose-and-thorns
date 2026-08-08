import React from 'react';
import '../styles/AboutPage.css';

export default function AboutPage({ onBrowseAll }) {
  return (
    <div className="about-page">
      <h1 className="about-title">Why I built this</h1>

      <p>
        I love romantasy. I don&apos;t love guessing.
      </p>

      <p>
        Every trope list and star rating can tell you what a book is about — enemies to lovers,
        dragon riders, spice level four — but almost none of them can tell you if it&apos;s
        actually any good, not without wading through a pile of reviews yourself to find out.
        And for me, that matters. I can&apos;t
        stay immersed in a story if the prose is clunky, the dialogue is stilted, or the page is
        riddled with typos, no matter how much I like the trope.
      </p>

      <p>
        BookTok and Bookstagram reviews help, but they move fast — seconds per book, then on to
        the next, with little time to actually sit with what worked and what didn&apos;t. And
        they&apos;re not systematic: a creator reviews whatever they happen to pick up, not
        necessarily what you&apos;re looking for. There was no way to ask &ldquo;does anyone
        think this genre-perfect enemies-to-lovers dragon-rider book is actually well
        written?&rdquo; and get a real answer.
      </p>

      <p>
        So this is the thing I wished existed: tell it what you&apos;re after, and it tells you
        what&apos;s actually good — not from a single star rating, not from hype, but from real
        reader reviews synthesized into six specific dimensions (prose, romance, world-building,
        pacing, emotional payoff, character depth), so you can see exactly what&apos;s strong and
        what isn&apos;t before you start.
      </p>

      <p>
        Not everything here is strictly romantasy — some of it is the fantasy that romantasy
        readers tend to love anyway, even without a central romance plot (think{' '}
        <em>Circe</em>, or <em>The Name of the Wind</em>). That&apos;s deliberate, not scope
        creep — if that&apos;s not what you&apos;re after on a given day, the subgenre filter
        will get you back to the romance-forward stuff specifically.
      </p>

      <p className="about-note">
        It&apos;s early, and the catalog is still growing — but that&apos;s the idea.
      </p>

      <button className="browse-all-btn" onClick={onBrowseAll}>
        Browse all books
      </button>
    </div>
  );
}
