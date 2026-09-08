import express from "express";
import path from "node:path";
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

  const enabledIds = new Set(sites.filter((s) => s.enabled !== false).map((s) => s.id));
  const boats = (avail.boats || []).filter((b) => enabledIds.has(b.siteId));
  const siteName = Object.fromEntries(sites.map((s) => [s.id, s.name]));

  const n = daysInMonth(month);
  const startDay = month === today.slice(0, 7) ? Number(today.slice(8, 10)) : 1;
  const rows = [];
  for (let d = startDay; d <= n; d++) {
    const iso = `${month}-${String(d).padStart(2, "0")}`;
    const t = tideRow(tide, iso);
    const cells = {};
    const dayAvail = avail.byDate?.[iso] || {};
    for (const b of boats) {
      const c = dayAvail[b.id];
      if (c) cells[b.id] = c;
    }
    rows.push({ ...t, isToday: iso === today, cells });
  }

  res.json({
    month,
    today,
    updatedAt: avail.updatedAt,
    tideSource: "바다타임 인천(158)",
    sites,
    boats: boats.map((b) => ({ id: b.id, siteId: b.siteId, site: siteName[b.siteId] || b.siteId, name: b.name, fish: b.fish || "" })),
    rows,
    myplan,
  });
});

app.get("/api/sites", async (_req, res) => res.json(await getSites()));

app.post("/api/sites", async (req, res) => {
  const { name, url } = req.body || {};
  if (!url || !/^https?:\/\//.test(url)) return res.status(400).json({ error: "url 필요" });
  const kind = await detectKind(url);
  const { listUrl, dayUrl } = normalizeSiteUrl(url, kind);
  const site = {
    id: slugId(name),
    name: name || new URL(url).hostname.replace(/^www\./, ""),
    kind,
    listUrl,
    dayUrl,
    enabled: true,
  };
  const next = await withLock("sites.json", async () => {
    const sites = await getSites();
    sites.push(site);
    await saveSites(sites);
    return sites;
  });
  refreshAll().catch((e) => console.error("post-add scrape:", e.message));
  res.json({ site, sites: next, kind });
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

app.listen(PORT, () => {
  console.log(`인천 물때 예약판 → http://localhost:${PORT}`);
});
