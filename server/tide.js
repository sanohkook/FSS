// data/tide.json (바다타임 인천 158 기준, 2026–2027) → 날짜별 파생값.
import { readJson } from "./store.js";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const SARI = new Set(["7물", "8물"]); // 큰 물(사리 전후)
const MID = new Set(["5물", "6물", "9물", "10물"]);

// 대한민국 공휴일 (대체공휴일 포함) 2026–2027
const HOLIDAYS = {
  "2026-01-01": "신정",
  "2026-02-16": "설날 연휴", "2026-02-17": "설날", "2026-02-18": "설날 연휴",
  "2026-03-01": "삼일절", "2026-03-02": "대체공휴일",
  "2026-05-05": "어린이날",
  "2026-05-24": "부처님오신날", "2026-05-25": "대체공휴일",
  "2026-06-06": "현충일",
  "2026-08-15": "광복절", "2026-08-17": "대체공휴일",
  "2026-09-24": "추석 연휴", "2026-09-25": "추석", "2026-09-26": "추석 연휴",
  "2026-10-03": "개천절", "2026-10-05": "대체공휴일",
  "2026-10-09": "한글날",
  "2026-12-25": "성탄절",
  "2027-01-01": "신정",
  "2027-02-06": "설날 연휴", "2027-02-07": "설날", "2027-02-08": "설날 연휴", "2027-02-09": "대체공휴일",
  "2027-03-01": "삼일절",
  "2027-05-05": "어린이날",
  "2027-05-13": "부처님오신날",
  "2027-06-06": "현충일",
  "2027-08-15": "광복절", "2027-08-16": "대체공휴일",
  "2027-09-14": "추석 연휴", "2027-09-15": "추석", "2027-09-16": "추석 연휴",
  "2027-10-03": "개천절", "2027-10-04": "대체공휴일",
  "2027-10-09": "한글날", "2027-10-11": "대체공휴일",
  "2027-12-25": "성탄절", "2027-12-27": "대체공휴일",
};
export function holidayName(iso) {
  return HOLIDAYS[iso] || null;
}

let cache = null;
export async function loadTide() {
  if (!cache) cache = await readJson("tide.json", {});
  return cache;
}
export function clearTideCache() {
  cache = null;
}

export function mulTier(mul) {
  if (SARI.has(mul)) return "sari";
  if (MID.has(mul)) return "mid";
  return "";
}

// iso: "YYYY-MM-DD" → { date, weekday, lunar, mul, mulTier, flow, flowLabel, est } | null
export function tideRow(tide, iso) {
  const rec = tide[iso];
  const [y, m, d] = iso.split("-").map(Number);
  const weekday = WD[new Date(y, m - 1, d).getDay()];
  const holiday = HOLIDAYS[iso] || null;
  if (!rec) return { date: iso, weekday, holiday, lunar: null, mul: "", mulTier: "", flow: null, flowLabel: "", est: false };
  const est = !!rec.e;
  const flowLabel = rec.x ? rec.x : est ? `≈${rec.f}%` : `${rec.f}%`;
  return {
    date: iso,
    weekday,
    holiday,
    lunar: rec.l ?? null,
    mul: rec.m || "",
    mulTier: mulTier(rec.m),
    flow: typeof rec.f === "number" ? rec.f : null,
    flowLabel,
    est,
  };
}

export function daysInMonth(month) {
  const [y, m] = month.split("-").map(Number);
  return new Date(y, m, 0).getDate();
}
