// 저장된 "레시피"(정규식 규칙 데이터)로 임의 예약 사이트를 파싱한다.
// 레시피는 AI(server/scrape/ai.js)가 사이트 추가 시 1회 생성 → sites.json 에 저장.
// 이후 조회는 이 파일이 토큰 없이 처리한다.
import { httpGet, stripTags } from "./http.js";

// 레시피 스키마 (모든 정규식은 문자열):
// {
//   dateSection: { regex, dateGroup, dateStyle: "ymd8" | "iso" },   // g 플래그로 각 날짜 구간 시작을 찾음
//   boatUnit:    { regex, nameGroup },                               // 구간 안 배 단위 반복
//   statusScope: "match" | "group",  statusGroup: <n>,               // 상태 텍스트 위치
//   fullWords:   [ ... ],   closedWords: [ ... ],
//   remainRegex: <string, group1 = 숫자>,
//   bookingUrl:  "<{ymd} / {iso} 치환>"
// }

function safeRe(src, flags) {
  try {
    return new RegExp(src, flags);
  } catch {
    return null;
  }
}

function toIso(raw, style) {
  const d = String(raw).replace(/\D/g, "");
  if (d.length !== 8) return null;
  const iso = `${d.slice(0, 4)}-${d.slice(4, 6)}-${d.slice(6, 8)}`;
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso : null;
}

function classify(text, R) {
  const t = String(text || "");
  if ((R.fullWords || []).some((w) => w && t.includes(w))) return { status: "full", remain: 0 };
  if ((R.closedWords || []).some((w) => w && t.includes(w))) return { status: "unknown", remain: null };
  const rr = R.remainRegex && safeRe(R.remainRegex, "");
  const m = rr && t.match(rr);
  if (m) {
    const n = Number(m[1]);
    if (Number.isFinite(n)) return { status: n <= 0 ? "full" : n <= 3 ? "few" : "open", remain: n };
  }
  return { status: "unknown", remain: null };
}

// html, recipe, { fromIso, toIso } → { boats: Map(name→{name,fish}), byDate, days, errors }
export function applyRecipe(html, R, range = {}) {
  const acc = { boats: new Map(), byDate: {}, errors: [] };
  if (!R || !R.dateSection || !R.boatUnit) {
    acc.errors.push("레시피 형식 오류");
    return finish(acc, range);
  }
  const sectRe = safeRe(R.dateSection.regex, "g");
  const unitSrc = R.boatUnit.regex;
  if (!sectRe || !safeRe(unitSrc, "g")) {
    acc.errors.push("레시피 정규식 오류");
    return finish(acc, range);
  }
  const dg = R.dateSection.dateGroup || 1;
  const ng = R.boatUnit.nameGroup || 1;

  const anchors = [...html.matchAll(sectRe)].slice(0, 400);
  for (let i = 0; i < anchors.length; i++) {
    const iso = toIso(anchors[i][dg], R.dateSection.dateStyle);
    if (!iso) continue;
    const seg = html.slice(anchors[i].index, i + 1 < anchors.length ? anchors[i + 1].index : html.length);
    const unitRe = safeRe(unitSrc, "g");
    let m;
    let guard = 0;
    while ((m = unitRe.exec(seg)) && guard++ < 200) {
      if (m.index === unitRe.lastIndex) unitRe.lastIndex++;
      const name = stripTags(m[ng] || "").slice(0, 40);
      if (!name) continue;
      const statusText = R.statusScope === "group" ? m[R.statusGroup || 2] : m[0];
      const info = classify(statusText, R);
      const ymd = iso.replace(/-/g, "");
      const url = (R.bookingUrl || "").replace(/\{ymd\}/g, ymd).replace(/\{iso\}/g, iso);
      if (!acc.boats.has(name)) acc.boats.set(name, { name, fish: "" });
      acc.byDate[iso] ||= {};
      acc.byDate[iso][name] = { ...info, url: url || undefined };
    }
  }
  return finish(acc, range);
}

function finish(acc, range) {
  const from = (range.fromIso || "0000-00-00").replace(/-/g, "");
  const to = (range.toIso || "9999-99-99").replace(/-/g, "");
  const days = Object.keys(acc.byDate).filter((iso) => {
    const y = iso.replace(/-/g, "");
    return y >= from && y <= to;
  }).length;
  // uid = 배 이름 슬러그 (레시피 사이트는 안정적 숫자 id 가 없음)
  const boats = new Map();
  for (const [name, meta] of acc.boats) boats.set(slug(name), meta);
  const byDate = {};
  for (const [iso, cells] of Object.entries(acc.byDate)) {
    byDate[iso] = {};
    for (const [name, cell] of Object.entries(cells)) byDate[iso][slug(name)] = cell;
  }
  return { boats, byDate, days, errors: acc.errors };
}

export function slug(name) {
  let h = 0;
  for (let i = 0; i < name.length; i++) h = (h * 31 + name.charCodeAt(i)) >>> 0;
  return h.toString(36);
}

// scrape 어댑터 진입점
export async function scrapeRecipe(site, range) {
  const acc = { boats: new Map(), byDate: {}, errors: [] };
  const months = monthsIn(range);
  for (const [y, m] of months) {
    const url = (site.listUrl || "")
      .replace(/\{y\}/g, y)
      .replace(/\{yyyy\}/g, y)
      .replace(/\{m\}/g, m)
      .replace(/\{mm\}/g, m);
    let res;
    try {
      res = await httpGet(url);
    } catch (e) {
      acc.errors.push(`${site.id} ${y}-${m}: ${e.message}`);
      continue;
    }
    const out = applyRecipe(res.text, site.recipe, range);
    for (const [uid, meta] of out.boats) if (!acc.boats.has(uid)) acc.boats.set(uid, meta);
    for (const [iso, cells] of Object.entries(out.byDate)) {
      acc.byDate[iso] = { ...(acc.byDate[iso] || {}), ...cells };
    }
    acc.errors.push(...out.errors);
  }
  const from = range.fromIso.replace(/-/g, "");
  const to = range.toIso.replace(/-/g, "");
  const days = Object.keys(acc.byDate).filter((iso) => {
    const y = iso.replace(/-/g, "");
    return y >= from && y <= to;
  }).length;
  return { boats: acc.boats, byDate: acc.byDate, days, errors: acc.errors };
}

function monthsIn({ fromIso, toIso }) {
  const out = [];
  let [y, m] = [Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7))];
  const end = toIso.slice(0, 7);
  for (let i = 0; i < 6; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push([String(y), String(m).padStart(2, "0")]);
    if (key >= end) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}
