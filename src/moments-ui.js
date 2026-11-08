// Moments: share the words you learn as 24-hour, Instagram-style text stories with friends.
import { closeOverlay } from './motion.js';
import { idbGet, idbSet, idbDel } from './idb.js';
import * as social from './social.js';
import { loadImage, renderStoryImage, isStoryPhoto } from './photo.js';

export const THEMES = {
  fika:      { name: 'Fika',      bg: 'linear-gradient(160deg,#f6e7cf 0%,#d8b083 100%)', fg: '#3b2414', accent: '#8a4b20' },
  midsommar: { name: 'Midsommar', bg: 'linear-gradient(160deg,#fff6bf 0%,#a6dd8f 100%)', fg: '#1e3a12', accent: '#2f7d1f' },
  norrsken:  { name: 'Norrsken',  bg: 'linear-gradient(165deg,#081a33 0%,#14655f 55%,#5b3596 100%)', fg: '#ffffff', accent: '#8ff0c8' },
  hav:       { name: 'Hav',       bg: 'linear-gradient(160deg,#0a77b8 0%,#073a63 100%)', fg: '#ffffff', accent: '#fecc02' },
  lingon:    { name: 'Lingon',    bg: 'linear-gradient(160deg,#d0223a 0%,#6d0a1b 100%)', fg: '#ffffff', accent: '#ffd6dc' },
  sno:       { name: 'Snö',       bg: 'linear-gradient(160deg,#ffffff 0%,#d6e6f5 100%)', fg: '#13202b', accent: '#006aa7' },
  flagga:    { name: 'Flagga',    bg: 'linear-gradient(90deg,transparent 26%,#fecc02 26% 38%,transparent 38%),linear-gradient(0deg,#006aa7 44%,#fecc02 44% 56%,#006aa7 56%)', fg: '#ffffff', accent: '#fecc02', panel: true },
  natt:      { name: 'Natt',      bg: 'linear-gradient(160deg,#1b2735 0%,#090a0f 100%)', fg: '#f5f1e6', accent: '#fecc02' },
};
export const FONTS = {
  sans: { name: 'Modern', css: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif", weight: 800 },
  serif: { name: 'Klassisk', css: "'Iowan Old Style', 'Palatino Linotype', Georgia, serif", weight: 700 },
  hand: { name: 'Handskrift', css: "'Bradley Hand', 'Segoe Print', 'Comic Sans MS', 'Chalkboard SE', cursive", weight: 700 },
  mono: { name: 'Maskin', css: "'SF Mono', Menlo, Consolas, monospace", weight: 700 },
  pop: { name: 'Pop', css: "'Arial Black', 'Helvetica Neue', Impact, sans-serif", weight: 900, upper: true },
};
const EMOJIS = ['', '☕', '💡', '😂', '❤️', '🤯', '🎉', '📚', '🗣️', '🎧', '🍓', '❄️', '☀️', '🌧️', '🚆', '💼'];
const REACTIONS = ['❤️', '🔥', '😂', '🤯', '👏', '🇸🇪'];
const STORY_MS = 7000;
const SCRIMS = { dark: 'Dark box', light: 'Light box', clean: 'Shadow only' };

let ctx = null;          // app helpers
let data = { profile: undefined, groups: [], friends: null, board: [], loaded: false, uid: null, error: null };

export function initMoments(appCtx) { ctx = appCtx; }

const esc = (s) => ctx.esc(s);

function ago(ts) {
  const m = Math.round((Date.now() - ts) / 60000);
  if (m < 1) return 'now';
  if (m < 60) return `${m}m`;
  return `${Math.round(m / 60)}h`;
}

function errText(e) {
  if (!e) return 'Something went wrong.';
  if (e.code && String(e.code).includes('permission')) return 'Not allowed by the server. (Have the latest database rules been published?)';
  if (e.code && String(e.code).includes('unavailable')) return 'You seem to be offline.';
  if (e.code === 'timeout') return navigator.onLine === false ? 'You seem to be offline.' : 'The server is not answering right now. Check your connection and try again.';
  return e.message || 'Something went wrong.';
}

// ---------- story card (used in preview, viewer and composer) ----------
export function storyCardHTML(m, { small = false } = {}) {
  const t = THEMES[m.theme] || THEMES.fika;
  const f = FONTS[m.font] || FONTS.sans;
  const photo = isStoryPhoto(m.photo);
  const scrim = SCRIMS[m.scrim] ? m.scrim : 'dark';
  const len = (m.word || '').length;
  const wordSize = photo ? (len > 22 ? 28 : len > 14 ? 36 : len > 9 ? 44 : 52) : (len > 22 ? 34 : len > 14 ? 44 : len > 9 ? 54 : 64);
  const colors = photo
    ? (scrim === 'light' ? '--fg:#13202b;--accent:#006aa7' : '--fg:#ffffff;--accent:#fecc02')
    : `--sbg:${t.bg};--fg:${t.fg};--accent:${t.accent}`;
  const hasText = m.word || m.translation || m.context || m.note || m.emoji;
  return `
    <div class="story-card ${!photo && t.panel ? 'panelled' : ''} ${photo ? `has-photo scrim-${scrim}` : ''} ${small ? 'small' : ''}" style="${colors};--font:${f.css};--weight:${f.weight};text-align:${m.align === 'left' ? 'left' : 'center'}">
      ${photo ? `<img class="story-photo" src="${esc(m.photo)}" alt="${esc(m.word ? `Photo: ${m.word}` : 'Photo')}">` : ''}
      ${photo && !hasText ? '' : `<div class="story-inner">
        ${m.emoji ? `<div class="story-emoji">${esc(m.emoji)}</div>` : ''}
        ${m.level && m.word ? `<div class="story-level">${esc(m.level)}</div>` : ''}
        ${m.word || !photo ? `<div class="story-word ${f.upper ? 'upper' : ''}" style="font-size:${wordSize}px">${esc(m.word || 'ord')}</div>` : ''}
        ${m.translation ? `<div class="story-translation">${esc(m.translation)}</div>` : ''}
        ${m.context ? `<div class="story-context">“${esc(m.context)}”${m.contextEn ? `<span>${esc(m.contextEn)}</span>` : ''}</div>` : ''}
        ${m.note ? `<div class="story-note">${esc(m.note)}</div>` : ''}
        ${m.username ? `<div class="story-by">@${esc(m.username)}</div>` : ''}
      </div>`}
    </div>`;
}

// ---------- the Moments tab ----------
// The tab shows what it has straight away (from memory, or from the copy saved on this device)
// and refreshes in the background. Every network call has a time limit, so it can never hang on
// "Loading" forever; if loading fails you get the reason and a "Try again" button.
const STALE_MS = 45000;
let inflight = null;     // the running refresh, shared by everyone who asks for one
let lastAttempt = 0;
let cacheTried = false;
const viewEl = () => document.getElementById('view');
const onMomentsTab = () => ctx.currentTab() === 'moments';
const cacheKey = (uid) => 'moments:' + uid;

function skeleton(text) {
  return `<div class="m-skel" aria-busy="true">
    <div class="me-line"><span class="skel circle"></span><div><span class="skel line w40"></span><span class="skel line w25"></span></div></div>
    <div class="rings">${'<span class="skel ring-skel"></span>'.repeat(4)}</div>
    <span class="skel block"></span>
    <span class="skel block tall"></span>
    <p class="small muted center">${text}</p>
  </div>`;
}

function dropExpired(groups) {
  const now = Date.now();
  return (groups || []).map((g) => ({ ...g, items: g.items.filter((m) => m.expiresAt > now) })).filter((g) => g.items.length);
}

function saveCache() {
  if (!data.uid || !data.loaded) return;
  idbSet(cacheKey(data.uid), { profile: data.profile, groups: data.groups, friends: data.friends, board: data.board, savedAt: Date.now() });
}

export async function renderMoments(view) {
  const st = ctx.status();
  if (!st.signedIn) {
    if (st.restoring) { view.innerHTML = skeleton('Signing you in…'); return; }
    view.innerHTML = `
      <section class="moments-hero">
        <div class="hero-cards">
          ${storyCardHTML({ word: 'fika', translation: 'coffee break', context: 'Ska vi ta en fika?', theme: 'fika', font: 'hand', emoji: '☕' }, { small: true })}
          ${storyCardHTML({ word: 'lagom', translation: 'just right', context: 'Lagom är bäst.', theme: 'norrsken', font: 'serif', emoji: '✨' }, { small: true })}
        </div>
        <h2>Shared moments</h2>
        <p class="muted">Share the words you learn as styled stories that your friends see for 24 hours. React, compete on the weekly leaderboard and add your friends' words with one tap.</p>
        <button class="btn primary wide google-btn" id="momentsSignIn">${ctx.googleIcon()} Sign in with Google to start</button>
      </section>`;
    view.querySelector('#momentsSignIn').onclick = () => ctx.signIn();
    return;
  }
  const me = ctx.uid();
  if (data.uid && data.uid !== me) resetMoments();
  if (!data.loaded && !cacheTried) {
    cacheTried = true;
    view.innerHTML = skeleton('Loading moments…');
    const cached = await idbGet(cacheKey(me));
    if (cached && !data.loaded && ctx.uid() === me) {
      Object.assign(data, cached, { uid: me, groups: dropExpired(cached.groups), loaded: true });
    }
    if (!onMomentsTab()) { if (!data.loaded) refresh(); return; }
  }
  if (!data.loaded) {
    if (data.error && !inflight) {
      view.innerHTML = `
        <section class="empty">
          <div class="big">📡</div>
          <h2>Couldn't load moments</h2>
          <p>${esc(data.error)}</p>
          <button class="btn primary" id="retryMoments">Try again</button>
        </section>`;
      view.querySelector('#retryMoments').onclick = () => { data.error = null; renderMoments(view); refresh(); };
      return;
    }
    view.innerHTML = skeleton('Loading moments…');
    refresh();
    return;
  }
  if (!data.profile) {
    renderUsernameSetup(view);
  } else {
    draw(view);
  }
  if (Date.now() - lastAttempt > STALE_MS) refresh();
}

// Redraw the tab with new data, unless the person is in the middle of typing there.
function redraw() {
  const v = viewEl();
  if (!v || !onMomentsTab()) return;
  const a = document.activeElement;
  if (a && v.contains(a) && a.matches('input, textarea')) return;
  if (v.querySelector('#unameForm') && !data.profile) return;
  if (v.querySelector('.add-friend input')?.value) return;
  renderMoments(v);
}

function setSpinning(on) {
  const b = document.getElementById('refreshMoments');
  if (b) b.classList.toggle('spinning', on);
}

export function refresh() {
  if (!ctx.status().signedIn) return Promise.resolve();
  if (inflight) return inflight;
  lastAttempt = Date.now();
  setSpinning(true);
  const me = ctx.uid();
  inflight = (async () => {
    let changed = false;
    try {
      const [profile, groups, friends] = await Promise.all([social.myProfile(true), social.loadMoments(), social.loadFriendships(true)]);
      if (ctx.uid() !== me) return;
      Object.assign(data, { uid: me, profile, groups, friends, loaded: true, error: null });
      ctx.onSocial({ friends: friends.friends.length, incoming: friends.incoming.length, unseen: unseenCount() });
      saveCache();
      changed = true;
      if (profile) {
        ctx.pushStats().catch(() => {});
        social.leaderboard().then((board) => {
          if (ctx.uid() !== me) return;
          data.board = board; saveCache(); redraw();
        }).catch(() => {});
      }
    } catch (e) {
      data.error = errText(e);
      changed = true;
    } finally {
      inflight = null;
      setSpinning(false);
    }
    if (changed) redraw();
  })();
  return inflight;
}

function myUid() { return ctx.uid(); }

function ringFace(g) {
  const withPhoto = [...g.items].reverse().find((m) => isStoryPhoto(m.photo));
  return withPhoto
    ? `<span class="ring-avatar photo"><img src="${esc(withPhoto.photo)}" alt=""><b>${esc(g.avatar || '🙂')}</b></span>`
    : `<span class="ring-avatar">${esc(g.avatar || '🙂')}</span>`;
}

function unseenCount() {
  const me = myUid();
  return data.groups.filter((g) => !g.mine && g.items.some((m) => !(m.seen || {})[me])).length;
}

function draw(view) {
  const me = myUid();
  const p = data.profile;
  const mine = data.groups.find((g) => g.mine);
  const others = data.groups.filter((g) => !g.mine);
  const fr = data.friends || { friends: [], incoming: [], outgoing: [] };
  const wotd = ctx.wordOfDay();

  const ring = (g) => {
    const unseen = !g.mine && g.items.some((m) => !(m.seen || {})[me]);
    return `<button class="ring-item" data-author="${esc(g.author)}">
      <span class="ring ${unseen ? 'unseen' : g.mine ? 'mine' : 'seen'}">${ringFace(g)}</span>
      <span class="ring-name">${g.mine ? 'You' : '@' + esc(g.username)}</span>
    </button>`;
  };

  view.innerHTML = `
    <div class="me-line">
      <span class="avatar-emoji">${esc(p.avatar || '🙂')}</span>
      <div><b>@${esc(p.username)}</b><span class="small muted">${fr.friends.length} friend${fr.friends.length === 1 ? '' : 's'}</span></div>
      <button class="link-btn" id="editProfile">Edit</button>
      <button class="icon-btn" id="refreshMoments" aria-label="Refresh">⟳</button>
    </div>
    ${data.error ? `<p class="small error">${esc(data.error)}</p>` : ''}

    <div class="rings" role="list">
      <button class="ring-item" id="${mine ? 'viewMine' : 'newMoment'}">
        <span class="ring ${mine ? 'mine' : 'add'}"><span class="ring-avatar">${esc(p.avatar || '🙂')}</span>${mine ? '' : '<b class="ring-plus">+</b>'}</span>
        <span class="ring-name">${mine ? 'Your story' : 'Add yours'}</span>
      </button>
      ${others.map(ring).join('')}
      ${!others.length ? `<div class="rings-empty small muted">${fr.friends.length ? 'No stories from friends right now.' : 'Add friends to see their stories here.'}</div>` : ''}
    </div>

    <div class="share-row">
      <button class="btn primary share-cta" id="shareWord">✨ Share a word you learned</button>
      <button class="btn ghost share-cam" id="sharePhoto" aria-label="Share a photo">📷</button>
    </div>

    ${wotd ? `
    <section class="panel wotd">
      <div class="wotd-head"><span>☀️ Dagens ord</span><span class="pill level">${esc(wotd.level || '')}</span></div>
      <div class="wotd-word">${esc(wotd.sv)}</div>
      <div class="muted">${esc(wotd.en)}</div>
      <div class="actions">
        ${ctx.isAdded(wotd.id) ? '<span class="small muted">✓ In your words</span>' : '<button class="btn ghost" id="wotdAdd">+ Add</button>'}
        <button class="btn ghost" id="wotdShare">✨ Share</button>
      </div>
    </section>` : ''}

    <section class="panel">
      <h3>Friends</h3>
      <form class="add-friend" id="addFriend">
        <span class="at">@</span><input name="u" placeholder="username" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="21">
        <button class="btn primary">Add</button>
      </form>
      <p class="small muted" id="friendMsg">Share your username <b>@${esc(p.username)}</b> so friends can add you.</p>
      ${fr.incoming.length ? `<h4>Requests</h4>${fr.incoming.map((f) => `
        <div class="friend-row"><span class="avatar-emoji sm">${esc(f.avatar)}</span><b>@${esc(f.username)}</b>
          <button class="btn primary sm" data-accept="${esc(f.id)}">Accept</button><button class="btn ghost sm" data-remove="${esc(f.id)}">✕</button></div>`).join('')}` : ''}
      ${fr.outgoing.length ? `<h4>Waiting for answer</h4>${fr.outgoing.map((f) => `
        <div class="friend-row"><span class="avatar-emoji sm">${esc(f.avatar)}</span><span>@${esc(f.username)}</span>
          <button class="btn ghost sm" data-remove="${esc(f.id)}">Cancel</button></div>`).join('')}` : ''}
      ${fr.friends.length ? `<h4>Your friends</h4>${fr.friends.map((f) => `
        <div class="friend-row"><span class="avatar-emoji sm">${esc(f.avatar)}</span><span>@${esc(f.username)}</span>
          <button class="btn ghost sm" data-unfriend="${esc(f.id)}" data-name="${esc(f.username)}">Remove</button></div>`).join('')}` : ''}
    </section>

    ${data.board.length > 1 ? `
    <section class="panel">
      <h3>This week 🏁</h3>
      <ol class="board">
        ${data.board.map((r, i) => `
          <li class="${r.me ? 'me' : ''}">
            <span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
            <span class="avatar-emoji sm">${esc(r.avatar)}</span>
            <span class="who-name">${r.me ? 'You' : '@' + esc(r.username)}</span>
            <span class="small muted">${r.streak ? `🔥${r.streak}` : ''}</span>
            <b>${r.week}</b>
          </li>`).join('')}
      </ol>
      <p class="small muted">Reviews this week (Monday–Sunday).</p>
    </section>` : ''}`;

  view.querySelector('#refreshMoments').onclick = () => { data.error = null; refresh(); };
  if (inflight) setSpinning(true);
  view.querySelector('#editProfile').onclick = () => renderUsernameSetup(view, true);
  view.querySelector('#shareWord').onclick = () => openComposer({});
  view.querySelector('#sharePhoto').onclick = () => openComposer({ withPhoto: true });
  const nm = view.querySelector('#newMoment'); if (nm) nm.onclick = () => openComposer({});
  const vm = view.querySelector('#viewMine'); if (vm) vm.onclick = () => openViewer(data.groups.indexOf(mine), view);
  view.querySelectorAll('.ring-item[data-author]').forEach((b) => b.onclick = () => {
    openViewer(data.groups.findIndex((g) => g.author === b.dataset.author), view);
  });
  if (wotd) {
    const wa = view.querySelector('#wotdAdd');
    if (wa) wa.onclick = () => { ctx.addWordOfDay(wotd); draw(view); };
    view.querySelector('#wotdShare').onclick = () => openComposer({ wordObj: wotd });
  }
  const form = view.querySelector('#addFriend');
  const msg = view.querySelector('#friendMsg');
  form.onsubmit = async (e) => {
    e.preventDefault();
    const name = form.u.value;
    if (!name.trim()) return;
    form.querySelector('button').disabled = true;
    try {
      const r = await social.addFriend(name);
      ctx.toast({ sent: `Request sent to @${social.cleanUsername(name)} 👋`, accepted: `You and @${social.cleanUsername(name)} are now friends! 🎉`, already: 'You are already friends.', pending: 'Request already sent — waiting for an answer.' }[r]);
      if (r === 'accepted') ctx.confetti();
      form.u.value = '';
      await refresh(view);
      return;
    } catch (err) {
      msg.className = 'small error';
      msg.textContent = errText(err);
    }
    form.querySelector('button').disabled = false;
  };
  view.querySelectorAll('[data-accept]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await social.acceptFriend(b.dataset.accept); ctx.toast('New friend! 🎉'); ctx.confetti(); } catch (e) { ctx.toast(errText(e)); }
    refresh(view);
  });
  view.querySelectorAll('[data-remove]').forEach((b) => b.onclick = async () => {
    b.disabled = true;
    try { await social.removeFriendship(b.dataset.remove); } catch (e) { ctx.toast(errText(e)); }
    refresh(view);
  });
  view.querySelectorAll('[data-unfriend]').forEach((b) => b.onclick = async () => {
    if (!confirm(`Remove @${b.dataset.name} from your friends?`)) return;
    try { await social.removeFriendship(b.dataset.unfriend); } catch (e) { ctx.toast(errText(e)); }
    refresh(view);
  });
}

