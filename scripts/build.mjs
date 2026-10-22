// Builds the animated cards in assets/ from GitHub's own numbers (GraphQL API), in the style of
// Inkwell: black and white, letters out of a blur, digits that roll, bars that grow, a calm
// flame. Every card comes in a dark and a light version; the README picks one with <picture>.
// Run: GITHUB_TOKEN=… node scripts/build.mjs   (the Action in .github/workflows does it daily)
import fs from 'node:fs';
import path from 'node:path';

const LOGIN = process.env.LOGIN || 'Jonizz14';
const TOKEN = process.env.GITHUB_TOKEN;
if (!TOKEN) throw new Error('GITHUB_TOKEN is needed');
const OUT = path.join(path.dirname(new URL(import.meta.url).pathname), '..', 'assets');

async function gql(query) {
  const r = await fetch('https://api.github.com/graphql', {
    method: 'POST',
    headers: { Authorization: `bearer ${TOKEN}`, 'Content-Type': 'application/json', 'User-Agent': LOGIN },
    body: JSON.stringify({ query }),
  });
  const j = await r.json();
  if (j.errors) throw new Error(JSON.stringify(j.errors));
  return j.data;
}

/* ---------------- the numbers ---------------- */

const { user } = await gql(`{ user(login: "${LOGIN}") {
  name
  repositories(ownerAffiliations: OWNER, privacy: PUBLIC, first: 100, isFork: false) {
    totalCount
    nodes { stargazerCount languages(first: 12, orderBy: {field: SIZE, direction: DESC}) { edges { size node { name } } } }
  }
  contributionsCollection {
    restrictedContributionsCount
    contributionCalendar { totalContributions weeks { contributionDays { date contributionCount } } }
  }
} }`);

const repos = user.repositories.nodes;
const cal = user.contributionsCollection.contributionCalendar;
const days = cal.weeks.flatMap((w) => w.contributionDays);
const today = days[days.length - 1];
// the streak: today counts once there's something in it; until then it's still yesterday's
let streak = 0;
for (let i = days.length - 1 - (today.contributionCount ? 0 : 1); i >= 0 && days[i].contributionCount > 0; i--) streak++;
let longest = 0;
let run = 0;
for (const d of days) longest = Math.max(longest, (run = d.contributionCount ? run + 1 : 0));
const lit = days.slice(-7).map((d) => d.contributionCount > 0);

const langs = {};
for (const r of repos) for (const e of r.languages.edges) langs[e.node.name] = (langs[e.node.name] || 0) + e.size;
const langTotal = Object.values(langs).reduce((a, b) => a + b, 0) || 1;
const top = Object.entries(langs).sort((a, b) => b[1] - a[1]);
const shown = top.slice(0, 5);
const other = top.slice(5).reduce((a, [, v]) => a + v, 0);
if (other) shown.push(['Other', other]);

const N = {
  total: cal.totalContributions,
  privateN: user.contributionsCollection.restrictedContributionsCount,
  repos: user.repositories.totalCount,
  stars: repos.reduce((a, r) => a + r.stargazerCount, 0),
  active: days.filter((d) => d.contributionCount > 0).length,
  span: days.length,
  streak,
  longest,
};
const stamp = new Date().toISOString().slice(0, 10);

/* ---------------- drawing ---------------- */

const THEMES = {
  dark: { ink: '#e6edf3', ink2: '#9198a1', muted: '#6e7681', line: '#30363d', card: '#0d1117', cells: ['#21262d', '#3d444d', '#656c76', '#9198a1', '#e6edf3'] },
  light: { ink: '#1f2328', ink2: '#4b535d', muted: '#818b98', line: '#d1d9e0', card: '#ffffff', cells: ['#eff2f5', '#d1d9e0', '#9ba5b0', '#59636e', '#1f2328'] },
};
const SERIF = `'Iowan Old Style', Charter, 'Source Serif Pro', Georgia, 'Times New Roman', serif`;
const UI = `-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Noto Sans', Helvetica, Arial, sans-serif`;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
const fmt = (n) => n.toLocaleString('en-US');

const svg = (w, h, css, body, label) => `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}" role="img" aria-label="${esc(label)}">
<title>${esc(label)}</title>
<style>
.ser { font-family: ${SERIF}; font-variant-numeric: lining-nums tabular-nums; }
.ui { font-family: ${UI}; }
.in { opacity: 0; animation: in 900ms ${EASE} forwards; }
@keyframes in { from { opacity: 0; transform: translateY(6px); filter: blur(6px); } to { opacity: 1; transform: none; filter: blur(0); } }
${css}
</style>
${body}
</svg>`;

