'use strict';

const BASIC_DEDUCTION = 2_500_000; // 해외주식 양도소득 기본공제 (1인 1년 1회)
const NATIONAL_RATE = 0.2;         // 양도소득세 20%
const LOCAL_RATE = 0.1;            // 지방소득세 = 양도소득세의 10%
const STORAGE_KEY = 'ustax-v1';
const DEFAULT_BROKERS = [
  { name: '키움증권', profile: 'kiwoom' },
  { name: '한국투자증권', profile: 'kis' },
  { name: '메리츠증권', profile: 'meritz' },
];

// 미국 현지 기준, 해당 연도 결제(T+1)로 잡히는 마지막 매도일
const YEAR_END = {
  2026: { trade: '12월 30일(수)', settle: '12월 31일(목)' },
  2027: { trade: '12월 30일(목)', settle: '12월 31일(금)' },
};

const $ = (id) => document.getElementById(id);
const won = (n) => `${Math.abs(Math.round(n)).toLocaleString('ko-KR')}원`;
const signedWon = (n) => (n > 0 ? '+' : n < 0 ? '−' : '') + won(n);
const uid = () => Math.random().toString(36).slice(2, 10);

const el = (tag, cls, text) => {
  const node = document.createElement(tag);
  if (cls) node.className = cls;
  if (text != null) node.textContent = text;
  return node;
};

const ICON = {
  check: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M20 6 9 17l-5-5"/></svg>',
  alert: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/></svg>',
  x: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" aria-hidden="true"><path d="M18 6 6 18M6 6l12 12"/></svg>',
};
const iconEl = (svg) => {
  const span = el('span');
  span.innerHTML = svg;
  return span.firstElementChild;
};

const profileFor = (name) =>
  /키움/.test(name) ? 'kiwoom' : /한국투자|한투/.test(name) ? 'kis' : /메리츠/.test(name) ? 'meritz' : null;

/* ---------- 저장 ---------- */

function load() {
  let s = null;
  try { s = JSON.parse(localStorage.getItem(STORAGE_KEY)); } catch (e) { /* 빈 상태로 시작 */ }
  if (!s || typeof s !== 'object') s = { year: new Date().getFullYear(), years: {} };
  // 1.0 버전 데이터에 새 필드 채우기
  Object.values(s.years || {}).forEach((y) => {
    (y.brokers || []).forEach((b) => {
      if (b.profile === undefined) b.profile = profileFor(b.name || '');
      if (b.ria === undefined) b.ria = 0;
      if (b.source === undefined) b.source = b.amount ? 'manual' : null;
    });
    y.holdings = y.holdings || [];
  });
  return s;
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
}

const state = load();

function yearData(year = state.year) {
  const key = String(year);
  if (!state.years[key]) {
    state.years[key] = {
      brokers: DEFAULT_BROKERS.map((d) => ({
        id: uid(), name: d.name, profile: d.profile, account: null,
        amount: 0, ria: 0, source: null, verified: null, updatedAt: null,
      })),
      holdings: [],
    };
  }
  return state.years[key];
}

/* ---------- 계산 ---------- */

function calcTax(net, ria = 0) {
  const base = Math.max(0, net - ria - BASIC_DEDUCTION);
  const national = Math.floor(base * NATIONAL_RATE);
  return { base, tax: national + Math.floor(national * LOCAL_RATE) };
}

const totals = (data) => ({
  net: data.brokers.reduce((s, b) => s + (Number(b.amount) || 0), 0),
  ria: data.brokers.reduce((s, b) => s + (Number(b.ria) || 0), 0),
});

/* ---------- 금액 입력 ---------- */

// 부호 버튼 + 숫자 입력. 금액이 0일 때도 손실(−) 선택을 유지하기 위해 부호를 따로 들고 있음
function amountInput(value, onChange, big) {
  const wrap = el('div', `amount-wrap${big ? ' big' : ''}`);
  const sign = el('button', 'sign');
  sign.type = 'button';
  sign.setAttribute('aria-label', '이익/손실 전환');
  const input = el('input', 'amount');
  input.type = 'text';
  input.inputMode = 'numeric';
  input.placeholder = '0';
  input.setAttribute('aria-label', '금액(원)');
  wrap.append(sign, input, el('span', 'unit', '원'));

  let negative = value < 0;
  let abs = Math.abs(value || 0);
  const paint = () => {
    wrap.classList.toggle('is-neg', negative);
    sign.textContent = negative ? '−' : '+';
    input.value = abs ? abs.toLocaleString('ko-KR') : '';
  };
  input.addEventListener('input', () => {
    abs = Number(input.value.replace(/[^\d]/g, '').slice(0, 13)) || 0;
    input.value = abs ? abs.toLocaleString('ko-KR') : '';
    onChange(negative ? -abs : abs);
  });
  sign.addEventListener('click', () => {
    negative = !negative;
    paint();
    onChange(negative ? -abs : abs);
  });
  paint();
  return wrap;
}

