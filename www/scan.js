'use strict';

// 증권사 양도세 화면 캡처의 OCR 결과(줄 단위 텍스트 + 위치)에서 금액을 뽑아내는 로직.
// 증권사마다 "화면 프로필"을 두고, 화면에 같이 나오는 숫자로 검산해 오인식을 걸러낸다.

const DEDUCTION = 2_500_000;

function taxOf(net) {
  const base = Math.max(0, net - DEDUCTION);
  const national = Math.floor(base * 0.2);
  return national + Math.floor(national * 0.1);
}

const PROFILES = [
  {
    id: 'kiwoom',
    name: '키움증권',
    keys: ['양도소득총합계', '산출세액', '기본공제적용', '가계산조회', '대행신고신청', '양도세조회'],
    fields: {
      amount: ['양도소득총합계'],
      tax: ['양도소득산출세액', '산출세액'],
    },
    // 화면의 산출세액 = (양도소득 총 합계 − 250만) × 22%
    verify: (f) => (f.tax == null || f.tax === 0 ? null : Math.abs(taxOf(f.amount) - f.tax) <= 10),
  },
  {
    id: 'kis',
    name: '한국투자증권',
    keys: ['손익합계', '수수료및제비용', '과세대상금액', '총예상세금', '해외주식양도세조회'],
    fields: {
      amount: ['양도소득금액'],
      gross: ['손익합계'],
      fee: ['수수료및제비용'],
    },
    // 양도소득금액 = 손익 합계 − 수수료 및 제비용
    verify: (f) => (f.gross == null || f.fee == null ? null : f.gross - Math.abs(f.fee) === f.amount),
  },
  {
    id: 'meritz',
    name: '메리츠증권',
    keys: ['조회/발급', '양도소득년도', 'RIA최종공제금액', '과세표준금액', '종목별합산내역', '거래내역발송'],
    fields: {
      amount: ['양도소득금액'],
      sell: ['매도금액'],
      buy: ['매수금액'],
      cost: ['필요경비'],
      ria: ['RIA최종공제금액'],
    },
    // 양도소득금액 = 매도금액 − 매수금액 − 필요경비
    verify: (f) => (f.sell == null || f.buy == null ? null : f.sell - f.buy - (f.cost || 0) === f.amount),
  },
];

// 프로필이 없는 증권사 화면에서 시도할 일반 항목명 (앞쪽이 우선)
const GENERIC_AMOUNT = ['양도소득금액', '양도소득총합계', '양도차익', '양도소득합계', '손익합계'];

// 공백·기호를 지워 OCR 표기 차이를 흡수 (괄호 안 기호 ①②③은 OCR이 0 등으로 읽기도 함)
const norm = (s) => s.replace(/[^가-힣A-Za-z0-9/]/g, '');

// "-4,199,901원", "457,094 원" → 정수. 숫자·쉼표·부호·원 외의 글자가 섞이면 오인식으로 보고 null.
function parseAmount(raw) {
  let t = raw.replace(/\s+/g, '').replace(/원$/, '').replace(/[Oo]/g, '0');
  const negative = /^[-−–]/.test(t);
  t = t.replace(/^[-−–=]+/, '');
  if (!/^\d{1,3}(,\d{3})*$|^\d+$/.test(t)) return null;
  const n = Number(t.replace(/,/g, ''));
  return negative ? -n : n;
}

const NUM_TOKEN = /[-−–]?\s?\d[\d,]*\s?원?/g;
const isNumberLine = (text) => parseAmount(text) != null;
const centerY = (l) => l.y + l.h / 2;

// 항목명 줄과 같은 높이, 오른쪽에 있는 숫자 줄을 찾는다. 없으면 같은 줄 안의 숫자를 쓴다.
function valueFor(lines, label) {
  const hit = lines
    .filter((l) => norm(l.text).startsWith(label))
    .sort((a, b) => a.y - b.y)[0];
  if (!hit) return null;

  const right = lines
    .filter((l) => l !== hit && l.x > hit.x + hit.w * 0.5 && isNumberLine(l.text))
    .filter((l) => Math.abs(centerY(l) - centerY(hit)) < Math.max(l.h, hit.h) * 0.7)
    .sort((a, b) => Math.abs(centerY(a) - centerY(hit)) - Math.abs(centerY(b) - centerY(hit)) || b.x - a.x)[0];
  if (right) return parseAmount(right.text);

  // 같은 줄에 붙어 나온 경우: 항목명 뒤쪽에서 쉼표가 있는 숫자를 우선
  const rest = hit.text.slice(Math.min(hit.text.length, label.length));
  const tokens = (rest.match(NUM_TOKEN) || []).map(parseAmount).filter((n) => n != null);
  const grouped = (rest.match(NUM_TOKEN) || []).filter((t) => t.includes(','));
  if (grouped.length) return parseAmount(grouped[grouped.length - 1]);
  return tokens.length ? tokens[tokens.length - 1] : null;
}

function detectYear(lines) {
  const top = [...lines].sort((a, b) => a.y - b.y).slice(0, 15);
  for (const l of top) {
    const m = l.text.match(/(20\d{2})/);
    if (m) return Number(m[1]);
  }
  return null;
}

function detectAccount(lines) {
  for (const l of lines) {
    const m = l.text.match(/\b(\d{4}-\d{4}(?:-\d{2})?)\b/);
    if (m) return m[1];
  }
  return null;
}

function detectProfile(lines) {
  const texts = lines.map((l) => norm(l.text));
  let best = null;
  let bestScore = 0;
  for (const p of PROFILES) {
    const score = p.keys.filter((k) => texts.some((t) => t.includes(norm(k)))).length;
    if (score > bestScore) { best = p; bestScore = score; }
  }
  return bestScore >= 2 ? best : null;
}

/**
 * @param {{text:string,x:number,y:number,w:number,h:number}[]} lines
 * @returns {{profile:string|null, brokerName:string|null, amount:number|null, ria:number,
 *            verified:boolean|null, year:number|null, account:string|null, label:string|null}}
 */
function scanLines(lines) {
  const profile = detectProfile(lines);
  const year = detectYear(lines);
  const account = detectAccount(lines);

  if (profile) {
    const f = {};
    let label = null;
    for (const [key, labels] of Object.entries(profile.fields)) {
      for (const lb of labels) {
        const v = valueFor(lines, lb);
        if (v != null) { f[key] = v; if (key === 'amount') label = lb; break; }
      }
    }
    const verified = f.amount == null ? false : profile.verify(f);
    return {
      profile: profile.id, brokerName: profile.name, amount: f.amount ?? null,
      ria: f.ria || 0, verified, year, account, label,
    };
  }

  for (const lb of GENERIC_AMOUNT) {
    const v = valueFor(lines, lb);
    if (v != null) {
      return { profile: null, brokerName: null, amount: v, ria: 0, verified: null, year, account, label: lb };
    }
  }
  return { profile: null, brokerName: null, amount: null, ria: 0, verified: false, year, account, label: null };
}

if (typeof module !== 'undefined') module.exports = { scanLines, parseAmount, taxOf, PROFILES };
