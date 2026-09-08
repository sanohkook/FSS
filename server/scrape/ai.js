// 사이트 추가 시 1회만 AI(Claude)로 파싱 레시피를 만든다.
// 이후 조회는 server/scrape/recipe.js 가 토큰 없이 처리.
//
// 필요: ANTHROPIC_API_KEY 환경변수 (없으면 레시피 생성 건너뛰고 generic 처리).
import Anthropic from "@anthropic-ai/sdk";
import { httpGet } from "./http.js";
import { applyRecipe } from "./recipe.js";

const MODEL = process.env.ANTHROPIC_MODEL || "claude-opus-5";

function trimHtml(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<head\b[^>]*>[\s\S]*?<\/head>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/[ \t]+/g, " ")
    .slice(0, 60000);
}

const SCHEMA_DOC = `레시피 JSON 스키마:
{
  "dateSection": { "regex": "<JS 정규식 소스>", "dateGroup": <int>, "dateStyle": "ymd8" | "iso" },
  "boatUnit":    { "regex": "<JS 정규식 소스>", "nameGroup": <int> },
  "statusScope": "match" | "group",
  "statusGroup": <int>,
  "fullWords":   ["예약완료","예약마감","마감"],
  "closedWords": ["휴항","정비","미운항"],
  "remainRegex": "<JS 정규식 소스, 그룹1 = 남은자리 숫자>",
  "bookingUrl":  "<예약 URL 템플릿, {ymd}=YYYYMMDD, {iso}=YYYY-MM-DD 치환>"
}
- dateSection.regex: 페이지를 날짜별 구간으로 나누는 앵커. 전역(g)로 여러 번 매치되며 dateGroup 이 날짜(8자리 또는 YYYY-MM-DD).
- boatUnit.regex: 한 날짜 구간 안에서 배 1척 = 1매치. nameGroup 이 배 이름.
- 상태 텍스트: statusScope="match" 면 전체 매치, "group" 이면 statusGroup 번째 그룹.
- 그 텍스트에 fullWords 가 있으면 마감, remainRegex 가 맞으면 남은자리 N.
예시(XpressEngine 계열):
{"dateSection":{"regex":"<a\\\\s+name=\\"(\\\\d{8})\\"","dateGroup":1,"dateStyle":"ymd8"},
 "boatUnit":{"regex":"<span[^>]*font-weight:bold[^>]*>([^<]+)</span>[\\\\s\\\\S]*?<div id=\\"admin-right-\\\\d{8}-(\\\\d+)-0\\">([\\\\s\\\\S]*?)</div>","nameGroup":1},
 "statusScope":"group","statusGroup":3,
 "fullWords":["예약완료","예약마감"],"closedWords":["배정비"],
 "remainRegex":"남은자리\\\\s*(\\\\d+)","bookingUrl":""}`;

async function generate(client, html, url, feedback) {
  const msg = await client.messages.create({
    model: MODEL,
    max_tokens: 4000,
    system:
      "너는 한국 낚시배 예약 달력 페이지의 HTML을 보고, 날짜별·배별 예약 현황(마감 / 남은자리 N)을 " +
      "코드로 추출할 정규식 레시피(JSON)를 만든다. 반드시 JSON 하나만 출력한다. 코드블록·설명 금지.",
    messages: [
      {
        role: "user",
        content:
          `${SCHEMA_DOC}\n\n` +
          (feedback ? `이전 시도 결과가 부족했다: ${feedback}\n다시 시도.\n\n` : "") +
          `대상 URL: ${url}\n--- HTML (일부) ---\n${html}`,
      },
    ],
  });
  const text = msg.content.filter((b) => b.type === "text").map((b) => b.text).join("");
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) throw new Error("AI 응답에서 JSON 을 찾지 못함");
  return JSON.parse(m[0]);
}

// url(월 목록 페이지) → recipe | null
export async function buildRecipe(url, { attempts = 2 } = {}) {
  if (!process.env.ANTHROPIC_API_KEY) return { recipe: null, reason: "no_key" };
  let client;
  try {
    client = new Anthropic();
  } catch {
    return { recipe: null, reason: "no_key" };
  }
  const res = await httpGet(url);
  const html = trimHtml(res.text);

  let feedback = "";
  for (let i = 0; i < attempts; i++) {
    let recipe;
    try {
      recipe = await generate(client, html, url, feedback);
    } catch (e) {
      feedback = e.message;
      continue;
    }
    const out = applyRecipe(res.text, recipe, {});
    const boatN = out.boats.size;
    const dayN = Object.keys(out.byDate).length;
    if (boatN >= 1 && dayN >= 2) {
      return { recipe, sample: { boats: boatN, days: dayN } };
    }
    feedback = `배 ${boatN}척, 날짜 ${dayN}일만 인식됨. 정규식을 더 정확히.`;
  }
  return { recipe: null, reason: "validate_failed" };
}
