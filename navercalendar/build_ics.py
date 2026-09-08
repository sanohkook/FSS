#!/usr/bin/env python3
"""
badatime -> iCalendar (.ics)

바다타임(https://www.badatime.com) 지역별 '날짜별 물때' 페이지를 긁어
네이버 캘린더 등에서 구독 가능한 .ics 파일을 만든다.

- 하루에 '종일 일정' 1개
- 제목:  "4물 69%"  (물때 + 물흐름%)
- 설명:  만조/간조 시각·조위, 일출몰, 월출몰 (참고용, 캘린더 목록에는 안 보임)
"""

import os
import re
import ssl
import sys
import html
import datetime as dt
import urllib.request

# 지역 코드 / 이름 (badatime.com/{코드}/daily). 환경변수로 덮어쓰기 가능.
LOC = os.environ.get("BADATIME_LOC", "158")          # 158 = 인천
LOC_NAME = os.environ.get("BADATIME_NAME", "인천")
BASE = "https://www.badatime.com"
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36"

# daily/N 페이지는 (N-30일 ~ N일) 30일 구간을 보여준다.
# 오늘 ~ +90일을 덮으려면 30, 60, 90 세 페이지를 합친다.
OFFSETS = [30, 60, 90]


def _ctx():
    try:
        import certifi
        return ssl.create_default_context(cafile=certifi.where())
    except Exception:
        return ssl.create_default_context()


def fetch(url: str) -> str:
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    try:
        with urllib.request.urlopen(req, timeout=30, context=_ctx()) as r:
            return r.read().decode("utf-8", "replace")
    except urllib.error.URLError as e:
        if not isinstance(e.reason, ssl.SSLError):
            raise
        print(f"warn: SSL 검증 실패, 미검증 재시도: {url}", file=sys.stderr)
        with urllib.request.urlopen(
            req, timeout=30, context=ssl._create_unverified_context()
        ) as r:
            return r.read().decode("utf-8", "replace")


ROW_RE = re.compile(r'<tr[^>]*class="day-row"[^>]*>(.*?)</tr>', re.S)
GRAPH_RE = re.compile(r'/%s/graph/(\d{4})-(\d{1,2})-(\d{1,2})' % LOC)
TIDE_RE = re.compile(r'<b>\s*(\d+)\s*물\s*</b>')
MUL_LABEL_RE = re.compile(r'<b>\s*(막물|아치조금|조금|무시|한물)\s*</b>')
FLOW_RE = re.compile(r'data-value="(\d+)"')
# "<b>03:14 (784) </b><span><font>▲+639</font>"  /  "(&nbsp;92) ... ▼-692"
LEVEL_RE = re.compile(
    r'(\d{1,2}:\d{2})\s*\(\s*(?:&nbsp;|\s)*(-?\d+)\s*\)'
    r'(?:\s*<[^>]+>)*?\s*([▲▼])\s*([+-]?\d+)',
    re.S,
)
CELL_RE = re.compile(r'<td class="(manjo|ganjo|s_rs|m_rs)"[^>]*>(.*?)</td>', re.S)


def strip_tags(s: str) -> str:
    return html.unescape(re.sub(r"<[^>]+>", " ", s)).replace("\xa0", " ")


def parse_page(page: str, days: dict):
    for m in ROW_RE.finditer(page):
        row = m.group(1)

        g = GRAPH_RE.search(row)
        if not g:
            continue
        y, mo, d = map(int, g.groups())
        date = dt.date(y, mo, d)

        tide = TIDE_RE.search(row)
        if tide:
            tide_txt = f"{tide.group(1)}물"
        else:
            lbl = MUL_LABEL_RE.search(row)
            tide_txt = lbl.group(1) if lbl else "?"

        flow = FLOW_RE.search(row)
        flow_txt = f"{flow.group(1)}%" if flow else None

        cells = {k: v for k, v in CELL_RE.findall(row)}

        def levels(key, arrow):
            out = []
            for lm in LEVEL_RE.finditer(cells.get(key, "")):
                t, lvl, ar, delta = lm.groups()
                out.append(f"{t} {lvl}cm ({ar}{delta})")
            return out

        highs = levels("manjo", "▲")
        lows = levels("ganjo", "▼")
        s_rs = strip_tags(cells.get("s_rs", "")).split()
        m_rs = strip_tags(cells.get("m_rs", "")).split()

        title = tide_txt + (f" {flow_txt}" if flow_txt else "")
        desc_lines = []
        if highs:
            desc_lines.append("만조 " + " · ".join(highs))
        if lows:
            desc_lines.append("간조 " + " · ".join(lows))
        if len(s_rs) >= 2:
            desc_lines.append(f"일출 {s_rs[0]} / 일몰 {s_rs[1]}")
        if len(m_rs) >= 2:
            desc_lines.append(f"월출 {m_rs[0]} / 월몰 {m_rs[1]}")

        days[date] = {
            "title": title,
            "desc": "\n".join(desc_lines),
        }


def ics_escape(s: str) -> str:
    return (
        s.replace("\\", "\\\\")
        .replace(";", "\\;")
        .replace(",", "\\,")
        .replace("\n", "\\n")
    )


def fold(line: str) -> str:
    """RFC5545 75-octet line folding (UTF-8 안전)."""
    b = line.encode("utf-8")
    if len(b) <= 75:
        return line
    out, cur = [], b""
    for ch in line:
        e = ch.encode("utf-8")
        if len(cur) + len(e) > 74:
            out.append(cur)
            cur = b" " + e
        else:
            cur += e
    out.append(cur)
    return "\r\n".join(x.decode("utf-8") for x in out)


def build_ics(days: dict) -> str:
    now = dt.datetime.now(dt.timezone.utc).strftime("%Y%m%dT%H%M%SZ")
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//badatime-ics//KR//",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{LOC_NAME} 물때표",
        "X-WR-TIMEZONE:Asia/Seoul",
        f"X-WR-CALDESC:바다타임 {LOC_NAME} 물때·물흐름 (자동 생성)",
        "REFRESH-INTERVAL;VALUE=DURATION:P1D",
        "X-PUBLISHED-TTL:P1D",
    ]
    for date in sorted(days):
        info = days[date]
        ymd = date.strftime("%Y%m%d")
        nxt = (date + dt.timedelta(days=1)).strftime("%Y%m%d")
        lines += [
            "BEGIN:VEVENT",
            f"UID:badatime-{LOC}-{ymd}@badatime-ics",
            f"DTSTAMP:{now}",
            f"DTSTART;VALUE=DATE:{ymd}",
            f"DTEND;VALUE=DATE:{nxt}",
            f"SUMMARY:{ics_escape(info['title'])}",
            f"DESCRIPTION:{ics_escape(info['desc'])}",
            "TRANSP:TRANSPARENT",
            "END:VEVENT",
        ]
    lines.append("END:VCALENDAR")
    # RFC5545: 75옥텟 폴딩 + CRLF 줄바꿈
    return "\r\n".join(fold(x) for x in lines) + "\r\n"


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else "badatime-158.ics"
    days: dict = {}
    for off in OFFSETS:
        url = f"{BASE}/{LOC}/daily/{off}"
        try:
            parse_page(fetch(url), days)
        except Exception as e:  # noqa
            print(f"warn: {url} -> {e}", file=sys.stderr)
    if not days:
        print("error: no data parsed", file=sys.stderr)
        sys.exit(1)
    with open(out, "w", encoding="utf-8", newline="") as f:
        f.write(build_ics(days))
    print(f"{out}: {len(days)} days ({min(days)} ~ {max(days)})")


if __name__ == "__main__":
    main()
