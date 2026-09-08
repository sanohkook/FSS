// 물때·조류 세기 갱신 (선택 기능).
//
// 기본값: data/tide.json 에 2026–2027 전량이 번들돼 있어 갱신 없이 동작한다.
//         (바다타임도 2028년 자료가 없으므로 사실상 추가 갱신 불필요.)
//
// 소스 두 가지:
//   1) badatime  — badatime.com/158/daily 파싱. **비영리·개인 용도에 한해** 사용.
//                  기본. 인증키 불필요. `npm run tide`
//   2) khoa      — 국립해양조사원 조석예보 OpenAPI. 공식·약관상 자유.
//                  무료 인증키 필요: https://www.khoa.go.kr/oceangrid/ → export KHOA_KEY=...
//                  `npm run tide -- --khoa`  (또는 KHOA_KEY 설정 시 자동)
//
// 물때(3물/조금/사리): 음력일로 계산 — n = (음력일 + 6) % 15, 0→무시·14→조금·그 외 "n물".
//   (인천 서해 기준, 2026년 바다타임과 365일 전부 일치 확인)
// 조류 세기 %: 그날 조차(최고조-최저조)를 인천 조차 범위로 정규화.

import { httpGet } from "./scrape/http.js";
import { readJson, writeJson, withLock } from "./store.js";

const KHOA_OBS = process.env.KHOA_OBS || "DT_0001"; // 인천
const R_MIN = 150;
const R_MAX = 990;

function mulFromLunar(lunarDay) {
  if (!lunarDay) return null;
  const n = (lunarDay + 6) % 15;
  if (n === 0) return "무시";
  if (n === 14) return "조금";
  return `${n}물`;
}
const MUL_KEEP = new Set(["조금", "무시", "사리"]);
function normMul(s) {
  s = String(s).replace(/\s+/g, "");
  const m = s.match(/(\d+)물/);
  if (m) return `${m[1]}물`;
  return MUL_KEEP.has(s) ? s : s;
}

function ymdList(fromIso, days) {
  const out = [];
  const d = new Date(fromIso + "T12:00:00");
  for (let i = 0; i < days; i++) {
    out.push(`${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`);
    d.setDate(d.getDate() + 1);
  }
  return out;
}

// ---- 1) badatime ----
async function fromBadatime(tide, stationId = 158) {
  const res = await httpGet(`https://www.badatime.com/${stationId}/daily`);
  const html = res.text;
  const monthM = html.match(/<th id="week">\s*(\d{1,2})월/);
  if (!monthM) return { ok: false, message: "바다타임 표 머리글을 찾지 못함" };
  const now = new Date();
  let year = now.getFullYear();
  let month = Number(monthM[1]);
  if (month < now.getMonth() + 1 - 6) year += 1;

  const rows = [
    ...html.matchAll(
      /<td id="week" class="day-cell">\s*(\d{1,2})\([^)]*\)<br>\s*<span[^>]*>([\d.]+)<\/span>[\s\S]*?<b>([^<]+)<\/b>[\s\S]*?data-value="(\d+)"/g
    ),
  ];
  if (!rows.length) return { ok: false, message: "바다타임 데이터 행 파싱 실패" };

  let prevDay = 0;
  let applied = 0;
  for (const r of rows) {
    const day = Number(r[1]);
    if (day < prevDay) {
      month += 1;
      if (month > 12) { month = 1; year += 1; }
    }
    prevDay = day;
    const iso = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    const lunar = Number((r[2].split(".")[1] || "").replace(/^0/, "")) || null;
    const f = Number(r[4]);
    const cur = tide[iso] || {};
    const next = { ...cur, m: normMul(r[3]), f, l: lunar ?? cur.l };
    if (f >= 100) next.x = "최대";
    else if (f <= 3) next.x = "최소";
    else delete next.x;
    delete next.e;
    tide[iso] = next;
    applied++;
  }
  return { ok: applied > 0, applied, source: `badatime ${stationId}` };
}

// ---- 2) KHOA OpenAPI ----
async function fromKhoa(tide, { days, fromIso }) {
  const key = process.env.KHOA_KEY;
  if (!key)
    return {
      ok: false,
      message:
        "KHOA_KEY 가 없습니다. https://www.khoa.go.kr/oceangrid/ 무료 인증키 발급 후 export KHOA_KEY=...",
    };
  const start = fromIso || new Date().toISOString().slice(0, 10);
  let applied = 0;
  const errors = [];
  for (const ymd of ymdList(start, days)) {
    const iso = `${ymd.slice(0, 4)}-${ymd.slice(4, 6)}-${ymd.slice(6, 8)}`;
    const url =
      `https://www.khoa.go.kr/api/oceangrid/tideObsPreTab/search.do` +
      `?ServiceKey=${encodeURIComponent(key)}&ObsCode=${KHOA_OBS}&Date=${ymd}&ResultType=json`;
    let json;
    try {
      json = JSON.parse((await httpGet(url, { timeout: 15000 })).text);
    } catch (e) {
      errors.push(`${iso}: ${e.message}`);
      continue;
    }
    const rows = json?.result?.data;
    if (!Array.isArray(rows) || rows.length < 2) continue;
    const lv = rows.map((r) => Number(r.tph_level ?? r.pre_value)).filter(Number.isFinite);
    if (lv.length < 2) continue;
    const range = Math.max(...lv) - Math.min(...lv);
    const f = Math.max(0, Math.min(100, Math.round(((range - R_MIN) / (R_MAX - R_MIN)) * 100)));
    const cur = tide[iso] || {};
    const next = { ...cur, f };
    const mul = mulFromLunar(cur.l);
    if (mul) next.m = mul;
    if (f >= 97) next.x = "최대";
    else if (f <= 5) next.x = "최소";
    else delete next.x;
    delete next.e;
    tide[iso] = next;
    applied++;
  }
  return { ok: applied > 0, applied, errors, source: `KHOA ${KHOA_OBS}` };
}

export async function refreshTide({ days = 60, fromIso, source } = {}) {
  const use = source || (process.env.KHOA_KEY ? "khoa" : "badatime");
  const tide = await readJson("tide.json", {});
  const r = use === "khoa" ? await fromKhoa(tide, { days, fromIso }) : await fromBadatime(tide);
  if (r.ok) await withLock("tide.json", () => writeJson("tide.json", tide));
  return r;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const source = process.argv.includes("--khoa") ? "khoa" : process.argv.includes("--badatime") ? "badatime" : undefined;
  refreshTide({ source })
    .then((r) => console.log(r))
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