// ---------- username setup ----------
function renderUsernameSetup(view, editing = false) {
  const p = data.profile || {};
  let avatar = p.avatar || social.AVATARS[Math.floor(Math.random() * social.AVATARS.length)];
  const suggestion = (ctx.status().user?.name || '').toLowerCase().normalize('NFD').replace(/[^a-z0-9]/g, '').slice(0, 14);
  view.innerHTML = `
    <section class="panel picker">
      <h2>${editing ? 'Edit profile' : 'Pick a username'}</h2>
      <p class="muted">${editing ? 'Changing your username frees the old one.' : 'Friends add you with your username. It is public; your email stays private.'}</p>
      <form id="unameForm">
        <div class="add-friend big"><span class="at">@</span><input name="u" value="${esc(p.username || suggestion)}" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="20" required></div>
        <p class="small muted" id="unameMsg">3–20 characters: a–z, 0–9, _ or .</p>
        <h4>Choose your avatar</h4>
        <div class="avatar-grid">${social.AVATARS.map((a) => `<button type="button" class="avatar-pick ${a === avatar ? 'on' : ''}" data-av="${a}">${a}</button>`).join('')}</div>
        <button class="btn primary wide">${editing ? 'Save' : 'Continue'}</button>
        ${editing ? '<button type="button" class="btn ghost wide" id="cancelEdit">Cancel</button>' : ''}
      </form>
    </section>`;
  const form = view.querySelector('#unameForm');
  const msg = view.querySelector('#unameMsg');
  let timer;
  form.u.oninput = () => {
    clearTimeout(timer);
    const n = social.cleanUsername(form.u.value);
    if (!social.USERNAME_RE.test(n)) { msg.className = 'small muted'; msg.textContent = '3–20 characters: a–z, 0–9, _ or .'; return; }
    timer = setTimeout(async () => {
      try {
        const taken = n !== p.username && await social.usernameTaken(n);
        msg.className = taken ? 'small error' : 'small ok';
        msg.textContent = taken ? `@${n} is taken` : `@${n} is available ✓`;
      } catch { /* ignore */ }
    }, 350);
  };
  view.querySelectorAll('[data-av]').forEach((b) => b.onclick = () => {
    avatar = b.dataset.av;
    view.querySelectorAll('[data-av]').forEach((x) => x.classList.toggle('on', x === b));
  });
  const cancel = view.querySelector('#cancelEdit');
  if (cancel) cancel.onclick = () => draw(view);
  form.onsubmit = async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button.primary');
    btn.disabled = true;
    try {
      data.profile = await social.claimUsername(form.u.value, { avatar, color: '' }, ctx.publicStats());
      ctx.onUsername();
      ctx.toast(`Hej @${data.profile.username}! 👋`);
      data.loaded = true;
      data.uid = ctx.uid();
      saveCache();
      renderMoments(view);
    } catch (err) {
      msg.className = 'small error';
      msg.textContent = errText(err);
      btn.disabled = false;
    }
  };
}

