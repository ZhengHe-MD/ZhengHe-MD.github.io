/* Running dashboard — vanilla port of equator's projection math (src/lib/projection.js)
   trimmed to what this page renders. Data: /running/data.json (see scripts/filter-activities.jq). */
(function () {
  'use strict';

  var CONFIG = {
    goalKm: 40075.02,
    planStartDate: '2026-03-21',
    targetDate: '2048-12-31',
  };
  var DAY_MS = 24 * 60 * 60 * 1000;

  function parseUtc(s) {
    var p = s.split('-').map(Number);
    return new Date(Date.UTC(p[0], p[1] - 1, p[2]));
  }
  function addDays(d, n) { return new Date(d.getTime() + n * DAY_MS); }
  function daysBetween(a, b) { return Math.max(0, Math.round((b.getTime() - a.getTime()) / DAY_MS)); }
  function fmtKm(n, digits) {
    return n.toLocaleString('en-US', { maximumFractionDigits: digits == null ? 0 : digits });
  }

  // dedupe per date keeping the longest run (mirrors normalizeActivities)
  function normalize(records) {
    var byDate = new Map();
    records.forEach(function (r) {
      var cur = byDate.get(r.date);
      if (!cur || r.distance > cur.distance) byDate.set(r.date, r);
    });
    return Array.from(byDate.values()).sort(function (a, b) { return a.date < b.date ? -1 : 1; });
  }

  function milestones(records) {
    var first = parseUtc(records[0].date);
    var planStart = parseUtc(CONFIG.planStartDate);
    var target = parseUtc(CONFIG.targetDate);
    var baselineKm = records.reduce(function (s, r) {
      return parseUtc(r.date) < planStart ? s + r.distance : s;
    }, 0);
    var totalPlanDays = daysBetween(planStart, addDays(target, 1));
    var dailyTargetKm = totalPlanDays === 0 ? 0 : (CONFIG.goalKm - baselineKm) / totalPlanDays;
    return [0.25, 0.5, 0.75, 1].map(function (p) {
      var requiredKm = Math.max(CONFIG.goalKm * p - baselineKm, 0);
      var days = dailyTargetKm === 0 ? 0 : Math.max(Math.ceil(requiredKm / dailyTargetKm) - 1, 0);
      var date = p === 1 ? target : addDays(planStart, days);
      return { pct: Math.round(p * 100) + '%', pos: p * 100, year: date.getUTCFullYear() };
    });
  }

  function heatLevel(km) {
    if (km <= 0) return 0;
    if (km < 4) return 1;
    if (km < 7) return 2;
    if (km < 10) return 3;
    if (km < 15) return 4;
    return 5;
  }

  fetch('/running/data.json')
    .then(function (r) { return r.json(); })
    .then(function (raw) {
      var records = normalize(raw);
      if (!records.length) return;

      var totalKm = records.reduce(function (s, r) { return s + r.distance; }, 0);
      var pct = totalKm / CONFIG.goalKm;
      var first = records[0].date;
      var last = records[records.length - 1].date;

      // hero
      document.getElementById('run-hero').hidden = false;
      document.getElementById('rh-done').textContent = fmtKm(totalKm);
      document.getElementById('rh-remaining').textContent = fmtKm(Math.max(CONFIG.goalKm - totalKm, 0));
      document.getElementById('rh-pct').textContent = (pct * 100).toFixed(1) + '%';
      document.getElementById('rh-start').textContent = first;
      document.getElementById('rh-sync').textContent = last;
      var barPct = Math.min(pct * 100, 100).toFixed(2) + '%';
      document.getElementById('rh-fill').style.width = barPct;
      document.getElementById('rh-runner').style.left = barPct;
      var msWrap = document.getElementById('rh-milestones');
      milestones(records).forEach(function (m) {
        var el = document.createElement('div');
        el.className = 'ms';
        el.style.left = m.pos + '%';
        el.innerHTML = '<div class="p">' + m.pct + '</div><div class="d">~' + m.year + '</div>';
        msWrap.appendChild(el);
      });

      // per-year aggregates
      var byYear = new Map();
      records.forEach(function (r) {
        var y = Number(r.date.slice(0, 4));
        if (!byYear.has(y)) byYear.set(y, []);
        byYear.get(y).push(r);
      });
      var thisYear = new Date().getFullYear();
      var years = Array.from(byYear.keys()).sort(function (a, b) { return b - a; });

      var grid = document.getElementById('year-grid');
      years.forEach(function (year) {
        var runs = byYear.get(year);
        var total = runs.reduce(function (s, r) { return s + r.distance; }, 0);
        var kmByDate = new Map();
        runs.forEach(function (r) { kmByDate.set(r.date, r.distance); });

        // daily heatmap: one cell per day of the year
        var start = parseUtc(year + '-01-01');
        var days = daysBetween(start, parseUtc((year + 1) + '-01-01'));
        var cells = '';
        for (var i = 0; i < days; i++) {
          var d = addDays(start, i);
          var key = d.toISOString().slice(0, 10);
          var lvl = heatLevel(kmByDate.get(key) || 0);
          cells += '<span style="background:var(--heat-' + lvl + ')" title="' + key +
            (kmByDate.has(key) ? ' · ' + kmByDate.get(key).toFixed(1) + ' km' : '') + '"></span>';
        }

        // monthly totals
        var monthKm = new Array(12).fill(0);
        runs.forEach(function (r) { monthKm[Number(r.date.slice(5, 7)) - 1] += r.distance; });
        var maxMonth = Math.max.apply(null, monthKm.concat([0.01]));
        var bars = monthKm.map(function (km) {
          var h = Math.round((km / maxMonth) * 100);
          return '<span style="height:' + h + '%" title="' + km.toFixed(1) + ' km"></span>';
        }).join('');
        var labels = '';
        for (var mo = 1; mo <= 12; mo++) labels += '<span>' + mo + '</span>';

        var stage = year < thisYear ? '已结束' : year === thisYear ? '进行中' : '未开始';
        var badgeCls = year === thisYear ? 'badge active' : 'badge';

        var card = document.createElement('div');
        card.className = 'year-card';
        card.innerHTML =
          '<div class="head"><span class="year">' + year + '</span><span class="' + badgeCls + '">' + stage + '</span></div>' +
          '<div class="total">' + fmtKm(total, 1) + ' km</div>' +
          '<div class="heatmap">' + cells + '</div>' +
          '<div class="month-bars">' + bars + '</div>' +
          '<div class="month-labels">' + labels + '</div>';
        grid.appendChild(card);
      });
    })
    .catch(function (err) { console.error('running dashboard:', err); });
})();
