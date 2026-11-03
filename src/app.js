import { INTERVALS, todayStr, newCard, knownCard, review, isDue, daysBetween } from './srs.js';
import * as store from './storage.js';
import { makeSwipeable } from './swipe.js';
import { streakDays, bestStreak, lastDays, forecast, accuracy } from './stats.js';

const view = document.getElementById('view');
const statsEl = document.getElementById('stats');
const dueBadge = document.getElementById('dueBadge');

let state = store.load();
let bank = [];            // built-in words
let index = new Map();    // id -> word (built-in + custom)
let tab = 'review';
let session = { reviewedToday: 0, learnIndex: 0, wordsMode: 'mine', wordsQuery: '' };
let undoTimer = null;

const LEVELS = ['A1', 'A2', 'B1', 'B2', 'C1'];
const LEVEL_INFO = { A1: 'Beginner', A2: 'Elementary', B1: 'Intermediate', B2: 'Upper intermediate', C1: 'Advanced' };

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function persist() { store.save(state); updateChrome(); }

function reindex() {
  index = new Map();
  for (const w of bank) index.set(w.id, w);
  for (const w of state.custom) index.set(w.id, w);
}
function allWords() { return [...index.values()]; }
function wordById(id) { return index.get(id); }

function logEvent(field, n = 1) {
  const d = todayStr();
  const e = state.log[d] || (state.log[d] = { reviews: 0, correct: 0, added: 0 });
  e[field] = Math.max(0, (e[field] || 0) + n);
}

function dueList() {
  const today = todayStr();
  return Object.entries(state.progress)
    .filter(([id, c]) => isDue(c, today) && index.has(id))
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[1].stage - b[1].stage))
    .map(([id]) => id);
}

function enabledLevels() { return state.settings.levels && state.settings.levels.length ? state.settings.levels : LEVELS; }
function levelRank(l) { const i = LEVELS.indexOf(l); return i < 0 ? 99 : i; }

function learnList() {
  const enabled = enabledLevels();
  const lvl = enabled.includes(state.settings.level) ? state.settings.level : 'all';
  const fresh = allWords()
    .filter((w) => !state.progress[w.id] && (enabled.includes(w.level) || !LEVELS.includes(w.level)) && (lvl === 'all' || w.level === lvl))
    .map((w, i) => [w, i])
    .sort((a, b) => levelRank(a[0].level) - levelRank(b[0].level) || a[1] - b[1]) // easiest enabled level first
    .map(([w]) => w);
  const skipped = new Set(state.skipped);
  return [...fresh.filter((w) => !skipped.has(w.id)), ...fresh.filter((w) => skipped.has(w.id))];
}

function updateChrome() {
  const due = dueList().length;
  dueBadge.hidden = due === 0;
  dueBadge.textContent = due > 99 ? '99+' : due;
  const total = Object.keys(state.progress).length;
  const streak = streakDays(state.log);
  statsEl.textContent = `${streak ? `🔥 ${streak} · ` : ''}${total} words`;
  document.querySelectorAll('.tabbar button').forEach((b) => b.classList.toggle('active', b.dataset.tab === tab));
}

// ---------- speech ----------
let svVoice = null;
function pickVoice() {
  const voices = speechSynthesis.getVoices();
  svVoice = voices.find((v) => v.lang && v.lang.toLowerCase().startsWith('sv')) || null;
}
if ('speechSynthesis' in window) { pickVoice(); speechSynthesis.onvoiceschanged = pickVoice; }
function speak(text) {
  if (!('speechSynthesis' in window)) return;
  speechSynthesis.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'sv-SE';
  if (svVoice) u.voice = svVoice;
  u.rate = 0.9;
  speechSynthesis.speak(u);
}

// ---------- undo ----------
// Remembers how things were before the last swipe, so a mis-swipe can be taken back.
function snapshot(id) {
  const d = todayStr();
  return {
    id,
    card: state.progress[id] ? { ...state.progress[id] } : null,
    skipped: [...state.skipped],
    log: state.log[d] ? { ...state.log[d] } : null,
    date: d,
    reviewedToday: session.reviewedToday,
    learnIndex: session.learnIndex,
  };
}

function offerUndo(snap, label) {
  hideUndo();
  const bar = document.createElement('div');
  bar.className = 'undo-bar';
  bar.innerHTML = `<span>${esc(label)}</span><button type="button">↶ Undo</button>`;
  bar.querySelector('button').onclick = () => undo(snap);
  document.body.appendChild(bar);
  session.undo = snap;
  undoTimer = setTimeout(hideUndo, 6000);
}

