/* global document, window, fetch, sessionStorage, history, location, URLSearchParams, AbortController, setTimeout, clearTimeout */
// Progressive enhancement for every page. Each page works without this file: the menu links are
// visible, branches are all listed, and forms submit to real URLs. No innerHTML anywhere: every
// piece of text from the server is set with textContent.
// Minification note (build.mjs): every line must stand alone; no multi-line template literals, and no
// line may start with "*" or "/*".
(function () {
  'use strict';
  var doc = document;

  // ---- Small DOM helpers ----------------------------------------------------------------------
  function el(tag, attrs, children) {
    var node = doc.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'text') node.textContent = attrs[k];
        else if (k === 'class') node.className = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    (children || []).forEach(function (c) {
      if (c) node.appendChild(typeof c === 'string' ? doc.createTextNode(c) : c);
    });
    return node;
  }
  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }
  function money(n) {
    var v = Number(n) || 0;
    return 'GH₵ ' + v.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function iso(d) {
    var m = String(d.getMonth() + 1).padStart(2, '0');
    var day = String(d.getDate()).padStart(2, '0');
    return d.getFullYear() + '-' + m + '-' + day;
  }
  function parseIso(s) {
    var p = String(s || '').split('-');
    if (p.length !== 3) return null;
    var d = new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]));
    return isNaN(d.getTime()) ? null : d;
  }
  function addDays(d, n) {
    var c = new Date(d.getTime());
    c.setDate(c.getDate() + n);
    return c;
  }
  function longDate(s) {
    var d = parseIso(s);
    return d ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : s;
  }
  function today() {
    var d = new Date();
    d.setHours(0, 0, 0, 0);
    return d;
  }

  // ---- Header: compact on scroll, full-height mobile menu --------------------------------------
  var header = doc.querySelector('[data-header]');
  if (header) {
    var onScroll = function () {
      header.classList.toggle('is-compact', window.scrollY > 24);
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
  }
  var menuBtn = doc.querySelector('.menu-btn');
  var nav = doc.getElementById('site-nav');
  if (menuBtn && nav && header) {
    menuBtn.hidden = false;
    var label = menuBtn.querySelector('.menu-label');
    var setOpen = function (open, focusBack) {
      nav.classList.toggle('is-open', open);
      doc.documentElement.classList.toggle('menu-open', open);
      menuBtn.setAttribute('aria-expanded', String(open));
      if (label) label.textContent = open ? 'Close' : 'Menu';
      if (open) {
        var first = nav.querySelector('a');
        if (first) first.focus();
      } else if (focusBack) {
        menuBtn.focus();
      }
    };
    menuBtn.addEventListener('click', function () {
      setOpen(menuBtn.getAttribute('aria-expanded') !== 'true', true);
    });
    nav.addEventListener('click', function (e) {
      if (e.target.closest && e.target.closest('a')) setOpen(false, false);
    });
    doc.addEventListener('keydown', function (e) {
      if (!nav.classList.contains('is-open')) return;
      if (e.key === 'Escape') {
        setOpen(false, true);
        return;
      }
      if (e.key !== 'Tab') return;
      // Keep focus inside the open menu and its toggle button.
      var items = [menuBtn].concat(Array.prototype.slice.call(nav.querySelectorAll('a')));
      var i = items.indexOf(doc.activeElement);
      if (e.shiftKey && i <= 0) {
        e.preventDefault();
        items[items.length - 1].focus();
      } else if (!e.shiftKey && i === items.length - 1) {
        e.preventDefault();
        items[0].focus();
      }
    });
    var wide = window.matchMedia('(min-width: 1024px)');
    var onWide = function () {
      if (wide.matches) setOpen(false, false);
    };
    if (wide.addEventListener) wide.addEventListener('change', onWide);
  }

  // ---- Tabs (quick quote) ------------------------------------------------------------------------
  var tablist = doc.querySelector('[role="tablist"]');
  if (tablist) {
    var tabs = Array.prototype.slice.call(tablist.querySelectorAll('[role="tab"]'));
    var select = function (tab, focus) {
      tabs.forEach(function (t) {
        var on = t === tab;
        t.setAttribute('aria-selected', String(on));
        t.tabIndex = on ? 0 : -1;
        var panel = doc.getElementById(t.getAttribute('aria-controls'));
        if (panel) panel.hidden = !on;
      });
      if (focus) tab.focus();
    };
    if (/[?&]quote=travel/.test(location.search) && tabs[1]) select(tabs[1], false);
    tabs.forEach(function (tab, i) {
      tab.addEventListener('click', function () {
        select(tab, false);
      });
      tab.addEventListener('keydown', function (e) {
        var next = null;
        if (e.key === 'ArrowRight') next = tabs[(i + 1) % tabs.length];
        else if (e.key === 'ArrowLeft') next = tabs[(i - 1 + tabs.length) % tabs.length];
        else if (e.key === 'Home') next = tabs[0];
        else if (e.key === 'End') next = tabs[tabs.length - 1];
        if (next) {
          e.preventDefault();
          select(next, true);
        }
      });
    });
  }

  // ---- Field errors ------------------------------------------------------------------------------
  function setError(input, message) {
    var id = input.id + '-error';
    var existing = doc.getElementById(id);
    var described = (input.getAttribute('aria-describedby') || '').split(' ').filter(function (x) {
      return x && x !== id;
    });
    if (existing) existing.parentNode.removeChild(existing);
    if (!message) {
      input.removeAttribute('aria-invalid');
      if (described.length) input.setAttribute('aria-describedby', described.join(' '));
      else input.removeAttribute('aria-describedby');
      return;
    }
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', described.concat(id).join(' '));
    var p = el('p', { class: 'field-error', id: id, text: message });
    input.parentNode.appendChild(p);
  }

  // ---- Quick quote -------------------------------------------------------------------------------
  var STORAGE_KEY = 'serene.quickQuote';
  var BUY_URL = '/account/buy?product=';

  function continueTo(productCode, answers) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ productCode: productCode, answers: answers }));
    } catch {
      // Private browsing can block storage; the proposal form simply starts empty.
    }
    location.href = BUY_URL + productCode;
  }

  function postQuote(body) {
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timer = ctrl
      ? setTimeout(function () {
          ctrl.abort();
        }, 12000)
      : null;
    return fetch('/api/account/quick-quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-requested-with': 'serene-account' },
      body: JSON.stringify(body),
      credentials: 'same-origin',
      signal: ctrl ? ctrl.signal : undefined,
    })
      .then(function (res) {
        if (timer) clearTimeout(timer);
        var type = res.headers.get('content-type') || '';
        var json = type.indexOf('json') >= 0 ? res.json() : Promise.resolve(null);
        return json.then(
          function (data) {
            return { status: res.status, data: data };
          },
          function () {
            return { status: res.status, data: null };
          },
        );
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        return { status: 0, data: null };
      });
  }

  /** Turns any response into { kind: 'quote' | 'refer' | 'invalid' | 'unavailable', … }. */
  function interpret(r) {
    var d = r.data || {};
    var reasons = [];
    if (Array.isArray(d.refer)) reasons = d.refer;
    else if (Array.isArray(d.reasons)) reasons = d.reasons;
    if (r.status >= 200 && r.status < 300) {
      if (d.ok === false) return { kind: 'refer', reasons: reasons };
      var q = d.quote || d;
      if (q && typeof q.total === 'number') return { kind: 'quote', quote: q };
      return { kind: 'unavailable' };
    }
    if (r.status === 422 || reasons.length) {
      if (!reasons.length && Array.isArray(d.errors)) {
        reasons = d.errors.map(function (e) {
          return e && e.message ? e.message : String(e);
        });
      }
      if (!reasons.length && d.detail) reasons = [d.detail];
      return { kind: 'refer', reasons: reasons };
    }
    if (r.status === 400 && d && (d.detail || d.errors)) {
      return { kind: 'invalid', message: d.detail || 'Please check your answers.' };
    }
    return { kind: 'unavailable' };
  }

  function actions(onContinue, onChange, continueLabel) {
    var go = el('button', {
      type: 'button',
      class: 'btn btn-primary btn-block',
      text: continueLabel || 'Continue',
    });
    go.addEventListener('click', onContinue);
    var back = el('button', { type: 'button', class: 'btn btn-quiet btn-block', text: 'Change details' });
    back.addEventListener('click', onChange);
    return el('div', { class: 'qq-actions' }, [go, back]);
  }

  function renderQuote(box, title, quote, period, onContinue, onChange) {
    var rows = [];
    (quote.lines || []).forEach(function (l) {
      rows.push(el('tr', null, [el('td', { text: l.label }), el('td', { text: money(l.amount) })]));
    });
    (quote.taxes || []).forEach(function (l) {
      rows.push(el('tr', null, [el('td', { text: l.label }), el('td', { text: money(l.amount) })]));
    });
    rows.push(
      el('tr', { class: 'total' }, [
        el('td', { text: 'Total to pay' }),
        el('td', { text: money(quote.total) }),
      ]),
    );
    var table = el('table', { class: 'qq-lines' }, [
      el('caption', { class: 'sr-only', text: 'How the price is made up' }),
      el('tbody', null, rows),
    ]);
    var notes = (quote.notes || []).slice();
    if (quote.validUntil) notes.push('This price is valid until ' + longDate(quote.validUntil) + '.');
    var children = [
      el('h3', { text: title, tabindex: '-1' }),
      el('span', {
        class: 'qq-badge ' + (quote.indicative ? 'indicative' : 'firm'),
        text: quote.indicative ? 'Indicative price' : 'Fixed tariff price',
      }),
      el('p', { class: 'qq-total', text: money(quote.total) }),
      el('p', { class: 'qq-period', text: period }),
      table,
    ];
    if (quote.indicative) {
      children.push(
        el('p', {
          class: 'hint',
          text: 'Indicative: an underwriter confirms the price after seeing your answers, photos and documents. You will see any change before you pay.',
        }),
      );
    }
    if (notes.length) {
      children.push(
        el(
          'ul',
          { class: 'qq-notes' },
          notes.map(function (n) {
            return el('li', { text: n });
          }),
        ),
      );
    }
    children.push(actions(onContinue, onChange, 'Continue to the proposal form'));
    show(box, children);
  }

  function renderRefer(box, reasons, onContinue, onChange) {
    var list = reasons.length
      ? el(
          'ul',
          { class: 'qq-notes' },
          reasons.map(function (r) {
            return el('li', { text: r });
          }),
        )
      : null;
    show(box, [
      el('div', { class: 'qq-refer' }, [
        el('h3', { text: 'An underwriter needs to price this', tabindex: '-1' }),
        list,
        el('p', {
          text: 'You can still apply online. Continue to the proposal form and an underwriter will send you a price, usually within one working day.',
        }),
      ]),
      actions(onContinue, onChange, 'Continue to the proposal form'),
    ]);
  }

  function renderUnavailable(box, lines, onContinue, onChange) {
    var children = [el('h3', { text: 'We can’t show a live price right now', tabindex: '-1' })];
    lines.forEach(function (t) {
      children.push(el('p', { text: t }));
    });
    children.push(actions(onContinue, onChange, 'Continue to the proposal form'));
    show(box, children);
  }

  function show(box, children) {
    clear(box);
    children.forEach(function (c) {
      if (c) box.appendChild(c);
    });
    box.hidden = false;
    var h = box.querySelector('h3');
    if (h) h.focus();
  }

  function busy(form, on) {
    var btn = form.querySelector('[type="submit"]');
    if (!btn) return;
    if (on) {
      btn.dataset.label = btn.textContent;
      btn.textContent = 'Working out your price…';
      btn.disabled = true;
    } else {
      btn.textContent = btn.dataset.label || btn.textContent;
      btn.disabled = false;
    }
  }

  function wireForm(form, build) {
    var box = form.parentNode.querySelector('[data-result]');
    var restore = function () {
      box.hidden = true;
      clear(box);
      form.hidden = false;
      var first = form.querySelector('input, select');
      if (first) first.focus();
    };
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var spec = build();
      if (!spec) return;
      busy(form, true);
      postQuote({ productCode: spec.productCode, answers: spec.answers }).then(function (r) {
        busy(form, false);
        var res = interpret(r);
        var go = function () {
          continueTo(spec.productCode, spec.answers);
        };
        if (res.kind === 'invalid') {
          renderRefer(box, [res.message], go, restore);
        } else if (res.kind === 'quote') {
          renderQuote(box, spec.title, res.quote, spec.period, go, restore);
        } else if (res.kind === 'refer') {
          renderRefer(box, res.reasons, go, restore);
        } else {
          renderUnavailable(box, spec.fallback, go, restore);
        }
        form.hidden = true;
      });
    });
  }

  // Motor
  var motorForm = doc.querySelector('form[data-product="MTR"]');
  if (motorForm) {
    var vehicle = motorForm.querySelector('#m-vehicle');
    var seats = motorForm.querySelector('#m-seats');
    var body = motorForm.querySelector('#m-body');
    var value = motorForm.querySelector('#m-value');
    var year = motorForm.querySelector('#m-year');
    var start = motorForm.querySelector('#m-start');
    var t0 = today();
    start.value = iso(t0);
    start.min = iso(t0);
    start.max = iso(addDays(t0, 60));
    year.max = String(t0.getFullYear() + 1);
    var cover = function () {
      var c = motorForm.querySelector('input[name="cover_type"]:checked');
      return c ? c.value : 'tpo';
    };
    var sync = function () {
      var opt = vehicle.options[vehicle.selectedIndex];
      motorForm.querySelector('[data-show="seats"]').hidden = opt.dataset.seats !== 'true';
      motorForm.querySelector('[data-show="goods"]').hidden = opt.dataset.goods !== 'true';
      motorForm.querySelector('[data-show="own-damage"]').hidden = cover() === 'tpo';
    };
    motorForm.addEventListener('change', sync);
    sync();
    wireForm(motorForm, function () {
      var opt = vehicle.options[vehicle.selectedIndex];
      var c = cover();
      var bad = [];
      [seats, value, year, start].forEach(function (i) {
        setError(i, '');
      });
      var seatCount = 5;
      if (opt.dataset.seats === 'true') {
        seatCount = Number(seats.value);
        if (!(seatCount >= 6 && seatCount <= 60)) {
          setError(seats, 'Enter the number of seats, from 6 to 60.');
          bad.push(seats);
        }
      } else if (opt.dataset.goods === 'true' || opt.value === 'tricycle') {
        seatCount = 3;
      } else if (opt.value === 'motorcycle') {
        seatCount = 2;
      }
      var amount = Number(String(value.value).replace(/[,\s]/g, '').replace(/^GH₵/i, ''));
      var made = Number(year.value);
      if (c !== 'tpo') {
        if (!(amount > 0)) {
          setError(value, 'Enter the vehicle’s value in cedis, for example 85000.');
          bad.push(value);
        }
        if (!(made >= 1970 && made <= t0.getFullYear() + 1)) {
          setError(year, 'Enter the year the vehicle was made, for example 2018.');
          bad.push(year);
        }
      }
      var s = parseIso(start.value);
      if (!s || s < t0 || s > addDays(t0, 60)) {
        setError(start, 'Choose a start date between today and 60 days from now.');
        bad.push(start);
      }
      if (bad.length) {
        bad[0].focus();
        return null;
      }
      var end = addDays(new Date(s.getFullYear() + 1, s.getMonth(), s.getDate()), -1);
      var row = {
        body_type: opt.dataset.goods === 'true' ? body.value : opt.dataset.body,
        seating_capacity: seatCount,
      };
      if (c !== 'tpo') {
        row.estimated_value = amount;
        row.year_of_make = made;
      }
      var coverName = motorForm.querySelector('input[name="cover_type"]:checked + span strong').textContent;
      var tpo = Number(opt.dataset.tpo);
      var fallback = [
        'Our pricing service did not answer. You can still continue: the proposal form works out the same price.',
        c === 'tpo' && tpo
          ? 'Third party only for this class of vehicle is ' +
            money(tpo).replace('.00', '') +
            ' a year, the NIC tariff from 16 February 2026' +
            (opt.dataset.seats === 'true' ? ' (for up to 12 seats; larger buses cost more).' : '.')
          : 'Third party from GH₵ 557 a year for a private car.',
      ];
      return {
        productCode: 'MTR',
        title:
          coverName +
          ', ' +
          opt.textContent
            .toLowerCase()
            .replace('suv', 'SUV')
            .replace('uber, bolt, yango', 'Uber, Bolt, Yango'),
        period: 'For 12 months from ' + longDate(iso(s)) + ' to ' + longDate(iso(end)) + '.',
        fallback: fallback,
        answers: {
          vehicle_use: opt.dataset.use,
          vehicles: [row],
          cover_type: c,
          tppd_increase: 'no',
          cover_start: iso(s),
          cover_end: iso(end),
        },
      };
    });
  }

  // Travel
  var travelForm = doc.querySelector('form[data-product="TRV"]');
  if (travelForm) {
    var zone = travelForm.querySelector('#t-zone');
    var tStart = travelForm.querySelector('#t-start');
    var tEnd = travelForm.querySelector('#t-end');
    var list = travelForm.querySelector('[data-travellers]');
    var addBtn = travelForm.querySelector('[data-add-traveller]');
    var t1 = today();
    tStart.min = iso(t1);
    tEnd.min = iso(t1);
    tStart.addEventListener('change', function () {
      if (tStart.value) tEnd.min = tStart.value;
    });
    var counter = 1;
    var relabel = function () {
      Array.prototype.forEach.call(list.children, function (li, i) {
        var lab = li.querySelector('label');
        if (i > 0) lab.textContent = 'Traveller ' + (i + 1);
        var rm = li.querySelector('.remove');
        if (rm) rm.setAttribute('aria-label', 'Remove traveller ' + (i + 1));
      });
      addBtn.hidden = list.children.length >= 8;
    };
    addBtn.addEventListener('click', function () {
      var id = 't-dob-' + counter++;
      var input = el('input', { id: id, type: 'date', 'data-dob': '' });
      input.max = iso(t1);
      var remove = el('button', { type: 'button', class: 'remove', text: '✕' });
      var li = el('li', { class: 'traveller' }, [el('label', { for: id, text: 'Traveller' }), input, remove]);
      remove.addEventListener('click', function () {
        list.removeChild(li);
        relabel();
        addBtn.focus();
      });
      list.appendChild(li);
      relabel();
      input.focus();
    });
    travelForm.querySelector('#t-dob-0').max = iso(t1);
    wireForm(travelForm, function () {
      var bad = [];
      var dobs = Array.prototype.slice.call(list.querySelectorAll('[data-dob]'));
      [tStart, tEnd].concat(dobs).forEach(function (i) {
        setError(i, '');
      });
      var s = parseIso(tStart.value);
      var e = parseIso(tEnd.value);
      if (!s || s < t1) {
        setError(tStart, 'Choose the day you leave Ghana: today or later.');
        bad.push(tStart);
      }
      if (!e || (s && e < s)) {
        setError(tEnd, 'Choose the day you return, on or after the day you leave.');
        bad.push(tEnd);
      }
      dobs.forEach(function (i) {
        var d = parseIso(i.value);
        if (!d || d > t1) {
          setError(i, 'Enter a date of birth.');
          bad.push(i);
        }
      });
      if (bad.length) {
        bad[0].focus();
        return null;
      }
      var days = Math.round((e - s) / 86400000) + 1;
      var others = dobs.slice(1).map(function (i, n) {
        return { name: 'Traveller ' + (n + 2), date_of_birth: i.value };
      });
      var people = dobs.length === 1 ? '1 traveller' : dobs.length + ' travellers';
      return {
        productCode: 'TRV',
        title: zone.options[zone.selectedIndex].textContent + ', ' + people,
        period:
          days + (days === 1 ? ' day' : ' days') + ', ' + longDate(iso(s)) + ' to ' + longDate(iso(e)) + '.',
        fallback: [
          'Our pricing service did not answer. Travel prices depend on the destination zone, the length of the trip and each traveller’s age.',
          'You can still continue: the proposal form works out the price, and Schengen cover meets the EUR 30,000 visa requirement.',
        ],
        answers: {
          destination_zone: zone.value,
          cover_start: iso(s),
          cover_end: iso(e),
          date_of_birth: dobs[0].value,
          accompanying_travellers: others,
        },
      };
    });
  }

  // ---- Certificate check ---------------------------------------------------------------------------
  var verifyForm = doc.querySelector('[data-verify]');
  if (verifyForm) {
    var cert = verifyForm.querySelector('#v-cert');
    var reg = verifyForm.querySelector('#v-reg');
    var out = doc.querySelector('[data-verify-result]');
    var params = new URLSearchParams(location.search);
    if (params.get('certificate')) cert.value = params.get('certificate');
    if (params.get('reg')) reg.value = params.get('reg');
    var STATUS = {
      active: [
        'is-valid',
        'Valid certificate',
        'This certificate is genuine and the cover is in force today.',
      ],
      not_yet_active: [
        'is-warn',
        'Not yet started',
        'This certificate is genuine, but the cover has not started yet.',
      ],
      expired: ['is-bad', 'Expired', 'This certificate is genuine, but the cover has ended.'],
      cancelled: ['is-bad', 'Cancelled', 'This policy was cancelled. The certificate no longer gives cover.'],
    };
    var paint = function (cls, title, text, rows) {
      clear(out);
      out.className = 'verify-result ' + cls;
      out.appendChild(el('h3', { text: title }));
      out.appendChild(el('p', { text: text }));
      if (rows && rows.length) {
        out.appendChild(
          el(
            'dl',
            null,
            rows.map(function (r) {
              return el('div', null, [el('dt', { text: r[0] }), el('dd', { text: r[1] })]);
            }),
          ),
        );
      }
      out.focus();
    };
    var check = function () {
      setError(cert, '');
      setError(reg, '');
      var c = cert.value.trim();
      var g = reg.value.trim();
      if (!c) setError(cert, 'Enter the certificate number.');
      if (!g) setError(reg, 'Enter the vehicle registration or the policy number.');
      if (!c || !g) {
        (c ? reg : cert).focus();
        return;
      }
      if (history.replaceState) history.replaceState(null, '', '?certificate=' + encodeURIComponent(c));
      var btn = verifyForm.querySelector('[type="submit"]');
      btn.disabled = true;
      btn.textContent = 'Checking…';
      fetch('/api/verify?certificate=' + encodeURIComponent(c) + '&reg=' + encodeURIComponent(g), {
        headers: { accept: 'application/json' },
      })
        .then(function (res) {
          if (res.status === 429) return { tooMany: true };
          if (!res.ok && res.status !== 404) throw new Error('status ' + res.status);
          return res.json();
        })
        .then(function (d) {
          if (d.tooMany) {
            paint('is-warn', 'Too many checks', 'Please wait a minute and try again.');
          } else if (!d.found) {
            paint(
              'is-bad',
              'Not found',
              'No Serene certificate matches both of these details. Check them against the certificate. If they are right, the certificate may not be genuine: please call us on 030 291 7444.',
            );
          } else {
            var s = STATUS[d.status] || [
              'is-warn',
              'Found',
              'This certificate was issued by Serene Insurance.',
            ];
            var rows = [];
            if (d.certificateNo) rows.push(['Certificate', d.certificateNo]);
            if (d.policyNo) rows.push(['Policy', d.policyNo]);
            if (d.productName || d.coverTitle)
              rows.push(['Cover', [d.productName, d.coverTitle].filter(Boolean).join(', ')]);
            if (d.insuredSubject) rows.push(['Insured', d.insuredSubject]);
            if (d.holderInitials) rows.push(['Policyholder', d.holderInitials]);
            if (d.startsOn || d.expiresOn)
              rows.push(['Period', longDate(d.startsOn) + ' to ' + longDate(d.expiresOn)]);
            paint(s[0], s[1], s[2], rows);
          }
        })
        .catch(function () {
          paint(
            'is-warn',
            'We couldn’t check right now',
            'Please try again in a moment, or call us on 030 291 7444. For motor, you can also dial *920*57#.',
          );
        })
        .then(function () {
          btn.disabled = false;
          btn.textContent = 'Check certificate';
        });
    };
    verifyForm.addEventListener('submit', function (e) {
      e.preventDefault();
      check();
    });
    if (cert.value && reg.value) check();
    else if (cert.value) reg.focus();
  }

  // ---- Branch finder -------------------------------------------------------------------------------
  var finder = doc.querySelector('[data-branch-filter]');
  if (finder) {
    var q = finder.querySelector('#branch-q');
    var region = finder.querySelector('#branch-region');
    var status = doc.querySelector('[data-branch-status]');
    var empty = doc.querySelector('[data-branch-empty]');
    var sections = Array.prototype.slice.call(doc.querySelectorAll('.region'));
    var total = doc.querySelectorAll('.branch').length;
    var apply = function () {
      var words = q.value.toLowerCase().split(/\s+/).filter(Boolean);
      var shown = 0;
      sections.forEach(function (sec) {
        var inRegion = !region.value || sec.getAttribute('data-region') === region.value;
        var visible = 0;
        Array.prototype.forEach.call(sec.querySelectorAll('.branch'), function (b) {
          var text = b.getAttribute('data-search');
          var on =
            inRegion &&
            words.every(function (w) {
              return text.indexOf(w) >= 0;
            });
          b.hidden = !on;
          if (on) visible++;
        });
        sec.hidden = visible === 0;
        shown += visible;
      });
      empty.hidden = shown !== 0;
      status.textContent = shown === total ? '' : 'Showing ' + shown + ' of ' + total + ' branches';
    };
    q.addEventListener('input', apply);
    region.addEventListener('change', apply);
    finder.addEventListener('submit', function (e) {
      e.preventDefault();
    });
  }
})();
