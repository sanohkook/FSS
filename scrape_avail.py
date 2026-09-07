#!/usr/bin/env python3
"""
인천 낚시배 예약현황 스크레이퍼.
칸피싱 / 동양낚시 / 제일낚시 3개 사이트에서 향후 약 3개월치 날짜별 예약 가능 여부를
읽어 avail.js (window.AVAIL / window.AVAIL_UPDATED) 로 저장한다.

- 클라우드 루틴이 주기적으로 실행 → 변경 시 커밋/푸시
- 아티팩트(인천 물때 예약판)가 jsDelivr 로 avail.js 를 불러 표시

파싱 규칙
  칸피싱·제일낚시(XpressEngine): 날짜 섹션(<a name="YYYYMMDD">) 안 각 배의
      <div id="admin-right-*"><img alt="..."> 에서
        alt="예약완료"        -> 그 배 마감
        alt="남은자리 N명"     -> 그 배 N석
        alt="배정비일"         -> 운항 안 함(제외)
  동양낚시(sunsang24): data-sdate="YYYY-MM-DD" 블록 안
        <span class="shipping_status" data-status_code="END"> -> 그 배 마감
        "남은자리 N명" 텍스트 -> 그 배 N석

  날짜 상태: 남은 좌석 최대값 >= 4 -> open / 1~3 -> few / 없음 -> full
"""

import json
import re
import ssl
import sys
import urllib.request
from datetime import date, datetime, timezone

# 일부 한국 낚시배 사이트의 인증서 체인이 불완전(Missing Authority Key Identifier)해
# 표준 검증이 실패한다. 공개된 읽기 전용 예약 현황 페이지이므로 검증 없이 가져온다.
_SSL = ssl.create_default_context()
_SSL.check_hostname = False
_SSL.verify_mode = ssl.CERT_NONE

UA = "Mozilla/5.0 (compatible; FSS-tide-board/1.0; +https://github.com/sanohkook/FSS)"
TIMEOUT = 25
OPEN_MIN = 4  # 이 이상이면 '여유', 1~3이면 '여석'

SITES = [
    {"id": "khan", "kind": "xe", "base": "https://khanfishing.com/index.php?mid=bk&mode=list"},
    {"id": "jeil", "kind": "xe", "base": "https://jnaksi.com/index.php?mid=bk&mode=list"},
    {"id": "dy",   "kind": "sunsang", "base": "https://dyfishing.sunsang24.com/ship/schedule_fleet"},
]


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=TIMEOUT, context=_SSL) as r:
        raw = r.read()
    for enc in ("utf-8", "euc-kr", "cp949"):
        try:
            return raw.decode(enc)
        except UnicodeDecodeError:
            continue
    return raw.decode("utf-8", "replace")


def target_months(n=3):
    t = date.today()
    out = []
    y, m = t.year, t.month
    for _ in range(n):
        out.append((y, m))
        m += 1
        if m > 12:
            m = 1
            y += 1
    return out


def seats_to_status(seats):
    """seats: list of ints (남은 좌석). 배 없으면 None."""
    if not seats:
        return None
    mx = max(seats)
    if mx >= OPEN_MIN:
        return {"s": "open", "n": "%d석" % mx}
    if mx >= 1:
        return {"s": "few", "n": "%d석" % mx}
    return {"s": "full"}


def parse_xe(html, y, m):
    """XpressEngine 예약현황(칸피싱·제일낚시). {iso: {s,n}} 반환."""
    out = {}
    # 날짜 섹션: <a name="YYYYMMDD"></a> ... 다음 <a name= 전까지
    anchors = list(re.finditer(r'<a\s+name="(\d{8})"\s*>', html))
    for i, a in enumerate(anchors):
        ymd = a.group(1)
        if ymd[:4] != "%04d" % y or ymd[4:6] != "%02d" % m:
            continue
        seg = html[a.end(): anchors[i + 1].start() if i + 1 < len(anchors) else len(html)]
        seats = []
        for cell in re.findall(r'<div id="admin-right-[^"]*">(.*?)</div>', seg, re.S):
            alts = re.findall(r'alt="([^"]*)"', cell)
            if not alts:
                continue
            alt = alts[0]
            if "예약완료" in alt:
                seats.append(0)
            elif "배정비" in alt or "정비일" in alt:
                continue  # 운항 안 함
            else:
                mm = re.search(r'남은자리\s*(\d+)', alt)
                if mm:
                    seats.append(int(mm.group(1)))
        st = seats_to_status(seats)
        if st:
            out["%04d-%02d-%02d" % (y, m, int(ymd[6:8]))] = st
    return out


