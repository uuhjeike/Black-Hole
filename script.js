'use strict';
/* BLACK HOLE — vanilla JS, no dependencies. Normally you only ever edit Post.txt. */

const CONFIG = {
  posts: 'https://github.com/uuhjeike/Black-Hole/blob/main/Post.txt',
  video: 'https://github.com/uuhjeike/Black-Hole/blob/main/5591d7a8efe3e0b7661923ecab104dfa.mp4',
  pageSize: 6 // posts drawn per batch while scrolling
};

/* ---------- small helpers ---------- */
const $ = id => document.getElementById(id);
const el = (tag, cls, text) => {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (text != null) n.textContent = text;
  return n;
};
const pathOf = u => u.split(/[?#]/)[0];
const nameOf = u => {
  const s = pathOf(u).split('/').pop() || u;
  try { return decodeURIComponent(s); } catch (e) { return s; }
};
const hostOf = u => { try { return new URL(u).hostname.replace(/^www\./, ''); } catch (e) { return u; } };

/* github.com/<user>/<repo>/blob/<branch>/<path>  ->  raw.githubusercontent.com/<user>/<repo>/<branch>/<path> */
function toRaw(u) {
  u = String(u).trim();
  const m = u.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/]+)\/(?:blob|raw)\/([^?#]+)/i);
  return m ? 'https://raw.githubusercontent.com/' + m[1] + '/' + m[2] + '/' + m[3] : u;
}

/* ---------- Post.txt parser ---------- */
const EXT = {
  image: /\.(jpe?g|png|gif|webp|avif|bmp|svg)$/i,
  video: /\.(mp4|webm|mov|m4v|ogv)$/i,
  audio: /\.(mp3|wav|ogg|oga|m4a|aac|flac|opus)$/i,
  file: /\.(pdf|zip|rar|7z|docx?|xlsx?|pptx?|txt|csv|apk|epub)$/i
};
const KEYS = { image: 'image', photo: 'image', video: 'video', audio: 'audio', file: 'file', link: 'link' };
const KEY_RE = /^(image|photo|video|audio|file|link)\s*:\s*(https?:\/\/[^\s|]+|[^\s|:]*[./][^\s|]*)\s*(?:\|\s*(.+))?$/i;
const BARE_RE = /^https?:\/\/\S+$/i;
const UNSAFE_RE = /^\s*(javascript|data|vbscript):/i;
const kindOf = u => Object.keys(EXT).find(k => EXT[k].test(pathOf(u))) || 'link';

/* One line -> a media item, or null when the line is ordinary text. */
function parseMediaLine(line) {
  const m = line.match(KEY_RE);
  let kind, url, label = '';
  if (m) { kind = KEYS[m[1].toLowerCase()]; url = m[2]; label = (m[3] || '').trim(); }
  else if (BARE_RE.test(line)) { url = line; kind = kindOf(url); }
  else return null;
  if (UNSAFE_RE.test(url)) return null;
  return { kind, url, src: kind === 'link' ? url : toRaw(url), label };
}

const groupOf = k => (k === 'file' || k === 'link') ? 'links' : k + 's';

/* Lines of one block -> ordered parts: text | images | videos | audios | links */
function parsePost(lines) {
  const parts = [];
  let buf = [];
  const flush = () => {
    const t = buf.join('\n').replace(/^(?:[ \t]*\n)+/, '').replace(/\s+$/, '');
    if (t.trim()) parts.push({ type: 'text', text: t });
    buf = [];
  };
  for (const raw of lines) {
    const item = parseMediaLine(raw.trim());
    if (!item) { buf.push(raw); continue; }
    flush();
    const g = groupOf(item.kind), last = parts[parts.length - 1];
    if (last && last.type === g) last.items.push(item); else parts.push({ type: g, items: [item] });
  }
  flush();
  return parts;
}

/* Whole file -> { bio, posts }. A line that is only "$" separates blocks; "//" lines are comments. */
function parsePosts(text) {
  const lines = String(text).replace(/^\uFEFF/, '').replace(/\r\n?/g, '\n').split('\n')
    .filter(l => !/^\s*\/\//.test(l));
  const blocks = [[]];
  for (const l of lines) {
    if (/^(?:\$|\(-\s*Post\s*-\)|---POST---)$/i.test(l.trim())) blocks.push([]);
    else blocks[blocks.length - 1].push(l);
  }
  let bio = '';
  const posts = [];
  for (const b of blocks) {
    const body = b.join('\n').trim();
    if (!body) continue;
    if (/^#bio(?![^\s:])/i.test(body)) { bio = body.replace(/^#bio[:\s]*/i, '').trim(); continue; }
    const parts = parsePost(b);
    if (parts.length) posts.push(parts);
  }
  return { bio, posts };
}

/* Text with clickable http(s) links, built with DOM nodes (no innerHTML). */
const URL_RE = /https?:\/\/[^\s<>"]+/g;
function linkify(node, str) {
  let i = 0, m;
  URL_RE.lastIndex = 0;
  while ((m = URL_RE.exec(str))) {
    const url = m[0].replace(/[.,;:!?)\]}'"।]+$/, '');
    if (m.index > i) node.append(str.slice(i, m.index));
    const a = el('a', null, url);
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    node.append(a);
    i = m.index + url.length;
    URL_RE.lastIndex = i;
  }
  if (i < str.length) node.append(str.slice(i));
}

/* ---------- the page ---------- */
function start() {
  const html = document.documentElement;
  const bg = $('bg'), feed = $('feed'), list = $('list'), stateEl = $('state'), moreBtn = $('more');
  const countEl = $('count'), bioEl = $('bio'), avatar = $('avatar'), avatarVideo = $('avatar-video');
  const viewer = $('viewer'), vimg = $('viewer-img'), vnote = $('viewer-note');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)');
  const saveData = !!(navigator.connection && navigator.connection.saveData);
  let all = [], shown = 0;
  let vList = [], vIdx = 0, vOpener = null, vOpen = false;

  /* Background video: starts after the page loads, pauses when hidden or covered. */
  function syncBg() {
    if (!bg.getAttribute('src')) return;
    if (!document.hidden && !vOpen && !reduce.matches) {
      const p = bg.play();
      if (p && p.catch) p.catch(() => {});
    } else bg.pause();
  }
  function startBg() {
    if (saveData) return; // respect the browser's data-saver setting
    bg.muted = true;
    bg.preload = 'metadata';
    bg.addEventListener('loadeddata', () => bg.classList.add('on'), { once: true });
    bg.addEventListener('error', () => bg.removeAttribute('src'), { once: true });
    bg.src = toRaw(CONFIG.video);
    syncBg();
  }
  document.addEventListener('visibilitychange', syncBg);
  reduce.addEventListener('change', syncBg);

  /* Full-screen image viewer (also used by the profile photo). */
  function showImg(i) {
    vIdx = (i + vList.length) % vList.length;
    const it = vList[vIdx];
    vimg.classList.remove('bad');
    vimg.alt = it.label || '';
    vimg.src = it.src;
    vnote.textContent = vList.length > 1 ? (vIdx + 1) + ' / ' + vList.length : '';
    $('vprev').hidden = $('vnext').hidden = vList.length < 2;
  }
  function openViewer(items, i, opener) {
    vList = items; vOpener = opener || null;
    showImg(i);
    viewer.hidden = false;
    html.classList.add('lock');
    if (!vOpen) { vOpen = true; history.pushState({ bh: 1 }, ''); syncBg(); } // Android back button closes the viewer
    $('vclose').focus();
  }
  function closeViewer(fromPop) {
    if (!vOpen) return;
    vOpen = false;
    viewer.hidden = true;
    vimg.removeAttribute('src');
    html.classList.remove('lock');
    if (!fromPop && history.state && history.state.bh) history.back();
    syncBg();
    if (vOpener) vOpener.focus();
  }
  const step = d => { if (vList.length > 1) showImg(vIdx + d); };
  vimg.addEventListener('error', () => { vimg.classList.add('bad'); vnote.textContent = 'This photo couldn’t load.'; });
  $('vclose').addEventListener('click', () => closeViewer());
  $('vprev').addEventListener('click', () => step(-1));
  $('vnext').addEventListener('click', () => step(1));
  viewer.addEventListener('click', e => { if (e.target === viewer) closeViewer(); });
  addEventListener('popstate', () => closeViewer(true));
  document.addEventListener('keydown', e => {
    if (!vOpen) return;
    if (e.key === 'Escape') closeViewer();
    else if (e.key === 'ArrowLeft') step(-1);
    else if (e.key === 'ArrowRight') step(1);
    else if (e.key === 'Tab') { // keep focus inside the viewer
      const f = [...viewer.querySelectorAll('button')].filter(b => !b.hidden);
      const i = f.indexOf(document.activeElement);
      e.preventDefault();
      f[(i + (e.shiftKey ? -1 : 1) + f.length) % f.length].focus();
    }
  });
  let tx = 0, ty = 0, single = false;
  viewer.addEventListener('touchstart', e => {
    single = e.touches.length === 1;
    if (single) { tx = e.touches[0].clientX; ty = e.touches[0].clientY; }
  }, { passive: true });
  viewer.addEventListener('touchend', e => {
    const zoomed = window.visualViewport && window.visualViewport.scale > 1.02;
    if (!single || zoomed || vList.length < 2 || e.changedTouches.length !== 1) return;
    const dx = e.changedTouches[0].clientX - tx, dy = e.changedTouches[0].clientY - ty;
    if (Math.abs(dx) > 50 && Math.abs(dx) > Math.abs(dy) * 1.5) step(dx < 0 ? 1 : -1);
  }, { passive: true });

  /* Square video profile: centred crop, muted autoplay and loop. */
  function startAvatarVideo() {
    avatarVideo.muted = true;
    avatarVideo.loop = true;
    avatarVideo.autoplay = true;
    avatarVideo.playsInline = true;
    avatarVideo.preload = 'metadata';
    avatarVideo.src = toRaw(CONFIG.video);
    avatarVideo.addEventListener('error', () => avatar.classList.add('video-error'), { once: true });
    if (!reduce.matches) avatarVideo.play().catch(() => {});
  }
  document.addEventListener('visibilitychange', () => {
    if (document.hidden || reduce.matches) avatarVideo.pause();
    else avatarVideo.play().catch(() => {});
  });
  reduce.addEventListener('change', () => {
    if (reduce.matches) avatarVideo.pause();
    else if (!document.hidden) avatarVideo.play().catch(() => {});
  });
  startAvatarVideo();

  /* Media builders */
  const errBox = (msg, url) => {
    const d = el('div', 'err', msg + ' ');
    const a = el('a', null, 'Open the file directly');
    a.href = url; a.target = '_blank'; a.rel = 'noopener noreferrer';
    d.append(a);
    return d;
  };
  // Videos get their source only when they are near the screen; one tap on play starts the stream.
  const attach = v => { v.preload = saveData ? 'none' : 'metadata'; v.src = v.dataset.src + '#t=0.001'; };
  const vio = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => es.forEach(e => {
        if (e.isIntersecting) { vio.unobserve(e.target); attach(e.target); }
      }), { rootMargin: '500px 0px' })
    : null;
  function video(it) {
    const v = document.createElement('video');
    v.controls = true; v.playsInline = true; v.preload = 'none'; v.dataset.src = it.src;
    v.setAttribute('aria-label', it.label || nameOf(it.url));
    v.addEventListener('loadedmetadata', () => { if (v.videoWidth) v.style.aspectRatio = v.videoWidth + '/' + v.videoHeight; });
    v.addEventListener('error', () => v.replaceWith(errBox('This video couldn’t play.', it.src)));
    if (vio) vio.observe(v); else attach(v);
    return v;
  }
  async function download(a, src, name) { // real download even though the file is on another domain
    a.classList.add('busy');
    try {
      const r = await fetch(src);
      if (!r.ok) throw new Error('HTTP ' + r.status);
      const u = URL.createObjectURL(await r.blob());
      const d = el('a');
      d.href = u; d.download = name;
      document.body.append(d); d.click(); d.remove();
      setTimeout(() => URL.revokeObjectURL(u), 5000);
    } catch (e) { window.open(src, '_blank', 'noopener'); }
    a.classList.remove('busy');
  }

  const PART = {
    text: p => {
      const wrap = el('div', 'txt-wrap');
      const n = el('p', 'txt is-collapsed'); linkify(n, p.text);
      const more = el('button', 'text-more', 'See more');
      more.type = 'button';
      // Show the control for long content; CSS clamps the visible text to six lines.
      const long = p.text.split('\n').length > 6 || p.text.length > 320;
      if (long) {
        more.setAttribute('aria-expanded', 'false');
        more.addEventListener('click', () => {
          const expanded = n.classList.toggle('is-expanded');
          n.classList.toggle('is-collapsed', !expanded);
          more.textContent = expanded ? 'See less' : 'See more';
          more.setAttribute('aria-expanded', String(expanded));
        });
      } else more.hidden = true;
      wrap.append(n, more);
      return wrap;
    },

    images: p => {
      const many = p.items.length > 1;
      const g = el('div', 'gal ' + (many ? 'many' : 'one'));
      p.items.forEach((it, i) => {
        const b = el('button');
        b.type = 'button';
        b.setAttribute('aria-label', (it.label || 'Photo') + (many ? ' ' + (i + 1) + ' of ' + p.items.length : '') + ', open full screen');
        const im = new Image();
        im.loading = 'lazy'; im.decoding = 'async'; im.alt = it.label || '';
        im.addEventListener('error', () => b.replaceWith(errBox('This photo couldn’t load.', it.src)));
        im.src = it.src;
        b.append(im);
        b.addEventListener('click', () => openViewer(p.items, i, b));
        g.append(b);
      });
      return g;
    },

    videos: p => { const w = el('div', 'vids'); p.items.forEach(it => w.append(video(it))); return w; },

    audios: p => {
      const w = el('div', 'auds');
      p.items.forEach(it => {
        const box = el('div', 'aud');
        const a = document.createElement('audio');
        a.controls = true; a.preload = 'none'; a.src = it.src;
        a.addEventListener('error', () => a.replaceWith(errBox('This audio couldn’t play.', it.src)));
        box.append(el('b', null, it.label || nameOf(it.url).replace(/\.[^.]+$/, '')), a);
        w.append(box);
      });
      return w;
    },

    links: p => {
      const w = el('div', 'links');
      p.items.forEach(it => {
        const isFile = it.kind === 'file', name = nameOf(it.url);
        const ext = (name.match(/\.([a-z0-9]+)$/i) || [0, 'file'])[1].toUpperCase();
        const a = el('a', 'card');
        a.href = it.src;
        a.append(
          el('span', 'ct', it.label || (isFile ? name : it.url.replace(/^https?:\/\/(www\.)?/i, ''))),
          el('span', 'cs', isFile ? 'Download ' + ext : (it.label ? hostOf(it.url) : 'External link'))
        );
        if (isFile) {
          a.setAttribute('download', name);
          a.addEventListener('click', e => { e.preventDefault(); download(a, it.src, name); });
        } else { a.target = '_blank'; a.rel = 'noopener noreferrer'; }
        w.append(a);
      });
      return w;
    }
  };

  function renderPost(parts) {
    const art = el('article', 'post');
    for (const p of parts) art.append(PART[p.type](p));
    return art;
  }
  const sep = () => null;

  /* Posts render in small batches so the DOM and network stay light. */
  const mio = 'IntersectionObserver' in window
    ? new IntersectionObserver(es => { if (es[0].isIntersecting) renderMore(); }, { rootMargin: '800px 0px' })
    : null;
  function renderMore() {
    const end = Math.min(shown + CONFIG.pageSize, all.length), frag = document.createDocumentFragment();
    for (let i = shown; i < end; i++) {
      try { frag.append(renderPost(all[i])); }
      catch (e) { frag.append(el('div', 'err', 'This post couldn’t be displayed.')); }
    }
    list.append(frag);
    shown = end;
    moreBtn.hidden = shown >= all.length;
    if (mio) { mio.unobserve(moreBtn); if (!moreBtn.hidden) mio.observe(moreBtn); }
  }
  moreBtn.addEventListener('click', renderMore);

  /* Status line */
  function setState(msg, retry) {
    stateEl.hidden = !msg;
    stateEl.textContent = msg || '';
    stateEl.classList.toggle('err', !!retry);
    if (retry) {
      const b = el('button', 'retry', 'Try again');
      b.type = 'button';
      b.addEventListener('click', loadPosts);
      stateEl.append(b);
    }
  }
  const explain = e => {
    const m = /HTTP (\d+)/.exec((e && e.message) || '');
    if (m && m[1] === '404') return 'Post.txt was not found. Check the file name and that the repository is public.';
    if (m) return 'Post.txt could not be loaded (error ' + m[1] + '). Try again in a minute.';
    return 'Post.txt could not be loaded. Check your connection, then try again.';
  };
  async function fetchText() {
    // Read the plain-text file, never the GitHub HTML preview. Cache-busting helps after edits.
    const raw = toRaw(CONFIG.posts);
    const urls = [
      raw + (raw.includes('?') ? '&' : '?') + 'v=' + Date.now(),
      'https://api.github.com/repos/uuhjeike/Black-Hole/contents/Post.txt?ref=main',
      new URL('Post.txt', document.baseURI).href
    ];
    let err;
    for (const u of urls) {
      try {
        const r = await fetch(u, { cache: 'no-store', headers: { Accept: u.includes('api.github.com') ? 'application/vnd.github+json' : 'text/plain' } });
        if (!r.ok) { err = new Error('HTTP ' + r.status); continue; }
        if (u.includes('api.github.com')) {
          const data = await r.json();
          if (!data || !data.content) throw new Error('GitHub API returned no file content');
          const binary = atob(data.content.replace(/\s/g, ''));
          const bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
          return new TextDecoder('utf-8').decode(bytes);
        }
        return await r.text();
      } catch (e) { err = e; }
    }
    throw err || new Error('Unable to fetch Post.txt');
  }
  function setBio(t) {
    bioEl.textContent = '';
    if (t) linkify(bioEl, t);
    bioEl.hidden = !t;
  }
  async function loadPosts() {
    list.textContent = '';
    moreBtn.hidden = true; countEl.hidden = true;
    all = []; shown = 0;
    setState('Loading posts…');
    feed.setAttribute('aria-busy', 'true');
    try {
      const res = parsePosts(await fetchText());
      all = res.posts;
      setBio(res.bio);
      countEl.textContent = all.length + (all.length === 1 ? ' post' : ' posts');
      countEl.hidden = false;
      if (all.length) { setState(''); renderMore(); } else setState('No posts yet. Add one to Post.txt.');
    } catch (e) { setState(explain(e), true); }
    feed.setAttribute('aria-busy', 'false');
  }

  /* Only one video or audio plays at a time. */
  feed.addEventListener('play', e => {
    if (!/^(VIDEO|AUDIO)$/.test(e.target.tagName)) return;
    feed.querySelectorAll('video,audio').forEach(m => { if (m !== e.target) m.pause(); });
  }, true);

  loadPosts();
  const go = () => setTimeout(startBg, 200);
  if (document.readyState === 'complete') go(); else addEventListener('load', go, { once: true });
}

if (typeof document !== 'undefined') start();
if (typeof module !== 'undefined' && module.exports) module.exports = { toRaw, parsePosts, parseMediaLine, kindOf };