// a number whose digits roll down to their place, right to left, like Inkwell's statistics
let rollId = 0;
function roll(n, x, y, size, color, delay, anchor = 'start') {
  const s = fmt(n);
  const adv = size * 0.6;
  const sep = size * 0.28;
  const width = [...s].reduce((a, c) => a + (/\d/.test(c) ? adv : sep), 0);
  let cx = anchor === 'end' ? x - width : x;
  const id = `r${rollId++}`;
  let out = `<g class="ser" fill="${color}" font-size="${size}" font-weight="700">`;
  let css = '';
  const digits = [...s].filter((c) => /\d/.test(c)).length;
  let k = digits;
  for (const c of s) {
    if (!/\d/.test(c)) {
      out += `<text x="${(cx + sep / 2).toFixed(1)}" y="${y}" text-anchor="middle" class="in" style="animation-delay:${delay}ms">${c}</text>`;
      cx += sep;
      continue;
    }
    k--;
    const to = +c || 10; // a 0 spins all the way round to the 0 at the bottom
    const cid = `${id}${k}`;
    const lh = size * 1.1;
    out += `<clipPath id="c${cid}"><rect x="${cx.toFixed(1)}" y="${(y - size * 0.92).toFixed(1)}" width="${adv.toFixed(1)}" height="${(size * 1.12).toFixed(1)}"/></clipPath>`;
    out += `<g clip-path="url(#c${cid})"><g class="col ${cid}">`;
    [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 0].forEach((d, i) => (out += `<text x="${(cx + adv / 2).toFixed(1)}" y="${(y + i * lh).toFixed(1)}" text-anchor="middle">${d}</text>`));
    out += `</g></g>`;
    css += `.${cid} { animation: ${cid} 1400ms ${EASE} ${delay + k * 90}ms both; }
@keyframes ${cid} { 0% { transform: translateY(0); filter: blur(0); } 30% { filter: blur(2px); } 100% { transform: translateY(${(-to * lh).toFixed(1)}px); filter: blur(0); } }\n`;
    cx += adv;
  }
  return { svg: out + '</g>', css };
}

/* the header: the name, letter by letter out of a blur, and a hairline filling under it */
function header(t) {
  const name = user.name || LOGIN;
  const size = 44;
  const W = 840;
  const letters = [...name];
  // a tspan can't be moved or blurred on its own: each letter fades in on its own beat while the
  // whole word comes out of a blur
  const css = `.l { fill-opacity: 0; animation: l 700ms ${EASE} forwards; }
@keyframes l { to { fill-opacity: 1; } }
.word { animation: word 1400ms ${EASE} 100ms both; }
@keyframes word { from { filter: blur(8px); } to { filter: blur(0); } }
.hair { transform-origin: 0 0; transform: scaleX(0); animation: fill 1700ms cubic-bezier(0.65, 0, 0.35, 1) 500ms forwards; }
@keyframes fill { to { transform: scaleX(1); } }`;
  // the letters are one text line (so the font's own spacing holds); each is a tspan with its delay
  const word = `<text class="ser word" x="${W / 2}" y="62" text-anchor="middle" font-size="${size}" font-weight="600" fill="${t.ink}" letter-spacing="-0.5">${letters.map((c, i) => `<tspan class="l" style="animation-delay:${150 + i * 45}ms">${c === ' ' ? '&#160;' : esc(c)}</tspan>`).join('')}</text>`;
  const body = `${word}
<rect x="${W / 2 - 80}" y="84" width="160" height="1" fill="${t.line}" class="in" style="animation-delay:300ms"/>
<rect x="${W / 2 - 80}" y="84" width="160" height="1" fill="${t.ink}" class="hair"/>
<text class="ui in" x="${W / 2}" y="116" text-anchor="middle" font-size="15" fill="${t.ink2}" style="animation-delay:1100ms">Full-stack developer · Tashkent · founder of Knowza · building Inkwell</text>`;
  return svg(W, 136, css, body, `${name} — full-stack developer from Tashkent`);
}

