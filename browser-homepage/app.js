/* ==========================================================================
 * 轻主页 Lite New Tab — app.js
 * --------------------------------------------------------------------------
 * Sections
 *   1. storage shim            6. groups / tiles rendering
 *   2. defaults & samples      7. resize + corner-radius handles
 *   3. state load / save       8. drag & drop (links + group order)
 *   4. theme application       9. dialogs
 *   5. background wallpaper   10. settings panel bindings / data io / init
 * ========================================================================== */

(function () {
  'use strict';

  /* ==================================================== 1. storage shim ===
   * Works as a chrome extension (chrome.storage.local) and also when the
   * file is simply opened in a browser (localStorage), which keeps the page
   * previewable outside of the extension sandbox.                       */
  const IS_EXT = typeof chrome !== 'undefined' && !!(chrome.storage && chrome.storage.local);

  const store = {
    get(keys) {
      const list = Array.isArray(keys) ? keys : [keys];
      if (IS_EXT) {
        return new Promise((res) => chrome.storage.local.get(list, (r) => res(r || {})));
      }
      const out = {};
      list.forEach((k) => {
        try {
          const raw = localStorage.getItem('litehome.' + k);
          if (raw !== null) out[k] = JSON.parse(raw);
        } catch (e) { /* ignore */ }
      });
      return Promise.resolve(out);
    },
    set(obj) {
      if (IS_EXT) {
        return new Promise((res) => chrome.storage.local.set(obj, () => res()));
      }
      Object.keys(obj).forEach((k) => {
        try { localStorage.setItem('litehome.' + k, JSON.stringify(obj[k])); }
        catch (e) { /* quota */ }
      });
      return Promise.resolve();
    }
  };

  /* ============================================ 2. defaults & samples === */
  const ENGINES = {
    bing:   { name: '必应',      url: 'https://cn.bing.com/search?q=%s' },
    baidu:  { name: '百度',      url: 'https://www.baidu.com/s?wd=%s' },
    google: { name: 'Google',    url: 'https://www.google.com/search?q=%s' },
    sogou:  { name: '搜狗',      url: 'https://www.sogou.com/web?query=%s' },
    so360:  { name: '360',       url: 'https://www.so.com/s?q=%s' },
    ddg:    { name: 'DuckDuckGo', url: 'https://duckduckgo.com/?q=%s' }
  };

  function uid() {
    return Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-3);
  }

  function sampleState() {
    const l = (title, url) => ({ id: uid(), title, url, size: null, radius: null, color: '', alpha: null });
    return {
      version: 1,
      mode: 'bookmarks',
      search: {
        engine: 'bing',
        customUrl: '',
        placeholder: '搜索或输入网址',
        width: 640,
        radius: 999,
        showEngines: true
      },
      background: {
        source: 'bing',
        url: '',
        dataUrl: '',
        color: '#0b1020',
        blur: 0,
        brightness: 100,
        overlay: 30,
        zoom: 100,
        fit: 'cover',
        refreshDaily: true,
        bingIndex: 0
      },
      glass: {
        enabled: true,
        blur: 22,
        alpha: 22,          // stored as 0-80 (%) for the slider, used /100
        saturate: 160,
        tint: '#ffffff',
        radius: 22,
        border: 18,
        shadow: 24
      },
      ui: {
        showClock: true,
        showDate: true,
        showLabels: true,
        textTheme: 'light',
        iconSize: 66,
        groupWidth: 320
      },
      groups: [
        {
          id: uid(), name: '常用', width: 320, height: null, radius: null,
          color: '', alpha: null,
          links: [
            l('百度', 'https://www.baidu.com'),
            l('知乎', 'https://www.zhihu.com'),
            l('B 站', 'https://www.bilibili.com'),
            l('微博', 'https://weibo.com')
          ]
        },
        {
          id: uid(), name: '开发', width: 320, height: null, radius: null,
          color: '', alpha: null,
          links: [
            l('GitHub', 'https://github.com'),
            l('掘金', 'https://juejin.cn'),
            l('MDN', 'https://developer.mozilla.org/zh-CN'),
            l('ChatGPT', 'https://chatgpt.com')
          ]
        },
        {
          id: uid(), name: '工具', width: 320, height: null, radius: null,
          color: '', alpha: null,
          links: [
            l('腾讯文档', 'https://docs.qq.com'),
            l('语雀', 'https://www.yuque.com'),
            l('网易邮箱', 'https://mail.163.com')
          ]
        }
      ]
    };
  }

  const GLASS_PRESETS = {
    clear:   { blur: 6,  alpha: 8,  saturate: 120, border: 26, shadow: 10, radius: 22 },
    frost:   { blur: 24, alpha: 24, saturate: 150, border: 18, shadow: 24, radius: 22 },
    acrylic: { blur: 38, alpha: 42, saturate: 180, border: 22, shadow: 34, radius: 18 },
    liquid:  { blur: 52, alpha: 55, saturate: 220, border: 30, shadow: 46, radius: 30 },
    none:    { enabled: false }
  };

  let state = sampleState();

  /* ================================================= 3. state / saving === */
  let saveTimer = null;
  function save(immediate) {
    if (saveTimer) clearTimeout(saveTimer);
    const doIt = () => store.set({ litehome: state });
    if (immediate) return doIt();
    saveTimer = setTimeout(doIt, 220);
    return Promise.resolve();
  }

  function load() {
    return store.get('litehome').then((res) => {
      const saved = res.litehome;
      if (!saved || typeof saved !== 'object') return false;
      state = mergeDeep(sampleState(), saved);
      // never let an empty group list erase the samples on a bad import
      if (!Array.isArray(state.groups)) state.groups = sampleState().groups;
      return true;
    });
  }

  function mergeDeep(base, patch) {
    if (Array.isArray(base)) return Array.isArray(patch) ? patch : base;
    if (base && typeof base === 'object') {
      const out = Object.assign({}, base);
      Object.keys(patch || {}).forEach((k) => {
        out[k] = (k in base) ? mergeDeep(base[k], patch[k]) : patch[k];
      });
      return out;
    }
    return patch === undefined ? base : patch;
  }

  /* ------------------------------------------------------- small helpers */
  const $ = (sel, root) => (root || document).querySelector(sel);

  function hexToRgb(hex) {
    const h = String(hex || '').replace('#', '').trim();
    const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h;
    const n = parseInt(full || 'ffffff', 16);
    if (isNaN(n)) return '255,255,255';
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255].join(',');
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); }
    catch (e) { return ''; }
  }

  function normalizeUrl(raw) {
    let u = String(raw || '').trim();
    if (!u) return '';
    if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(u)) {
      if (/^(localhost|\d{1,3}(\.\d{1,3}){3})(:\d+)?(\/|$)/.test(u)) u = 'http://' + u;
      else u = 'https://' + u;
    }
    return u;
  }

  function looksLikeUrl(s) {
    const t = String(s || '').trim();
    if (!t || /\s/.test(t)) return false;
    if (/^https?:\/\//i.test(t)) return true;
    return /^[\w-]+(\.[\w-]+)+(\/\S*)?$/.test(t) || /^localhost(:\d+)?/.test(t);
  }

  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg;
    el.classList.add('show');
    clearTimeout(toast._t);
    toast._t = setTimeout(() => el.classList.remove('show'), 2000);
  }

  function faviconUrl(url) {
    // chrome's built-in favicon cache (MV3 "favicon" permission)
    if (IS_EXT && location.protocol === 'chrome-extension:' && chrome.runtime && chrome.runtime.getURL) {
      try {
        return chrome.runtime.getURL(
          '/_favicon/?pageUrl=' + encodeURIComponent(url) + '&size=64');
      } catch (e) { /* fall through */ }
    }
    return '';
  }

  /* ================================================= 4. theme apllied ==== */
  function applyTheme() {
    const r = document.documentElement.style;
    const g = state.glass;
    const b = state.background;
    const ui = state.ui;

    bodyClass('mode-bookmarks', state.mode === 'bookmarks');
    bodyClass('mode-minimal', state.mode === 'minimal');
    bodyClass('no-glass', !g.enabled);
    bodyClass('hide-clock', !ui.showClock);
    bodyClass('hide-date', !ui.showDate);
    bodyClass('hide-labels', !ui.showLabels);
    bodyClass('hide-engines', !state.search.showEngines);

    // background layer
    r.setProperty('--bg-blur', b.blur + 'px');
    r.setProperty('--bg-bright', (b.brightness / 100).toFixed(2));
    r.setProperty('--bg-scale', (b.zoom / 100).toFixed(2));
    r.setProperty('--bg-overlay', (b.overlay / 100).toFixed(2));

    // glass
    r.setProperty('--glass-blur', g.blur + 'px');
    r.setProperty('--glass-alpha', (g.alpha / 100).toFixed(3));
    r.setProperty('--glass-tint', hexToRgb(g.tint));
    r.setProperty('--tile-tint', hexToRgb(g.tint));
    r.setProperty('--tile-alpha', (Math.max(g.alpha, 8) / 100 * 0.85).toFixed(3));
    r.setProperty('--glass-sat', g.saturate + '%');
    r.setProperty('--glass-radius', g.radius + 'px');
    r.setProperty('--glass-border', (g.border / 100).toFixed(3));
    r.setProperty('--glass-shadow', (g.shadow / 100).toFixed(3));

    // search bar
    r.setProperty('--search-width', state.search.width + 'px');
    r.setProperty('--search-radius', state.search.radius + 'px');

    // text colours
    const dark = ui.textTheme === 'dark';
    r.setProperty('--fg', dark ? '#0b1220' : '#ffffff');
    r.setProperty('--fg-dim', dark ? 'rgba(11,18,32,.62)' : 'rgba(255,255,255,.62)');
    r.setProperty('--fg-line', dark ? 'rgba(11,18,32,.14)' : 'rgba(255,255,255,.16)');
    r.setProperty('--overlay-tint', dark ? '255,255,255' : '0,0,0');

    $('#search-input').setAttribute('placeholder', state.search.placeholder || '搜索或输入网址');
  }

  function bodyClass(name, on) {
    document.body.classList.toggle(name, !!on);
  }

  /* ================================================= 5. background ====== */
  let bingFetched = false;

  function fetchBingUrl(idx) {
    const endpoints = [
      'https://cn.bing.com/HPImageArchive.aspx?format=js&idx=' + idx + '&n=1&mkt=zh-CN',
      'https://www.bing.com/HPImageArchive.aspx?format=js&idx=' + idx + '&n=1&mkt=en-US'
    ];
    return endpoints.reduce((chain, ep) => chain.catch(() => fetch(ep, { cache: 'no-store' })
      .then((res) => {
        if (!res.ok) throw new Error('http ' + res.status);
        return res.json();
      })
      .then((json) => {
        const img = json && json.images && json.images[0];
        if (!img) throw new Error('no image');
        let url = img.url || '';
        if (url.startsWith('/')) url = 'https://cn.bing.com' + url;
        // ask bing for the UHD render of the same picture
        url = url.replace(/_\d+x\d+\.jpg$/, '_UHD.jpg');
        return url;
      })), Promise.reject(new Error('init'))).then((u) => u);
  }

  function applyBackground() {
    const b = state.background;
    const bg = $('#bg');
    let image = '';

    if (b.source === 'url') image = b.url;
    else if (b.source === 'upload') image = b.dataUrl;
    else if (b.source === 'bing') image = b._bingUrl || '';
    else image = '';

    if (image) {
      bg.style.backgroundImage = 'url("' + image.replace(/"/g, '\\"') + '")';
      bg.style.backgroundColor = b.color;
      bg.style.backgroundSize = b.fit === 'contain' ? 'contain'
        : (b.fit === 'repeat' ? 'auto' : 'cover');
      bg.style.backgroundRepeat = b.fit === 'repeat' ? 'repeat' : 'no-repeat';
    } else {
      bg.style.backgroundImage = '';
      bg.style.backgroundSize = 'cover';
      bg.style.backgroundColor = b.color;
    }
  }

  const BING_KEY = 'litehome.bingCache';

  function loadBing(force) {
    const b = state.background;
    if (b.source !== 'bing' && !force) return Promise.resolve();

    const today = new Date().toISOString().slice(0, 10);
    return store.get(['bingCache']).then((res) => {
      const cache = res.bingCache || {};
      const key = today + '#' + (b.bingIndex || 0);
      if (!force && cache.key === key && cache.url) {
        b._bingUrl = cache.url;
        return;
      }
      return fetchBingUrl(b.bingIndex || 0)
        .then((url) => {
          b._bingUrl = url;
          bingFetched = true;
          return store.set({ bingCache: { key: key, url: url } });
        })
        .catch(() => {
          b._bingUrl = '';
          toast('必应壁纸获取失败，已使用纯色背景');
        });
    }).then(() => applyBackground());
  }

  /* ===================================================== 6. rendering === */
  const els = {};

  function cacheEls() {
    els.stage = $('#stage');
    els.groups = $('#groups-wrap');
    els.clockTime = $('#clock-time');
    els.clockDate = $('#clock-date');
    els.searchForm = $('#search-form');
    els.searchInput = $('#search-input');
    els.engines = $('#engines');
    els.addGroup = $('#add-group');
    els.panel = $('#panel');
    els.mask = $('#modal-mask');
    els.modal = $('#modal');
  }

  /* ---- clock ---- */
  const WEEK = ['星期日', '星期一', '星期二', '星期三', '星期四', '星期五', '星期六'];
  function tickClock() {
    const d = new Date();
    els.clockTime.textContent =
      String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
    els.clockDate.textContent =
      d.getFullYear() + ' 年 ' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日  ' + WEEK[d.getDay()];
  }

  /* ---- search engines ---- */
  function renderEngines() {
    els.engines.innerHTML = '';
    Object.keys(ENGINES).forEach((key) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = ENGINES[key].name;
      b.classList.toggle('on', state.search.engine === key);
      b.addEventListener('click', () => {
        state.search.engine = key;
        save();
        renderEngines();
        syncPanel();
        els.searchInput.focus();
      });
      els.engines.appendChild(b);
    });
  }

  /* ---- groups ---- */
  function tileSize(link) { return link.size || state.ui.iconSize; }
  function tileRadius(link) {
    const s = tileSize(link);
    if (link.radius == null) return Math.round(s * 0.27);
    return link.radius;
  }
  function groupWidth(g) { return g.width || state.ui.groupWidth; }
  function groupRadius(g) {
    if (g.radius == null) return state.glass.radius;
    return g.radius;
  }

  function renderGroups() {
    // keep the "+ 新建分组" node, rebuild the rest
    els.groups.querySelectorAll('.group').forEach((n) => n.remove());

    state.groups.forEach((g, gi) => {
      els.groups.appendChild(buildGroup(g, gi));
    });
  }

  function buildGroup(g, gi) {
    const el = document.createElement('section');
    el.className = 'group glass';
    el.dataset.gid = g.id;
    el.style.width = groupWidth(g) + 'px';
    el.style.borderRadius = groupRadius(g) + 'px';
    if (g.height) el.style.height = g.height + 'px';
    if (g.color) {
      const a = g.alpha == null ? state.glass.alpha / 100 : g.alpha;
      el.style.background = 'rgba(' + hexToRgb(g.color) + ',' + a + ')';
    }

    /* head */
    const head = document.createElement('div');
    head.className = 'group-head';
    head.innerHTML =
      '<span class="grip" draggable="true" title="拖动排序">⣿</span>' +
      '<span class="title">' + escapeHtml(g.name || '未命名分组') + '</span>' +
      '<span class="count">' + g.links.length + '</span>' +
      '<div class="tools">' +
        '<button data-act="add" title="添加网址">＋</button>' +
        '<button data-act="edit" title="编辑分组">✎</button>' +
        '<button data-act="del" class="danger" title="删除分组">✕</button>' +
      '</div>';

    head.querySelector('.grip').addEventListener('dragstart', (e) => {
      dragCtx = { kind: 'group', gid: g.id };
      el.classList.add('dragging');
      try { e.dataTransfer.setData('text/plain', g.id); } catch (err) { /* noop */ }
      e.dataTransfer.effectAllowed = 'move';
    });
    head.querySelector('.grip').addEventListener('dragend', () => {
      el.classList.remove('dragging');
      clearDropMarks();
      dragCtx = null;
    });

    head.querySelector('.tools').addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      const act = btn.dataset.act;
      if (act === 'add') openLinkDialog(g.id, null);
      else if (act === 'edit') openGroupDialog(g.id);
      else if (act === 'del') {
        confirmDialog('删除分组', '确定删除「' + g.name + '」及其中的 ' + g.links.length + ' 个网址吗？')
          .then((ok) => {
            if (!ok) return;
            state.groups = state.groups.filter((x) => x.id !== g.id);
            save(); renderGroups(); toast('分组已删除');
          });
      }
    });

    el.appendChild(head);

    /* links */
    const links = document.createElement('div');
    links.className = 'links';
    g.links.forEach((lk) => links.appendChild(buildTile(g, lk)));

    const add = document.createElement('div');
    add.className = 'tile add';
    add.innerHTML = '<div class="box">＋</div><div class="label">添加</div>';
    add.addEventListener('click', () => openLinkDialog(g.id, null));
    links.appendChild(add);
    el.appendChild(links);

    /* resize handles */
    const hSize = document.createElement('div');
    hSize.className = 'rh rh-size';
    hSize.title = '拖动调整分组大小';
    el.appendChild(hSize);
    attachResize(el, hSize, {
      min: { w: 200, h: 110 }, max: { w: 900, h: 1200 },
      onCommit(w, h) {
        g.width = Math.round(w);
        g.height = Math.round(h);
        save();
      }
    });

    const hRad = document.createElement('div');
    hRad.className = 'rh rh-radius';
    hRad.title = '拖动调整分组圆角';
    el.appendChild(hRad);
    attachRadius(el, hRad, {
      get: () => groupRadius(g),
      min: 0, max: 160,
      onCommit(v) { g.radius = v; save(); }
    });

    /* drop zone for links */
    bindGroupDrop(el, g);

    /* double click empty area = rename */
    el.addEventListener('dblclick', (e) => {
      if (!document.body.classList.contains('editing')) return;
      if (e.target.closest('.tile') || e.target.closest('button')) return;
      openGroupDialog(g.id);
    });

    return el;
  }

  function buildTile(g, lk) {
    const size = tileSize(lk);
    const tile = document.createElement('div');
    tile.className = 'tile';
    tile.dataset.lid = lk.id;
    tile.dataset.gid = g.id;
    tile.draggable = true;
    tile.style.width = Math.max(size, 74) + 'px';
    tile.title = lk.url;

    const box = document.createElement('div');
    box.className = 'box';
    box.style.width = size + 'px';
    box.style.height = size + 'px';
    box.style.borderRadius = tileRadius(lk) + 'px';
    if (lk.color) {
      const a = lk.alpha == null ? Math.max(state.glass.alpha, 8) / 100 * 0.85 : lk.alpha;
      box.style.background = 'rgba(' + hexToRgb(lk.color) + ',' + a + ')';
    }

    const letter = (lk.title || hostOf(lk.url) || '?').trim().charAt(0).toUpperCase();
    const fav = document.createElement('img');
    fav.className = 'fav';
    fav.alt = '';
    fav.referrerPolicy = 'no-referrer';
    const src = faviconUrl(lk.url);
    if (src) {
      fav.src = src;
      fav.addEventListener('error', () => tile.classList.add('no-icon'));
    } else {
      tile.classList.add('no-icon');
    }
    const fb = document.createElement('span');
    fb.className = 'fallback';
    fb.textContent = letter;

    box.appendChild(fav);
    box.appendChild(fb);

    const hSize = document.createElement('div');
    hSize.className = 'rh rh-size';
    box.appendChild(hSize);
    const hRad = document.createElement('div');
    hRad.className = 'rh rh-radius';
    box.appendChild(hRad);

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = lk.title || hostOf(lk.url);

    const tools = document.createElement('div');
    tools.className = 'tools';
    tools.innerHTML = '<button data-act="edit" title="编辑">✎</button>' +
                      '<button data-act="del" class="danger" title="删除">✕</button>';
    tools.addEventListener('click', (e) => {
      const btn = e.target.closest('button');
      if (!btn) return;
      e.stopPropagation();
      if (btn.dataset.act === 'edit') openLinkDialog(g.id, lk.id);
      else {
        confirmDialog('删除网址', '确定删除「' + (lk.title || lk.url) + '」吗？').then((ok) => {
          if (!ok) return;
          g.links = g.links.filter((x) => x.id !== lk.id);
          save(); renderGroups(); toast('已删除');
        });
      }
    });

    tile.appendChild(box);
    tile.appendChild(label);
    box.appendChild(tools);   // kept inside .box so it hugs the icon corner

    /* handles */
    attachResize(box, hSize, {
      min: { w: 36, h: 36 }, max: { w: 200, h: 200 },
      square: true,
      onLive(w) { tile.style.width = Math.max(w, 74) + 'px'; },
      onCommit(w) {
        lk.size = Math.round(w);
        if (lk.radius != null) lk.radius = Math.min(lk.radius, Math.round(w / 2) + 40);
        save(); renderGroups();
      }
    });
    attachRadius(box, hRad, {
      get: () => tileRadius(lk),
      min: 0, max: 999,
      onCommit(v) { lk.radius = v; save(); }
    });

    /* click / drag */
    tile.addEventListener('click', (e) => {
      if (e.target.closest('.rh') || e.target.closest('.tools')) return;
      if (document.body.classList.contains('editing')) { openLinkDialog(g.id, lk.id); return; }
      if (e.ctrlKey || e.metaKey) window.open(lk.url, '_blank');
      else location.href = lk.url;
    });
    tile.addEventListener('auxclick', (e) => {
      if (e.button === 1 && !document.body.classList.contains('editing')) {
        e.preventDefault();
        window.open(lk.url, '_blank');
      }
    });

    tile.addEventListener('dragstart', (e) => {
      dragCtx = { kind: 'link', gid: g.id, lid: lk.id };
      tile.classList.add('dragging');
      e.dataTransfer.effectAllowed = 'move';
      try { e.dataTransfer.setData('text/plain', lk.url); } catch (err) { /* noop */ }
    });
    tile.addEventListener('dragend', () => {
      tile.classList.remove('dragging');
      clearDropMarks();
      dragCtx = null;
    });

    return tile;
  }

  /* ==================================== 7. resize / radius interactions == */
  function showHint(host, text, clientX, clientY) {
    let h = host.querySelector('.rh-hint');
    if (!h) {
      h = document.createElement('div');
      h.className = 'rh-hint';
      if (getComputedStyle(host).position === 'static') host.style.position = 'relative';
      host.appendChild(h);
    }
    const r = host.getBoundingClientRect();
    h.textContent = text;
    h.style.left = (clientX - r.left) + 'px';
    h.style.top = (clientY - r.top) + 'px';
    return h;
  }
  function hideHint(host) {
    const h = host.querySelector('.rh-hint');
    if (h) h.remove();
  }

  function attachResize(el, handle, opts) {
    const min = opts.min || { w: 40, h: 40 };
    const max = opts.max || { w: 2000, h: 2000 };

    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');

      const rect = el.getBoundingClientRect();
      const sx = e.clientX, sy = e.clientY;
      const sw = rect.width, sh = rect.height;

      const onMove = (ev) => {
        const dx = ev.clientX - sx;
        const dy = ev.clientY - sy;
        let w, h;
        if (opts.square) {
          const d = (Math.abs(dx) > Math.abs(dy) ? dx : dy);
          w = h = clamp(sw + d, min.w, max.w);
        } else {
          w = clamp(sw + dx, min.w, max.w);
          h = clamp(sh + dy, min.h, max.h);
        }
        el.style.width = w + 'px';
        el.style.height = h + 'px';
        if (opts.onLive) opts.onLive(w, h);
        showHint(el, Math.round(w) + ' × ' + Math.round(h), ev.clientX, ev.clientY);
      };

      const onUp = (ev) => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        document.body.classList.remove('resizing');
        hideHint(el);
        const w = parseFloat(el.style.width) || sw;
        const h = parseFloat(el.style.height) || sh;
        if (opts.onCommit) opts.onCommit(w, h);
      };

      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
  }

  function attachRadius(el, handle, opts) {
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault();
      e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      document.body.classList.add('resizing');

      const sx = e.clientX;
      const start = opts.get ? opts.get() : 0;

      const onMove = (ev) => {
        const v = clamp(Math.round(start + (ev.clientX - sx) * 0.9), opts.min, opts.max);
        el.style.borderRadius = v + 'px';
        showHint(el, '圆角 ' + v + 'px', ev.clientX, ev.clientY);
      };
      const onUp = () => {
        handle.removeEventListener('pointermove', onMove);
        handle.removeEventListener('pointerup', onUp);
        handle.removeEventListener('pointercancel', onUp);
        document.body.classList.remove('resizing');
        hideHint(el);
        const v = parseFloat(el.style.borderRadius) || 0;
        if (opts.onCommit) opts.onCommit(v);
      };
      handle.addEventListener('pointermove', onMove);
      handle.addEventListener('pointerup', onUp);
      handle.addEventListener('pointercancel', onUp);
    });
  }

  /* ============================================ 8. drag & drop wiring === */
  let dragCtx = null;

  function clearDropMarks() {
    document.querySelectorAll('.group.drop-over').forEach((n) => n.classList.remove('drop-over'));
    document.querySelectorAll('.tile.drop-before').forEach((n) => n.classList.remove('drop-before'));
  }

  function insertIndexIn(container, clientX, clientY) {
    const tiles = Array.from(container.querySelectorAll('.tile')).filter(
      (t) => !t.classList.contains('add') && !t.classList.contains('dragging'));
    for (let i = 0; i < tiles.length; i++) {
      const r = tiles[i].getBoundingClientRect();
      if (clientY < r.bottom && clientX < r.right) {
        return { index: i, node: tiles[i] };
      }
    }
    return { index: tiles.length, node: null };
  }

  function bindGroupDrop(el, g) {
    const container = el.querySelector('.links');

    el.addEventListener('dragover', (e) => {
      if (!dragCtx || dragCtx.kind !== 'link') return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      el.classList.add('drop-over');
    });
    el.addEventListener('dragleave', (e) => {
      if (el.contains(e.relatedTarget)) return;
      el.classList.remove('drop-over');
      clearDropMarks();
    });

    container.addEventListener('dragover', (e) => {
      if (!dragCtx || dragCtx.kind !== 'link') return;
      e.preventDefault();
      const hit = insertIndexIn(container, e.clientX, e.clientY);
      document.querySelectorAll('.tile.drop-before').forEach((n) => n.classList.remove('drop-before'));
      if (hit.node) hit.node.classList.add('drop-before');
    });

    el.addEventListener('drop', (e) => {
      if (!dragCtx || dragCtx.kind !== 'link') return;
      e.preventDefault();
      e.stopPropagation();
      moveLink(dragCtx.gid, g.id, dragCtx.lid, container, e.clientX, e.clientY);
      clearDropMarks();
      dragCtx = null;
    });

    /* group reorder */
    el.addEventListener('dragover', (e) => {
      if (!dragCtx || dragCtx.kind !== 'group') return;
      e.preventDefault();
      if (dragCtx.gid === g.id) return;
      el.classList.add('drop-over');
    });
    el.addEventListener('drop', (e) => {
      if (!dragCtx || dragCtx.kind !== 'group' || dragCtx.gid === g.id) return;
      e.preventDefault();
      e.stopPropagation();
      const from = state.groups.findIndex((x) => x.id === dragCtx.gid);
      const to = state.groups.findIndex((x) => x.id === g.id);
      if (from < 0 || to < 0) return;
      const [moved] = state.groups.splice(from, 1);
      state.groups.splice(to, 0, moved);
      save(); renderGroups();
      clearDropMarks();
      dragCtx = null;
    });
  }

  function moveLink(fromGid, toGid, lid, container, cx, cy) {
    const from = state.groups.find((x) => x.id === fromGid);
    const to = state.groups.find((x) => x.id === toGid);
    if (!from || !to) return;
    const i = from.links.findIndex((x) => x.id === lid);
    if (i < 0) return;
    const [link] = from.links.splice(i, 1);

    let index = to.links.length;
    if (from === to) index = to.links.length;
    const hit = insertIndexIn(container, cx, cy);
    if (hit.index != null) index = Math.min(hit.index, to.links.length);

    to.links.splice(index, 0, link);
    save(); renderGroups();
    toast(from === to ? '已调整顺序' : '已移动到「' + to.name + '」');
  }

  /* ================================================== 9. dialogs ======== */
  let modalResolver = null;

  function closeModal(result) {
    els.mask.classList.remove('open');
    els.modal.innerHTML = '';
    const r = modalResolver;
    modalResolver = null;
    if (r) r(!!result);
  }

  function fieldHtml(f) {
    const id = 'f_' + f.key;
    if (f.type === 'select') {
      return '<div class="field"><span>' + escapeHtml(f.label) + '</span>' +
        '<select id="' + id + '" data-key="' + f.key + '" class="full">' +
        f.options.map((o) => '<option value="' + escapeHtml(o.value) + '"' +
          (String(o.value) === String(f.value) ? ' selected' : '') + '>' +
          escapeHtml(o.label) + '</option>').join('') +
        '</select></div>';
    }
    if (f.type === 'range') {
      return '<div class="field"><span>' + escapeHtml(f.label) +
        ' <b data-out="' + f.key + '" style="color:#a5b4fc">' + f.value + '</b></span>' +
        '<input type="range" id="' + id + '" data-key="' + f.key + '" min="' + f.min +
        '" max="' + f.max + '" step="' + (f.step || 1) + '" value="' + f.value + '" style="width:100%">' +
        '</div>';
    }
    if (f.type === 'color') {
      return '<div class="field"><span>' + escapeHtml(f.label) + '</span>' +
        '<input type="color" id="' + id + '" data-key="' + f.key + '" value="' +
        escapeHtml(f.value || '#ffffff') + '"></div>';
    }
    return '<div class="field"><span>' + escapeHtml(f.label) + '</span>' +
      '<input type="' + (f.type || 'text') + '" id="' + id + '" data-key="' + f.key +
      '" value="' + escapeHtml(f.value || '') + '" placeholder="' +
      escapeHtml(f.placeholder || '') + '"></div>';
  }

  function openModal(opts) {
    els.modal.innerHTML =
      '<h3>' + escapeHtml(opts.title) + '</h3>' +
      '<div class="modal-fields">' + (opts.fields || []).map(fieldHtml).join('') + '</div>' +
      '<div class="actions">' +
        (opts.extraButton || '') +
        '<button class="btn" data-close>取消</button>' +
        '<button class="btn primary" data-ok>' + escapeHtml(opts.okText || '确定') + '</button>' +
      '</div>';

    els.mask.classList.add('open');

    els.modal.querySelectorAll('input[type="range"]').forEach((r) => {
      r.addEventListener('input', () => {
        const out = els.modal.querySelector('[data-out="' + r.dataset.key + '"]');
        if (out) out.textContent = r.value;
      });
    });

    const collect = () => {
      const o = {};
      els.modal.querySelectorAll('[data-key]').forEach((n) => { o[n.dataset.key] = n.value; });
      return o;
    };

    els.modal.querySelector('[data-ok]').addEventListener('click', () => {
      const vals = collect();
      const err = opts.onSubmit ? opts.onSubmit(vals) : null;
      if (err === false) return;
      closeModal();
    });
    els.modal.querySelector('[data-close]').addEventListener('click', () => closeModal(false));
    const first = els.modal.querySelector('input[type="text"], input[type="url"]');
    if (first) { first.focus(); first.select(); }

    els.modal.onkeydown = (e) => {
      if (e.key === 'Enter' && e.target.tagName === 'INPUT' && e.target.type !== 'color') {
        e.preventDefault();
        els.modal.querySelector('[data-ok]').click();
      }
    };
    return collect;
  }

  function confirmDialog(title, text) {
    return new Promise((resolve) => {
      modalResolver = resolve;
      els.modal.innerHTML =
        '<h3>' + escapeHtml(title) + '</h3>' +
        '<p style="margin:0;font-size:13.5px;line-height:1.7;color:#cbd5e1">' +
        escapeHtml(text) + '</p>' +
        '<div class="actions"><button class="btn" data-close>取消</button>' +
        '<button class="btn danger" data-ok style="background:rgba(239,68,68,.35)">删除</button></div>';
      els.mask.classList.add('open');
      els.modal.querySelector('[data-ok]').addEventListener('click', () => closeModal(true));
      els.modal.querySelector('[data-close]').addEventListener('click', () => closeModal(false));
    });
  }

  function findGroup(gid) { return state.groups.find((x) => x.id === gid); }

  function openLinkDialog(gid, lid) {
    const g = findGroup(gid);
    if (!g) return;
    const link = lid ? g.links.find((x) => x.id === lid) : null;
    const cur = link || { title: '', url: '', size: state.ui.iconSize, radius: null, color: '', alpha: null };
    const alphaPct = cur.alpha == null ? Math.round(Math.max(state.glass.alpha, 8) * 0.85) : Math.round(cur.alpha * 100);

    openModal({
      title: link ? '编辑网址' : '添加网址',
      okText: link ? '保存' : '添加',
      fields: [
        { key: 'title', label: '名称', value: cur.title, placeholder: '例如 GitHub' },
        { key: 'url', label: '网址', type: 'text', value: cur.url, placeholder: 'https://github.com' },
        { key: 'size', label: '图标大小', type: 'range', value: tileSize(cur), min: 36, max: 160, step: 2 },
        { key: 'radius', label: '圆角', type: 'range', value: tileRadius(cur), min: 0, max: 120, step: 1 },
        { key: 'alpha', label: '背景不透明度 (%)', type: 'range', value: alphaPct, min: 0, max: 100, step: 1 },
        { key: 'color', label: '图标底色（选「#ffffff」外的颜色可覆盖全局）', type: 'color', value: cur.color || state.glass.tint }
      ],
      onSubmit(vals) {
        const url = normalizeUrl(vals.url);
        if (!url) { toast('请填写网址'); return false; }
        const payload = {
          title: (vals.title || '').trim() || hostOf(url) || url,
          url: url,
          size: parseInt(vals.size, 10),
          radius: parseInt(vals.radius, 10),
          color: (vals.color || '').toLowerCase() === String(state.glass.tint).toLowerCase() ? '' : vals.color,
          alpha: parseInt(vals.alpha, 10) / 100
        };
        if (link) Object.assign(link, payload);
        else g.links.push(Object.assign({ id: uid() }, payload));
        save(); renderGroups();
        toast(link ? '已保存' : '已添加');
      }
    });
  }

  function openGroupDialog(gid) {
    let g = findGroup(gid);
    const isNew = !g;
    if (isNew) g = { id: uid(), name: '', width: state.ui.groupWidth, height: null, radius: null, color: '', alpha: null, links: [] };
    const alphaPct = g.alpha == null ? state.glass.alpha : Math.round(g.alpha * 100);

    openModal({
      title: isNew ? '新建分组' : '编辑分组',
      okText: isNew ? '创建' : '保存',
      fields: [
        { key: 'name', label: '分组名称', value: g.name, placeholder: '例如 常用' },
        { key: 'width', label: '分组宽度', type: 'range', value: groupWidth(g), min: 200, max: 900, step: 10 },
        { key: 'radius', label: '圆角', type: 'range', value: groupRadius(g), min: 0, max: 160, step: 1 },
        { key: 'alpha', label: '背景不透明度 (%)', type: 'range', value: alphaPct, min: 0, max: 100, step: 1 },
        { key: 'color', label: '分组底色', type: 'color', value: g.color || state.glass.tint }
      ],
      onSubmit(vals) {
        g.name = (vals.name || '').trim() || '未命名分组';
        g.width = parseInt(vals.width, 10);
        g.radius = parseInt(vals.radius, 10);
        g.alpha = parseInt(vals.alpha, 10) / 100;
        g.color = (vals.color || '').toLowerCase() === String(state.glass.tint).toLowerCase() ? '' : vals.color;
        if (isNew) state.groups.push(g);
        save(); renderGroups();
        toast(isNew ? '分组已创建' : '已保存');
      }
    });
  }

  /* ============================== 10. settings panel / data io / init === */
  function getPath(path) {
    return path.split('.').reduce((o, k) => (o == null ? o : o[k]), state);
  }
  function setPath(path, val) {
    const ks = path.split('.');
    const last = ks.pop();
    let o = state;
    ks.forEach((k) => { if (o[k] == null) o[k] = {}; o = o[k]; });
    o[last] = val;
  }

  const UNIT = {
    'background.blur': 'px', 'background.overlay': '%', 'background.brightness': '%',
    'background.zoom': '%', 'glass.blur': 'px', 'glass.alpha': '%', 'glass.saturate': '%',
    'glass.radius': 'px', 'glass.border': '%', 'glass.shadow': '%',
    'search.width': 'px', 'search.radius': 'px', 'ui.iconSize': 'px', 'ui.groupWidth': 'px'
  };

  function syncPanel() {
    els.panel.querySelectorAll('[data-bind]').forEach((n) => {
      const path = n.dataset.bind;
      const v = getPath(path);
      if (n.classList.contains('sw')) {
        n.classList.toggle('on', !!v);
      } else if (n.type === 'range') {
        n.value = v;
        const out = els.panel.querySelector('[data-val="' + path + '"]');
        if (out) out.textContent = v + (UNIT[path] || '');
      } else {
        n.value = v == null ? '' : v;
      }
    });
    els.panel.querySelectorAll('[data-show-if]').forEach((n) => {
      const [path, want] = n.dataset.showIf.split('=');
      const cur = getPath(path);
      let show = String(cur) === want;
      if (path === 'background.source') {
        show = String(cur) === want;
      }
      n.style.display = show ? '' : 'none';
    });
    const presetBtns = els.panel.querySelectorAll('#glass-presets button');
    presetBtns.forEach((b) => b.classList.toggle('on', b.dataset.preset === state.glass._preset));
  }

  function bindPanel() {
    els.panel.addEventListener('click', (e) => {
      const sw = e.target.closest('.sw[data-bind]');
      if (sw) {
        const path = sw.dataset.bind;
        setPath(path, !getPath(path));
        sw.classList.toggle('on', !!getPath(path));
        afterSettingChange(path);
        return;
      }
      const preset = e.target.closest('#glass-presets button');
      if (preset) {
        const p = GLASS_PRESETS[preset.dataset.preset];
        Object.assign(state.glass, p);
        state.glass._preset = preset.dataset.preset;
        if (p.enabled === false) state.glass.enabled = false;
        else state.glass.enabled = true;
        save(); applyTheme(); syncPanel(); renderGroups();
        return;
      }
      if (e.target.closest('[data-bg-random]')) {
        state.background.source = 'bing';
        state.background.bingIndex = ((state.background.bingIndex || 0) + 1) % 8;
        save();
        syncPanel();
        loadBing(true).then(() => toast('已切换到必应壁纸 #' + ((state.background.bingIndex || 0) + 1)));
        return;
      }
    });

    els.panel.addEventListener('input', (e) => {
      const n = e.target.closest('[data-bind]');
      if (!n || n.classList.contains('sw')) return;
      const path = n.dataset.bind;
      let v = n.value;
      if (n.type === 'range' || n.type === 'number') v = parseInt(v, 10);
      setPath(path, v);
      // live numeric readout next to the slider
      const out = els.panel.querySelector('[data-val="' + path + '"]');
      if (out) out.textContent = v + (UNIT[path] || '');
      afterSettingChange(path);
    });

    els.panel.addEventListener('change', (e) => {
      const n = e.target.closest('[data-bind]');
      if (!n) return;
      if (n.type === 'range' || n.type === 'number') return; // handled on input
      const path = n.dataset.bind;
      setPath(path, n.value);
      syncPanel();          // refresh conditional rows (data-show-if) and readouts
      afterSettingChange(path);
    });

    $('#bg-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      if (f.size > 8 * 1024 * 1024) toast('图片较大（>8MB），可能保存失败');
      const fr = new FileReader();
      fr.onload = () => {
        state.background.dataUrl = fr.result;
        state.background.source = 'upload';
        save(true).then(() => { applyBackground(); syncPanel(); });
      };
      fr.readAsDataURL(f);
    });

    $('#panel-close').addEventListener('click', () => els.panel.classList.remove('open'));

    /* data io */
    $('#data-export').addEventListener('click', () => {
      const raw = JSON.parse(JSON.stringify(state));
      delete raw.background._bingUrl;
      const blob = new Blob([JSON.stringify(raw, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = 'lite-homepage-' + new Date().toISOString().slice(0, 10) + '.json';
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      toast('配置已导出');
    });

    $('#data-import').addEventListener('click', () => $('#import-file').click());
    $('#import-file').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (!f) return;
      const fr = new FileReader();
      fr.onload = () => {
        try {
          const obj = JSON.parse(fr.result);
          state = mergeDeep(sampleState(), obj);
          save(true).then(() => {
            applyTheme(); renderGroups(); renderEngines(); syncPanel();
            loadBing(true);
            toast('配置已导入');
          });
        } catch (err) {
          toast('导入失败：文件格式不正确');
        }
      };
      fr.readAsText(f);
      e.target.value = '';
    });

    $('#data-clear').addEventListener('click', () => {
      confirmDialog('清空收藏', '将删除所有分组和网址，此操作不可恢复。').then((ok) => {
        if (!ok) return;
        state.groups = [];
        save(); renderGroups(); toast('已清空');
      });
    });

    $('#data-reset').addEventListener('click', () => {
      confirmDialog('恢复默认', '所有设置与收藏将恢复为初始状态。').then((ok) => {
        if (!ok) return;
        state = sampleState();
        save(true).then(() => {
          applyTheme(); renderGroups(); renderEngines(); syncPanel(); loadBing(true);
          toast('已恢复默认');
        });
      });
    });
  }

  function afterSettingChange(path) {
    applyTheme();
    save();
    if (path.indexOf('background.') === 0) {
      if (path === 'background.source') loadBing(true);
      else applyBackground();
    }
    // only these need a DOM rebuild; the rest are driven by CSS variables
    if (path === 'ui.iconSize' || path === 'ui.groupWidth' || path === 'glass.radius') {
      renderGroups();
    }
  }

  /* ---- search behaviour ---- */
  function bindSearch() {
    els.searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const q = els.searchInput.value.trim();
      if (!q) return;
      if (looksLikeUrl(q)) { location.href = normalizeUrl(q); return; }
      const key = state.search.engine;
      const tpl = key === 'custom'
        ? (state.search.customUrl || ENGINES.bing.url)
        : (ENGINES[key] || ENGINES.bing).url;
      location.href = tpl.replace('%s', encodeURIComponent(q));
    });
  }

  /* ---- toolbar / modes ---- */
  function bindToolbar() {
    $('#tb-mode').addEventListener('click', () => {
      state.mode = state.mode === 'minimal' ? 'bookmarks' : 'minimal';
      if (state.mode === 'minimal') document.body.classList.remove('editing');
      save(); applyTheme(); syncToolbar();
      els.searchInput.focus();
    });
    $('#tb-edit').addEventListener('click', () => {
      if (state.mode === 'minimal') { state.mode = 'bookmarks'; save(); applyTheme(); }
      const on = !document.body.classList.contains('editing');
      document.body.classList.toggle('editing', on);
      $('#tb-edit').classList.toggle('on', on);
      syncToolbar();
      if (on) toast('编辑模式：拖动紫色方块改大小，青色圆点改圆角');
    });
    $('#tb-settings').addEventListener('click', () => {
      els.panel.classList.toggle('open');
      syncPanel();
    });
    els.addGroup.addEventListener('click', () => openGroupDialog(null));
  }

  function syncToolbar() {
    $('#tb-mode-label').textContent = state.mode === 'minimal' ? '极简' : '收藏夹';
    $('#tb-edit').classList.toggle('on', document.body.classList.contains('editing'));
  }

  function bindKeys() {
    document.addEventListener('keydown', (e) => {
      const typing = /^(INPUT|TEXTAREA|SELECT)$/.test(document.activeElement.tagName);
      if (e.key === 'Escape') {
        if (els.mask.classList.contains('open')) closeModal(false);
        else if (els.panel.classList.contains('open')) els.panel.classList.remove('open');
        else if (document.body.classList.contains('editing')) {
          document.body.classList.remove('editing');
          syncToolbar();
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'e') {
        e.preventDefault();
        $('#tb-edit').click();
        return;
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'm') {
        e.preventDefault();
        $('#tb-mode').click();
        return;
      }
      if (e.key === '/' && !typing) {
        e.preventDefault();
        els.searchInput.focus();
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        els.searchInput.focus();
        els.searchInput.select();
      }
    });
    els.mask.addEventListener('click', (e) => { if (e.target === els.mask) closeModal(false); });
  }

  /* ---- boot ---- */
  function init() {
    cacheEls();
    load().then(() => {
      applyTheme();
      renderEngines();
      renderGroups();
      bindPanel();
      bindSearch();
      bindToolbar();
      bindKeys();
      syncPanel();
      syncToolbar();
      // persist the merged/default state straight away so the store always
      // holds a valid snapshot from the very first tab
      save(true);
      els.searchInput.value = '';
      els.searchInput.focus();
      tickClock();
      setInterval(tickClock, 1000 * 10);
      loadBing(false);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
