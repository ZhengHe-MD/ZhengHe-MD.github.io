/* ZhengHe personal site — shared chrome.
   Loaded blocking in <head> so the theme applies before first paint. */
(function () {
  'use strict';

  // ---------- theme (must run before paint) ----------
  var stored = null;
  try { stored = localStorage.getItem('theme'); } catch (e) {}
  var theme = stored === 'light' || stored === 'dark'
    ? stored
    : (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
  document.documentElement.setAttribute('data-theme', theme);

  function setTheme(next) {
    theme = next;
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme', next); } catch (e) {}
    document.querySelectorAll('.theme-toggle').forEach(function (btn) {
      btn.textContent = next === 'dark' ? '☀' : '☾';
    });
  }
  window.__toggleTheme = function () { setTheme(theme === 'dark' ? 'light' : 'dark'); };

  // ---------- nav / footer web components ----------
  var NAV_ITEMS = [
    { id: 'writing', zh: '写作', en: 'Writing', href: '/writing/' },
    { id: 'projects', zh: '项目', en: 'Projects', href: '/projects/' },
    { id: 'running', zh: '跑步', en: 'Running', href: '/running/' },
    { id: 'talks', zh: '演讲', en: 'Talks', href: '/talks/' },
    { id: 'about', zh: '关于', en: 'About', href: '/about/' }
  ];

  var EMAIL = 'ranchardzheng@gmail.com';
  var GITHUB = 'https://github.com/ZhengHe-MD';

  customElements.define('site-nav', class extends HTMLElement {
    connectedCallback() {
      var active = this.getAttribute('active') || '';
      var links = NAV_ITEMS.map(function (n) {
        return '<a class="nav-item' + (n.id === active ? ' active' : '') + '" href="' + n.href + '">' +
          '<span class="zh">' + n.zh + '</span><span class="en">' + n.en + '</span></a>';
      }).join('');
      this.innerHTML =
        '<header class="site-header"><div class="container bar">' +
        '<a class="brand" href="/"><span class="zh">郑鹤</span><span class="en">ZhengHe</span></a>' +
        '<nav aria-label="主导航" style="display:flex;align-items:center;gap:4px;">' +
        '<div class="site-nav-links">' + links +
        '<button class="theme-toggle" title="切换主题" aria-label="切换主题">' + (theme === 'dark' ? '☀' : '☾') + '</button>' +
        '</div>' +
        '<button class="nav-burger" title="菜单" aria-label="菜单">☰</button>' +
        '</nav></div></header>';
      var self = this;
      this.querySelector('.theme-toggle').addEventListener('click', window.__toggleTheme);
      this.querySelector('.nav-burger').addEventListener('click', function () {
        self.querySelector('.site-nav-links').classList.toggle('open');
      });
    }
  });

  customElements.define('site-footer', class extends HTMLElement {
    connectedCallback() {
      this.innerHTML =
        '<footer class="site-footer"><div class="inner">' +
        '<div class="copy">© ' + new Date().getFullYear() + ' 郑鹤 · ZhengHe</div>' +
        '<div class="links">' +
        '<a href="/feed.xml">RSS</a>' +
        '<a href="' + GITHUB + '">GitHub</a>' +
        '<a href="mailto:' + EMAIL + '">Email</a>' +
        '</div></div></footer>';
    }
  });

  // ---------- per-page features ----------
  document.addEventListener('DOMContentLoaded', function () {
    var meta = function (name) {
      var el = document.querySelector('meta[name="' + name + '"]');
      return el ? el.getAttribute('content') : null;
    };

    // MathJax (per-page flag; self-hosted)
    if (meta('mathjax') === 'true') {
      window.MathJax = {
        tex: { inlineMath: [['$', '$'], ['\\(', '\\)']], processEscapes: true },
        chtml: { fontURL: '/assets/vendor/mathjax/fonts/woff-v2' },
        options: { skipHtmlTags: ['script', 'noscript', 'style', 'textarea', 'pre', 'code'] }
      };
      var mj = document.createElement('script');
      mj.src = '/assets/vendor/mathjax/tex-chtml.js';
      mj.async = true;
      document.head.appendChild(mj);
    }

    // Code highlighting (self-hosted highlight.js, loaded only when needed)
    if (document.querySelector('.prose pre code, .til-card pre code')) {
      var hl = document.createElement('script');
      hl.src = '/assets/vendor/highlight/highlight.min.js';
      hl.onload = function () {
        document.querySelectorAll('.prose pre code, .til-card pre code').forEach(function (block) {
          try { window.hljs.highlightElement(block); } catch (e) {}
        });
      };
      document.head.appendChild(hl);
    }

    // Image zoom for article images
    document.addEventListener('click', function (ev) {
      var t = ev.target;
      if (t.tagName === 'IMG' && t.closest('.prose')) {
        var overlay = document.createElement('div');
        overlay.className = 'zoom-overlay';
        var img = document.createElement('img');
        img.src = t.src;
        img.alt = t.alt || '';
        overlay.appendChild(img);
        overlay.addEventListener('click', function () { overlay.remove(); });
        document.body.appendChild(overlay);
      }
    });

    // Category filter buttons (writing index)
    document.querySelectorAll('[data-filter-target]').forEach(function (group) {
      var rowClass = group.getAttribute('data-filter-target');
      group.querySelectorAll('.filter-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          group.querySelectorAll('.filter-btn').forEach(function (b) { b.classList.remove('active'); });
          btn.classList.add('active');
          var want = btn.getAttribute('data-filter');
          document.querySelectorAll('.' + rowClass).forEach(function (row) {
            row.style.display = (want === '*' || row.getAttribute('data-cat') === want) ? '' : 'none';
          });
        });
      });
    });

    // Giscus (placeholder until Discussions + giscus app are configured).
    // When ready: replace the placeholder block by wiring data-repo-id/category-id here.
  });

  // ---------- Cloudflare Web Analytics (site's only third-party request) ----------
  if (location.hostname === 'zhenghe-md.github.io') {
    var cf = document.createElement('script');
    cf.defer = true;
    cf.src = 'https://static.cloudflareinsights.com/beacon.min.js';
    cf.setAttribute('data-cf-beacon', '{"token": "ba6353705dc04c448779a37c8fa6a89e"}');
    document.head.appendChild(cf);
  }
})();
