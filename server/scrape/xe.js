// XpressEngine 예약 모듈(reservation_boat_v5.2) 어댑터 — 칸피싱·제일낚시 등.
// 한 달 목록 페이지 + more.php 페이지네이션으로 날짜별·배별 잔여석을 읽는다.
import { httpGet, unescapeHtml, stripTags } from "./http.js";

const BOAT_RE =
  /<span style="font-size:15px;\s*font-weight:bold;[^"]*">([\s\S]*?)<\/span>([\s\S]*?)<div id="admin-right-(\d{8})-(\d+)-0">([\s\S]*?)<\/div>/g;

function classify(alt) {
  const a = String(alt || "");
  if (/예약완료|예약마감|마감/.test(a)) return { status: "full", remain: 0 };
  if (/배정비|정비일|휴항|운휴/.test(a)) return { status: "unknown", remain: null };
  const m = a.match(/남은자리\s*(\d+)\s*명?/);
  if (m) {
    const remain = Number(m[1]);
    return { status: remain <= 0 ? "full" : remain <= 3 ? "few" : "open", remain };
  }
  return { status: "unknown", remain: null };
}

function moduleDir(html) {
  const m = html.match(/reservation_boat_v5\.\d+_seat\d+/);
  return m ? m[0] : "reservation_boat_v5.2_seat1";
}

function parseSections(html, origin, modDir, acc) {
  const anchors = [...html.matchAll(/<a\s+name="(\d{8})"\s*>/g)];
  for (let i = 0; i < anchors.length; i++) {
    const ymd = anchors[i][1];
    const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const seg = html.slice(anchors[i].index, i + 1 < anchors.length ? anchors[i + 1].index : html.length);
    BOAT_RE.lastIndex = 0;
    let m;
    while ((m = BOAT_RE.exec(seg))) {
      const name = stripTags(m[1]).replace(/\s+/g, " ").trim();
      if (!name) continue;
      const between = m[2];
      const uid = m[4];
      const info = classify(m[5]);
      const fishM = between.match(/alt="낚시종류"[\s\S]*?padding-left:5px;">\s*([^<]+?)\s*<\/td>/);
      const fish = fishM ? fishM[1].replace(/낚시$/, "").trim() : "";
      if (!acc.boats.has(uid)) acc.boats.set(uid, { name, fish });
      else if (fish && !acc.boats.get(uid).fish) acc.boats.get(uid).fish = fish;
      const url = `${origin}/_core/module/${modDir}/popup.step1.php?date=${ymd}&PA_N_UID=${uid}`;
      acc.byDate[iso] ||= {};
      acc.byDate[iso][uid] = { ...info, url };
    }
  }
}

// site: { id, name, listUrl, dayUrl }  range: { fromIso, toIso }
export async function scrapeXe(site, { fromIso, toIso }) {
  const acc = { boats: new Map(), byDate: {}, errors: [] };
  const origin = new URL(site.listUrl).origin;
  const fromYmd = fromIso.replace(/-/g, "");
  const toYmd = toIso.replace(/-/g, "");

  // 1) 시작 달의 목록 페이지 (오늘 이후 며칠 + 모듈 경로 파악)
  let modDir = "reservation_boat_v5.2_seat1";
  try {
    const url = site.listUrl
      .replace(/\{y\}/g, fromIso.slice(0, 4))
      .replace(/\{m\}/g, fromIso.slice(5, 7));
    const res = await httpGet(url);
    modDir = moduleDir(res.text);
    parseSections(res.text, origin, modDir, acc);
  } catch (e) {
    acc.errors.push(`${site.id} list: ${e.message}`);
  }

  // 2) more.php 로 범위 끝까지 페이지네이션
  let cursor = fromYmd;
  for (let guard = 0; guard < 24; guard++) {
    let res;
    try {
      res = await httpGet(
        `${origin}/_core/module/${modDir}/_module.new.list.more.php?date8=${cursor}&PA_N_UID=0`,
        { headers: { "x-requested-with": "XMLHttpRequest" } }
      );
    } catch (e) {
      acc.errors.push(`${site.id} more ${cursor}: ${e.message}`);
      break;
    }
    const htmlM = res.text.match(/<htmlCode>([\s\S]*?)<\/htmlCode>/);
    const lastM = res.text.match(/<last_day>(\d{8})<\/last_day>/);
    if (htmlM) parseSections(unescapeHtml(htmlM[1]), origin, modDir, acc);
    const last = lastM ? lastM[1] : null;
    if (!last || last <= cursor) break;
    cursor = last;
    if (cursor >= toYmd) break;
  }

  // 오늘 행은 목록 페이지에서 비어 오는 경우가 있어 day 파라미터로 재요청
  const todayCells = acc.byDate[fromIso];
  const todayEmpty = !todayCells || Object.values(todayCells).every((c) => c.status === "unknown");
  if (todayEmpty && site.dayUrl) {
    try {
      const url = site.dayUrl
        .replace(/\{y\}/g, fromIso.slice(0, 4))
        .replace(/\{m\}/g, fromIso.slice(5, 7))
        .replace(/\{d\}/g, fromIso.slice(8, 10));
      const res = await httpGet(url);
      parseSections(res.text, origin, modDir, acc);
    } catch (e) {
      acc.errors.push(`${site.id} day ${fromIso}: ${e.message}`);
    }
  }

  const days = Object.keys(acc.byDate).filter((iso) => {
    const y = iso.replace(/-/g, "");
    return y >= fromYmd && y <= toYmd;
  }).length;
  return { boats: acc.boats, byDate: acc.byDate, days, errors: acc.errors };
}