function hideUndo() {
  clearTimeout(undoTimer);
  document.querySelectorAll('.undo-bar').forEach((b) => b.remove());
  session.undo = null;
}

function undo(snap = session.undo) {
  if (!snap) return;
  if (snap.card) state.progress[snap.id] = snap.card; else delete state.progress[snap.id];
  state.skipped = snap.skipped;
  if (snap.log) state.log[snap.date] = snap.log; else delete state.log[snap.date];
  session.reviewedToday = snap.reviewedToday;
  session.learnIndex = snap.learnIndex;
  session.forceNext = snap.id; // show the same card again
  hideUndo();
  persist();
  go(tab);
}

// ---------- card markup ----------
function cardHTML(w, { revealed, mode, card, reverse = false }) {
  const leftLabel = mode === 'learn' ? 'Skip' : 'Again';
  const rightLabel = mode === 'learn' ? 'Add' : 'Knew it';
  const stageInfo = card ? `<span class="pill">Step ${card.stage + 1}/${INTERVALS.length}</span>` : '';
  const examples = (w.examples || []).map((ex) => `
      <li>
        <div class="ex-sv">${esc(ex.sv)} <button class="speak mini" data-say="${esc(ex.sv)}" aria-label="Listen">🔊</button></div>
        ${ex.en ? `<div class="ex-en">${esc(ex.en)}</div>` : ''}
      </li>`).join('');
  return `
    <div class="card ${revealed ? 'revealed' : ''} ${reverse ? 'reverse' : ''}">
      <div class="hint hint-left">${leftLabel}</div>
      <div class="hint hint-right">${rightLabel}</div>
      <div class="card-top">
        <span class="pill level">${esc(w.level || '')}</span>
        ${w.pos ? `<span class="pill">${esc(w.pos)}</span>` : ''}
        ${stageInfo}
        ${reverse ? '<span class="pill dir">EN → SV</span>' : ''}
      </div>
      ${reverse ? `<h1 class="word prompt-en">${esc(w.en)}</h1>` : ''}
      <div class="sv-part">
        <div class="word-row">
          <h1 class="word">${esc(w.sv)}</h1>
          <button class="speak" data-say="${esc(w.sv)}" aria-label="Listen">🔊</button>
        </div>
        ${w.forms ? `<div class="forms">${esc(w.forms)}</div>` : ''}
      </div>
      <div class="answer">
        ${reverse ? '' : `<div class="en">${esc(w.en)}</div>`}
        ${examples ? `<ul class="examples">${examples}</ul>` : ''}
      </div>
      <div class="tap-hint">${reverse ? 'Say the Swedish word, then tap to check' : 'Tap to show the translation'}</div>
    </div>`;
}

function wireCard(container, { onLeft, onRight, revealOnTap, onReveal }) {
  const el = container.querySelector('.card');
  el.querySelectorAll('.speak').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); speak(b.dataset.say); }));
  const reveal = () => {
    if (!revealOnTap || el.classList.contains('revealed')) return;
    el.classList.add('revealed');
    if (onReveal) onReveal();
  };
  const swipe = makeSwipeable(el, { onLeft, onRight, onTap: reveal });
  container.querySelector('[data-act="left"]')?.addEventListener('click', () => swipe.fly('left'));
  container.querySelector('[data-act="right"]')?.addEventListener('click', () => swipe.fly('right'));
  el.reveal = reveal;
  return el;
}

// ---------- Review tab ----------
function cardDirection(id) {
  const d = state.settings.direction || 'sv-en';
  if (d !== 'mixed') return d === 'en-sv';
  // stable per word and day, so re-rendering doesn't flip the card
  let h = 0;
  for (const ch of id + todayStr()) h = (h * 31 + ch.charCodeAt(0)) | 0;
  return (h & 1) === 1;
}

