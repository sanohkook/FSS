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
