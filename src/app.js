import { INTERVALS, LAST_STAGE, todayStr, newCard, review, isDue, daysBetween } from './srs.js';
import * as store from './storage.js';
import { makeSwipeable } from './swipe.js';

const view = document.getElementById('view');
const statsEl = document.getElementById('stats');
const dueBadge = document.getElementById('dueBadge');

let state = store.load();
let bank = [];            // built-in words + custom words
let tab = 'review';
let session = { reviewedToday: 0, learnIndex: 0 };

const esc = (s = '') => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

function persist() { store.save(state); updateChrome(); }

function allWords() { return [...bank, ...state.custom]; }
function wordById(id) { return allWords().find((w) => w.id === id); }

function dueList() {
  const today = todayStr();
  return Object.entries(state.progress)
    .filter(([id, c]) => isDue(c, today) && wordById(id))
    .sort((a, b) => (a[1].due < b[1].due ? -1 : a[1].due > b[1].due ? 1 : a[1].stage - b[1].stage))
    .map(([id]) => id);
}

function learnList() {
  const lvl = state.settings.level;
  const fresh = allWords().filter((w) => !state.progress[w.id] && (lvl === 'all' || w.level === lvl));
  const skipped = new Set(state.skipped);
  // Not-yet-skipped words first, skipped ones after
  return [...fresh.filter((w) => !skipped.has(w.id)), ...fresh.filter((w) => skipped.has(w.id))];
}

