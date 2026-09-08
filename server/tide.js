// data/tide.json (바다타임 인천 158 기준, 2026–2027) → 날짜별 파생값.
import { readJson } from "./store.js";

const WD = ["일", "월", "화", "수", "목", "금", "토"];
const SARI = new Set(["7물", "8물"]); // 큰 물(사리 전후)
const MID = new Set(["5물", "6물", "9물", "10물"]);

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
  if (!rec) return { date: iso, weekday, lunar: null, mul: "", mulTier: "", flow: null, flowLabel: "", est: false };
  const est = !!rec.e;
  const flowLabel = rec.x ? rec.x : est ? `≈${rec.f}%` : `${rec.f}%`;
  return {
    date: iso,
    weekday,
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