/* the stats: the streak with its flame, and four numbers */
function stats(t) {
  rollId = 0;
  const W = 840;
  const H = 214;
  let css = `.fo { transform-box: fill-box; transform-origin: 50% 100%; animation: breathe 3.2s ease-in-out infinite; }
.fi { transform-box: fill-box; transform-origin: 50% 100%; animation: breathe2 2.6s ease-in-out infinite; }
@keyframes breathe { 50% { transform: scale(0.985, 1.03); } }
@keyframes breathe2 { 50% { transform: scale(0.96, 1.06); } }
.dot { opacity: 0; transform-box: fill-box; transform-origin: center; animation: pop 520ms cubic-bezier(0.34, 1.56, 0.64, 1) forwards; }
@keyframes pop { from { opacity: 1; transform: scale(0); } to { opacity: 1; transform: scale(1); } }\n`;
  const card = (x, y, w, h, d) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="16" fill="${t.card}" stroke="${t.line}" class="in" style="animation-delay:${d}ms"/>`;
  let body = card(0.5, 0.5, 300, H - 1, 0);
  // the flame (grey and still when the streak is broken)
  const on = N.streak > 0;
  body += `<defs>
<linearGradient id="fo" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ff3b00"/><stop offset=".55" stop-color="#ff7a00"/><stop offset="1" stop-color="#ffb300"/></linearGradient>
<linearGradient id="fi" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="#ffd23f"/><stop offset="1" stop-color="#fff4c2"/></linearGradient>
</defs>
<g class="in" style="animation-delay:150ms"><g transform="translate(26 38) scale(3.1)"${on ? '' : ' opacity="0.35"'}>
  <path class="${on ? 'fo' : ''}" d="M12 1.5c.8 4.6 6.8 7.4 6.8 15.2A6.8 6.8 0 0 1 5.2 16.7c0-3 1.4-5.3 3-6.7-.1 2.4.9 3.9 2.4 4.3-.4-4.9-.2-8.8 1.4-12.8z" fill="${on ? 'url(#fo)' : t.muted}"/>
  <path class="${on ? 'fi' : ''}" d="M12 13.2c1.9 1.9 3.3 3.6 3.3 5.9a3.3 3.3 0 0 1-6.6 0c0-1.8 1-3 2-4 .1 1.3.6 2 1.3 2.2-.1-1.5-.2-2.7 0-4.1z" fill="${on ? 'url(#fi)' : t.line}"/>
</g></g>`;
  const r = roll(N.streak, 134, 92, 54, t.ink, 300);
  css += r.css;
  body += r.svg;
  body += `<text class="ser in" x="134" y="120" font-size="16" font-weight="600" fill="${t.ink}" style="animation-delay:500ms">day streak</text>
<text class="ui in" x="134" y="142" font-size="12" fill="${t.muted}" style="animation-delay:650ms">longest: ${N.longest} days</text>`;
  // the last seven days as dots that pop in, filled where something was done
  lit.forEach((v, i) => {
    body += `<circle cx="${140 + i * 20}" cy="176" r="6.5" fill="${v ? '#ff7a00' : 'none'}" stroke="${v ? 'none' : t.line}" stroke-width="1.5" class="dot" style="animation-delay:${800 + i * 90}ms"/>`;
  });
  body += `<text class="ui in" x="26" y="180" font-size="11" fill="${t.muted}" style="animation-delay:800ms">last 7 days</text>`;
  // four tiles
  const tiles = [
    ['CONTRIBUTIONS', N.total, `last year · ${fmt(N.privateN)} in private repos`],
    ['ACTIVE DAYS', N.active, `of the last ${N.span}`],
    ['PUBLIC REPOS', N.repos, 'not counting forks'],
    ['STARS', N.stars, 'on public repos'],
  ];
  tiles.forEach(([k, v, s], i) => {
    const x = 316 + (i % 2) * 262;
    const y = i < 2 ? 0.5 : 110;
    body += card(x, y, 523 / 2 - 6, 103, 80 + i * 60);
    body += `<text class="ui in" x="${x + 20}" y="${y + 30}" font-size="11" font-weight="600" letter-spacing="0.8" fill="${t.muted}" style="animation-delay:${150 + i * 60}ms">${k}</text>`;
    const rr = roll(v, x + 20, y + 68, 32, t.ink, 300 + i * 120);
    css += rr.css;
    body += rr.svg;
    body += `<text class="ui in" x="${x + 20}" y="${y + 90}" font-size="12" fill="${t.ink2}" style="animation-delay:${400 + i * 60}ms">${esc(s)}</text>`;
  });
  return svg(W, H, css, body, `${N.streak}-day streak (longest ${N.longest}); ${N.total} contributions in the last year, ${N.active} active days, ${N.repos} public repos, ${N.stars} stars`);
}

/* the year: every day a square, coming in as a wave from the left */
function year(t) {
  const W = 840;
  const cell = 11;
  const gap = 3;
  const weeks = cal.weeks;
  const L = 34;
  const T = 44;
  const vals = days.map((d) => d.contributionCount).filter((v) => v > 0).sort((a, b) => a - b);
  const q = (p) => vals[Math.min(vals.length - 1, Math.floor(p * vals.length))] || 0;
  const cuts = [q(0.25), q(0.5), q(0.75)];
  const level = (v) => (v <= 0 ? 0 : v <= cuts[0] ? 1 : v <= cuts[1] ? 2 : v <= cuts[2] ? 3 : 4);
  const css = `.w { opacity: 0; transform-box: fill-box; transform-origin: center; animation: w 700ms ${EASE} forwards; }
@keyframes w { from { opacity: 0; transform: scale(0.4); } to { opacity: 1; transform: none; } }`;
  let body = `<text class="ser in" x="0" y="20" font-size="18" font-weight="600" fill="${t.ink}">${fmt(N.total)} contributions in the last year</text>
<text class="ui in" x="${W}" y="20" text-anchor="end" font-size="12" fill="${t.muted}" style="animation-delay:200ms">updated ${stamp}</text>`;
  let lastMonth = -1;
  let lastLabel = -9;
  weeks.forEach((w, c) => {
    const first = w.contributionDays[0];
    const m = new Date(first.date + 'T00:00').getMonth();
    if (m !== lastMonth && c - lastLabel >= 3 && c < weeks.length - 1) {
      body += `<text class="ui in" x="${L + c * (cell + gap)}" y="${T - 8}" font-size="10" fill="${t.muted}" style="animation-delay:${300 + c * 14}ms">${new Date(first.date + 'T00:00').toLocaleString('en-US', { month: 'short' })}</text>`;
      lastLabel = c;
    }
    lastMonth = m;
    body += `<g class="w" style="animation-delay:${300 + c * 14}ms">`;
    for (const d of w.contributionDays) {
      const r = new Date(d.date + 'T00:00').getDay();
      body += `<rect x="${L + c * (cell + gap)}" y="${T + r * (cell + gap)}" width="${cell}" height="${cell}" rx="2.5" fill="${t.cells[level(d.contributionCount)]}"><title>${d.date}: ${d.contributionCount}</title></rect>`;
    }
    body += `</g>`;
  });
  ['Mon', 'Wed', 'Fri'].forEach((s, i) => (body += `<text class="ui in" x="0" y="${T + (1 + i * 2) * (cell + gap) + cell - 2}" font-size="10" fill="${t.muted}">${s}</text>`));
  const legendY = T + 7 * (cell + gap) + 18;
  body += `<g class="in" style="animation-delay:1100ms"><text class="ui" x="${W - 118}" y="${legendY}" text-anchor="end" font-size="10" fill="${t.muted}">Less</text>`;
  t.cells.forEach((c, i) => (body += `<rect x="${W - 112 + i * 15}" y="${legendY - 10}" width="11" height="11" rx="2.5" fill="${c}"/>`));
  body += `<text class="ui" x="${W - 34}" y="${legendY}" font-size="10" fill="${t.muted}">More</text></g>`;
  return svg(W, legendY + 8, css, body, `${N.total} contributions in the last year`);
}

/* languages: one bar split by bytes of code in public repos, each part growing in turn */
function languages(t) {
  const W = 840;
  const shades = [t.ink, t.ink2, t.muted, t.cells[2], t.cells[1], t.line];
  const css = `.seg { transform-box: fill-box; transform-origin: 0 50%; transform: scaleX(0); animation: grow 900ms ${EASE} forwards; }
@keyframes grow { to { transform: scaleX(1); } }`;
  let body = `<text class="ser in" x="0" y="20" font-size="18" font-weight="600" fill="${t.ink}">Languages</text>
<text class="ui in" x="${W}" y="20" text-anchor="end" font-size="12" fill="${t.muted}" style="animation-delay:200ms">by size of code in public repos</text>`;
  let x = 0;
  shown.forEach(([name, v], i) => {
    const w = (v / langTotal) * W;
    body += `<rect x="${x.toFixed(1)}" y="38" width="${Math.max(2, w - 2).toFixed(1)}" height="12" rx="4" fill="${shades[i]}" class="seg" style="animation-delay:${300 + i * 160}ms"/>`;
    x += w;
  });
  shown.forEach(([name, v], i) => {
    const col = i % 3;
    const row = Math.floor(i / 3);
    const lx = col * 280;
    const ly = 82 + row * 26;
    body += `<g class="in" style="animation-delay:${500 + i * 120}ms"><circle cx="${lx + 5}" cy="${ly - 4}" r="5" fill="${shades[i]}"/><text class="ui" x="${lx + 18}" y="${ly}" font-size="13" fill="${t.ink}">${esc(name)}</text><text class="ui" x="${lx + 240}" y="${ly}" text-anchor="end" font-size="13" fill="${t.muted}">${((v / langTotal) * 100).toFixed(1)}%</text></g>`;
  });
  return svg(W, 82 + Math.ceil(shown.length / 3) * 26, css, body, `Languages: ${shown.map(([n, v]) => `${n} ${((v / langTotal) * 100).toFixed(1)}%`).join(', ')}`);
}

fs.mkdirSync(OUT, { recursive: true });
for (const [name, t] of Object.entries(THEMES)) {
  fs.writeFileSync(path.join(OUT, `header-${name}.svg`), header(t));
  fs.writeFileSync(path.join(OUT, `stats-${name}.svg`), stats(t));
  fs.writeFileSync(path.join(OUT, `year-${name}.svg`), year(t));
  fs.writeFileSync(path.join(OUT, `languages-${name}.svg`), languages(t));
}
console.log('built', JSON.stringify(N));
