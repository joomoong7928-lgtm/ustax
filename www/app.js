'use strict';

const BASIC_DEDUCTION = 2_500_000; // 해외주식 양도소득 기본공제
const NATIONAL_RATE = 0.2;         // 양도소득세 20%
const LOCAL_RATE = 0.1;            // 지방소득세 = 양도소득세의 10%
const DEFAULT_BROKERS = ['키움증권', '한국투자증권', '메리츠증권'];
const STORAGE_KEY = 'ustax-v1';

// 미국 현지 기준, 해당 연도 결제(T+1)로 잡히는 마지막 매도일
const YEAR_END = {
  2026: { trade: '12월 30일(수)', settle: '12월 31일(목)' },
  2027: { trade: '12월 30일(목)', settle: '12월 31일(금)' },
};

const $ = (id) => document.getElementById(id);
const won = (n) => `${Math.round(n).toLocaleString('ko-KR')}원`;
const signedWon = (n) => (n > 0 ? '+' : '') + won(n);
const uid = () => Math.random().toString(36).slice(2, 10);

/* ---------- 저장 ---------- */

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch (e) { /* 저장소 사용 불가 시 빈 상태로 시작 */ }
  return { year: new Date().getFullYear(), years: {} };
}

function save() {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch (e) { /* 무시 */ }
}

const state = load();

function yearData() {
  const key = String(state.year);
  if (!state.years[key]) {
    state.years[key] = {
      brokers: DEFAULT_BROKERS.map((name) => ({ id: uid(), name, amount: 0 })),
      holdings: [],
    };
  }
  return state.years[key];
}

/* ---------- 계산 ---------- */

function calcTax(net) {
  const base = Math.max(0, net - BASIC_DEDUCTION);
  const national = Math.floor(base * NATIONAL_RATE);
  const local = Math.floor(national * LOCAL_RATE);
  return { base, tax: national + local };
}

function netOf(data) {
  return data.brokers.reduce((s, b) => s + (Number(b.amount) || 0), 0);
}

/* ---------- 금액 입력 행 ---------- */

function bindAmountRow(li, item, onChange) {
  const amountEl = li.querySelector('.amount');
  const signEl = li.querySelector('.sign');

  // 금액이 0일 때도 손실(−) 선택을 유지하기 위해 부호를 따로 들고 있음
  let negative = item.amount < 0;

  const paintSign = () => {
    li.classList.toggle('neg', negative);
    signEl.textContent = negative ? '−' : '+';
  };

  amountEl.addEventListener('input', () => {
    const abs = Number(amountEl.value.replace(/[^\d]/g, '').slice(0, 13)) || 0;
    item.amount = negative ? -abs : abs;
    amountEl.value = abs ? abs.toLocaleString('ko-KR') : '';
    onChange();
  });
  signEl.addEventListener('click', () => {
    negative = !negative;
    item.amount = -item.amount;
    paintSign();
    onChange();
  });

  amountEl.value = item.amount ? Math.abs(item.amount).toLocaleString('ko-KR') : '';
  paintSign();
}

/* ---------- 렌더 ---------- */

function renderBrokers() {
  const data = yearData();
  const list = $('brokerList');
  list.innerHTML = '';
  data.brokers.forEach((b) => {
    const li = $('brokerTpl').content.firstElementChild.cloneNode(true);
    const nameEl = li.querySelector('.name');
    nameEl.value = b.name;
    nameEl.addEventListener('input', () => { b.name = nameEl.value; save(); });
    bindAmountRow(li, b, update);
    li.querySelector('.del').addEventListener('click', () => {
      if (b.amount && !confirm(`${b.name || '이 증권사'} 항목을 삭제할까요?`)) return;
      data.brokers = data.brokers.filter((x) => x !== b);
      renderBrokers();
      update();
    });
    list.appendChild(li);
  });
}

function renderHoldings() {
  const data = yearData();
  const list = $('holdingList');
  list.innerHTML = '';
  data.holdings.forEach((h) => {
    const li = $('holdingTpl').content.firstElementChild.cloneNode(true);
    const nameEl = li.querySelector('.name');
    const selEl = li.querySelector('.sel');
    nameEl.value = h.name;
    selEl.checked = !!h.selected;
    nameEl.addEventListener('input', () => { h.name = nameEl.value; save(); });
    selEl.addEventListener('change', () => { h.selected = selEl.checked; update(); });
    bindAmountRow(li, h, update);
    li.querySelector('.del').addEventListener('click', () => {
      data.holdings = data.holdings.filter((x) => x !== h);
      renderHoldings();
      update();
    });
    list.appendChild(li);
  });
}

function renderSchedule() {
  const y = state.year;
  const end = YEAR_END[y];
  const items = [];
  if (end) {
    items.push(['올해 귀속 마지막 매도', `미국 현지 ${end.trade} 장까지`]);
    items.push(['결제일', `${y}년 ${end.settle}`]);
  } else {
    items.push(['올해 귀속 마지막 매도', '증권사 연말 공지 확인']);
  }
  items.push(['증권사 신고대행 신청', `${y + 1}년 2~4월경 (증권사별 상이)`]);
  items.push(['확정신고·납부', `${y + 1}년 5월 1일 ~ 5월 31일`]);

  $('schedule').innerHTML = items
    .map(([k, v]) => `<li><span class="k">${k}</span><span class="v">${v}</span></li>`)
    .join('');
}

function hintFor(net) {
  if (net <= BASIC_DEDUCTION) {
    const room = BASIC_DEDUCTION - net;
    return `세금이 없어요. 앞으로 <b>${won(room)}</b>까지는 이익을 실현해도 세금이 0원이에요.`;
  }
  const base = net - BASIC_DEDUCTION;
  return `손실 <b>${won(base)}</b>을 실현하면 세금이 0원이 돼요. 손실 100만원을 실현할 때마다 약 22만원이 줄어요.`;
}

function update() {
  const data = yearData();
  const net = netOf(data);
  const { base, tax } = calcTax(net);

  $('sumTax').textContent = won(tax);
  $('sumNet').textContent = signedWon(net);
  $('sumDeduct').textContent = won(-Math.min(BASIC_DEDUCTION, Math.max(0, net)));
  $('sumBase').textContent = won(base);
  $('sumHint').innerHTML = hintFor(net);

  const selected = data.holdings.filter((h) => h.selected);
  $('simResult').hidden = selected.length === 0;
  if (selected.length) {
    const simNet = net + selected.reduce((s, h) => s + (Number(h.amount) || 0), 0);
    const simTax = calcTax(simNet).tax;
    const delta = simTax - tax;
    $('simNet').textContent = signedWon(simNet);
    $('simTax').textContent = won(simTax);
    const d = $('simDelta');
    d.textContent = delta === 0 ? '변화 없음' : signedWon(delta);
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

/* ---------- 이벤트 ---------- */

$('addBroker').addEventListener('click', () => {
  yearData().brokers.push({ id: uid(), name: '', amount: 0 });
  renderBrokers();
  const names = $('brokerList').querySelectorAll('.name');
  names[names.length - 1].focus();
  save();
});

$('addHolding').addEventListener('click', () => {
  yearData().holdings.push({ id: uid(), name: '', amount: 0, selected: true });
  renderHoldings();
  const names = $('holdingList').querySelectorAll('.name');
  names[names.length - 1].focus();
  update();
});

$('prevYear').addEventListener('click', () => { state.year -= 1; renderAll(); });
$('nextYear').addEventListener('click', () => { state.year += 1; renderAll(); });

renderAll();