// ---------- composer ----------
export function openComposer({ wordObj = null, withPhoto = false } = {}) {
  if (!ctx.status().signedIn) { ctx.toast('Sign in (Moments tab) to share moments'); return; }
  const m = { word: '', translation: '', context: '', contextEn: '', note: '', emoji: '', theme: 'fika', font: 'sans', align: 'center', level: '', wordId: '', photo: '', scrim: 'dark' };
  const pic = { img: null, fit: 'cover', focusY: 0.5 };
  const fill = (w) => {
    const ex = (w.examples || [])[0] || {};
    Object.assign(m, { word: w.sv, translation: w.en, context: ex.sv || '', contextEn: ex.en || '', level: w.level || '', wordId: w.id });
  };
  if (wordObj) fill(wordObj);
  const today = ctx.todaysWords();
  const dlg = document.createElement('div');
  dlg.className = 'composer';
  dlg.innerHTML = `
    <div class="composer-top">
      <button class="icon-btn" data-x="close" aria-label="Close">✕</button>
      <b>New moment</b>
      <button class="btn primary sm" data-x="post">Share</button>
    </div>
    <div class="composer-body">
      <div class="composer-preview" id="preview"></div>
      <div class="composer-form">
        <div class="photo-bar">
          <label class="btn ghost sm photo-btn">📷 Camera<input type="file" accept="image/*" capture="environment" data-photo-input hidden></label>
          <label class="btn ghost sm photo-btn">🖼️ Photo library<input type="file" accept="image/*" data-photo-input hidden></label>
          <span class="small muted" id="photoStatus"></span>
        </div>
        <div class="photo-tools" hidden>
          <div class="chips">
            <button type="button" class="chip" data-fit="cover">Fill</button>
            <button type="button" class="chip" data-fit="contain">Whole photo</button>
            <button type="button" class="chip" data-move="-1" aria-label="Show more of the top">▲</button>
            <button type="button" class="chip" data-move="1" aria-label="Show more of the bottom">▼</button>
            <button type="button" class="chip" data-remove-photo>✕ Remove photo</button>
          </div>
          <div class="chips">${Object.entries(SCRIMS).map(([k, v]) => `<button type="button" class="chip" data-scrim="${k}">${v}</button>`).join('')}</div>
        </div>
        ${today.length ? `<div class="small muted">Your words today</div><div class="chips today-chips">${today.slice(0, 12).map((w) => `<button type="button" class="chip" data-pick="${esc(w.id)}">${esc(w.sv)}</button>`).join('')}</div>` : ''}
        <label>Word<input name="word" maxlength="${social.LIMITS.word}" placeholder="t.ex. lagom" autocomplete="off" list="wordSuggest"></label>
        <datalist id="wordSuggest"></datalist>
        <label>Translation<input name="translation" maxlength="${social.LIMITS.translation}" placeholder="just right, not too much"></label>
        <label>Context — a sentence in Swedish<textarea name="context" rows="2" maxlength="${social.LIMITS.context}" placeholder="Lagom är bäst."></textarea></label>
        <label>Sentence in English<input name="contextEn" maxlength="${social.LIMITS.contextEn}" placeholder="Just right is best."></label>
        <label>Your note<textarea name="note" rows="2" maxlength="${social.LIMITS.note}" placeholder="Where did you hear it? A memory trick? 😄"></textarea></label>
        <div class="small muted">Emoji</div>
        <div class="emoji-row">${EMOJIS.map((e) => `<button type="button" class="emoji-pick" data-emoji="${e}">${e || '∅'}</button>`).join('')}</div>
        <div class="small muted" data-theme-label>Style</div>
        <div class="theme-row">${Object.entries(THEMES).map(([k, t]) => `<button type="button" class="theme-pick" data-theme="${k}" style="background:${t.bg}" title="${t.name}" aria-label="${t.name}"></button>`).join('')}</div>
        <div class="chips">${Object.entries(FONTS).map(([k, f]) => `<button type="button" class="chip font-pick" data-font="${k}" style="font-family:${f.css};font-weight:${f.weight}">${f.name}</button>`).join('')}
          <button type="button" class="chip" data-align>⇆ Align</button></div>
        <p class="small muted" id="audience">Visible to your friends for 24 hours. Photos are resized and their location data removed before sharing.</p>
      </div>
    </div>`;
  document.body.appendChild(dlg);
  document.body.classList.add('no-scroll');
  const f = (n) => dlg.querySelector(`[name="${n}"]`);
  const sync = () => {
    for (const k of ['word', 'translation', 'context', 'contextEn', 'note']) f(k).value = m[k];
    preview();
  };
  const preview = () => {
    dlg.querySelector('#preview').innerHTML = storyCardHTML({ ...m, username: data.profile?.username || '' });
    dlg.querySelectorAll('[data-theme]').forEach((b) => b.classList.toggle('on', b.dataset.theme === m.theme));
    dlg.querySelectorAll('[data-font]').forEach((b) => b.classList.toggle('on', b.dataset.font === m.font));
    dlg.querySelectorAll('[data-emoji]').forEach((b) => b.classList.toggle('on', b.dataset.emoji === m.emoji));
    const hasPhoto = !!m.photo;
    dlg.querySelector('.photo-tools').hidden = !hasPhoto;
    dlg.querySelector('.theme-row').hidden = hasPhoto;
    dlg.querySelector('[data-theme-label]').textContent = hasPhoto ? 'Text style' : 'Style';
    dlg.querySelectorAll('[data-fit]').forEach((b) => b.classList.toggle('on', b.dataset.fit === pic.fit));
    dlg.querySelectorAll('[data-scrim]').forEach((b) => b.classList.toggle('on', b.dataset.scrim === m.scrim));
    dlg.querySelectorAll('[data-move]').forEach((b) => { b.hidden = pic.fit !== 'cover'; });
  };
  const photoStatus = (t, isErr) => { const el = dlg.querySelector('#photoStatus'); el.textContent = t; el.className = 'small ' + (isErr ? 'error' : 'muted'); };
  const redrawPhoto = () => {
    try { m.photo = renderStoryImage(pic.img, { fit: pic.fit, focusY: pic.focusY }); photoStatus(`${Math.round(m.photo.length * 0.75 / 1024)} KB`); }
    catch (e) { m.photo = ''; photoStatus(e.message, true); }
    preview();
  };
  dlg.querySelectorAll('[data-photo-input]').forEach((input) => input.onchange = async () => {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    photoStatus('Preparing photo…');
    try {
      pic.img = await loadImage(file);
      pic.fit = pic.img.naturalWidth > pic.img.naturalHeight ? 'contain' : 'cover';
      pic.focusY = 0.5;
      redrawPhoto();
    } catch (e) { photoStatus(e.message, true); }
  });
  dlg.querySelectorAll('[data-fit]').forEach((b) => b.onclick = () => { pic.fit = b.dataset.fit; redrawPhoto(); });
  dlg.querySelectorAll('[data-move]').forEach((b) => b.onclick = () => { pic.focusY = Math.min(1, Math.max(0, pic.focusY + Number(b.dataset.move) * 0.15)); redrawPhoto(); });
  dlg.querySelectorAll('[data-scrim]').forEach((b) => b.onclick = () => { m.scrim = b.dataset.scrim; preview(); });
  dlg.querySelector('[data-remove-photo]').onclick = () => { m.photo = ''; pic.img = null; photoStatus(''); preview(); };
  for (const k of ['word', 'translation', 'context', 'contextEn', 'note']) {
    f(k).oninput = () => {
      m[k] = f(k).value;
      if (k === 'word') {
        m.wordId = '';
        // suggestions from the word bank; picking an exact match fills in the rest
        const hits = ctx.searchWords(m.word).slice(0, 8);
        dlg.querySelector('#wordSuggest').innerHTML = hits.map((w) => `<option value="${esc(w.sv)}">${esc(w.en)}</option>`).join('');
        const exact = hits.find((w) => w.sv.toLowerCase() === m.word.trim().toLowerCase());
        if (exact && !m.translation) { fill(exact); sync(); return; }
      }
      preview();
    };
  }
  dlg.querySelectorAll('[data-pick]').forEach((b) => b.onclick = () => { fill(ctx.wordById(b.dataset.pick)); sync(); });
  dlg.querySelectorAll('[data-theme]').forEach((b) => b.onclick = () => { m.theme = b.dataset.theme; preview(); });
  dlg.querySelectorAll('[data-font]').forEach((b) => b.onclick = () => { m.font = b.dataset.font; preview(); });
  dlg.querySelectorAll('[data-emoji]').forEach((b) => b.onclick = () => { m.emoji = b.dataset.emoji; preview(); });
  dlg.querySelector('[data-align]').onclick = () => { m.align = m.align === 'left' ? 'center' : 'left'; preview(); };
  const close = () => { closeOverlay(dlg, 300); document.body.classList.remove('no-scroll'); };
  dlg.querySelector('[data-x="close"]').onclick = close;
  dlg.querySelector('[data-x="post"]').onclick = async (e) => {
    const btn = e.currentTarget;
    if (!m.word.trim() && !m.photo) { f('word').focus(); ctx.toast('Write a word or add a photo first'); return; }
    btn.disabled = true;
    btn.textContent = 'Sharing…';
    try {
      const posted = await social.postMoment(m);
      close();
      ctx.onPosted();
      ctx.toast('Shared with your friends ✨');
      // show it right away; the next refresh brings in everything else
      let mineG = data.groups.find((g) => g.mine);
      if (!mineG) {
        mineG = { author: posted.author, username: posted.username, avatar: posted.avatar, mine: true, items: [] };
        data.groups.unshift(mineG);
      }
      mineG.items.push(posted);
      saveCache();
      redraw();
    } catch (err) {
      ctx.toast(errText(err));
      btn.disabled = false;
      btn.textContent = 'Share';
    }
  };
  // load profile for the "@username" on the preview if needed
  if (data.profile === undefined) social.myProfile().then((p) => { data.profile = p; preview(); if (!p) { close(); ctx.toast('Pick a username in the Moments tab first'); } }).catch(() => {});
  sync();
  if (withPhoto) dlg.querySelector('[data-photo-input][capture]').click();
  else setTimeout(() => (m.word ? f('note') : f('word')).focus(), 50);
}

