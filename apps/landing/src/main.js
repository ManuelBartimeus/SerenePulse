/* global document, window */
// Progressive enhancement only: the page is complete without JavaScript.
(function () {
  var doc = document;

  // Mobile navigation disclosure (button with aria-expanded / aria-controls).
  var btn = doc.querySelector('.menu-btn');
  var nav = doc.getElementById('site-nav');
  if (btn && nav) {
    btn.hidden = false;
    var label = btn.querySelector('.menu-label');
    var use = btn.querySelector('use');
    var setOpen = function (open) {
      nav.classList.toggle('open', open);
      btn.setAttribute('aria-expanded', String(open));
      if (label) label.textContent = open ? 'Close' : 'Menu';
      if (use) use.setAttribute('href', open ? '#i-close' : '#i-menu');
    };
    btn.addEventListener('click', function () {
      setOpen(btn.getAttribute('aria-expanded') !== 'true');
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setOpen(false);
    });
    doc.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && nav.classList.contains('open')) {
        setOpen(false);
        btn.focus();
      }
    });
    window.matchMedia('(min-width: 1000px)').addEventListener('change', function (m) {
      if (m.matches) setOpen(false);
    });
  }

  // Branch region filter (toggle buttons with aria-pressed). All regions stay visible without JS.
  var filter = doc.querySelector('.region-filter');
  var status = doc.getElementById('branch-count');
  if (filter) {
    filter.hidden = false;
    var regions = doc.querySelectorAll('.region');
    filter.addEventListener('click', function (e) {
      var b = e.target.closest && e.target.closest('button');
      if (!b) return;
      var key = b.getAttribute('data-region');
      filter.querySelectorAll('button').forEach(function (x) {
        x.setAttribute('aria-pressed', String(x === b));
      });
      var shown = 0;
      regions.forEach(function (r) {
        var on = key === 'all' || r.getAttribute('data-region') === key;
        r.hidden = !on;
        if (on) shown += r.querySelectorAll('.branch').length;
      });
      if (status) {
        status.textContent =
          'Showing ' +
          shown +
          (shown === 1 ? ' branch' : ' branches') +
          (key === 'all' ? '' : ' in ' + b.textContent);
      }
    });
  }
})();
