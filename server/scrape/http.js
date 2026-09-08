// 간단한 GET 헬퍼. 한국 낚시 사이트 인증서 체인이 불완전(Missing Authority Key
// Identifier)해 표준 검증이 실패하므로, 공개 읽기 전용 페이지에 한해 검증 없이 가져온다.
import http from "node:http";
import https from "node:https";
import zlib from "node:zlib";
import { URL } from "node:url";

const UA = "Mozilla/5.0 (compatible; FSS-tide-board/1.0; +https://github.com/bit4man/FSS)";
const insecureAgent = new https.Agent({ rejectUnauthorized: false, keepAlive: true });

function decode(buf, headers) {
  const ct = String(headers["content-type"] || "").toLowerCase();
  let charset = (ct.match(/charset=([\w-]+)/) || [])[1];
  if (!charset) {
    const head = buf.slice(0, 2048).toString("latin1").toLowerCase();
    if (/euc-kr|ks_c_5601|cp949/.test(head)) charset = "euc-kr";
  }
  try {
    return new TextDecoder(charset || "utf-8").decode(buf);
  } catch {
    return buf.toString("utf-8");
  }
}

export function httpGet(url, { timeout = 25000, headers = {}, method = "GET", body = null, redirects = 5 } = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const mod = u.protocol === "http:" ? http : https;
    const req = mod.request(
      u,
      {
        method,
        agent: u.protocol === "https:" ? insecureAgent : undefined,
        headers: {
          "user-agent": UA,
          "accept-language": "ko,en;q=0.8",
          "accept-encoding": "gzip, deflate",
          ...headers,
        },
      },
      (res) => {
        const loc = res.headers.location;
        if (loc && res.statusCode >= 300 && res.statusCode < 400 && redirects > 0) {
          res.resume();
          resolve(httpGet(new URL(loc, u).toString(), { timeout, headers, redirects: redirects - 1 }));
          return;
        }
        const chunks = [];
        let pipe = res;
        const enc = res.headers["content-encoding"];
        if (enc === "gzip") pipe = res.pipe(zlib.createGunzip());
        else if (enc === "deflate") pipe = res.pipe(zlib.createInflate());
        pipe.on("data", (c) => chunks.push(c));
        pipe.on("end", () => {
          const buf = Buffer.concat(chunks);
          resolve({ status: res.statusCode, headers: res.headers, text: decode(buf, res.headers) });
        });
        pipe.on("error", reject);
      }
    );
    req.setTimeout(timeout, () => req.destroy(new Error(`timeout ${url}`)));
    req.on("error", reject);
    if (body) req.write(body);
    req.end();
  });
}

// HTML 엔티티 최소 복원 (XE more.php 의 이스케이프된 htmlCode 용)
export function unescapeHtml(s) {
  return String(s)
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&");
}

export function stripTags(s) {
  return String(s)
    .replace(/<br\s*\/?>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

// 낚시 대상 어종 사전 (별칭 → 표준명). 공지사항·낚시종류 텍스트에서 찾는다.
const FISH = [
  ["주꾸미", /주꾸미|쭈꾸미|쭈갑/],
  ["갑오징어", /갑오징어|갑오징|무늬오징어/],
  ["한치", /한치/],
  ["오징어", /물오징어|(?<![갑한늬])오징어/],
  ["광어", /광어|넙치/],
  ["우럭", /우럭|조피볼락/],
  ["참돔", /참돔/],
  ["돌돔", /돌돔/],
  ["감성돔", /감성돔/],
  ["농어", /농어/],
  ["삼치", /삼치/],
  ["부시리", /부시리/],
  ["방어", /방어/],
  ["대구", /대구/],
  ["열기", /열기|불볼락/],
  ["가자미", /가자미|도다리/],
  ["학꽁치", /학꽁치|꽁치/],
  ["문어", /문어/],
  ["볼락", /볼락/],
  ["쥐노래미", /쥐노래미|노래미/],
  ["망상어", /망상어/],
  ["숭어", /숭어/],
];

// 텍스트에서 대상 어종 추출 (여러 개면 "·" 로). fallbackNongo=낚시종류 필드값
export function detectFish(text, hint) {
  const src = `${hint || ""} ${stripTags(text || "")}`;
  const found = [];
  for (const [name, re] of FISH) {
    if (re.test(src) && found.indexOf(name) < 0) found.push(name);
    if (found.length >= 3) break;
  }
  return found.join("·");
}
