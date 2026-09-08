// 전체 예약 사이트 재조회 → data/avail.json 갱신.
import { getSites, getAvail, writeJson, withLock } from "../store.js";
import { scrapeXe } from "./xe.js";
import { scrapeSunsang } from "./sunsang.js";
import { scrapeRecipe } from "./recipe.js";

function isoToday() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function addMonths(iso, k) {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y, m - 1 + k, d);
  return `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, "0")}-${String(dt.getDate()).padStart(2, "0")}`;
}

const ADAPTERS = { xe: scrapeXe, sunsang: scrapeSunsang, recipe: scrapeRecipe };

export async function refreshAll({ months } = {}) {
  const sites = await getSites();
  const prev = await getAvail();
  const fromIso = isoToday();
  // 이번 달 ~ 올해 12월 (최소 4개월 앞까지)
  if (months == null) {
    const m = Number(fromIso.slice(5, 7));
    months = Math.max(4, 12 - m + 1);
  }
  const toIso = addMonths(fromIso, months);
  const range = { fromIso, toIso };

  const boatMeta = new Map(); // id -> { id, siteId, name, fish, lastSeen }
  for (const b of prev.boats || []) boatMeta.set(b.id, { ...b });

  const byDate = {};
  const errors = [];
  const summary = [];
  let collected = 0;

  for (const site of sites) {
    if (site.enabled === false) continue;
    const adapter = ADAPTERS[site.kind];
    if (!adapter) {
      summary.push({ site: site.id, kind: site.kind || "generic", days: 0, note: "스크레이프 미지원(링크 전용)" });
      continue;
    }
    let out;
    try {
      out = await adapter(site, range);
    } catch (e) {
      errors.push(`${site.id}: ${e.message}`);
      summary.push({ site: site.id, kind: site.kind, days: 0, note: e.message });
      continue;
    }
    errors.push(...out.errors);
    for (const [uid, meta] of out.boats) {
      const id = `${site.id}:${uid}`;
      const existing = boatMeta.get(id) || {};
      boatMeta.set(id, {
        id,
        siteId: site.id,
        uid,
        name: meta.name || existing.name || id,
        fish: meta.fish || existing.fish || "",
        lastSeen: fromIso,
      });
    }
    for (const [iso, cells] of Object.entries(out.byDate)) {
      byDate[iso] ||= {};
      for (const [uid, cell] of Object.entries(cells)) {
        byDate[iso][`${site.id}:${uid}`] = cell;
      }
    }
    collected += out.days;
    summary.push({ site: site.id, kind: site.kind, days: out.days });
  }

  if (collected === 0 && (prev.boats || []).length) {
    return { ok: false, kept: true, updatedAt: prev.updatedAt, summary, errors, message: "수집 0건 — 기존 데이터 유지" };
  }

  // 이번 조회에 실제로 등장한 배만 유지 (배 이름/대상어는 이전 값으로 보강)
  const seenIds = new Set();
  for (const cells of Object.values(byDate)) for (const id of Object.keys(cells)) seenIds.add(id);
  const boats = [...boatMeta.values()]
    .filter((b) => seenIds.has(b.id))
    .sort((a, b) => {
      const si = sites.findIndex((s) => s.id === a.siteId) - sites.findIndex((s) => s.id === b.siteId);
      return si !== 0 ? si : a.name.localeCompare(b.name, "ko");
    });

  const avail = { updatedAt: new Date().toISOString(), range, boats, byDate, errors };
  await withLock("avail.json", () => writeJson("avail.json", avail));
  return { ok: true, updatedAt: avail.updatedAt, boats: boats.length, days: collected, summary, errors };
}

// CLI: npm run scrape
if (import.meta.url === `file://${process.argv[1]}`) {
  refreshAll()
    .then((r) => {
      console.log(JSON.stringify(r.summary, null, 2));
      if (r.errors?.length) console.log("errors:", r.errors);
      console.log(r.ok ? `완료: 배 ${r.boats} · ${r.days}일 · ${r.updatedAt}` : r.message);
    })
    .catch((e) => {
      console.error(e);
      process.exit(1);
    });
}
