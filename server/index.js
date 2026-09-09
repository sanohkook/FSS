import express from "express";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import {
  getSites,
  saveSites,
  getAvail,
  getMyplan,
  saveMyplan,
  withLock,
} from "./store.js";
import { loadTide, tideRow, daysInMonth, clearTideCache } from "./tide.js";
import { refreshAll } from "./scrape/index.js";
import { detectKind, normalizeSiteUrl } from "./scrape/detect.js";
import { buildRecipe } from "./scrape/ai.js";
import { refreshTide } from "./refreshTide.js";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const PORT = process.env.PORT || 3300;
const app = express();
app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));

function isoToday() {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, "0")}-${String(n.getDate()).padStart(2, "0")}`;
}
function slugId(name) {
  return (
    "s" +
    Math.random().toString(36).slice(2, 8) +
    (name || "").replace(/[^a-z0-9]/gi, "").slice(0, 6).toLowerCase()
  );
}

app.get("/api/board", async (req, res) => {
  const today = isoToday();
  const month = /^\d{4}-\d{2}$/.test(req.query.month || "") ? req.query.month : today.slice(0, 7);
  const [tide, avail, sites, myplan] = await Promise.all([
    loadTide(),
    getAvail(),
    getSites(),
    getMyplan(),
  ]);

  const enabledSites = sites.filter((s) => s.enabled !== false);
  const enabledIds = new Set(enabledSites.map((s) => s.id));
  const siteById = Object.fromEntries(sites.map((s) => [s.id, s]));
  const scraped = (avail.boats || []).filter((b) => enabledIds.has(b.siteId));

  // 파싱 규칙이 없는(generic) 사이트는 배가 없으므로 링크 전용 열 1개를 만든다 → 셀은 "X"
  const linkOnly = enabledSites
    .filter((s) => s.kind === "generic" && !scraped.some((b) => b.siteId === s.id))
    .map((s) => ({ id: `${s.id}:_link`, siteId: s.id, name: s.name, fish: "", generic: true }));
  const boats = [...scraped, ...linkOnly];

  const linkUrl = (s, iso) =>
    (s.dayUrl || s.listUrl || "")
      .replace(/\{y\}|\{yyyy\}/g, iso.slice(0, 4))
      .replace(/\{m\}|\{mm\}/g, iso.slice(5, 7))
      .replace(/\{d\}|\{dd\}/g, iso.slice(8, 10)) || "#";

  const n = daysInMonth(month);
  const startDay = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : 1;
  const rows = [];
  for (let d = startDay; d <= n; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const t = tideRow(tide, iso);
    const cells = {};
    const dayAvail = avail.byDate?.[iso] || {};
    for (const b of scraped) {
      const c = dayAvail[b.id];
      if (c) cells[b.id] = c;
    }
    for (const b of linkOnly) cells[b.id] = { status: "link", url: linkUrl(siteById[b.siteId], iso) };
    rows.push({ ...t, isToday: iso === today, cells });
  }

  res.json({
    month,
    today,
    updatedAt: avail.updatedAt,
    tideSource: "국립해양조사원 인천 조석예보",
    sites,
    boats: boats.map((b) => ({
      id: b.id,
      siteId: b.siteId,
      site: (siteById[b.siteId] || {}).name || b.siteId,
      kind: (siteById[b.siteId] || {}).kind || "generic",
      name: b.name,
      fish: b.fish || "",
      generic: !!b.generic,
    })),
    rows,
    myplan,
  });
});

app.get("/api/sites", async (_req, res) => res.json(await getSites()));

app.post("/api/sites", async (req, res) => {
  const { name, url } = req.body || {};
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ error: "url 필요" });
  let kind = await detectKind(url);
  const { listUrl, dayUrl } = normalizeSiteUrl(url, kind);

  // 알려진 플랫폼(xe·sunsang)이 아니면 AI로 파싱 레시피 1회 생성 (토큰 사용)
  let recipe = null;
  let aiNote = null;
  if (kind === "generic") {
    const now = new Date();
    const probe = listUrl
      .replace(/\{y\}|\{yyyy\}/g, now.getFullYear())
      .replace(/\{m\}|\{mm\}/g, String(now.getMonth() + 1).padStart(2, "0"));
    try {
      const r = await buildRecipe(probe);
      if (r.recipe) {
        kind = "recipe";
        recipe = r.recipe;
        aiNote = `AI 분석 성공 (배 ${r.sample.boats} · ${r.sample.days}일 인식)`;
      } else {
        aiNote = r.reason === "no_key"
          ? "ANTHROPIC_API_KEY 미설정 — 링크 전용(X)으로 추가"
          : "AI가 파싱 규칙을 못 찾음 — 링크 전용(X)으로 추가";
      }
    } catch (e) {
      aiNote = `AI 분석 실패: ${e.message} — 링크 전용(X)`;
    }
  }

  const site = {
    id: slugId(name),
    name: name || new URL(url).hostname.replace(/^www\./, ""),
    kind,
    listUrl,
    dayUrl,
    enabled: true,
  };
  if (recipe) site.recipe = recipe;
  const next = await withLock("sites.json", async () => {
    const sites = await getSites();
    sites.push(site);
    await saveSites(sites);
    return sites;
  });
  if (kind !== "generic") refreshAll().catch((e) => console.error("post-add scrape:", e.message));
  res.json({ site: { ...site, recipe: undefined }, sites: next, kind, aiNote });
});

app.put("/api/sites/:id", async (req, res) => {
  const { name, enabled, listUrl, dayUrl } = req.body || {};
  const next = await withLock("sites.json", async () => {
    const sites = await getSites();
    const s = sites.find((x) => x.id === req.params.id);
    if (!s) return null;
    if (name != null) s.name = name;
    if (enabled != null) s.enabled = !!enabled;
    if (listUrl != null) s.listUrl = listUrl;
    if (dayUrl != null) s.dayUrl = dayUrl;
    await saveSites(sites);
    return sites;
  });
  if (!next) return res.status(404).json({ error: "없는 사이트" });
  res.json({ sites: next });
});

app.delete("/api/sites/:id", async (req, res) => {
  const next = await withLock("sites.json", async () => {
    const sites = (await getSites()).filter((x) => x.id !== req.params.id);
    await saveSites(sites);
    return sites;
  });
  res.json({ sites: next });
});

app.post("/api/refresh", async (_req, res) => {
  try {
    const r = await refreshAll();
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post("/api/tide/refresh", async (_req, res) => {
  try {
    const r = await refreshTide();
    clearTideCache();
    res.json(r);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.get("/api/myplan", async (_req, res) => res.json(await getMyplan()));

// 전체 교체 (내보내기/가져오기용)
app.put("/api/myplan", async (req, res) => {
  const { list } = req.body || {};
  if (!Array.isArray(list)) return res.status(400).json({ error: "list 배열 필요" });
  const clean = list
    .filter((x) => x && x.date && x.boatId)
    .map((x) => ({
      date: String(x.date),
      boatId: String(x.boatId),
      note: x.note || "",
      addedAt: x.addedAt || new Date().toISOString(),
    }));
  const saved = await withLock("myplan.json", async () => {
    await saveMyplan(clean);
    return clean;
  });
  res.json(saved);
});

app.post("/api/myplan", async (req, res) => {
  const { date, boatId, note } = req.body || {};
  if (!date || !boatId) return res.status(400).json({ error: "date, boatId 필요" });
  const list = await withLock("myplan.json", async () => {
    const cur = await getMyplan();
    const i = cur.findIndex((x) => x.date === date && x.boatId === boatId);
    if (i >= 0) cur.splice(i, 1);
    else cur.push({ date, boatId, note: note || "", addedAt: new Date().toISOString() });
    await saveMyplan(cur);
    return cur;
  });
  res.json(list);
});

app.delete("/api/myplan/:date/:boatId", async (req, res) => {
  const list = await withLock("myplan.json", async () => {
    const cur = (await getMyplan()).filter(
      (x) => !(x.date === req.params.date && x.boatId === decodeURIComponent(req.params.boatId))
    );
    await saveMyplan(cur);
    return cur;
  });
  res.json(list);
});

// FSS_SYNC=1 npm start  → 1시간마다 스크레이프 + git 'avail' 브랜치 push (앱 동기화용)
if (process.env.FSS_SYNC === "1") {
  const { startSyncLoop } = await import("./syncLoop.js");
  startSyncLoop(1);
}

app.listen(PORT, () => {
  console.log(`예약현황 → http://localhost:${PORT}`);
  if (process.env.FSS_SYNC === "1") console.log("  git 동기화: 1시간마다 'avail' 브랜치 갱신");
  // 같은 와이파이의 폰(안드로이드 앱)에서 접속할 주소
  try {
    const nets = os.networkInterfaces();
    for (const list of Object.values(nets)) {
      for (const ni of list || []) {
        if (ni.family === "IPv4" && !ni.internal) console.log(`  폰에서:  http://${ni.address}:${PORT}`);
      }
    }
  } catch {
    /* ignore */
  }
});