function updateChrome() {
  const due = dueList().length;
  dueBadge.hidden = due === 0;
  dueBadge.textContent = due > 99 ? '99+' : due;
  const total = Object.keys(state.progress).length;
  const mastered = Object.values(state.progress).filter((c) => c.mastered).length;
  statsEl.textContent = `${total} words · ${mastered} mastered`;
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

// ---------- card markup ----------
function cardHTML(w, { revealed, mode, card }) {
  const leftLabel = mode === 'learn' ? 'Skip' : 'Again';
  const rightLabel = mode === 'learn' ? 'Add' : 'Knew it';
  const stageInfo = card
    ? `<span class="pill">Step ${card.stage + 1}/${INTERVALS.length}</span>`
    : '';
  const examples = (w.examples || []).map((ex) => `
      <li>
        <div class="ex-sv">${esc(ex.sv)} <button class="speak mini" data-say="${esc(ex.sv)}" aria-label="Listen">🔊</button></div>
        ${ex.en ? `<div class="ex-en">${esc(ex.en)}</div>` : ''}
      </li>`).join('');
  return `
    <div class="card ${revealed ? 'revealed' : ''}">
      <div class="hint hint-left">${leftLabel}</div>
      <div class="hint hint-right">${rightLabel}</div>
      <div class="card-top">
        <span class="pill level">${esc(w.level || '')}</span>
        ${w.pos ? `<span class="pill">${esc(w.pos)}</span>` : ''}
        ${stageInfo}
      </div>
      <div class="word-row">
        <h1 class="word">${esc(w.sv)}</h1>
        <button class="speak" data-say="${esc(w.sv)}" aria-label="Listen">🔊</button>
      </div>
      ${w.forms ? `<div class="forms">${esc(w.forms)}</div>` : ''}
      <div class="answer">
        <div class="en">${esc(w.en)}</div>
        ${examples ? `<ul class="examples">${examples}</ul>` : ''}
      </div>
      <div class="tap-hint">Tap to show the translation</div>
    </div>`;
}

function wireCard(container, { onLeft, onRight, revealOnTap }) {
  const el = container.querySelector('.card');
  el.querySelectorAll('.speak').forEach((b) => b.addEventListener('click', (e) => { e.stopPropagation(); speak(b.dataset.say); }));
  const swipe = makeSwipeable(el, {
    onLeft, onRight,
    onTap: () => { if (revealOnTap) el.classList.add('revealed'); },
  });
  container.querySelector('[data-act="left"]')?.addEventListener('click', () => swipe.fly('left'));
  container.querySelector('[data-act="right"]')?.addEventListener('click', () => swipe.fly('right'));
  return el;
}

// ---------- Review tab ----------
function renderReview() {
  const due = dueList();
  const limit = state.settings.dailyLimit;
  const remainingToday = Math.max(0, limit - session.reviewedToday);

  if (due.length === 0 || remainingToday === 0) {
    const nextDue = Object.values(state.progress).map((c) => c.due).sort()[0];
    const total = Object.keys(state.progress).length;
    view.innerHTML = `
      <section class="empty">
        <div class="big">${total === 0 ? '👋' : '🎉'}</div>
        <h2>${total === 0 ? 'Välkommen!' : remainingToday === 0 && due.length ? 'Daily limit reached' : 'Allt klart för idag!'}</h2>
        <p>${total === 0
          ? 'Start in the <b>Learn</b> tab: swipe right to add words to your vocabulary. They come back here tomorrow.'
          : remainingToday === 0 && due.length
            ? `${due.length} more due, but you've hit your daily limit of ${limit}. Change it in Settings if you want more.`
            : nextDue ? `Next review: <b>${formatDue(nextDue)}</b>.` : ''}</p>
        <button class="btn primary" data-goto="learn">Learn new words</button>
      </section>`;
    view.querySelector('[data-goto]').onclick = () => go('learn');
    return;
  }

  const id = due[0];
  const w = wordById(id);
  const card = state.progress[id];
  view.innerHTML = `
    <div class="progress-line">${Math.min(due.length, remainingToday)} left today</div>
    <div class="stack">${cardHTML(w, { revealed: false, mode: 'review', card })}</div>
    <div class="actions">
      <button class="btn bad" data-act="left">✗ Again</button>
      <button class="btn good" data-act="right">✓ Knew it</button>
    </div>
    <p class="legend">Swipe right → next step in the sequence · swipe left → ${2} steps back</p>`;
  if (state.settings.autoSpeak) speak(w.sv);
  const done = (knew) => {
    state.progress[id] = review(state.progress[id], knew);
    session.reviewedToday++;
    persist();
    renderReview();
  };
  wireCard(view, { onLeft: () => done(false), onRight: () => done(true), revealOnTap: true });
}

// ---------- Learn tab ----------
function renderLearn() {
  const list = learnList();
  const lvl = state.settings.level;
  const levelChips = ['all', 'B2', 'C1'].map((l) =>
    `<button class="chip ${lvl === l ? 'on' : ''}" data-level="${l}">${l === 'all' ? 'All' : l}</button>`).join('');
  const addedToday = Object.values(state.progress).filter((c) => c.added === todayStr()).length;

  if (list.length === 0) {
    view.innerHTML = `
      <div class="chips">${levelChips}</div>
      <section class="empty"><div class="big">📚</div><h2>No new words here</h2>
      <p>You've added every word${lvl === 'all' ? '' : ' at ' + lvl}. Add your own in Settings.</p></section>`;
    wireLevelChips();
    return;
  }

  const idx = session.learnIndex % list.length;
  const w = list[idx];
  view.innerHTML = `
    <div class="chips">${levelChips}<span class="muted small">${list.length} new · ${addedToday} added today</span></div>
    <div class="stack">${cardHTML(w, { revealed: true, mode: 'learn' })}</div>
    <div class="actions">
      <button class="btn ghost" data-act="left">Skip</button>
      <button class="btn primary" data-act="right">+ Add to my words</button>
    </div>
    <p class="legend">Swipe right to add · swipe left to skip</p>`;
  if (state.settings.autoSpeak) speak(w.sv);
  wireLevelChips();
  wireCard(view, {
    onRight: () => {
      state.progress[w.id] = newCard();
      state.skipped = state.skipped.filter((s) => s !== w.id);
      persist();
      toast(`“${w.sv}” added — first review tomorrow`);
      renderLearn();
    },
    onLeft: () => {
      if (!state.skipped.includes(w.id)) state.skipped.push(w.id);
      persist();
      renderLearn();
    },
  });
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

function renderWords(filter = '') {
  const rows = Object.entries(state.progress)
    .map(([id, c]) => ({ w: wordById(id), c }))
    .filter((r) => r.w)
    .filter((r) => !filter || (r.w.sv + ' ' + r.w.en).toLowerCase().includes(filter.toLowerCase()))
    .sort((a, b) => a.w.sv.localeCompare(b.w.sv, 'sv'));

  view.innerHTML = `
    <input class="search" type="search" placeholder="Search your words…" value="${esc(filter)}">
    ${rows.length === 0 ? '<p class="muted center">No words yet. Add some in Learn.</p>' : ''}
    <ul class="wordlist">
      ${rows.map(({ w, c }) => `
        <li data-id="${esc(w.id)}">
          <div class="wl-main"><b>${esc(w.sv)}</b><span class="muted">${esc(w.en)}</span></div>
          <div class="wl-meta">
            <div class="steps">${INTERVALS.map((_, i) => `<i class="${i <= c.stage ? 'on' : ''}"></i>`).join('')}</div>
            <span class="small ${isDue(c) ? 'due' : 'muted'}">${c.mastered ? '★ mastered · ' : ''}${formatDue(c.due)}</span>
          </div>
        </li>`).join('')}
    </ul>`;
  const input = view.querySelector('.search');
  input.oninput = () => { renderWords(input.value); const i = view.querySelector('.search'); i.focus(); i.setSelectionRange(i.value.length, i.value.length); };
  view.querySelectorAll('.wordlist li').forEach((li) => li.onclick = () => openWord(li.dataset.id));
}

function openWord(id) {
  const w = wordById(id);
  const c = state.progress[id];
  const dlg = document.createElement('div');
  dlg.className = 'sheet-backdrop';
  dlg.innerHTML = `
    <div class="sheet">
      ${cardHTML(w, { revealed: true, mode: 'review', card: c }).replace('class="card revealed"', 'class="card revealed static"')}
      <p class="small muted center">Added ${c.added} · reviewed ${c.reviews}× · forgotten ${c.lapses}× · next ${formatDue(c.due)}</p>
      <div class="actions">
        <button class="btn ghost" data-x="remove">Remove from my words</button>
        <button class="btn primary" data-x="close">Close</button>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  dlg.querySelectorAll('.speak').forEach((b) => b.onclick = () => speak(b.dataset.say));
  const close = () => dlg.remove();
  dlg.onclick = (e) => { if (e.target === dlg) close(); };
  dlg.querySelector('[data-x="close"]').onclick = close;
  dlg.querySelector('[data-x="remove"]').onclick = () => {
    if (!confirm(`Remove “${w.sv}”? Its progress will be lost.`)) return;
    delete state.progress[id];
    persist(); close(); renderWords();
  };
}

// ---------- Settings tab ----------
function renderSettings() {
  const s = state.settings;
  view.innerHTML = `
    <section class="panel">
      <h3>Practice</h3>
      <label class="row">Daily review limit
        <input type="number" id="limit" min="5" max="500" value="${s.dailyLimit}"></label>
      <label class="row">Read words aloud automatically
        <input type="checkbox" id="autospeak" ${s.autoSpeak ? 'checked' : ''}></label>
      <p class="small muted">Sequence (days): ${INTERVALS.join(', ')}. Swipe left sends a word 2 steps back.</p>
    </section>

    <section class="panel">
      <h3>Add your own word</h3>
      <form id="addForm" class="form">
        <input name="sv" placeholder="Swedish word *" required>
        <input name="en" placeholder="English translation *" required>
        <input name="forms" placeholder="Forms (e.g. en bil, bilen, bilar)">
        <select name="pos"><option value="">Word type</option><option>noun</option><option>verb</option><option>adjective</option><option>adverb</option><option>expression</option></select>
        <select name="level"><option>B2</option><option>C1</option></select>
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
      <p class="small muted">Your progress is saved on this device only. Export a backup now and then (save it to Files or iCloud Drive).</p>
      <div class="actions">
        <button class="btn ghost" id="export">Export backup</button>
        <label class="btn ghost">Import backup<input type="file" id="import" accept="application/json,.json" hidden></label>
      </div>
      <button class="btn danger" id="reset">Reset everything</button>
    </section>
    <p class="small muted center">WordSv · ${allWords().length} words in the bank<br>
      Word list: <a href="https://spraakbanken.gu.se/en/resources/kelly" target="_blank" rel="noopener">Swedish Kelly list</a> (Språkbanken Text, CC BY 4.0).
      Translations &amp; examples: <a href="https://folkets-lexikon.csc.kth.se/folkets/" target="_blank" rel="noopener">Folkets lexikon</a> (CC BY-SA 2.5).</p>`;

  view.querySelector('#limit').onchange = (e) => { s.dailyLimit = Math.max(5, Number(e.target.value) || 50); persist(); };
  view.querySelector('#autospeak').onchange = (e) => { s.autoSpeak = e.target.checked; persist(); };
  view.querySelector('#export').onclick = () => store.exportFile(state);
  view.querySelector('#import').onchange = async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { state = await store.importFile(f); persist(); toast('Backup restored'); renderSettings(); }
    catch (err) { alert('Import failed: ' + err.message); }
  };
  view.querySelector('#reset').onclick = () => {
    if (!confirm('Delete all progress and custom words on this device?')) return;
    store.reset(); state = store.load(); persist(); toast('Reset done'); renderSettings();
  };
  view.querySelector('#addForm').onsubmit = (e) => {
    e.preventDefault();
    const f = Object.fromEntries(new FormData(e.target));
    const sv = f.sv.trim(), en = f.en.trim();
    if (!sv || !en) return;
    const id = 'custom-' + sv.toLowerCase().replace(/\s+/g, '-') + '-' + Date.now().toString(36);
    const examples = [[f.ex1, f.ex1en], [f.ex2, f.ex2en]].filter(([a]) => a && a.trim()).map(([a, b]) => ({ sv: a.trim(), en: (b || '').trim() }));
    state.custom.push({ id, sv, en, forms: f.forms.trim(), pos: f.pos, level: f.level, examples });
    if (f.addNow) state.progress[id] = newCard();
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
  ({ learn: renderLearn, review: renderReview, words: () => renderWords(), settings: renderSettings })[t]();
}

document.querySelectorAll('.tabbar button').forEach((b) => b.addEventListener('click', () => go(b.dataset.tab)));

async function init() {
  try {
    const files = ['data/words.json', 'data/kelly.json'];
    const lists = await Promise.all(files.map((f) => fetch(f).then((r) => r.json()).catch(() => [])));
    const seen = new Set();
    bank = lists.flat().filter((w) => (seen.has(w.id) ? false : seen.add(w.id)));
  } catch {
    bank = [];
  }
  // Count reviews already done today (so the daily limit survives reloads)
  const today = todayStr();
  session.reviewedToday = Object.values(state.progress).filter((c) => c.last === today).length;
  go(Object.keys(state.progress).length ? 'review' : 'learn');
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