function renderReview() {
  let due = dueList();
  const limit = state.settings.dailyLimit;
  const remainingToday = Math.max(0, limit - session.reviewedToday);

  if (session.forceNext && state.progress[session.forceNext]) {
    due = [session.forceNext, ...due.filter((d) => d !== session.forceNext)];
  }
  session.forceNext = null;

  if (due.length === 0 || remainingToday === 0) {
    const nextDue = Object.values(state.progress).map((c) => c.due).sort()[0];
    const total = Object.keys(state.progress).length;
    const today = lastDays(state.log, 1)[0];
    view.innerHTML = `
      <section class="empty">
        <div class="big">${total === 0 ? '👋' : '🎉'}</div>
        <h2>${total === 0 ? 'Välkommen!' : remainingToday === 0 && due.length ? 'Daily limit reached' : 'Allt klart för idag!'}</h2>
        <p>${total === 0
          ? 'Start in the <b>Learn</b> tab: swipe right to add words to your vocabulary. They come back here tomorrow.'
          : remainingToday === 0 && due.length
            ? `${due.length} more due, but you've hit your daily limit of ${limit}. Change it in Settings if you want more.`
            : `${today.reviews ? `You reviewed <b>${today.reviews}</b> word${today.reviews === 1 ? '' : 's'} today. ` : ''}${nextDue ? `Next review: <b>${formatDue(nextDue)}</b>.` : ''}`}</p>
        <button class="btn primary" data-goto="learn">Learn new words</button>
      </section>`;
    view.querySelector('[data-goto]').onclick = () => go('learn');
    return;
  }

  const id = due[0];
  const w = wordById(id);
  const card = state.progress[id];
  const reverse = cardDirection(id);
  view.innerHTML = `
    <div class="progress-line">${Math.min(due.length, remainingToday)} left today</div>
    <div class="stack">${cardHTML(w, { revealed: false, mode: 'review', card, reverse })}</div>
    <div class="actions">
      <button class="btn bad" data-act="left">✗ Again</button>
      <button class="btn good" data-act="right">✓ Knew it</button>
    </div>
    <p class="legend">Swipe right → next step · swipe left → 2 steps back<span class="kbd-hint"> · keys: ← → space, U = undo</span></p>`;
  if (state.settings.autoSpeak && !reverse) speak(w.sv);
  const done = (knew) => {
    const snap = snapshot(id);
    state.progress[id] = review(state.progress[id], knew);
    session.reviewedToday++;
    logEvent('reviews');
    if (knew) logEvent('correct');
    persist();
    const c = state.progress[id];
    offerUndo(snap, knew
      ? (c.mastered ? `★ “${w.sv}” mastered` : `“${w.sv}” → ${formatDue(c.due)}`)
      : `“${w.sv}” again tomorrow`);
    renderReview();
  };
  wireCard(view, {
    onLeft: () => done(false), onRight: () => done(true), revealOnTap: true,
    onReveal: () => { if (state.settings.autoSpeak && reverse) speak(w.sv); },
  });
}

// ---------- Learn tab ----------
function levelToggles(selected) {
  const counts = {};
  allWords().forEach((w) => { counts[w.level] = (counts[w.level] || 0) + 1; });
  return `<div class="level-grid">${LEVELS.map((l) => `
      <button type="button" class="level-toggle ${selected.includes(l) ? 'on' : ''}" data-toggle-level="${l}" aria-pressed="${selected.includes(l)}">
        <b>${l}</b><span>${LEVEL_INFO[l]}</span><small>${counts[l] || 0} words</small>
      </button>`).join('')}</div>`;
}

function wireLevelToggles(root, selected, onChange) {
  root.querySelectorAll('[data-toggle-level]').forEach((b) => b.onclick = () => {
    const l = b.dataset.toggleLevel;
    const i = selected.indexOf(l);
    if (i >= 0) selected.splice(i, 1); else selected.push(l);
    selected.sort((a, c) => levelRank(a) - levelRank(c));
    onChange(selected);
  });
}

function renderLevelPicker() {
  const selected = [...(state.settings.levels || [])];
  const draw = () => {
    view.innerHTML = `
      <section class="panel picker">
        <h2>Välkommen till WordSv! 🇸🇪</h2>
        <p class="muted">Which levels do you want to learn? Tap to choose one or more. You can change this any time in Settings.</p>
        ${levelToggles(selected)}
        <button class="btn primary wide" id="startLearning" ${selected.length ? '' : 'disabled'}>Start learning</button>
      </section>`;
    wireLevelToggles(view, selected, draw);
    view.querySelector('#startLearning').onclick = () => {
      state.settings.levels = selected;
      state.settings.level = 'all';
      session.learnIndex = 0;
      persist();
      renderLearn();
    };
  };
  draw();
}

function addWord(w, known = false) {
  state.progress[w.id] = known ? knownCard() : newCard();
  state.skipped = state.skipped.filter((s) => s !== w.id);
  logEvent('added');
}

function renderLearn() {
  if (!state.settings.levels) return renderLevelPicker();
  let list = learnList();
  if (session.forceNext) {
    const w = list.find((x) => x.id === session.forceNext);
    if (w) list = [w, ...list.filter((x) => x !== w)];
    session.forceNext = null;
  }
  const enabled = enabledLevels();
  const lvl = enabled.includes(state.settings.level) ? state.settings.level : 'all';
  const levelChips = (enabled.length > 1 ? ['all', ...enabled] : enabled).map((l) =>
    `<button class="chip ${lvl === l || enabled.length === 1 ? 'on' : ''}" data-level="${l}">${l === 'all' ? 'All' : l}</button>`).join('');
  const addedToday = lastDays(state.log, 1)[0].added;

  if (list.length === 0) {
    view.innerHTML = `
      <div class="chips">${levelChips}</div>
      <section class="empty"><div class="big">📚</div><h2>No new words here</h2>
      <p>You've added every word${lvl === 'all' ? ' in your levels' : ' at ' + lvl}. Turn on more levels or add your own words in Settings.</p></section>`;
    wireLevelChips();
    return;
  }

  const w = list[0];
  view.innerHTML = `
    <div class="chips">${levelChips}<span class="muted small">${list.length} new · ${addedToday} added today</span></div>
    <div class="stack">${cardHTML(w, { revealed: true, mode: 'learn' })}</div>
    <div class="actions three">
      <button class="btn ghost" data-act="left">Skip</button>
      <button class="btn ghost" data-act="known" title="Already know it: first review in 2 weeks">✓ I know it</button>
      <button class="btn primary" data-act="right">+ Add</button>
    </div>
    <p class="legend">Swipe right to add · left to skip · “I know it” schedules the word in 2 weeks</p>`;
  if (state.settings.autoSpeak) speak(w.sv);
  wireLevelChips();
  const el = wireCard(view, {
    onRight: () => {
      const snap = snapshot(w.id);
      addWord(w);
      persist();
      offerUndo(snap, `“${w.sv}” added — first review tomorrow`);
      renderLearn();
    },
    onLeft: () => {
      const snap = snapshot(w.id);
      if (!state.skipped.includes(w.id)) state.skipped.push(w.id);
      persist();
      offerUndo(snap, `Skipped “${w.sv}”`);
      renderLearn();
    },
  });
  view.querySelector('[data-act="known"]').onclick = () => {
    const snap = snapshot(w.id);
    addWord(w, true);
    persist();
    el.style.transition = 'opacity .2s'; el.style.opacity = '0';
    offerUndo(snap, `“${w.sv}” marked as known — review in 2 weeks`);
    setTimeout(renderLearn, 180);
  };
}

