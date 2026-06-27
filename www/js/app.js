/* ============================================================
   app.js — 現金経費管理アプリ 本体
   ============================================================ */
(() => {
  'use strict';

  const DEFAULT_CATS = ['接待交際', '消耗品', '旅費交通', '会議', 'その他'];
  const CHART_COLORS = ['#0f766e', '#2563eb', '#c2410c', '#7c3aed', '#0891b2', '#ca8a04', '#be185d', '#4d7c0f'];
  const $ = (sel, root = document) => root.querySelector(sel);
  const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

  const state = {
    view: 'home',
    histMonth: '',
    analysisMonth: '',
    categories: DEFAULT_CATS.slice(),
    opening: 0,
    allTx: [],
    cashcounts: {},      // month -> {month, actual, countedAt}
    input: null,
    exportMonth: '',
  };

  /* ---------- 小道具 ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  function todayISO() {
    const d = new Date();
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  }
  const monthOf = (iso) => iso.slice(0, 7);
  function currentMonth() { return monthOf(todayISO()); }
  function yen(n) {
    const v = Math.round(n);
    return '¥' + v.toLocaleString('ja-JP');
  }
  function signedYen(t) {
    return (t.type === 'withdraw' ? '+' : '−') + '¥' + t.amount.toLocaleString('ja-JP');
  }
  function monthLabel(m) {
    const [y, mo] = m.split('-');
    return `${y}年${Number(mo)}月`;
  }
  const WD = ['日', '月', '火', '水', '木', '金', '土'];
  function dateLabel(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    const wd = WD[new Date(y, m - 1, d).getDay()];
    return `${m}月${d}日(${wd})`;
  }
  function uid() {
    return 'tx_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
  }
  function signedAmount(t) { return t.type === 'withdraw' ? t.amount : -t.amount; }

  /* ---------- 計算（整合性の核心） ---------- */
  function computeMonth(month) {
    let carryIn = state.opening;
    let withdraw = 0, expense = 0;
    for (const t of state.allTx) {
      if (t.month < month) {
        carryIn += signedAmount(t);
      } else if (t.month === month) {
        if (t.type === 'withdraw') withdraw += t.amount;
        else expense += t.amount;
      }
    }
    const remain = carryIn + withdraw - expense;
    const cc = state.cashcounts[month];
    const diff = cc ? cc.actual - remain : null;
    return { carryIn, withdraw, expense, remain, cashcount: cc || null, diff };
  }

  /* ---------- データ読み込み ---------- */
  async function reloadData() {
    state.allTx = await DB.getAllTransactions();
    state.allTx.sort((a, b) =>
      a.date < b.date ? 1 : a.date > b.date ? -1 : (b.createdAt - a.createdAt));
    const counts = await DB.getAllCashCounts();
    state.cashcounts = {};
    counts.forEach((c) => { state.cashcounts[c.month] = c; });
  }

  /* ============================================================
     描画：入力（ホーム）
     ============================================================ */
  function renderHome() {
    const m = currentMonth();
    const c = computeMonth(m);
    const bEl = $('#home-balance');
    bEl.textContent = yen(c.remain);
    bEl.classList.toggle('neg', c.remain < 0);
    $('#home-balance-note').textContent = c.carryIn !== 0
      ? `前月繰越 ${yen(c.carryIn)} を含む`
      : '';

    // 最近の記録（全期間から新しい順に3件）
    const recent = state.allTx.slice(0, 3);
    const list = $('#recent-list');
    list.innerHTML = '';
    recent.forEach((t) => list.appendChild(txItem(t, true)));
    $('#recent-empty').hidden = recent.length > 0;
  }

  /* ============================================================
     描画：分析（グラフ）
     ============================================================ */
  function shortYen(v) {
    if (!v) return '';
    if (v >= 10000) return (Math.round((v / 10000) * 10) / 10) + '万';
    return '¥' + v.toLocaleString('ja-JP');
  }
  function analysisCategories(month) {
    const map = {};
    for (const t of state.allTx) {
      if (t.month === month && t.type === 'expense') {
        const k = t.category || 'その他';
        map[k] = (map[k] || 0) + t.amount;
      }
    }
    const arr = Object.keys(map).map((k) => ({ name: k, amount: map[k] }));
    arr.sort((a, b) => b.amount - a.amount);
    arr.forEach((cat, i) => { cat.color = CHART_COLORS[i % CHART_COLORS.length]; });
    return arr;
  }
  function analysisMonths(month, n) {
    const [y, mo] = month.split('-').map(Number);
    const res = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(y, mo - 1 - i, 1);
      const mk = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
      let expense = 0;
      for (const t of state.allTx) if (t.month === mk && t.type === 'expense') expense += t.amount;
      res.push({ key: mk, label: `${d.getMonth() + 1}月`, expense, isCurrent: mk === month });
    }
    return res;
  }
  function buildDonut(cats, total) {
    if (total <= 0) return '<div class="chart-empty">この月の使用はまだありません</div>';
    const r = 52, cx = 60, cy = 60, sw = 18, C = 2 * Math.PI * r;
    let offset = 0, segs = '';
    cats.forEach((cat) => {
      const len = (cat.amount / total) * C;
      segs += `<circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${cat.color}" stroke-width="${sw}" stroke-dasharray="${len.toFixed(2)} ${(C - len).toFixed(2)}" stroke-dashoffset="${(-offset).toFixed(2)}" transform="rotate(-90 ${cx} ${cy})"/>`;
      offset += len;
    });
    const legend = cats.map((cat) =>
      `<div class="legend-row"><span class="legend-dot" style="background:${cat.color}"></span>
        <span class="legend-name">${escapeHtml(cat.name)}</span>
        <span class="legend-val">${yen(cat.amount)}<span class="legend-pct">${Math.round((cat.amount / total) * 100)}%</span></span></div>`).join('');
    return `<div class="donut-row">
      <svg viewBox="0 0 120 120" class="donut">${segs}
        <text x="60" y="55" text-anchor="middle" class="donut-c1">使用合計</text>
        <text x="60" y="74" text-anchor="middle" class="donut-c2">${yen(total)}</text>
      </svg>
      <div class="legend">${legend}</div>
    </div>`;
  }
  function buildBars(months) {
    const max = Math.max(1, ...months.map((m) => m.expense));
    return `<div class="bars">${months.map((m) => {
      const h = m.expense > 0 ? Math.max(Math.round((m.expense / max) * 100), 4) : 0;
      return `<div class="bar-col">
        <div class="bar-val">${shortYen(m.expense)}</div>
        <div class="bar-track"><div class="bar-fill ${m.isCurrent ? 'cur' : ''}" style="height:${h}%"></div></div>
        <div class="bar-label ${m.isCurrent ? 'cur' : ''}">${m.label}</div>
      </div>`;
    }).join('')}</div>`;
  }
  function renderAnalysis() {
    const m = state.analysisMonth;
    const c = computeMonth(m);
    $('#analysis-month').textContent = monthLabel(m);

    let sum = `
      <div class="ana-row in"><span>引き出し合計</span><span class="av">${yen(c.withdraw)}</span></div>
      <div class="ana-row out"><span>使用合計</span><span class="av">${yen(c.expense)}</span></div>
      <div class="ana-rule"></div>
      <div class="ana-row total"><span>手元に残るはず</span><span class="av">${yen(c.remain)}</span></div>`;
    if (c.cashcount) {
      const d = c.diff;
      const cls = d === 0 ? '' : d > 0 ? 'in' : 'out';
      const dl = d === 0 ? '±0' : (d > 0 ? '+' : '−') + yen(Math.abs(d)).slice(1);
      sum += `<div class="ana-row ${cls}"><span>過不足</span><span class="av">${dl}</span></div>`;
    }
    $('#ana-summary').innerHTML = sum;

    renderCheckCard(m, c);

    const cats = analysisCategories(m);
    $('#ana-donut').innerHTML = buildDonut(cats, c.expense);
    $('#ana-bars').innerHTML = buildBars(analysisMonths(m, 6));
  }

  function renderCheckCard(month, c) {
    const el = $('#ana-check');
    if (!c.cashcount) {
      el.className = 'check-card cta';
      el.innerHTML = `
        <div class="cc-head"><span class="cc-title">手元現金の照合</span></div>
        <div class="cc-sub">月末などに財布の現金を入れると、帳簿との「過不足」を確認できます。</div>
        <button class="btn primary" data-action="open-cashcount" data-month="${month}">財布の現金を入れて照合</button>`;
      return;
    }
    const d = c.diff;
    const cls = d === 0 ? 'zero' : d > 0 ? 'good' : 'bad';
    const word = d === 0 ? 'ぴったり' : d > 0 ? `余り ${yen(d)}` : `不足 ${yen(-d)}`;
    let loan = '';
    if (d > 0) loan = '使い切らず手元に残っています。代表者貸付金から差し引く方向で確認しましょう。';
    else if (d < 0) loan = '持ち出し超過です。会社からの貸付として計上する方向で確認しましょう。';
    el.className = 'check-card';
    el.innerHTML = `
      <div class="cc-head">
        <span class="cc-title">手元現金の照合（過不足）</span>
        <span class="diff-badge ${cls}">${word}</span>
      </div>
      <div class="cc-sub">実際 ${yen(c.cashcount.actual)} ／ 残るはず ${yen(c.remain)}</div>
      ${loan ? `<div class="loan-note">${loan}</div>` : ''}
      <button class="btn ghost" data-action="open-cashcount" data-month="${month}" style="margin-top:12px">照合し直す</button>`;
  }

  /* ============================================================
     描画：履歴
     ============================================================ */
  function renderHistory() {
    const m = state.histMonth;
    const c = computeMonth(m);
    $('#hist-month').textContent = monthLabel(m);

    // 月次集計（通帳カード）
    let rows = `
      <div class="ledger-row muted"><span>前月からの繰越</span><span class="lv">${yen(c.carryIn)}</span></div>
      <div class="ledger-row in"><span>引き出し合計</span><span class="lv">+${yen(c.withdraw).slice(1)}</span></div>
      <div class="ledger-row out"><span>使用合計</span><span class="lv">−${yen(c.expense).slice(1)}</span></div>
      <div class="ledger-rule"></div>
      <div class="ledger-row total"><span>手元に残るはず</span><span class="lv">${yen(c.remain)}</span></div>`;
    if (c.cashcount) {
      const d = c.diff;
      const cls = d === 0 ? '' : d > 0 ? 'in' : 'out';
      const dl = d === 0 ? 'ぴったり' : d > 0 ? `+${yen(d).slice(1)}（余り）` : `−${yen(-d).slice(1)}（不足）`;
      rows += `
        <div class="ledger-row muted"><span>実際の手元現金</span><span class="lv">${yen(c.cashcount.actual)}</span></div>
        <div class="ledger-row ${cls}"><span>過不足</span><span class="lv">${dl}</span></div>`;
    }
    rows += `<div class="ledger-rule"></div>
      <div class="ledger-row carry"><span>翌月へ繰越</span><span class="lv">${yen(c.remain)}</span></div>`;
    $('#hist-summary').innerHTML = rows;

    // 取引一覧（日付ごとにグループ、新しい順）
    const items = state.allTx.filter((t) => t.month === m);
    const list = $('#hist-list');
    list.innerHTML = '';
    let lastDate = '';
    items.forEach((t) => {
      if (t.date !== lastDate) {
        lastDate = t.date;
        const h = document.createElement('li');
        h.className = 'day-group-head';
        h.textContent = dateLabel(t.date);
        list.appendChild(h);
      }
      list.appendChild(txItem(t, false));
    });
    $('#hist-empty').hidden = items.length > 0;
  }

  /* ---------- 取引アイテム（共通） ---------- */
  function txItem(t, showDate) {
    const li = document.createElement('li');
    li.className = 'tx-item';
    li.dataset.id = t.id;
    const io = t.type === 'withdraw' ? 'in' : 'out';
    const label = t.type === 'withdraw' ? '現金引き出し' : (t.category || 'その他');
    const photoIco = t.photo ? `<svg viewBox="0 0 24 24" class="tx-photo-ico"><path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5Z" fill="none" stroke="currentColor" stroke-width="1.5"/><circle cx="12" cy="13" r="3" fill="none" stroke="currentColor" stroke-width="1.5"/></svg>` : '';
    li.innerHTML = `
      <span class="tx-mark ${io}"></span>
      <div class="tx-main">
        <div class="tx-top">
          <span class="tx-cat">${escapeHtml(label)}</span>
          <span class="tx-type-tag ${io}">${t.type === 'withdraw' ? '引き出し' : '使用'}</span>
        </div>
        ${t.memo ? `<div class="tx-memo">${escapeHtml(t.memo)}</div>` : ''}
        ${showDate ? `<div class="tx-date">${dateLabel(t.date)}</div>` : ''}
      </div>
      <div class="tx-right">
        ${photoIco}
        <span class="tx-amount ${io}">${signedYen(t)}</span>
      </div>`;
    li.addEventListener('click', () => openDetail(t.id));
    return li;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  /* ============================================================
     記録シート（入力）
     ============================================================ */
  function openInput(editTx, presetType) {
    const cur = editTx || {
      id: null, type: presetType || 'expense', amount: 0, category: '', memo: '',
      date: todayISO(), photo: null,
    };
    state.input = {
      id: cur.id,
      type: cur.type,
      amountStr: cur.amount ? String(cur.amount) : '',
      category: cur.category || '',
      memo: cur.memo || '',
      date: cur.date,
      photoBlob: cur.photo || null,
      photoChanged: false,
    };
    $('#input-title').textContent = editTx ? '記録を編集' : '記録する';
    syncTypeUI();
    renderCatGrid();
    $('#memo-input').value = state.input.memo;
    $('#date-input').value = state.input.date;
    updateAmountDisplay();
    updatePhotoPreview();
    showSheet('#input-sheet');
  }

  function syncTypeUI() {
    const t = state.input.type;
    $('#type-seg').dataset.type = t;
    $$('#type-seg .seg-btn').forEach((b) =>
      b.classList.toggle('is-active', b.dataset.type === t));
    const isExpense = t === 'expense';
    $('#category-field').style.display = isExpense ? '' : 'none';
    $('#photo-field').style.display = isExpense ? '' : 'none';
  }

  function renderCatGrid() {
    const grid = $('#cat-grid');
    grid.innerHTML = '';
    state.categories.forEach((cat) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'cat-btn' + (cat === state.input.category ? ' is-active' : '');
      b.textContent = cat;
      b.addEventListener('click', () => {
        state.input.category = cat;
        renderCatGrid();
      });
      grid.appendChild(b);
    });
  }

  function updateAmountDisplay() {
    const s = state.input.amountStr;
    const n = s ? parseInt(s, 10) : 0;
    $('#amount-display').textContent = n.toLocaleString('ja-JP');
  }

  function keypadPress(key) {
    const inp = state.input;
    if (key === 'back') {
      inp.amountStr = inp.amountStr.slice(0, -1);
    } else {
      if (inp.amountStr.length >= 9) return;          // 上限 999,999,999
      if (inp.amountStr === '' && (key === '0' || key === '000')) return;
      inp.amountStr = (inp.amountStr + key).slice(0, 10);
    }
    updateAmountDisplay();
  }

  function updatePhotoPreview() {
    const wrap = $('#photo-preview');
    const img = $('#photo-thumb');
    const label = $('#photo-btn-label');
    if (state.input.photoBlob) {
      if (img.dataset.url) URL.revokeObjectURL(img.dataset.url);
      const url = URL.createObjectURL(state.input.photoBlob);
      img.src = url; img.dataset.url = url;
      wrap.hidden = false;
      label.textContent = '撮り直す';
    } else {
      wrap.hidden = true;
      label.textContent = '撮影 / 選択';
    }
  }

  async function handlePhotoFile(file) {
    if (!file) return;
    try {
      const blob = await compressImage(file);
      state.input.photoBlob = blob;
      state.input.photoChanged = true;
      updatePhotoPreview();
    } catch (e) {
      toast('写真を読み込めませんでした');
    }
  }

  function compressImage(file, maxDim = 1400, quality = 0.72) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        let { width, height } = img;
        const scale = Math.min(1, maxDim / Math.max(width, height));
        width = Math.round(width * scale);
        height = Math.round(height * scale);
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        URL.revokeObjectURL(url);
        canvas.toBlob((b) => b ? resolve(b) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  async function saveInput(e) {
    e.preventDefault();
    const inp = state.input;
    const amount = inp.amountStr ? parseInt(inp.amountStr, 10) : 0;
    if (!amount || amount <= 0) { toast('金額を入力してください'); return; }
    if (inp.type === 'expense' && !inp.category) { toast('分類を選んでください'); return; }

    const t = {
      id: inp.id || uid(),
      type: inp.type,
      date: inp.date,
      month: monthOf(inp.date),
      amount,
      category: inp.type === 'expense' ? inp.category : '',
      memo: $('#memo-input').value.trim(),
      photo: inp.type === 'expense' ? inp.photoBlob : null,
      createdAt: inp.id ? (await DB.getTransaction(inp.id))?.createdAt || Date.now() : Date.now(),
    };
    await DB.putTransaction(t);
    await reloadData();
    closeSheet('#input-sheet');
    refreshAll();
    toast(inp.id ? '更新しました' : '記録しました');
  }

  /* ============================================================
     明細モーダル
     ============================================================ */
  async function openDetail(id) {
    const t = await DB.getTransaction(id);
    if (!t) return;
    const io = t.type === 'withdraw' ? 'in' : 'out';
    const panel = $('#detail-panel');
    let photoHtml = '';
    if (t.photo) {
      const url = URL.createObjectURL(t.photo);
      photoHtml = `<img class="detail-photo" id="detail-photo-img" src="${url}" alt="領収書" data-url="${url}" />`;
    }
    panel.innerHTML = `
      <div class="detail-amount ${io}">${signedYen(t)}</div>
      <div class="detail-meta">${t.type === 'withdraw' ? '現金引き出し' : '使用'}・${dateLabel(t.date)}</div>
      ${photoHtml}
      ${t.type === 'expense' ? `<div class="detail-field"><span class="df-label">分類</span><span class="df-val">${escapeHtml(t.category || 'その他')}</span></div>` : ''}
      ${t.memo ? `<div class="detail-field"><span class="df-label">メモ</span><span class="df-val">${escapeHtml(t.memo)}</span></div>` : ''}
      <div class="modal-actions">
        <button class="btn danger" data-action="delete-tx" data-id="${t.id}">削除</button>
        <button class="btn" data-action="edit-tx" data-id="${t.id}">編集</button>
        <button class="btn primary" data-action="close-detail">閉じる</button>
      </div>`;
    if (t.photo) {
      $('#detail-photo-img').addEventListener('click', () => openViewer($('#detail-photo-img').src));
    }
    showModal('#detail-modal');
  }

  async function deleteTx(id) {
    if (!confirm('この記録を削除します。よろしいですか？')) return;
    await DB.deleteTransaction(id);
    await reloadData();
    closeModal('#detail-modal');
    refreshAll();
    toast('削除しました');
  }

  async function editTx(id) {
    const t = await DB.getTransaction(id);
    if (!t) return;
    closeModal('#detail-modal');
    openInput(t);
  }

  /* ============================================================
     実額照合（過不足）
     ============================================================ */
  function openCashCount(month) {
    state.exportMonth = month; // reuse holder
    const c = computeMonth(month);
    $('#cc-desc').textContent = `${monthLabel(month)} 末などに、実際に財布にある現金を入れてください。`;
    $('#cc-book').textContent = yen(c.remain);
    const existing = state.cashcounts[month];
    const input = $('#cc-input');
    input.value = existing ? String(existing.actual) : '';
    input.dataset.month = month;
    input.dataset.book = c.remain;
    updateCashCountResult();
    showModal('#cashcount-modal');
    setTimeout(() => input.focus(), 200);
  }

  function updateCashCountResult() {
    const input = $('#cc-input');
    const book = parseInt(input.dataset.book, 10);
    const raw = input.value.replace(/[^\d]/g, '');
    const res = $('#cc-result');
    if (raw === '') { res.className = 'cc-result'; res.innerHTML = '<span class="cc-diff-label">実際の現金を入力すると過不足が出ます</span>'; return; }
    const actual = parseInt(raw, 10);
    const diff = actual - book;
    const cls = diff === 0 ? '' : diff > 0 ? 'good' : 'bad';
    const lab = diff === 0 ? 'ぴったり合っています' : diff > 0 ? '余り（手元に多い）' : '不足（持ち出し超過）';
    let loan = '';
    if (diff > 0) loan = '使い切らず手元に残った分。代表者貸付金から差し引く方向で確認しましょう。';
    else if (diff < 0) loan = '持ち出し超過分。会社からの貸付として計上する方向で確認しましょう。';
    res.className = 'cc-result ' + cls;
    res.innerHTML = `<span class="cc-diff-label">${lab}</span>
      <span class="cc-diff-val">${diff === 0 ? '±0' : (diff > 0 ? '+' : '−') + yen(Math.abs(diff)).slice(1)}</span>
      ${loan ? `<div class="cc-loan">${loan}</div>` : ''}`;
  }

  async function saveCashCount() {
    const input = $('#cc-input');
    const month = input.dataset.month;
    const raw = input.value.replace(/[^\d]/g, '');
    if (raw === '') {            // 空なら記録を消す
      await DB.deleteCashCount(month);
    } else {
      await DB.putCashCount({ month, actual: parseInt(raw, 10), countedAt: Date.now() });
    }
    await reloadData();
    closeModal('#cashcount-modal');
    refreshAll();
    toast('照合を記録しました');
  }

  /* ============================================================
     写真ビューア
     ============================================================ */
  function openViewer(src) {
    $('#pv-image').src = src;
    $('#photo-viewer').hidden = false;
  }
  function closeViewer() { $('#photo-viewer').hidden = true; }

  /* ============================================================
     設定
     ============================================================ */
  function renderSettings() {
    renderCatEditList();
    $('#opening-input').value = state.opening ? String(state.opening) : '';
  }
  function renderCatEditList() {
    const ul = $('#cat-edit-list');
    ul.innerHTML = '';
    state.categories.forEach((cat, i) => {
      const li = document.createElement('li');
      li.className = 'cat-edit-item';
      li.innerHTML = `<span class="ce-name">${escapeHtml(cat)}</span>
        <button class="ce-del" data-i="${i}">削除</button>`;
      li.querySelector('.ce-del').addEventListener('click', async () => {
        if (state.categories.length <= 1) { toast('分類は1つ以上必要です'); return; }
        state.categories.splice(i, 1);
        await DB.setMeta('categories', state.categories);
        renderCatEditList();
      });
      ul.appendChild(li);
    });
  }
  async function addCategory() {
    const inp = $('#cat-add-input');
    const v = inp.value.trim();
    if (!v) return;
    if (state.categories.includes(v)) { toast('すでにあります'); return; }
    if (state.categories.length >= 8) { toast('分類は8個までが目安です'); }
    state.categories.push(v);
    await DB.setMeta('categories', state.categories);
    inp.value = '';
    renderCatEditList();
  }
  async function saveOpening() {
    const raw = $('#opening-input').value.replace(/[^\d]/g, '');
    state.opening = raw ? parseInt(raw, 10) : 0;
    await DB.setMeta('opening', state.opening);
  }

  /* ============================================================
     書き出し（CSV / 印刷 / バックアップ）
     ============================================================ */
  function txToRows(list) {
    return list.map((t) => [
      t.date,
      t.type === 'withdraw' ? '引き出し' : '使用',
      t.amount,
      t.type === 'withdraw' ? '' : (t.category || 'その他'),
      (t.memo || '').replace(/\r?\n/g, ' '),
    ]);
  }
  function buildCSV(list, title) {
    const header = ['日付', '種別', '金額', '分類', 'メモ'];
    const rows = txToRows(list);
    const esc = (v) => {
      const s = String(v);
      return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
    };
    const lines = [header, ...rows].map((r) => r.map(esc).join(','));
    return '﻿' + lines.join('\r\n') + '\r\n';
  }
  function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // ファイルを配信：iOS(ネイティブ)では共有シート、Webではダウンロード
  async function deliver(filename, content, mime, okMsg) {
    if (window.CashbookNative && window.CashbookNative.isNative) {
      try { await window.CashbookNative.deliverFile(filename, content, mime); }
      catch (e) { /* 共有キャンセル等は無視 */ }
      return;
    }
    downloadBlob(new Blob([content], { type: mime }), filename);
    if (okMsg) toast(okMsg);
  }
  function exportMonthCSV(month) {
    const list = state.allTx.filter((t) => t.month === month)
      .slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);
    const csv = buildCSV(list);
    deliver(`現金経費_${month}.csv`, csv, 'text/csv;charset=utf-8', 'CSVを書き出しました');
  }
  function exportAllCSV() {
    const list = state.allTx.slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);
    const csv = buildCSV(list);
    deliver(`現金経費_全期間.csv`, csv, 'text/csv;charset=utf-8', 'CSVを書き出しました');
  }

  function printMonth(month) {
    const c = computeMonth(month);
    const list = state.allTx.filter((t) => t.month === month)
      .slice().sort((a, b) => a.date < b.date ? -1 : a.date > b.date ? 1 : a.createdAt - b.createdAt);
    const rows = list.map((t) => `
      <tr>
        <td>${dateLabel(t.date)}</td>
        <td class="c">${t.type === 'withdraw' ? '引き出し' : '使用'}</td>
        <td>${t.type === 'withdraw' ? '—' : escapeHtml(t.category || 'その他')}</td>
        <td>${escapeHtml(t.memo || '')}</td>
        <td class="r ${t.type === 'withdraw' ? 'pin' : 'pout'}">${signedYen(t)}</td>
      </tr>`).join('');
    let ccRows = '';
    if (c.cashcount) {
      const d = c.diff;
      ccRows = `<tr><th>実際の手元現金</th><td class="r">${yen(c.cashcount.actual)}</td></tr>
        <tr><th>過不足</th><td class="r">${d === 0 ? '±0' : (d > 0 ? '+' : '−') + yen(Math.abs(d)).slice(1)}</td></tr>`;
    }
    const html = `<!DOCTYPE html><html lang="ja"><head><meta charset="UTF-8">
      <title>現金経費 ${monthLabel(month)}</title>
      <style>
        body{font-family:-apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;color:#1c1d1a;padding:24px;max-width:720px;margin:0 auto;}
        h1{font-size:20px;margin:0 0 4px;} .sub{color:#666;font-size:12px;margin-bottom:18px;}
        table{width:100%;border-collapse:collapse;font-size:13px;}
        .summary th{text-align:left;color:#555;font-weight:600;padding:5px 8px;width:55%;}
        .summary td{padding:5px 8px;} .summary{margin-bottom:20px;border:1px solid #ddd;border-radius:8px;overflow:hidden;}
        .summary tr:nth-child(odd){background:#faf9f5;}
        .ledger th,.ledger td{border-bottom:1px solid #eee;padding:8px;text-align:left;vertical-align:top;}
        .ledger th{background:#f2f0ea;font-size:12px;}
        .r{text-align:right;font-variant-numeric:tabular-nums;white-space:nowrap;} .c{text-align:center;}
        .pin{color:#1f6feb;} .pout{color:#c2410c;}
        .total{font-size:15px;font-weight:700;}
        @media print{body{padding:0;}}
      </style></head><body>
      <h1>現金経費管理　${monthLabel(month)}</h1>
      <div class="sub">出力日：${dateLabel(todayISO())}</div>
      <table class="summary">
        <tr><th>前月からの繰越</th><td class="r">${yen(c.carryIn)}</td></tr>
        <tr><th>引き出し合計</th><td class="r">${yen(c.withdraw)}</td></tr>
        <tr><th>使用合計</th><td class="r">${yen(c.expense)}</td></tr>
        <tr class="total"><th>手元に残るはず</th><td class="r">${yen(c.remain)}</td></tr>
        ${ccRows}
        <tr><th>翌月へ繰越</th><td class="r">${yen(c.remain)}</td></tr>
      </table>
      <table class="ledger">
        <thead><tr><th>日付</th><th>種別</th><th>分類</th><th>メモ</th><th class="r">金額</th></tr></thead>
        <tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#999;padding:24px">記録なし</td></tr>'}</tbody>
      </table>
      </body></html>`;
    if (window.CashbookNative && window.CashbookNative.isNative) {
      // ネイティブでは新規ウィンドウを開けないため、HTMLを共有（Safari等で開いて印刷/PDF保存）
      deliver(`現金経費_${month}.html`, html, 'text/html');
      return;
    }
    const w = window.open('', '_blank');
    if (!w) { toast('ポップアップを許可してください'); return; }
    const autoPrint = '<scr' + 'ipt>window.onload=function(){setTimeout(function(){window.print();},300);};</scr' + 'ipt>';
    w.document.open(); w.document.write(html.replace('</body>', autoPrint + '</body>')); w.document.close();
  }

  /* ---- バックアップ（JSON 全データ） ---- */
  function blobToDataURL(blob) {
    return new Promise((resolve, reject) => {
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.onerror = () => reject(r.error);
      r.readAsDataURL(blob);
    });
  }
  function dataURLToBlob(dataURL) {
    const [head, b64] = dataURL.split(',');
    const mime = (head.match(/data:(.*?);base64/) || [])[1] || 'image/jpeg';
    const bin = atob(b64);
    const arr = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
    return new Blob([arr], { type: mime });
  }
  async function exportBackup() {
    toast('バックアップを作成中…');
    const txs = [];
    for (const t of state.allTx) {
      const copy = { ...t };
      copy.photo = t.photo ? await blobToDataURL(t.photo) : null;
      txs.push(copy);
    }
    const data = {
      app: 'cashbook', version: 1, exportedAt: new Date().toISOString(),
      transactions: txs,
      cashcounts: Object.values(state.cashcounts),
      meta: { categories: state.categories, opening: state.opening },
    };
    await deliver(`現金経費_バックアップ_${todayISO()}.json`, JSON.stringify(data), 'application/json', 'バックアップを保存しました');
  }
  async function importBackup(file) {
    if (!file) return;
    if (!confirm('現在のデータをすべて置き換えてバックアップを読み込みます。よろしいですか？')) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text);
      if (!data || data.app !== 'cashbook' || !Array.isArray(data.transactions)) {
        toast('このファイルは読み込めません'); return;
      }
      await DB.clearAll();
      for (const t of data.transactions) {
        const copy = { ...t };
        copy.photo = (typeof t.photo === 'string' && t.photo.startsWith('data:')) ? dataURLToBlob(t.photo) : null;
        if (!copy.month && copy.date) copy.month = monthOf(copy.date);
        await DB.putTransaction(copy);
      }
      for (const c of (data.cashcounts || [])) await DB.putCashCount(c);
      const meta = data.meta || {};
      state.categories = Array.isArray(meta.categories) && meta.categories.length ? meta.categories : DEFAULT_CATS.slice();
      state.opening = meta.opening || 0;
      await DB.setMeta('categories', state.categories);
      await DB.setMeta('opening', state.opening);
      await reloadData();
      refreshAll();
      toast('バックアップを読み込みました');
    } catch (e) {
      toast('読み込みに失敗しました');
    }
  }

  /* ============================================================
     画面・モーダル制御
     ============================================================ */
  function switchView(view) {
    state.view = view;
    $$('.view').forEach((v) => v.classList.remove('is-active'));
    $('#view-' + view).classList.add('is-active');
    $$('.nav-btn').forEach((b) => b.classList.toggle('is-active', b.dataset.nav === view));
    window.scrollTo(0, 0);
    if (view === 'home') renderHome();
    else if (view === 'analysis') { if (!state.analysisMonth) state.analysisMonth = currentMonth(); renderAnalysis(); }
    else if (view === 'history') { if (!state.histMonth) state.histMonth = currentMonth(); renderHistory(); }
    else if (view === 'settings') renderSettings();
  }
  function refreshAll() {
    const v = state.view;
    if (v === 'home') renderHome();
    else if (v === 'analysis') renderAnalysis();
    else if (v === 'history') renderHistory();
    else if (v === 'settings') renderSettings();
  }
  function showSheet(sel) { $(sel).hidden = false; document.body.style.overflow = 'hidden'; }
  function closeSheet(sel) { $(sel).hidden = true; document.body.style.overflow = ''; }
  function showModal(sel) { $(sel).hidden = false; }
  function closeModal(sel) { $(sel).hidden = true; }

  let toastTimer = null;
  function toast(msg) {
    const el = $('#toast');
    el.textContent = msg; el.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { el.hidden = true; }, 2200);
  }

  function changeMonth(delta) {
    const [y, m] = state.histMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    state.histMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    renderHistory();
  }
  function changeAnalysisMonth(delta) {
    const [y, m] = state.analysisMonth.split('-').map(Number);
    const d = new Date(y, m - 1 + delta, 1);
    state.analysisMonth = `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
    renderAnalysis();
  }

  /* ============================================================
     イベント結線
     ============================================================ */
  function bindEvents() {
    // ナビ
    $$('[data-nav]').forEach((b) => b.addEventListener('click', () => switchView(b.dataset.nav)));

    // グローバル data-action
    document.body.addEventListener('click', (e) => {
      const el = e.target.closest('[data-action]');
      if (!el) return;
      const a = el.dataset.action;
      const map = {
        'input-withdraw': () => openInput(null, 'withdraw'),
        'input-expense': () => openInput(null, 'expense'),
        'close-input': () => closeSheet('#input-sheet'),
        'open-export': () => { state.exportMonth = state.histMonth; $('#export-title').textContent = `${monthLabel(state.histMonth)} を書き出す`; showModal('#export-modal'); },
        'close-export': () => closeModal('#export-modal'),
        'prev-month': () => changeMonth(-1),
        'next-month': () => changeMonth(1),
        'ana-prev': () => changeAnalysisMonth(-1),
        'ana-next': () => changeAnalysisMonth(1),
        'open-cashcount': () => openCashCount(el.dataset.month),
        'close-cashcount': () => closeModal('#cashcount-modal'),
        'close-detail': () => {
          const img = document.querySelector('#detail-photo-img');
          if (img && img.dataset.url) URL.revokeObjectURL(img.dataset.url);
          closeModal('#detail-modal');
        },
        'delete-tx': () => deleteTx(el.dataset.id),
        'edit-tx': () => editTx(el.dataset.id),
        'close-viewer': closeViewer,
      };
      if (map[a]) map[a]();
    });

    // 種別切替
    $$('#type-seg .seg-btn').forEach((b) => b.addEventListener('click', () => {
      state.input.type = b.dataset.type;
      syncTypeUI();
    }));

    // テンキー
    $('#keypad').addEventListener('click', (e) => {
      const k = e.target.closest('.key');
      if (k) keypadPress(k.dataset.key);
    });

    // メモ・日付
    $('#memo-input').addEventListener('input', (e) => { state.input.memo = e.target.value; });
    $('#date-input').addEventListener('change', (e) => { state.input.date = e.target.value || todayISO(); });

    // 写真
    $('#photo-btn').addEventListener('click', () => $('#photo-input').click());
    $('#photo-input').addEventListener('change', (e) => { handlePhotoFile(e.target.files[0]); e.target.value = ''; });
    $('#photo-remove').addEventListener('click', () => {
      state.input.photoBlob = null; state.input.photoChanged = true; updatePhotoPreview();
    });

    // 保存
    $('#input-form').addEventListener('submit', saveInput);

    // 実額照合
    $('#cc-input').addEventListener('input', updateCashCountResult);
    $('#cc-save').addEventListener('click', saveCashCount);

    // 設定
    $('#cat-add-btn').addEventListener('click', addCategory);
    $('#cat-add-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addCategory(); } });
    $('#opening-input').addEventListener('input', saveOpening);
    $('#backup-export').addEventListener('click', exportBackup);
    $('#backup-import').addEventListener('click', () => $('#backup-file').click());
    $('#backup-file').addEventListener('change', (e) => { importBackup(e.target.files[0]); e.target.value = ''; });
    $('#csv-all').addEventListener('click', exportAllCSV);

    // 書き出しメニュー
    $('#export-csv').addEventListener('click', () => { closeModal('#export-modal'); exportMonthCSV(state.exportMonth); });
    $('#export-print').addEventListener('click', () => { closeModal('#export-modal'); printMonth(state.exportMonth); });
  }

  /* ============================================================
     起動
     ============================================================ */
  async function init() {
    state.categories = await DB.getMeta('categories', DEFAULT_CATS.slice());
    if (!Array.isArray(state.categories) || !state.categories.length) state.categories = DEFAULT_CATS.slice();
    state.opening = await DB.getMeta('opening', 0) || 0;
    state.histMonth = currentMonth();
    await reloadData();
    bindEvents();
    renderHome();

    // ストレージの永続化を要求（容量逼迫時の自動削除をできるだけ抑止）
    try { if (navigator.storage && navigator.storage.persist) navigator.storage.persist(); } catch (e) { /* noop */ }

    // Service Worker は Web 配信時のみ（ネイティブ版は資産を同梱しており不要）
    const isNative = window.CashbookNative && window.CashbookNative.isNative;
    if ('serviceWorker' in navigator && !isNative && location.protocol.startsWith('http')) {
      navigator.serviceWorker.register('sw.js').catch(() => {});
    }
  }

  document.addEventListener('DOMContentLoaded', init);
})();
