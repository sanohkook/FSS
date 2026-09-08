// data/tide.json 을 국립해양조사원(KHOA) 조석예보로 재생성한다.
//
// 입력: khoa/incheon_YYYYMM.xls  (KHOA 조석예보 다운로드, 2026–2027 24개월)
//   각 행: "YYYY-MM-DD", "HH:MM/고|저/조위cm" ×4  (없는 칸은 "--:--/-/--/--")
//
// 산출 (날짜별):
//   m  물때  — 음력일로 계산: n=(음력일+6)%15, 0→무시·14→조금·그 외 "n물" (인천 서해)
//   f  조류 세기 % — 그날 조차(고조-저조 최대차)를 ±14일 구간의 최소~최대로 정규화
//                   (바다타임 물흐름%와 평균 오차 ≈3%p)
//   x  "최대"(f≥98) / "최소"(f≤3)
//   l  음력일 — 기존 tide.json 값을 유지(천문 사실)
//   t  조석 [ [HH:MM, "고"|"저", cm], ... ]
//
// 음력일이 없는 날짜(2028년 등)는 물때를 비워 둔다. KHOA 자료도 2028년 이후는 추산값.

import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as XLSX from "xlsx";
import { writeJson, readJson, withLock, dataPath } from "./store.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const KHOA_DIR = path.join(ROOT, "khoa");
const WIN = 14; // ±일, 물때 반주기(약 15일)

function mulFromLunar(lunarDay) {
  if (!lunarDay) return "";
  const n = (lunarDay + 6) % 15;
  if (n === 0) return "무시";
  if (n === 14) return "조금";
  return `${n}물`;
}

function parseExtremes(cells) {
  const out = [];
  for (const c of cells) {
    const m = String(c).match(/^(\d{2}:\d{2})\/(고|저)\/(-?\d+)$/);
    if (m) out.push([m[1], m[2], Number(m[3])]);
  }
  return out;
}

export async function importKhoa() {
  const prev = await readJson("tide.json", {});
  const daily = {}; // iso -> { t, range }

  const files = readdirSync(KHOA_DIR).filter((f) => /^incheon_\d{6}\.xls$/.test(f)).sort();
  if (!files.length) throw new Error(`${KHOA_DIR} 에 incheon_YYYYMM.xls 파일이 없습니다`);

  for (const f of files) {
    const wb = XLSX.read(readFileSync(path.join(KHOA_DIR, f)));
    const rows = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, raw: false });
    for (const r of rows) {
      if (!Array.isArray(r) || !/^\d{4}-\d{2}-\d{2}$/.test(r[0] || "")) continue;
      const t = parseExtremes(r.slice(1));
      if (t.length < 2) continue;
      const lv = t.map((x) => x[2]);
      daily[r[0]] = { t, range: Math.max(...lv) - Math.min(...lv) };
    }
  }

  const days = Object.keys(daily).sort();
  const idx = Object.fromEntries(days.map((d, i) => [d, i]));
  const tide = {};
  for (const d of days) {
    const i = idx[d];
    const seg = days.slice(Math.max(0, i - WIN), i + WIN + 1).map((x) => daily[x].range);
    const lo = Math.min(...seg);
    const hi = Math.max(...seg);
    let f = hi > lo ? Math.round(((daily[d].range - lo) / (hi - lo)) * 100) : 50;
    f = Math.max(0, Math.min(100, f));

    const l = prev[d]?.l ?? null;
    const rec = { m: mulFromLunar(l), f, l, t: daily[d].t };
    if (f >= 98) rec.x = "최대";
    else if (f <= 3) rec.x = "최소";
    if (!rec.m) delete rec.m;
    if (rec.l == null) delete rec.l;
    tide[d] = rec;
  }

  await withLock("tide.json", () => writeJson("tide.json", tide));
  return { ok: true, days: days.length, from: days[0], to: days[days.length - 1], file: dataPath("tide.json") };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  importKhoa()
    .then((r) => console.log(`data/tide.json 재생성: ${r.days}일 (${r.from} ~ ${r.to}) — KHOA 조석예보`))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
