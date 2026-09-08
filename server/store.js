// data/*.json 원자적 read/write (temp 파일 → rename).
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const DATA_DIR = path.join(ROOT, "data");

export function dataPath(name) {
  return path.join(DATA_DIR, name);
}

export async function readJson(name, fallback) {
  try {
    const raw = await fs.readFile(dataPath(name), "utf8");
    return JSON.parse(raw);
  } catch (e) {
    if (e.code === "ENOENT") return fallback;
    throw e;
  }
}

export async function writeJson(name, value) {
  await fs.mkdir(DATA_DIR, { recursive: true });
  const target = dataPath(name);
  const tmp = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(tmp, JSON.stringify(value, null, 2));
  await fs.rename(tmp, target);
}

// 파일별 직렬화 큐 — 동시 write 로 인한 손상 방지
const queues = new Map();
export function withLock(name, fn) {
  const prev = queues.get(name) || Promise.resolve();
  const next = prev.then(fn, fn);
  queues.set(name, next.catch(() => {}));
  return next;
}

const DEFAULT_SITES = [
  {
    id: "khan",
    name: "칸피싱",
    kind: "xe",
    listUrl: "https://khanfishing.com/index.php?mid=bk&year={y}&month={m}&mode=list",
    dayUrl: "https://khanfishing.com/index.php?mid=bk&year={y}&month={m}&day={d}&mode=list",
    enabled: true,
  },
  {
    id: "dy",
    name: "동양낚시",
    kind: "sunsang",
    listUrl: "https://dyfishing.sunsang24.com/ship/schedule_fleet/{y}{m}",
    dayUrl: "https://dyfishing.sunsang24.com/ship/schedule_fleet/{y}{m}",
    enabled: true,
  },
  {
    id: "jeil",
    name: "제일낚시",
    kind: "xe",
    listUrl: "https://jnaksi.com/index.php?mid=bk&year={y}&month={m}&mode=list",
    dayUrl: "https://jnaksi.com/index.php?mid=bk&year={y}&month={m}&day={d}&mode=list",
    enabled: true,
  },
];

export async function getSites() {
  const sites = await readJson("sites.json", null);
  if (!Array.isArray(sites) || !sites.length) {
    await writeJson("sites.json", DEFAULT_SITES);
    return structuredClone(DEFAULT_SITES);
  }
  return sites;
}

export async function saveSites(sites) {
  await writeJson("sites.json", sites);
}

export async function getAvail() {
  return readJson("avail.json", { updatedAt: null, boats: [], byDate: {}, errors: [] });
}

export async function getMyplan() {
  return readJson("myplan.json", []);
}

export async function saveMyplan(list) {
  await writeJson("myplan.json", list);
}

export { DEFAULT_SITES };
