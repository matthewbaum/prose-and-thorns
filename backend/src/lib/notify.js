// New-submission email notifications via Resend's REST API — raw fetch,
// not their SDK, matching this project's existing pattern for every other
// external integration (Google Books, Hardcover, Reddit all do the same).
// Without RESEND_API_KEY/NOTIFY_EMAIL configured, this silently no-ops
// rather than failing — a missing notification is a lesser problem than a
// submission failing to save because email delivery isn't set up yet.

const TYPE_LABEL = {
  contact: 'Contact message',
  review: 'Review submission',
  partnership: 'Partnership inquiry',
  correction: 'Error report',
};

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

function buildEmail(submission) {
  const { type, name, email, message, book_title, book_id, category, rating, channel_url } = submission;
  const label = TYPE_LABEL[type] || type;
  const rows = [
    ['From', `${escapeHtml(name)} &lt;${escapeHtml(email)}&gt;`],
    book_title ? ['Book', `${book_id ? `#${book_id} ` : ''}${escapeHtml(book_title)}`] : null,
    category ? ['Category', escapeHtml(category)] : null,
    rating ? ['Rating', `${rating}/5`] : null,
    channel_url ? ['Channel', escapeHtml(channel_url)] : null,
  ].filter(Boolean);

  const rowsHtml = rows.map(([k, v]) => `<tr><td style="color:#666;padding:2px 12px 2px 0;">${k}</td><td>${v}</td></tr>`).join('');

  return {
    subject: `[Prose & Thorns] ${label} from ${name}`,
    html: `
      <table>${rowsHtml}</table>
      <p style="white-space:pre-wrap;margin-top:16px;border-top:1px solid #ddd;padding-top:12px;">${escapeHtml(message)}</p>
    `,
  };
}

export async function notifyNewSubmission(submission) {
  const apiKey = process.env.RESEND_API_KEY;
  const to = process.env.NOTIFY_EMAIL;
  if (!apiKey || !to) return;

  const { subject, html } = buildEmail(submission);

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Prose & Thorns <onboarding@resend.dev>',
        to,
        subject,
        html,
      }),
    });
    if (!res.ok) {
      console.error(`[notify] Resend API error ${res.status}: ${await res.text()}`);
    }
  } catch (err) {
    console.error(`[notify] Failed to send notification: ${err.message}`);
  }
}