function wireLevelChips() {
  view.querySelectorAll('[data-level]').forEach((b) => b.onclick = () => {
    state.settings.level = b.dataset.level;
    session.learnIndex = 0;
    persist();
    renderLearn();
  });
}

// ---------- My words tab ----------
function formatDue(due) {
  const d = daysBetween(todayStr(), due);
  if (d <= 0) return 'today';
  if (d === 1) return 'tomorrow';
  return `in ${d} days`;
}

const norm = (s) => s.toLowerCase().normalize('NFC');

function searchBank(q) {
  const n = norm(q.trim());
  if (n.length < 2) return [];
  const starts = [], contains = [];
  for (const w of index.values()) {
    const sv = norm(w.sv), en = norm(w.en);
    if (sv.startsWith(n)) starts.push(w);
    else if (sv.includes(n) || en.includes(n)) contains.push(w);
    if (starts.length >= 60) break;
  }
  return [...starts, ...contains].slice(0, 60);
}

function renderWords() {
  const mode = session.wordsMode;
  const q = session.wordsQuery;
  let rows = '';
  let empty = '';

  if (mode === 'mine') {
    const list = Object.entries(state.progress)
      .map(([id, c]) => ({ w: wordById(id), c }))
      .filter((r) => r.w)
      .filter((r) => !q || norm(r.w.sv + ' ' + r.w.en).includes(norm(q)))
      .sort((a, b) => a.w.sv.localeCompare(b.w.sv, 'sv'));
    if (!list.length) empty = q ? 'No matches in your words. Try “All words”.' : 'No words yet. Add some in Learn.';
    rows = list.map(({ w, c }) => `
        <li data-id="${esc(w.id)}">
          <div class="wl-main"><b>${esc(w.sv)}</b><span class="muted">${esc(w.en)}</span></div>
          <div class="wl-meta">
            <div class="steps" aria-label="Step ${c.stage + 1} of ${INTERVALS.length}">${INTERVALS.map((_, i) => `<i class="${i <= c.stage ? 'on' : ''}"></i>`).join('')}</div>
            <span class="small ${isDue(c) ? 'due' : 'muted'}">${c.mastered ? '★ mastered · ' : ''}${formatDue(c.due)}</span>
          </div>
        </li>`).join('');
  } else {
    const list = searchBank(q);
    if (!q || q.trim().length < 2) empty = `Search all ${index.size.toLocaleString('sv-SE')} words in Swedish or English.`;
    else if (!list.length) empty = 'No words found.';
    rows = list.map((w) => {
      const has = !!state.progress[w.id];
      return `
        <li data-id="${esc(w.id)}">
          <div class="wl-main"><b>${esc(w.sv)}</b><span class="muted">${esc(w.en)}</span></div>
          <div class="wl-meta">
            <span class="pill level small-pill">${esc(w.level || '')}</span>
            ${has ? '<span class="small muted">✓ in my words</span>' : `<button class="mini-add" data-add="${esc(w.id)}">+ Add</button>`}
          </div>
        </li>`;
    }).join('');
  }

  const total = Object.keys(state.progress).length;
  view.innerHTML = `
    <div class="segmented" role="tablist">
      <button role="tab" data-mode="mine" aria-selected="${mode === 'mine'}" class="${mode === 'mine' ? 'on' : ''}">My words (${total})</button>
      <button role="tab" data-mode="all" aria-selected="${mode === 'all'}" class="${mode === 'all' ? 'on' : ''}">All words</button>
    </div>
    <input class="search" type="search" placeholder="${mode === 'mine' ? 'Search your words…' : 'Search Swedish or English…'}" value="${esc(q)}" autocomplete="off" autocapitalize="off">
    ${empty ? `<p class="muted center">${empty}</p>` : ''}
    <ul class="wordlist">${rows}</ul>`;

  const input = view.querySelector('.search');
  input.oninput = () => {
    session.wordsQuery = input.value;
    renderWords();
    const i = view.querySelector('.search');
    i.focus();
    i.setSelectionRange(i.value.length, i.value.length);
  };
  view.querySelectorAll('[data-mode]').forEach((b) => b.onclick = () => { session.wordsMode = b.dataset.mode; renderWords(); });
  view.querySelectorAll('[data-add]').forEach((b) => b.onclick = (e) => {
    e.stopPropagation();
    const w = wordById(b.dataset.add);
    const snap = snapshot(w.id);
    addWord(w);
    persist();
    offerUndo(snap, `“${w.sv}” added — first review tomorrow`);
    renderWords();
  });
  view.querySelectorAll('.wordlist li').forEach((li) => li.onclick = () => openWord(li.dataset.id));
}