def parse_sunsang(html, y, m):
    """sunsang24 schedule_fleet(동양낚시). {iso: {s,n}} 반환."""
    out = {}
    marks = list(re.finditer(r'data-sdate="(\d{4}-\d{2}-\d{2})"', html))
    # 같은 날짜가 여러 번 등장할 수 있어 날짜별로 구간을 합친다
    by_date = {}
    for i, mk in enumerate(marks):
        iso = mk.group(1)
        if not iso.startswith("%04d-%02d" % (y, m)):
            continue
        end = marks[i + 1].start() if i + 1 < len(marks) else len(html)
        by_date.setdefault(iso, []).append(html[mk.end():end])
    for iso, segs in by_date.items():
        seg = " ".join(segs)
        seats = []
        # 배 단위로 쪼개기 어려우므로: '예약마감' 개수와 '남은자리 N명' 을 모은다
        for mm in re.finditer(r'남은자리\s*(\d+)\s*명', seg):
            seats.append(int(mm.group(1)))
        ends = len(re.findall(r'data-status_code="END"', seg))
        if not seats and ends:
            out[iso] = {"s": "full"}
        else:
            st = seats_to_status(seats)
            if st:
                out[iso] = st
    return out


def build_url(site, y, m):
    if site["kind"] == "sunsang":
        return "%s/%04d%02d" % (site["base"], y, m)
    return "%s&year=%04d&month=%02d" % (site["base"], y, m)


def main():
    result = {}
    errors = []
    for site in SITES:
        acc = {}
        for (y, m) in target_months(3):
            url = build_url(site, y, m)
            try:
                html = fetch(url)
            except Exception as e:  # noqa: BLE001
                errors.append("%s %04d-%02d: %s" % (site["id"], y, m, e))
                continue
            try:
                part = parse_xe(html, y, m) if site["kind"] == "xe" else parse_sunsang(html, y, m)
            except Exception as e:  # noqa: BLE001
                errors.append("%s %04d-%02d parse: %s" % (site["id"], y, m, e))
                continue
            acc.update(part)
        result[site["id"]] = acc
        print("%-6s %3d일" % (site["id"], len(acc)), file=sys.stderr)

    for e in errors:
        print("WARN", e, file=sys.stderr)

    total = sum(len(v) for v in result.values())
    if total == 0:
        print("ERROR: 수집된 데이터 0건 — avail.js 를 갱신하지 않음", file=sys.stderr)
        sys.exit(1)

    now = datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")
    avail_json = json.dumps(result, ensure_ascii=False, separators=(",", ":"))

    # 1) avail.js (참고용 / 재사용)
    with open("avail.js", "w", encoding="utf-8") as f:
        f.write(
            "// 자동 생성 — scrape_avail.py. 직접 수정하지 마세요.\n"
            "window.AVAIL = %s;\nwindow.AVAIL_UPDATED = %s;\n"
            "if (window.__renderAvail) window.__renderAvail();\n"
            % (avail_json, json.dumps(now))
        )

    # 2) 아티팩트 HTML 의 AVAIL 블록 교체
    html_path = "인천물때예약판.html"
    try:
        with open(html_path, encoding="utf-8") as f:
            html = f.read()
        block = (
            "<!-- AVAIL:START (scrape_avail.py 가 이 블록을 자동 갱신) -->\n"
            '<script>window.AVAIL=%s;window.AVAIL_UPDATED=%s;'
            'if(window.__renderAvail)window.__renderAvail();</script>\n'
            "<!-- AVAIL:END -->"
        ) % (avail_json, json.dumps(now))
        new_html = re.sub(
            r"<!-- AVAIL:START.*?<!-- AVAIL:END -->",
            lambda _m: block,
            html,
            count=1,
            flags=re.S,
        )
        if new_html != html:
            with open(html_path, "w", encoding="utf-8") as f:
                f.write(new_html)
            print("%s AVAIL 블록 갱신" % html_path, file=sys.stderr)
        else:
            print("%s 변경 없음" % html_path, file=sys.stderr)
    except FileNotFoundError:
        print("WARN %s 없음 — HTML 갱신 건너뜀" % html_path, file=sys.stderr)

    print("완료: %d건, %s" % (total, now), file=sys.stderr)


if __name__ == "__main__":
    main()
