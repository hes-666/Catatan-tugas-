(function () {
  var KEY = 'catatan-tugas-v1';
  var $ = function (s) { return document.querySelector(s); };

  var form = $('#taskForm'), titleI = $('#title'), noteI = $('#note'),
      dueI = $('#due'), prioI = $('#priority'), errorP = $('#formError'),
      submitBtn = $('#submitBtn'), cancelBtn = $('#cancelBtn'), banner = $('#editBanner'),
      content = $('#content'), tabPending = $('#tabPending'), tabDone = $('#tabDone');

  var tasks = [];
  var editingId = null;
  var tab = 'pending';
  var toastTimer = null;

  var HOUR = 3600000, DAY = 86400000;
  var PRIORITY = { rendah: 'rendah', sedang: 'sedang', tinggi: 'tinggi' };

  /* ---------- Ikon ---------- */
  var ICONS = {
    calendar: '<rect x="3" y="4" width="18" height="18" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/>',
    clock: '<circle cx="12" cy="12" r="10"/><path d="M12 6v6l4 2"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    flag: '<path d="M4 22V4"/><path d="M4 4h13l-2 4 2 4H4"/>',
    edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
    trash: '<path d="M3 6h18"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>'
  };
  function icon(name) {
    var s = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    s.setAttribute('viewBox', '0 0 24 24');
    s.setAttribute('class', 'i');
    s.setAttribute('aria-hidden', 'true');
    s.innerHTML = ICONS[name];
    return s;
  }

  /* ---------- Penyimpanan (localStorage) ---------- */
  function load() {
    try {
      var raw = localStorage.getItem(KEY);
      if (raw !== null) {
        var parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (e) {}
    return null;
  }
  function save() { try { localStorage.setItem(KEY, JSON.stringify(tasks)); } catch (e) {} }
  function uid() { return Date.now().toString(36) + Math.random().toString(36).slice(2, 7); }
  function seed() {
    var n = Date.now();
    return [
      { id: uid(), title: 'Kumpulkan laporan praktikum', note: 'Format PDF, kirim lewat email dosen.', due: n + 5 * HOUR, priority: 'tinggi', done: false, doneAt: null },
      { id: uid(), title: 'Bayar tagihan internet', note: '', due: n - DAY, priority: 'sedang', done: false, doneAt: null },
      { id: uid(), title: 'Baca bab 4 buku pemrograman web', note: 'Catat poin penting untuk kuis.', due: n + 3 * DAY, priority: 'sedang', done: false, doneAt: null },
      { id: uid(), title: 'Rapikan catatan kuliah minggu lalu', note: '', due: n + 2 * DAY, priority: 'rendah', done: true, doneAt: n - 3 * HOUR }
    ];
  }

  /* ---------- Format tanggal ---------- */
  var fmtShort = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
  var fmtShortY = new Intl.DateTimeFormat('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
  var fmtTime = new Intl.DateTimeFormat('id-ID', { hour: '2-digit', minute: '2-digit', hour12: false });
  var fmtLong = new Intl.DateTimeFormat('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

  function fmtDate(ts) {
    var d = new Date(ts);
    var day = d.getFullYear() === new Date().getFullYear() ? fmtShort.format(d) : fmtShortY.format(d);
    return day + ', ' + fmtTime.format(d);
  }
  function pad(n) { return String(n).padStart(2, '0'); }
  function toInputValue(ts) {
    var d = new Date(ts);
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()) +
           'T' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function defaultDue() {
    var d = new Date();
    d.setDate(d.getDate() + 1);
    d.setHours(17, 0, 0, 0);
    return d.getTime();
  }
  function unitText(abs) {
    if (abs < HOUR) return Math.max(1, Math.round(abs / 60000)) + ' menit';
    if (abs < DAY) return Math.round(abs / HOUR) + ' jam';
    return Math.floor(abs / DAY) + ' hari';
  }
  function statusOf(t, now) {
    var diff = t.due - now;
    if (diff < 0) return 'late';
    if (diff < DAY) return 'soon';
    return 'ok';
  }

  /* ---------- Helper DOM (aman dari HTML injection) ---------- */
  function h(tag, attrs) {
    var e = document.createElement(tag);
    var a = attrs || {};
    Object.keys(a).forEach(function (k) {
      var v = a[k];
      if (v === null || v === undefined || v === false) return;
      if (k === 'class') e.className = v;
      else if (k.indexOf('on') === 0) e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v === true ? '' : v);
    });
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i];
      if (c === null || c === undefined || c === false) continue;
      e.append(c.nodeType ? c : document.createTextNode(c));
    }
    return e;
  }
  function chip(kind, iconName, text) {
    return h('span', { class: 'chip ' + kind }, icon(iconName), text);
  }

  /* ---------- Tampilan ---------- */
  function taskEl(t, now) {
    var cb = h('input', {
      type: 'checkbox',
      'aria-label': (t.done ? 'Tandai belum selesai: ' : 'Tandai selesai: ') + t.title,
      onchange: function () { toggle(t.id); }
    });
    cb.checked = t.done;

    var chips = [];
    var status = statusOf(t, now);
    chips.push(chip('', 'calendar', 'Tenggat ' + fmtDate(t.due)));
    if (t.done) {
      var onTime = t.doneAt && t.doneAt <= t.due;
      chips.push(chip(onTime ? 'ok' : 'late', 'check',
        'Selesai ' + (t.doneAt ? fmtDate(t.doneAt) : '') + (onTime ? '' : ' (terlambat)')));
    } else {
      var diff = t.due - now;
      chips.push(chip(status, 'clock', diff < 0 ? 'Terlambat ' + unitText(-diff) : unitText(diff) + ' lagi'));
    }
    chips.push(chip('p-' + t.priority, 'flag', 'Prioritas ' + (PRIORITY[t.priority] || 'sedang')));

    return h('li', { class: 'task' + (t.done ? ' is-done' : '') },
      h('label', { class: 'checkwrap' }, cb, h('span', { class: 'box' })),
      h('div', {},
        h('p', { class: 'title' }, t.title),
        t.note ? h('p', { class: 'note' }, t.note) : null,
        h.apply(null, ['div', { class: 'chips' }].concat(chips))
      ),
      h('div', { class: 'acts' },
        h('button', { type: 'button', class: 'icon-btn', 'aria-label': 'Ubah tugas: ' + t.title, title: 'Ubah', onclick: function () { startEdit(t.id); } }, icon('edit')),
        h('button', { type: 'button', class: 'icon-btn danger', 'aria-label': 'Hapus tugas: ' + t.title, title: 'Hapus', onclick: function () { remove(t.id); } }, icon('trash'))
      )
    );
  }

  function groupEl(label, kind, items, now) {
    var ul = h('ul', { class: 'rows' });
    items.forEach(function (t) { ul.append(taskEl(t, now)); });
    return h('section', { class: 'group' },
      h('h2', { class: 'group-head ' + kind }, label, h('span', { class: 'gc' }, String(items.length))),
      ul
    );
  }

  function render() {
    var now = Date.now();
    var pending = tasks.filter(function (t) { return !t.done; }).sort(function (a, b) { return a.due - b.due; });
    var done = tasks.filter(function (t) { return t.done; }).sort(function (a, b) { return (b.doneAt || 0) - (a.doneAt || 0); });
    var late = pending.filter(function (t) { return t.due < now; }).length;

    $('#today').textContent = fmtLong.format(new Date(now));
    $('#nPending').textContent = pending.length;
    $('#nDone').textContent = done.length;
    tabPending.setAttribute('aria-pressed', tab === 'pending');
    tabDone.setAttribute('aria-pressed', tab === 'done');

    var summary = $('#summary');
    if (!tasks.length) summary.textContent = 'Belum ada tugas.';
    else if (!pending.length) summary.textContent = 'Semua tugas sudah selesai.';
    else summary.textContent = pending.length + ' tugas belum selesai' + (late ? ', ' + late + ' terlambat' : '');

    content.replaceChildren();

    if (tab === 'done') {
      if (!done.length) content.append(h('div', { class: 'empty' }, 'Belum ada tugas yang selesai.'));
      else content.append(groupEl('Sudah dikerjakan', '', done, now));
      return;
    }

    if (!pending.length) {
      content.append(h('div', { class: 'empty' }, 'Tidak ada tugas yang menunggu. Tulis tugas baru di atas.'));
      return;
    }

    var t0 = new Date(now); t0.setHours(0, 0, 0, 0); t0 = t0.getTime();
    var groups = [
      { label: 'Terlambat', kind: 'late', items: [] },
      { label: 'Hari ini', kind: '', items: [] },
      { label: 'Besok', kind: '', items: [] },
      { label: 'Mendatang', kind: '', items: [] }
    ];
    pending.forEach(function (t) {
      if (t.due < now) groups[0].items.push(t);
      else if (t.due < t0 + DAY) groups[1].items.push(t);
      else if (t.due < t0 + 2 * DAY) groups[2].items.push(t);
      else groups[3].items.push(t);
    });
    groups.forEach(function (g) {
      if (g.items.length) content.append(groupEl(g.label, g.kind, g.items, now));
    });
  }

  /* ---------- Aksi ---------- */
  function find(id) { return tasks.filter(function (t) { return t.id === id; })[0]; }

  function toggle(id) {
    var t = find(id);
    if (!t) return;
    t.done = !t.done;
    t.doneAt = t.done ? Date.now() : null;
    save();
    render();
  }

  function remove(id) {
    var i = tasks.findIndex(function (t) { return t.id === id; });
    if (i < 0) return;
    var removed = tasks.splice(i, 1)[0];
    if (editingId === id) resetForm();
    save();
    render();
    showToast('Tugas dihapus.', 'Urungkan', function () {
      tasks.splice(Math.min(i, tasks.length), 0, removed);
      save();
      render();
    });
  }

  function startEdit(id) {
    var t = find(id);
    if (!t) return;
    editingId = id;
    titleI.value = t.title;
    noteI.value = t.note || '';
    dueI.value = toInputValue(t.due);
    prioI.value = t.priority || 'sedang';
    banner.hidden = false;
    submitBtn.textContent = 'Simpan';
    cancelBtn.hidden = false;
    errorP.textContent = '';
    form.scrollIntoView({ behavior: 'smooth', block: 'center' });
    titleI.focus();
  }

  function resetForm() {
    editingId = null;
    form.reset();
    dueI.value = toInputValue(defaultDue());
    prioI.value = 'sedang';
    banner.hidden = true;
    submitBtn.textContent = 'Tambah';
    cancelBtn.hidden = true;
    errorP.textContent = '';
  }

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var title = titleI.value.trim();
    var due = new Date(dueI.value).getTime();

    if (!title) { errorP.textContent = 'Tulis nama tugas terlebih dahulu.'; titleI.focus(); return; }
    if (!dueI.value || isNaN(due)) { errorP.textContent = 'Pilih tanggal dan jam tenggat.'; dueI.focus(); return; }

    if (editingId) {
      var t = find(editingId);
      if (t) {
        t.title = title;
        t.note = noteI.value.trim();
        t.due = due;
        t.priority = prioI.value;
      }
    } else {
      tasks.push({ id: uid(), title: title, note: noteI.value.trim(), due: due, priority: prioI.value, done: false, doneAt: null });
      tab = 'pending';
    }
    save();
    resetForm();
    render();
  });

  cancelBtn.addEventListener('click', resetForm);
  tabPending.addEventListener('click', function () { tab = 'pending'; render(); });
  tabDone.addEventListener('click', function () { tab = 'done'; render(); });

  /* ---------- Toast ---------- */
  function showToast(msg, actionLabel, onAction) {
    var toast = $('#toast'), btn = $('#toastAction');
    $('#toastMsg').textContent = msg;
    btn.textContent = actionLabel;
    btn.onclick = function () { hideToast(); onAction(); };
    toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(hideToast, 6000);
  }
  function hideToast() { $('#toast').hidden = true; }

  /* ---------- Mulai ---------- */
  var stored = load();
  tasks = stored !== null ? stored : seed();
  if (stored === null) save();
  resetForm();
  render();

  // Perbarui label "x jam lagi" tiap 30 detik (tanpa mengganggu fokus keyboard)
  setInterval(function () {
    var a = document.activeElement;
    if (a && content.contains(a)) return;
    render();
  }, 30000);
})();