/* ---------- 시트 / 알림 ---------- */

function openSheet(title, body, actions = []) {
  $('sheetTitle').textContent = title;
  $('sheetBody').replaceChildren(...[].concat(body));
  $('sheetActions').replaceChildren(...actions);
  const sheet = $('sheet');
  if (!sheet.open) sheet.showModal();
  sheet.focus(); // 닫기 버튼에 포커스 링이 생기지 않게
  $('sheetBody').scrollTop = 0;
}
const closeSheet = () => $('sheet').close();

function actionBtn(label, onClick, secondary) {
  const b = el('button', `cta${secondary ? ' secondary' : ''}`, label);
  b.type = 'button';
  b.addEventListener('click', onClick);
  return b;
}

let toastTimer;
function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2400);
}

$('sheetClose').addEventListener('click', closeSheet);
$('sheet').addEventListener('click', (e) => { if (e.target === e.currentTarget) closeSheet(); });

/* ---------- 증권사 목록 ---------- */

function avatar(profile, name) {
  return el('span', `avatar ${profile || ''}`, (name || '?').trim().charAt(0));
}

// 오늘이면 시각, 아니면 날짜만 (한 줄에 들어가도록)
function fmtTime(ts) {
  const d = new Date(ts);
  if (d.toDateString() !== new Date().toDateString()) return `${d.getMonth() + 1}월 ${d.getDate()}일`;
  return `오늘 ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function brokerMeta(b) {
  const meta = el('span', 'broker-meta');
  if (b.source === 'scan') {
    const ok = b.verified === true;
    meta.classList.add(ok ? 'ok' : 'warn');
    meta.append(iconEl(ok ? ICON.check : ICON.alert), `${fmtTime(b.updatedAt)} · ${ok ? '검산 완료' : '확인 필요'}`);
  } else if (b.source === 'manual') {
    meta.append(b.updatedAt ? `${fmtTime(b.updatedAt)} · 직접 입력` : '직접 입력');
  } else {
    meta.append('캡처를 올려 주세요');
  }
  return meta;
}

function renderBrokers() {
  const data = yearData();
  const list = $('brokerList');
  list.replaceChildren();
  data.brokers.forEach((b) => {
    const btn = el('button', 'broker');
    btn.type = 'button';
    const info = el('span', 'broker-info');
    info.append(el('span', 'broker-name', b.name || '이름 없음'), brokerMeta(b));
    const has = b.source || b.amount;
    const amt = el('span', `broker-amount ${!has ? 'empty' : b.amount < 0 ? 'neg' : b.amount > 0 ? 'pos' : ''}`,
      has ? signedWon(b.amount) : '—');
    btn.append(avatar(b.profile, b.name), info, amt);
    btn.addEventListener('click', () => openBroker(b));
    const li = el('li');
    li.append(btn);
    list.append(li);
  });
}

function guideBlock(g) {
  const box = el('section', 'guide');
  const h = el('h3');
  h.append(avatar(g.id, g.name), `${g.name} · ${g.app} 앱`);
  box.append(h);
  if (g.method) box.append(el('p', 'method', g.method));
  const ol = el('ol');
  g.steps.forEach((s) => ol.append(el('li', null, s)));
  box.append(ol);
  const reads = el('p', 'reads');
  reads.append('앱이 읽는 숫자: ', el('b', null, g.field));
  box.append(reads);
  if (g.extra) box.append(el('p', 'extra', g.extra));
  const help = el('p', 'extra');
  const tel = el('a', null, g.phone);
  tel.href = `tel:${g.phone}`;
  help.append('메뉴가 다르면 앱 검색에서 “양도세”를 찾아보세요. 고객센터 ', tel);
  box.append(help);
  return box;
}

function openGuides() {
  const intro = el('p', 'desc', `각 증권사 앱의 양도세 화면을 캡처해서 올리면 금액을 자동으로 읽어요. 여러 장을 한 번에 올려도 돼요. (안내 기준: ${GUIDE_CHECKED})`);
  openSheet('어떤 화면을 캡처하나요?', [intro, ...GUIDES.map(guideBlock)], [actionBtn('확인', closeSheet)]);
}

function openBroker(b) {
  const data = yearData();
  let amount = b.amount;
  let name = b.name;

  const nameInput = el('input', 'field');
  nameInput.value = b.name;
  nameInput.maxLength = 20;
  nameInput.setAttribute('aria-label', '증권사 이름');
  nameInput.addEventListener('input', () => { name = nameInput.value; });

  const body = [nameInput, amountInput(amount, (v) => { amount = v; }, true)];
  if (b.source) {
    const meta = brokerMeta(b);
    meta.style.marginTop = '10px';
    body.push(meta);
  }
  if (b.ria) body.push(el('p', 'change', `RIA 공제 ${won(b.ria)} 포함`));
  const g = GUIDES.find((x) => x.id === b.profile);
  if (g) body.push(guideBlock(g));

  const del = actionBtn('삭제', () => {
    data.brokers = data.brokers.filter((x) => x !== b);
    closeSheet();
    renderAll();
    toast(`${b.name || '증권사'}를 삭제했어요`);
  }, true);
  del.classList.add('danger');

  openSheet(b.name || '증권사', body, [del, actionBtn('저장', () => {
    if (amount !== b.amount) {
      b.amount = amount;
      b.source = 'manual';
      b.verified = null;
      b.updatedAt = Date.now();
    }
    b.name = name.trim() || b.name;
    b.profile = b.profile || profileFor(b.name);
    closeSheet();
    renderAll();
  })]);
}

$('addBroker').addEventListener('click', () => {
  const b = { id: uid(), name: '', profile: null, account: null, amount: 0, ria: 0, source: null, verified: null, updatedAt: null };
  yearData().brokers.push(b);
  openBroker(b);
  $('sheetTitle').textContent = '증권사 직접 추가';
});

$('openGuide').addEventListener('click', openGuides);

/* ---------- 캡처 인식 ---------- */

const isNative = !!(window.Capacitor && window.Capacitor.isNativePlatform && window.Capacitor.isNativePlatform());
const TextScanner = isNative && window.capacitorExports ? window.capacitorExports.registerPlugin('TextScanner') : null;

const readFile = (file) => new Promise((resolve, reject) => {
  const r = new FileReader();
  r.onload = () => resolve(r.result);
  r.onerror = () => reject(new Error('파일을 읽지 못했어요'));
  r.readAsDataURL(file);
});

$('scanBtn').addEventListener('click', () => {
  if (!TextScanner) { toast('캡처 인식은 휴대폰 앱에서 동작해요'); return; }
  $('fileInput').value = '';
  $('fileInput').click();
});

$('fileInput').addEventListener('change', async (e) => {
  const files = [...e.target.files];
  if (!files.length) return;
  const status = el('p', null, '');
  const prog = el('div', 'progress');
  prog.append(el('div', 'spinner'), status);
  openSheet('캡처 읽는 중', prog);

  // 사진 선택기의 접근 권한이 인식 도중 끊길 수 있어 고른 파일을 먼저 모두 읽어 둔다
  status.textContent = '사진을 불러오는 중';
  const images = await Promise.all(files.map((f) => readFile(f).catch((err) => err)));
  const results = [];
  for (let i = 0; i < images.length; i++) {
    status.textContent = images.length > 1 ? `${i + 1} / ${images.length}장 읽는 중` : '금액을 찾고 있어요';
    try {
      if (images[i] instanceof Error) throw images[i];
      const { lines } = await TextScanner.recognize({ image: images[i] });
      results.push(scanLines(lines || []));
    } catch (err) {
      results.push({ error: (err && err.message) || '읽지 못했어요' });
    }
  }
  showResults(results);
});

// 같은 증권사(·계좌)의 기존 항목을 찾는다. 없으면 null → 새로 추가
function findTarget(r, data) {
  if (!r.profile) return null;
  const rows = data.brokers.filter((b) => b.profile === r.profile);
  return rows.find((b) => (b.account || null) === (r.account || null))
    || rows.find((b) => !b.account)
    || null;
}

function statusLine(r) {
  if (r.verified === true) {
    const p = el('p', 'status ok');
    p.append(iconEl(ICON.check), '화면의 다른 숫자로 검산했어요');
    return p;
  }
  const p = el('p', 'status warn');
  p.append(iconEl(ICON.alert), '검산하지 못했어요. 캡처의 금액과 같은지 한 번 확인해 주세요');
  return p;
}

function showResults(results) {
  const items = [];
  const body = [];

  results.forEach((r) => {
    const card = el('section', 'result');
    if (r.error || r.amount == null) {
      const head = el('div', 'result-head');
      head.append(avatar(null, '?'));
      const t = el('div', 'result-title', r.brokerName || '금액을 찾지 못했어요');
      t.append(el('small', null, r.error ? r.error : '양도세 화면 캡처인지, 합계 부분이 보이는지 확인해 주세요'));
      head.append(t);
      card.append(head);
      const p = el('p', 'status fail');
      p.append(iconEl(ICON.x), '이 캡처는 반영하지 않아요');
      card.append(p);
      body.push(card);
      return;
    }

    const year = r.year || state.year;
    const data = yearData(year);
    const item = { r, year, amount: r.amount, include: true, target: findTarget(r, data), newName: '' };
    items.push(item);

    const head = el('div', 'result-head');
    const title = el('div', 'result-title');
    const acct = r.account ? ` · 계좌 …${r.account.slice(-4)}` : '';
    const sub = `${year}년${acct}${year !== state.year ? ' (다른 연도)' : ''}`;
    if (r.profile) {
      title.append(r.brokerName, el('small', null, sub));
      head.append(avatar(r.profile, r.brokerName), title);
    } else {
      title.append('어느 증권사인가요?', el('small', null, sub));
      head.append(avatar(null, '?'), title);
    }
    const inc = el('label', 'toggle');
    const box = el('input');
    box.type = 'checkbox';
    box.checked = true;
    box.addEventListener('change', () => { item.include = box.checked; updateApply(); });
    inc.append(box, '반영');
    head.append(inc);
    card.append(head);

    if (!r.profile) {
      const sel = el('select', 'field');
      sel.setAttribute('aria-label', '증권사 선택');
      data.brokers.forEach((b) => {
        const o = el('option', null, b.name || '이름 없음');
        o.value = b.id;
        sel.append(o);
      });
      const o = el('option', null, '새 증권사 추가…');
      o.value = '__new';
      sel.append(o);
      const nameInput = el('input', 'field');
      nameInput.placeholder = '증권사 이름';
      nameInput.hidden = true;
      const pick = () => {
        item.target = data.brokers.find((b) => b.id === sel.value) || null;
        nameInput.hidden = sel.value !== '__new';
      };
      sel.addEventListener('change', pick);
      nameInput.addEventListener('input', () => { item.newName = nameInput.value; });
      // 이미 읽은 증권사를 덮어쓰지 않도록, 직접 추가한 항목이 없으면 새로 추가가 기본
      const manual = data.brokers.find((b) => !b.profile);
      sel.value = manual ? manual.id : '__new';
      pick();
      card.append(sel, nameInput);
    }

    card.append(amountInput(r.amount, (v) => { item.amount = v; }, true));
    card.append(statusLine(r));
    const prev = item.target && (item.target.source || item.target.amount)
      ? `이전 ${signedWon(item.target.amount)} → 새 금액으로 바뀌어요`
      : '새로 저장돼요';
    card.append(el('p', 'change', r.ria ? `${prev} · RIA 공제 ${won(r.ria)} 함께 반영` : prev));
    body.push(card);
  });

  const apply = actionBtn('', () => applyResults(items));
  function updateApply() {
    const n = items.filter((i) => i.include).length;
    apply.textContent = n ? `${n}건 반영하기` : '반영할 캡처가 없어요';
    apply.disabled = n === 0;
  }
  updateApply();

  openSheet(items.length ? '이 금액으로 업데이트할까요?' : '인식하지 못했어요', body,
    items.length ? [actionBtn('취소', closeSheet, true), apply] : [actionBtn('확인', closeSheet)]);
}

function applyResults(items) {
  const done = [];
  items.filter((i) => i.include).forEach((i) => {
    const data = yearData(i.year);
    let row = i.target;
    if (!row) {
      const name = i.r.brokerName
        ? `${i.r.brokerName}${i.r.account && data.brokers.some((b) => b.profile === i.r.profile) ? ` …${i.r.account.slice(-4)}` : ''}`
        : (i.newName.trim() || '새 증권사');
      row = { id: uid(), name, profile: i.r.profile, account: null, amount: 0, ria: 0 };
      data.brokers.push(row);
    }
    Object.assign(row, {
      amount: i.amount,
      ria: i.r.ria || 0,
      account: i.r.account || row.account || null,
      source: 'scan',
      verified: i.amount === i.r.amount ? i.r.verified : null,
      updatedAt: Date.now(),
    });
    done.push(row.name);
    if (i.year !== state.year) state.year = i.year;
  });
  closeSheet();
  renderAll();
  toast(done.length === 1 ? `${done[0]} 금액을 업데이트했어요` : `${done.length}곳을 업데이트했어요`);
}

/* ---------- 연말 매도 시뮬레이션 ---------- */

function renderHoldings() {
  const data = yearData();
  const list = $('holdingList');
  list.replaceChildren();
  data.holdings.forEach((h) => {
    const li = $('holdingTpl').content.firstElementChild.cloneNode(true);
    const nameEl = li.querySelector('.name');
    const selEl = li.querySelector('.sel');
    nameEl.value = h.name;
    selEl.checked = !!h.selected;
    nameEl.addEventListener('input', () => { h.name = nameEl.value; save(); });
    selEl.addEventListener('change', () => { h.selected = selEl.checked; update(); });
    li.querySelector('.amount-wrap').replaceWith(amountInput(h.amount, (v) => { h.amount = v; update(); }));
    li.querySelector('.del').addEventListener('click', () => {
      data.holdings = data.holdings.filter((x) => x !== h);
      renderHoldings();
      update();
    });
    list.append(li);
  });
}

$('addHolding').addEventListener('click', () => {
  yearData().holdings.push({ id: uid(), name: '', amount: 0, selected: true });
  renderHoldings();
  const names = $('holdingList').querySelectorAll('.name');
  names[names.length - 1].focus();
  update();
});

/* ---------- 요약 ---------- */

function hintFor(net, ria) {
  const income = net - ria;
  if (income <= BASIC_DEDUCTION) {
    return `아직 세금이 없어요. 앞으로 ${won(BASIC_DEDUCTION - income)}까지는 이익을 실현해도 0원이에요.`;
  }
  return `손실 ${won(income - BASIC_DEDUCTION)}을 실현하면 세금이 0원이 돼요. 손실 100만원마다 약 22만원씩 줄어요.`;
}

function renderSchedule() {
  const end = YEAR_END[state.year];
  const items = end
    ? [['올해 귀속 마지막 매도', `미국 현지 ${end.trade} 장까지`], ['결제일', `${state.year}년 ${end.settle}`]]
    : [['올해 귀속 마지막 매도', '증권사 연말 공지 확인']];
  $('schedule').replaceChildren(...items.map(([k, v]) => {
    const li = el('li');
    li.append(el('span', 'k', k), el('span', 'v', v));
    return li;
  }));
}

function update() {
  const data = yearData();
  const { net, ria } = totals(data);
  const { base, tax } = calcTax(net, ria);

  $('sumTax').textContent = won(tax);
  const counted = data.brokers.filter((b) => b.source || b.amount).length;
  const sub = $('heroSub');
  sub.replaceChildren();
  if (counted) {
    sub.append(`${counted}개 증권사 합산 순손익 `, el('b', null, signedWon(net)));
  } else {
    sub.append('증권사 캡처를 올리면 합산해서 계산해요');
  }
  $('sumNet').textContent = signedWon(net);
  $('riaRow').hidden = !ria;
  $('sumRia').textContent = `−${won(ria)}`;
  $('sumDeduct').textContent = `−${won(Math.min(BASIC_DEDUCTION, Math.max(0, net - ria)))}`;
  $('sumBase').textContent = won(base);
  $('sumHint').textContent = counted ? hintFor(net, ria) : '';

  const selected = data.holdings.filter((h) => h.selected);
  $('simResult').hidden = selected.length === 0;
  if (selected.length) {
    const simNet = net + selected.reduce((s, h) => s + (Number(h.amount) || 0), 0);
    const simTax = calcTax(simNet, ria).tax;
    const delta = simTax - tax;
    $('simTax').textContent = won(simTax);
    const d = $('simDelta');
    d.textContent = delta === 0 ? '변화 없음' : `${won(delta)} ${delta < 0 ? '줄어요' : '늘어요'}`;
    d.className = delta < 0 ? 'down' : delta > 0 ? 'up' : '';
  }

  save();
}

function renderAll() {
  $('yearLabel').textContent = state.year;
  renderBrokers();
  renderHoldings();
  renderSchedule();
  update();
}

$('prevYear').addEventListener('click', () => { state.year -= 1; renderAll(); });
$('nextYear').addEventListener('click', () => { state.year += 1; renderAll(); });

renderAll();