// ---------- viewer ----------
function openViewer(groupIndex, view) {
  if (groupIndex < 0) return;
  const me = myUid();
  let gi = groupIndex;
  // start at the first unseen story of that person
  let ii = Math.max(0, data.groups[gi].items.findIndex((m) => !(m.seen || {})[me]));
  let timer = null, started = 0, elapsed = 0, paused = false;

  const dlg = document.createElement('div');
  dlg.className = 'viewer';
  document.body.appendChild(dlg);
  document.body.classList.add('no-scroll');

  const close = () => {
    clearTimeout(timer);
    closeOverlay(dlg);
    document.body.classList.remove('no-scroll');
    document.removeEventListener('keydown', onKey);
    ctx.onSocial({ unseen: unseenCount() });
    if (view.isConnected) draw(view);
  };
  const next = () => {
    const g = data.groups[gi];
    if (ii < g.items.length - 1) ii++;
    else if (gi < data.groups.length - 1 && !data.groups[gi + 1].mine) { gi++; ii = 0; }
    else return close();
    show();
  };
  const prev = () => {
    if (ii > 0) ii--;
    else if (gi > 0 && !data.groups[gi - 1].mine) { gi--; ii = data.groups[gi].items.length - 1; }
    show();
  };
  const run = (ms) => { clearTimeout(timer); started = Date.now(); timer = setTimeout(next, ms); };
  const onKey = (e) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowRight') next();
    else if (e.key === 'ArrowLeft') prev();
  };
  document.addEventListener('keydown', onKey);

  function show() {
    const g = data.groups[gi];
    const m = g.items[ii];
    elapsed = 0;
    paused = false;
    social.markSeen(m);
    const myReaction = (m.reactions || {})[me];
    const reactions = Object.values(m.reactions || {});
    const counts = {};
    reactions.forEach((r) => { counts[r] = (counts[r] || 0) + 1; });
    const inBank = m.wordId && ctx.wordById(m.wordId);
    const added = inBank && ctx.isAdded(m.wordId);
    const seenBy = Object.keys(m.seen || {}).length;
    dlg.innerHTML = `
      <div class="viewer-bars">${g.items.map((_, i) => `<i class="${i < ii ? 'done' : ''}"><b class="${i === ii ? 'run' : ''}" style="animation-duration:${STORY_MS}ms"></b></i>`).join('')}</div>
      <div class="viewer-head">
        <span class="avatar-emoji sm">${esc(g.avatar || '🙂')}</span>
        <b>${g.mine ? 'You' : '@' + esc(g.username)}</b><span class="small">${ago(m.createdAt)}</span>
        <button class="icon-btn light" data-x="close" aria-label="Close">✕</button>
      </div>
      <div class="viewer-card">
        ${storyCardHTML(m)}
        <div class="tap-zone left" data-x="prev"></div><div class="tap-zone right" data-x="next"></div>
      </div>
      <div class="viewer-foot">
        ${g.mine ? `
          <span class="small">👀 Seen by ${seenBy} · ${Object.entries(counts).map(([e, n]) => `${e} ${n}`).join(' ') || 'no reactions yet'}</span>
          <button class="btn ghost sm light" data-x="delete">Delete</button>` : `
          <div class="reactions">${REACTIONS.map((r) => `<button class="react ${myReaction === r ? 'on' : ''}" data-react="${r}" aria-label="React ${r}">${r}${counts[r] ? `<small>${counts[r]}</small>` : ''}</button>`).join('')}</div>
          ${inBank ? (added ? '<span class="small">✓ In your words</span>' : '<button class="btn primary sm" data-x="add">+ Add to my words</button>') : ''}`}
      </div>`;
    run(STORY_MS);
    dlg.querySelector('[data-x="close"]').onclick = close;
    dlg.querySelector('[data-x="next"]').onclick = next;
    dlg.querySelector('[data-x="prev"]').onclick = prev;
    const card = dlg.querySelector('.viewer-card');
    const bar = () => dlg.querySelector('.viewer-bars b.run');
    card.onpointerdown = () => { paused = true; clearTimeout(timer); elapsed += Date.now() - started; if (bar()) bar().style.animationPlayState = 'paused'; };
    const resume = () => { if (!paused) return; paused = false; if (bar()) bar().style.animationPlayState = 'running'; run(Math.max(500, STORY_MS - elapsed)); };
    card.onpointerup = resume;
    card.onpointerleave = resume;
    dlg.querySelectorAll('[data-react]').forEach((b) => b.onclick = async () => {
      try {
        await social.react(m, b.dataset.react);
        if (m.reactions[me]) ctx.burst(b.dataset.react, b);
      } catch (e) { ctx.toast(errText(e)); }
      const keep = Date.now() - started;
      show();
      clearTimeout(timer); run(Math.max(1500, STORY_MS - keep));
    });
    const add = dlg.querySelector('[data-x="add"]');
    if (add) add.onclick = () => { ctx.addWordById(m.wordId); ctx.toast(`“${m.word}” added — first review tomorrow`); show(); };
    const del = dlg.querySelector('[data-x="delete"]');
    if (del) del.onclick = async () => {
      if (!confirm('Delete this moment?')) return;
      try {
        await social.deleteMoment(m.id);
        g.items.splice(ii, 1);
        if (!g.items.length) { data.groups.splice(gi, 1); return close(); }
        ii = Math.min(ii, g.items.length - 1);
        show();
      } catch (e) { ctx.toast(errText(e)); }
    };
  }
  show();
}

export function resetMoments() {
  if (data.uid) idbDel(cacheKey(data.uid));
  data = { profile: undefined, groups: [], friends: null, board: [], loaded: false, uid: null, error: null };
  cacheTried = false;
  lastAttempt = 0;
}
export function socialCounts() { return { friends: data.friends ? data.friends.friends.length : 0 }; }
