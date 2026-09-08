// sunsang24 선단 스케줄(schedule_fleet) 어댑터 — 동양낚시 등.
import { httpGet, stripTags, detectFish } from "./http.js";

function monthsBetween(fromIso, toIso) {
  const out = [];
  let [y, m] = [Number(fromIso.slice(0, 4)), Number(fromIso.slice(5, 7))];
  const end = toIso.slice(0, 7);
  for (let i = 0; i < 6; i++) {
    const key = `${y}-${String(m).padStart(2, "0")}`;
    out.push(key);
    if (key >= end) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return out;
}

function parseUnit(block) {
  // 마감:  예약마감 <span>20명</span> 예약/...   → 20 = 정원
  if (/data-status_code="END"/.test(block) || /예약마감/.test(block)) {
    const t = block.match(/예약마감<\/span>[\s\S]*?<span class="number[^"]*"[^>]*>\s*(\d+)\s*명/);
    return { status: "full", remain: 0, total: t ? Number(t[1]) : null };
  }
  // 운항:  남은자리 <span>8명</span> 예약/<span>12명</span>  → 잔여 8, 예약 12, 정원 20
  const r = block.match(/남은자리[\s\S]*?<span class="number[^"]*"[^>]*>\s*(\d+)\s*명/);
  if (r) {
    const remain = Number(r[1]);
    const booked = block.match(/예약\/\s*<span class="number[^"]*"[^>]*>\s*(\d+)\s*명/);
    const total = booked ? remain + Number(booked[1]) : null;
    return {
      status: remain <= 0 ? "full" : remain <= 3 ? "few" : "open",
      remain,
      total,
    };
  }
  return { status: "unknown", remain: null, total: null };
}

export async function scrapeSunsang(site, { fromIso, toIso }) {
  const acc = { boats: new Map(), byDate: {}, errors: [] };
  const origin = new URL(site.listUrl).origin;
  const fromYmd = fromIso.replace(/-/g, "");
  const toYmd = toIso.replace(/-/g, "");

  for (const mk of monthsBetween(fromIso, toIso)) {
    const [y, m] = mk.split("-");
    const url = `${origin}/ship/schedule_fleet/${y}${m}`;
    const boatUrl = (shipNo) => `${origin}/ship/schedule_fleet/${y}${m}/${shipNo}`;
    let res;
    try {
      res = await httpGet(url);
    } catch (e) {
      acc.errors.push(`${site.id} ${mk}: ${e.message}`);
      continue;
    }
    const units = [...res.text.matchAll(/<table class="[^"]*ship_unit_ship_no_(\d+)[^"]*"[\s\S]*?<!--\s*해당날자 선박 끝\s*-->/g)];
    for (const u of units) {
      const block = u[0];
      const shipNo = u[1];
      const sd = block.match(/data-sdate="(\d{4}-\d{2}-\d{2})"/);
      if (!sd) continue;
      const iso = sd[1];
      const ymd = iso.replace(/-/g, "");
      if (ymd < fromYmd || ymd > toYmd) continue;
      const nameM = block.match(/<div class="title">\s*([^<]+?)\s*<\/div>/);
      const name = nameM ? stripTags(nameM[1]) : `선박${shipNo}`;
      const fishM = block.match(/<div id="fish">\s*([^<]+?)\s*<\/div>/);
      let hint = fishM ? fishM[1].trim() : "";
      if (/출조안내|미정|준비|안내/.test(hint)) hint = "";
      // 공지사항(editor_memo) + 낚시종류(#fish) 를 함께 보고 어종 판정
      const memo = (block.match(/editor_memo_pc">([\s\S]{0,800})/) || [])[1] || "";
      const fish = detectFish(memo + " " + hint.replace(/,/g, " "), hint);
      if (!acc.boats.has(shipNo)) acc.boats.set(shipNo, { name, fish });
      else if (fish && !acc.boats.get(shipNo).fish) acc.boats.get(shipNo).fish = fish;
      if (/마트|낚시마트/.test(name)) continue; // 선박 아님(낚시점)
      acc.byDate[iso] ||= {};
      acc.byDate[iso][shipNo] = { ...parseUnit(block), url: boatUrl(shipNo), fish };
    }
  }

  const days = Object.keys(acc.byDate).length;
  return { boats: acc.boats, byDate: acc.byDate, days, errors: acc.errors };
}
