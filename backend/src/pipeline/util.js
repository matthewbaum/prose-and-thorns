export function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export const RATE_LIMIT_DELAY_MS = 1000;

export function log(...args) {
  console.log('[pipeline]', ...args);
}

export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fenced ? fenced[1] : text;
  const start = candidate.indexOf('{');
  const end = candidate.lastIndexOf('}');
  if (start === -1 || end === -1) {
    throw new Error(`No JSON object found in model response: ${text.slice(0, 200)}`);
  }
  return JSON.parse(candidate.slice(start, end + 1));
}
