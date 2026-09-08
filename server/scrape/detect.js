// 예약 사이트 URL → 어댑터 종류 판별.
import { httpGet } from "./http.js";

export function detectFromUrl(url) {
  const u = url.toLowerCase();
  if (u.includes("sunsang24")) return "sunsang";
  if (/mid=bk|reservation_boat|thefishing\.kr/.test(u)) return "xe";
  return null;
}

export async function detectKind(url) {
  const byUrl = detectFromUrl(url);
  if (byUrl) return byUrl;
  try {
    const res = await httpGet(url, { timeout: 15000 });
    if (/sunsang24|ship_unit_ship_no_/.test(res.text)) return "sunsang";
    if (/admin-right-|reservation_boat_v5/.test(res.text)) return "xe";
  } catch {
    /* fall through */
  }
  return "generic";
}

// 사용자가 넣은 URL 을 사이트 설정 형태로 정규화
export function normalizeSiteUrl(url, kind) {
  const u = new URL(url);
  if (kind === "sunsang") {
    return {
      listUrl: `${u.origin}/ship/schedule_fleet/{y}{m}`,
      dayUrl: `${u.origin}/ship/schedule_fleet/{y}{m}`,
    };
  }
  if (kind === "xe") {
    // mid=bk 형태로 맞춘다
    const mid = u.searchParams.get("mid") || "bk";
    return {
      listUrl: `${u.origin}${u.pathname}?mid=${mid}&year={y}&month={m}&mode=list`,
      dayUrl: `${u.origin}${u.pathname}?mid=${mid}&year={y}&month={m}&day={d}&mode=list`,
    };
  }
  return { listUrl: url, dayUrl: url };
}
