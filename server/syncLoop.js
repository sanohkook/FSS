// 예약현황을 스크레이핑해 git 'avail' 브랜치로 올린다 (앱이 로딩 시 받아가는 소스).
//   node server/syncLoop.js            1회 실행
//   node server/syncLoop.js --watch    1시간마다 반복
//   npm start 에서도 FSS_SYNC=1 이면 startSyncLoop() 로 함께 돈다.
import { exec } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { refreshAll } from "./scrape/index.js";

const sh = promisify(exec);
const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** 스크레이프 → data/avail.json → 'avail' 브랜치에 커밋 1개 force-push */
export async function syncOnce() {
  const r = await refreshAll();
  if (!r.ok) throw new Error(r.message || "scrape 실패");
  // working tree / main 을 건드리지 않고 avail.json 하나만 담은 커밋을 만든다.
  // git push 가 자격증명 없이 멈추는 경우를 대비해 타임아웃.
  await sh(
    'b=$(git hash-object -w data/avail.json); ' +
      "t=$(printf '100644 blob %s\\tavail.json\\n' \"$b\" | git mktree); " +
      'c=$(git commit-tree "$t" -m "avail $(date -u +%Y-%m-%dT%H:%M:%SZ)"); ' +
      'GIT_TERMINAL_PROMPT=0 git push -f origin "$c:refs/heads/avail"',
    { cwd: REPO, timeout: 60_000, env: { ...process.env, GIT_TERMINAL_PROMPT: "0" } }
  );
  return r;
}

export function startSyncLoop(hours = 1) {
  const run = () =>
    syncOnce().then(
      (r) => console.log(`[sync] avail → ${r.updatedAt} (배 ${r.boats} · ${r.days}일)`),
      (e) => console.warn(`[sync] 실패: ${e.message}`)
    );
  run();
  const t = setInterval(run, hours * 3600_000);
  t.unref?.();
  return t;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const watch = process.argv.includes("--watch");
  if (watch) {
    console.log("[sync] 1시간마다 갱신 시작");
    startSyncLoop(1);
  } else {
    syncOnce()
      .then((r) => console.log(`완료: avail → ${r.updatedAt} (배 ${r.boats} · ${r.days}일)`))
      .catch((e) => {
        console.error("실패:", e.message);
        process.exit(1);
      });
  }
}