function openWord(id) {
  const w = wordById(id);
  const c = state.progress[id];
  const dlg = document.createElement('div');
  dlg.className = 'sheet-backdrop';
  dlg.innerHTML = `
    <div class="sheet" role="dialog" aria-label="${esc(w.sv)}">
      ${cardHTML(w, { revealed: true, mode: 'review', card: c }).replace('class="card revealed', 'class="card static revealed')}
      ${c ? `<p class="small muted center">Added ${c.added} · reviewed ${c.reviews}× · forgotten ${c.lapses}× · next ${formatDue(c.due)}</p>` : ''}
      <div class="actions">
        ${c ? '<button class="btn ghost" data-x="remove">Remove from my words</button>'
            : '<button class="btn ghost" data-x="known">✓ I know it</button><button class="btn primary" data-x="add">+ Add to my words</button>'}
        <button class="btn ${c ? 'primary' : 'ghost'}" data-x="close">Close</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelectorAll('.speak').forEach((b) => b.onclick = () => speak(b.dataset.say));
  const close = () => { dlg.remove(); document.removeEventListener('keydown', esc_); };
  const esc_ = (e) => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', esc_);
  dlg.onclick = (e) => { if (e.target === dlg) close(); };
  dlg.querySelector('[data-x="close"]').onclick = close;
  const addBtn = dlg.querySelector('[data-x="add"]');
  const knownBtn = dlg.querySelector('[data-x="known"]');
  const doAdd = (known) => { addWord(w, known); persist(); close(); toast(known ? `“${w.sv}” — review in 2 weeks` : `“${w.sv}” added`); go(tab); };
  if (addBtn) addBtn.onclick = () => doAdd(false);
  if (knownBtn) knownBtn.onclick = () => doAdd(true);
  const rm = dlg.querySelector('[data-x="remove"]');
  if (rm) rm.onclick = () => {
    if (!confirm(`Remove “${w.sv}”? Its progress will be lost.`)) return;
    delete state.progress[id];
    persist(); close(); go(tab);
  };
}

// ---------- Stats tab ----------
function shortDay(date) {
  const [y, m, d] = date.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-GB', { weekday: 'short' });
}

function barChart(items, { value, label, tip, title, caption }) {
  const max = Math.max(1, ...items.map(value));
  return `
    <figure class="chart">
      <figcaption><b>${title}</b>${caption ? `<span class="muted small">${caption}</span>` : ''}</figcaption>
      <div class="bars" style="--n:${items.length}">
        ${items.map((it) => {
          const v = value(it);
          return `<div class="bar-col" title="${esc(tip(it))}" tabindex="0" aria-label="${esc(tip(it))}">
            <div class="bar-val">${v || ''}</div>
            <div class="bar" style="height:${v ? Math.max(4, (v / max) * 100) : 0}%"></div>
            <div class="bar-label">${label(it)}</div>
          </div>`;
        }).join('')}
      </div>
    </figure>`;
}

function renderStats() {
  const cards = Object.values(state.progress);
  const streak = streakDays(state.log);
  const best = Math.max(streak, bestStreak(state.log));
  const days14 = lastDays(state.log, 14);
  const acc = accuracy(days14);
  const totalReviews = Object.values(state.log).reduce((s, e) => s + (e.reviews || 0), 0);
  const mastered = cards.filter((c) => c.mastered).length;
  const fc = forecast(cards, 7);

  const counts = {}, added = {};
  allWords().forEach((w) => {
    counts[w.level] = (counts[w.level] || 0) + 1;
    if (state.progress[w.id]) added[w.level] = (added[w.level] || 0) + 1;
  });

  // stage groups: learning (steps 1–4), getting there (5–8), strong (9–12)
  const groups = [
    { name: 'New (steps 1–4)', n: cards.filter((c) => c.stage <= 3).length },
    { name: 'Growing (steps 5–8)', n: cards.filter((c) => c.stage >= 4 && c.stage <= 7).length },
    { name: 'Strong (steps 9–12)', n: cards.filter((c) => c.stage >= 8).length },
  ];

  view.innerHTML = `
    <div class="tiles">
      <div class="tile"><span class="tile-label">Streak</span><b>${streak ? '🔥 ' : ''}${streak}</b><span class="tile-sub">day${streak === 1 ? '' : 's'} · best ${best}</span></div>
      <div class="tile"><span class="tile-label">My words</span><b>${cards.length}</b><span class="tile-sub">${mastered} mastered</span></div>
      <div class="tile"><span class="tile-label">Due today</span><b>${fc[0].count}</b><span class="tile-sub">${totalReviews} reviews total</span></div>
      <div class="tile"><span class="tile-label">Remembered</span><b>${acc === null ? '–' : acc + '%'}</b><span class="tile-sub">last 14 days</span></div>
    </div>

    <section class="panel">
      ${barChart(days14, {
        title: 'Reviews per day', caption: 'last 14 days',
        value: (d) => d.reviews,
        label: (d) => shortDay(d.date).slice(0, 2),
        tip: (d) => `${d.date}: ${d.reviews} reviews, ${d.correct} remembered, ${d.added} new words`,
      })}
    </section>

    <section class="panel">
      ${barChart(fc, {
        title: 'Coming up', caption: 'reviews due in the next 7 days',
        value: (d) => d.count,
        label: (d, i) => (d.date === todayStr() ? 'Today' : shortDay(d.date)),
        tip: (d) => `${d.date === todayStr() ? 'Today' : d.date}: ${d.count} due`,
      })}
    </section>

    <section class="panel">
      <h3>Where your words are</h3>
      ${groups.map((g) => `
        <div class="meter-row">
          <span>${g.name}</span><b>${g.n}</b>
          <div class="meter" role="img" aria-label="${g.n} of ${cards.length}"><i style="width:${cards.length ? (100 * g.n) / cards.length : 0}%"></i></div>
        </div>`).join('')}
    </section>

    <section class="panel">
      <h3>Progress by level</h3>
      ${LEVELS.map((l) => {
        const a = added[l] || 0, t = counts[l] || 0;
        return `
        <div class="meter-row">
          <span>${l} <small class="muted">${LEVEL_INFO[l]}</small></span><b>${a} / ${t}</b>
          <div class="meter" role="img" aria-label="${a} of ${t} ${l} words added"><i style="width:${t ? (100 * a) / t : 0}%"></i></div>
        </div>`;
      }).join('')}
    </section>`;
}

// ---------- Settings tab ----------
function renderSettings() {
  const s = state.settings;
  const dir = s.direction || 'sv-en';
  view.innerHTML = `
    <section class="panel">
      <h3>Practice</h3>
      <label class="row">Daily review limit
        <input type="number" id="limit" min="5" max="500" value="${s.dailyLimit}"></label>
      <label class="row">Read words aloud automatically
        <input type="checkbox" id="autospeak" ${s.autoSpeak ? 'checked' : ''}></label>
      <div class="row-block">
        <span>Review direction</span>
        <div class="segmented small-seg" id="direction">
          <button data-dir="sv-en" class="${dir === 'sv-en' ? 'on' : ''}">SV → EN</button>
          <button data-dir="en-sv" class="${dir === 'en-sv' ? 'on' : ''}">EN → SV</button>
          <button data-dir="mixed" class="${dir === 'mixed' ? 'on' : ''}">Mixed</button>
        </div>
        <p class="small muted">EN → SV shows the English meaning first: say the Swedish word, then tap to check.</p>
      </div>
      <p class="small muted">Sequence (days): ${INTERVALS.join(', ')}. Swipe left sends a word 2 steps back. “I know it” starts a word at step 6 (14 days).</p>
    </section>

    <section class="panel">
      <h3>Levels in Learn</h3>
      <p class="small muted">New words come from the levels you turn on, easiest first. Words you've already added keep coming up in Review.</p>
      <div id="levelSettings">${levelToggles(enabledLevels())}</div>
    </section>

    <section class="panel">
      <h3>Add your own word</h3>
      <form id="addForm" class="form">
        <input name="sv" placeholder="Swedish word *" required>
        <input name="en" placeholder="English translation *" required>
        <input name="forms" placeholder="Forms (e.g. en bil, bilen, bilar)">
        <select name="pos"><option value="">Word type</option><option>noun</option><option>verb</option><option>adjective</option><option>adverb</option><option>expression</option></select>
        <select name="level">${LEVELS.map((l) => `<option ${l === 'B2' ? 'selected' : ''}>${l}</option>`).join('')}</select>
        <input name="ex1" placeholder="Example sentence (Swedish)">
        <input name="ex1en" placeholder="Example translation (English)">
        <input name="ex2" placeholder="2nd example (Swedish)">
        <input name="ex2en" placeholder="2nd translation (English)">
        <label class="row small"><input type="checkbox" name="addNow" checked> Add straight to my words</label>
        <button class="btn primary">Save word</button>
      </form>
      ${state.custom.length ? `<p class="small muted">${state.custom.length} custom word(s) saved.</p>` : ''}
    </section>

    <section class="panel">
      <h3>Backup</h3>
      <p class="small muted">Your progress is saved on this device only. Export a backup now and then: on iPhone, choose “Save to Files”. Import it on another device to continue there.</p>
      <div class="actions">
        <button class="btn ghost" id="export">Export backup</button>
        <label class="btn ghost">Import backup<input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>
      <button class="btn danger" id="reset">Reset everything</button>
    </section>
    <p class="small muted center">WordSv · ${index.size.toLocaleString('sv-SE')} words in the bank<br>
      Word list: <a href="https://spraakbanken.gu.se/en/resources/kelly" target="_blank" rel="noopener">Swedish Kelly list</a> (Språkbanken Text, CC BY 4.0).
      Translations &amp; examples: <a href="https://folkets-lexikon.csc.kth.se/folkets/" target="_blank" rel="noopener">Folkets lexikon</a> (CC BY-SA 2.5).</p>`;

  const levelBox = view.querySelector('#levelSettings');
  const chosen = [...enabledLevels()];
  const redrawLevels = (sel) => {
    if (!sel.length) { sel.push(...enabledLevels()); toast('Keep at least one level on'); }
    state.settings.levels = [...sel];
    session.learnIndex = 0;
    persist();
    levelBox.innerHTML = levelToggles(sel);
    wireLevelToggles(levelBox, sel, redrawLevels);
  };
  wireLevelToggles(levelBox, chosen, redrawLevels);

  view.querySelectorAll('[data-dir]').forEach((b) => b.onclick = () => {
    s.direction = b.dataset.dir;
    persist();
    view.querySelectorAll('[data-dir]').forEach((x) => x.classList.toggle('on', x === b));
  });
  view.querySelector('#limit').onchange = (e) => { s.dailyLimit = Math.max(5, Number(e.target.value) || 50); persist(); };
  view.querySelector('#autospeak').onchange = (e) => { s.autoSpeak = e.target.checked; persist(); };
  view.querySelector('#export').onclick = async () => {
    const r = await store.exportFile(state);
    if (r === 'downloaded') toast('Backup downloaded');
  };
  view.querySelector('#import').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { state = await store.importFile(f); reindex(); persist(); toast('Backup restored'); renderSettings(); }
    catch (err) { alert('Import failed: ' + err.message); }
  };
  view.querySelector('#reset').onclick = () => {
    if (!confirm('Delete all progress and custom words on this device?')) return;
    store.reset(); state = store.load(); reindex(); persist(); toast('Reset done'); renderSettings();
  };
  view.querySelector('#addForm').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const sv = f.sv.trim(), en = f.en.trim();
    if (!sv || !en) return;
    const id = 'custom-' + sv.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36);
    const examples = [[f.ex1, f.ex1en], [f.ex2, f.ex2en]].filter(([a]) => a && a.trim()).map(([a, b]) => ({ sv: a.trim(), en: (b || '').trim() }));
    const w = { id, sv, en, forms: f.forms.trim(), pos: f.pos, level: f.level, examples };
    state.custom.push(w);
    reindex();
    if (f.addNow) addWord(w);
    persist();
    toast(`“${sv}” saved`);
    renderSettings();
  };
}

// ---------- shell ----------
function toast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.classList.add('out'), 1800);
  setTimeout(() => t.remove(), 2200);
}

function go(t) {
  tab = t;
  updateChrome();
  view.scrollTop = 0;
  ({ learn: renderLearn, review: renderReview, words: renderWords, stats: renderStats, settings: renderSettings })[t]();
}

document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => { if (b.dataset.tab !== tab) hideUndo(); go(b.dataset.tab); }));

// Keyboard shortcuts (web on a computer): ← again/skip, → knew it/add, space reveal, K I know it, U undo
document.addEventListener('keydown', (e) => {
  if (e.target.closest('input, select, textarea') || e.metaKey && e.key !== 'z' || e.altKey) return;
  if (document.querySelector('.sheet-backdrop')) return;
  const click = (sel) => { const b = view.querySelector(sel); if (b) { e.preventDefault(); b.click(); } };
  if (e.key === 'ArrowRight') click('[data-act="right"]');
  else if (e.key === 'ArrowLeft') click('[data-act="left"]');
  else if (e.key === 'k' || e.key === 'K') click('[data-act="known"]');
  else if (e.key === ' ' || e.key === 'Enter') {
    const card = view.querySelector('.card');
    if (card && card.reveal && !card.classList.contains('revealed')) { e.preventDefault(); card.reveal(); }
  } else if ((e.key === 'u' || e.key === 'U' || (e.key === 'z' && (e.metaKey || e.ctrlKey))) && session.undo) {
    e.preventDefault();
    undo();
  }
});

async function init() {
  try {
    const files = ['data/words.json', 'data/kelly.json'];
    const lists = await Promise.all(files.map((f) => fetch(f).then((r) => r.json()).catch(() => [])));
    const seen = new Set();
    bank = lists.flat().filter((w) => (seen.has(w.id) ? false : seen.add(w.id)));
  } catch {
    bank = [];
  }
  reindex();
  // Count reviews already done today (so the daily limit survives reloads)
  const today = todayStr();
  session.reviewedToday = Object.values(state.progress).filter((c) => c.last === today).length;
  go(Object.keys(state.progress).length ? 'review' : 'learn');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
