(function () {
  "use strict";

  var WD_ORDER = ["일", "월", "화", "수", "목", "금", "토"];
  var state = { month: null, board: null, months: [] };

  var el = {
    mLabel: document.getElementById("mLabel"),
    prevM: document.getElementById("prevM"),
    nextM: document.getElementById("nextM"),
    tabs: document.getElementById("tabs"),
    boatbar: document.getElementById("boatbar"),
    flowbar: document.getElementById("flowbar"),
    cols: document.getElementById("gridCols"),
    head: document.getElementById("gridHead"),
    body: document.getElementById("gridBody"),
    footNote: document.getElementById("footNote"),
    planCount: document.getElementById("planCount"),
    toast: document.getElementById("toast"),
  };

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function pad(n) { return (n < 10 ? "0" : "") + n; }
  function shiftMonth(m, d) {
    var y = +m.slice(0, 4), mm = +m.slice(5, 7) - 1 + d;
    y += Math.floor(mm / 12); mm = ((mm % 12) + 12) % 12;
    return y + "-" + pad(mm + 1);
  }

  var toastT;
  function toast(msg) {
    el.toast.textContent = msg;
    el.toast.classList.add("show");
    clearTimeout(toastT);
    toastT = setTimeout(function () { el.toast.classList.remove("show"); }, 2800);
  }

  function api(method, path, body) {
    return fetch(path, {
      method: method,
      headers: body ? { "content-type": "application/json" } : undefined,
      body: body ? JSON.stringify(body) : undefined,
    }).then(function (r) {
      if (!r.ok) return r.json().then(function (e) { throw new Error(e.error || r.status); });
      return r.json();
    });
  }

  // ---------- theme ----------
  var themeBtn = document.getElementById("themeBtn");
  function applyTheme(t) {
    if (t === "dark" || t === "light") document.documentElement.setAttribute("data-theme", t);
    else document.documentElement.removeAttribute("data-theme");
  }
  try { applyTheme(localStorage.getItem("ijb.theme")); } catch (e) {}
  themeBtn.onclick = function () {
    var cur = document.documentElement.getAttribute("data-theme");
    var next = cur === "dark" ? "light" : cur === "light" ? "" : "dark";
    applyTheme(next);
    try { next ? localStorage.setItem("ijb.theme", next) : localStorage.removeItem("ijb.theme"); } catch (e) {}
  };

  // ---------- load / render ----------
  // 이번 달 ~ 올해 12월(최소 3개월)을 세로로 이어서 한 번에 표시 (탭 선택 없음)
  function monthList() {
    var now = new Date();
    var cur = now.getFullYear() + "-" + ("0" + (now.getMonth() + 1)).slice(-2);
    var endDec = now.getFullYear() + "-12";
    var out = [cur];
    for (var i = 1; i < 12; i++) {
      var m = shiftMonth(cur, i);
      out.push(m);
      if (m >= endDec && out.length >= 3) break;
    }
    return out;
  }
  function load() {
    var months = monthList();
    return Promise.all(months.map(function (m) {
      return api("GET", "/api/board?month=" + encodeURIComponent(m));
    })).then(function (parts) {
      var b0 = parts[0];
      state.months = months;
      state.board = {
        today: b0.today,
        updatedAt: b0.updatedAt,
        sites: b0.sites,
        boats: b0.boats,
        myplan: b0.myplan,
        rows: parts.reduce(function (acc, p) { return acc.concat(p.rows); }, []),
      };
      render();
    });
  }

  // ---------- boat show/hide (per browser) ----------
  var hidden = (function () {
    try { return new Set(JSON.parse(localStorage.getItem("ijb.hiddenBoats") || "[]")); }
    catch (e) { return new Set(); }
  })();
  function saveHidden() {
    try { localStorage.setItem("ijb.hiddenBoats", JSON.stringify([...hidden])); } catch (e) {}
  }
  function visibleBoats() {
    return (state.board.boats || []).filter(function (b) { return !hidden.has(b.id); });
  }
  var bbCollapsed = (function () {
    try {
      var s = localStorage.getItem("ijb.bbCollapsed");
      if (s !== null) return s === "1";
    } catch (e) {}
    return window.matchMedia("(max-width: 640px)").matches; // 모바일 기본 접힘
  })();
  function renderBoatBar() {
    var boats = state.board.boats || [];
    var vis = boats.length - boats.filter(function (b) { return hidden.has(b.id); }).length;
    var bySite = [];
    boats.forEach(function (b) {
      var g = bySite.filter(function (x) { return x.site === b.site; })[0];
      if (!g) { g = { site: b.site, boats: [] }; bySite.push(g); }
      g.boats.push(b);
    });
    var h = '<div class="bb-head"><button class="bb-toggle" data-bbtoggle>배 표시 ' +
      (bbCollapsed ? "▸" : "▾") + '</button>' +
      '<span class="bb-count">' + vis + " / " + boats.length + "</span></div>";
    if (bbCollapsed) { el.boatbar.innerHTML = h; wireBoatBar(boats); return; }
    h += '<div class="bb-grid">' + bySite.map(function (g) {
      var allHidden = g.boats.every(function (b) { return hidden.has(b.id); });
      return '<div class="bb-sitename">' + esc(g.site) +
        '<button class="bb-all" data-site-toggle="' + esc(g.site) + '">' + (allHidden ? "＋전체" : "－해제") + "</button></div>" +
        '<div class="bb-chips">' + g.boats.map(function (b) {
          return '<button class="bb-chip" data-boat-toggle="' + esc(b.id) + '" aria-pressed="' + (!hidden.has(b.id)) + '">' + esc(b.name) + "</button>";
        }).join("") + "</div>";
    }).join("") + "</div>";
    el.boatbar.innerHTML = h;
    wireBoatBar(boats);
  }
  function wireBoatBar(boats) {
    var t = el.boatbar.querySelector("[data-bbtoggle]");
    if (t) t.onclick = function () {
      bbCollapsed = !bbCollapsed;
      try { localStorage.setItem("ijb.bbCollapsed", bbCollapsed ? "1" : "0"); } catch (e) {}
      renderBoatBar();
    };
    el.boatbar.querySelectorAll("[data-boat-toggle]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-boat-toggle");
        hidden.has(id) ? hidden.delete(id) : hidden.add(id);
        saveHidden(); render();
      };
    });
    el.boatbar.querySelectorAll("[data-site-toggle]").forEach(function (btn) {
      btn.onclick = function () {
        var site = btn.getAttribute("data-site-toggle");
        var gb = boats.filter(function (b) { return b.site === site; });
        var allHidden = gb.every(function (b) { return hidden.has(b.id); });
        gb.forEach(function (b) { allHidden ? hidden.delete(b.id) : hidden.add(b.id); });
        saveHidden(); render();
      };
    });
  }

  // ---------- 조류 세기 필터 (per browser) ----------
  // 선택한 % 이하인 날짜만 표시(약한 물 찾기). 임계값 30 / 50 / 70 / 80.
  var FLOW_STEPS = [30, 50, 70, 80];
  var flowMax = (function () {
    try { return Number(localStorage.getItem("ijb.flowMax")) || 0; } catch (e) { return 0; }
  })();
  function setFlowMax(v) {
    flowMax = v;
    try { v ? localStorage.setItem("ijb.flowMax", String(v)) : localStorage.removeItem("ijb.flowMax"); } catch (e) {}
    render();
  }
  var seatOnly = (function () {
    try { return localStorage.getItem("ijb.seatOnly") === "1"; } catch (e) { return false; }
  })();
  function setSeatOnly(v) {
    seatOnly = v;
    try { v ? localStorage.setItem("ijb.seatOnly", "1") : localStorage.removeItem("ijb.seatOnly"); } catch (e) {}
    render();
  }
  function renderFlowBar() {
    var h = '<span class="bb-label">조류 세기</span>' +
      '<button class="bb-chip" data-flow="0" aria-pressed="' + (flowMax === 0) + '">전체</button>' +
      FLOW_STEPS.map(function (s) {
        return '<button class="bb-chip" data-flow="' + s + '" aria-pressed="' + (flowMax === s) + '">' + s + "% 이하</button>";
      }).join("") +
      '<span class="bb-sep"></span>' +
      '<button class="bb-chip" data-seatonly aria-pressed="' + seatOnly + '">잔여석 있는 날만</button>';
    el.flowbar.innerHTML = h;
    el.flowbar.querySelectorAll("[data-flow]").forEach(function (btn) {
      btn.onclick = function () { setFlowMax(Number(btn.getAttribute("data-flow"))); };
    });
    el.flowbar.querySelector("[data-seatonly]").onclick = function () { setSeatOnly(!seatOnly); };
  }

  // 어종 축약: "주꾸미·갑오징어" → "쭈/갑"
  var FISH_ABBR = {
    "주꾸미": "쭈", "갑오징어": "갑", "오징어": "오징", "한치": "한치",
    "광어": "광어", "우럭": "우럭", "참돔": "참돔", "돌돔": "돌돔", "감성돔": "감성",
    "농어": "농어", "삼치": "삼치", "부시리": "부시", "방어": "방어", "대구": "대구",
    "열기": "열기", "가자미": "가자", "학꽁치": "꽁치", "문어": "문어", "볼락": "볼락",
    "쥐노래미": "놀래미", "망상어": "망상", "숭어": "숭어",
  };
  function fishAbbr(f) {
    if (!f) return "";
    return String(f).split("·").map(function (x) { return FISH_ABBR[x] || x; }).join("/");
  }

  function planKey(d, id) { return d + "|" + id; }
  function planSet() {
    var s = {};
    (state.board.myplan || []).forEach(function (p) { s[planKey(p.date, p.boatId)] = 1; });
    return s;
  }

  var booted = false;
  function render() {
    var b = state.board;
    // 첫 실행: 모든 배 숨김 상태로 시작 → 사용자가 볼 배를 고른다
    if (!booted) {
      booted = true;
      try {
        if (localStorage.getItem("ijb.hiddenBoats") === null) {
          (b.boats || []).forEach(function (x) { hidden.add(x.id); });
          saveHidden();
          bbCollapsed = false;
        }
      } catch (e) {}
    }
    if (el.mLabel) {
      var mm = state.months.map(function (m) { return +m.slice(5, 7) + "월"; });
      el.mLabel.innerHTML = '<span class="yr">' + state.months[0].slice(0, 4) + "</span> &nbsp;" + mm.join(" · ");
    }
    el.planCount.textContent = (b.myplan || []).length;
    renderBoatBar();
    renderFlowBar();

    var boats = visibleBoats();
    el.cols.innerHTML =
      '<col class="c-w-date"><col class="c-w-mul">' +
      boats.map(function () { return '<col class="c-w-boat">'; }).join("");

    el.head.innerHTML =
      '<tr><th class="c-date">날짜</th><th class="c-mul">물때·조류</th>' +
      boats.map(function (bt) {
        return '<th class="boat-h" data-boat="' + esc(bt.id) + '" title="' + esc(bt.site) + " · " + esc(bt.name) + '">' +
          '<span class="bn">' + esc(bt.name) + "</span></th>";
      }).join("") +
      "</tr>";

    // 표 전체 폭 = 앞 2열(날짜·물때) + 배 수 × 열폭 (모바일에서 더 좁게)
    var mobile = window.matchMedia("(max-width: 640px)").matches;
    var FROZEN_W = mobile ? 92 : 138;
    var BOAT_W = mobile ? 92 : 112;
    var tbl = el.head.closest("table");
    if (tbl) tbl.style.width = FROZEN_W + boats.length * BOAT_W + "px";

    var mine = planSet();
    var shownRows = b.rows.filter(function (r) {
      if (flowMax && !(r.flow != null && r.flow <= flowMax)) return false;
      if (seatOnly) {
        var any = boats.some(function (bt) {
          var c = r.cells[bt.id];
          return c && (c.status === "open" || c.status === "few");
        });
        if (!any) return false;
      }
      return true;
    });
    var curMonth = "";
    var rowsHtml = shownRows.map(function (r) {
      var sep = "";
      if (r.date.slice(0, 7) !== curMonth) {
        curMonth = r.date.slice(0, 7);
        sep = '<tr class="mrow"><td colspan="' + (2 + boats.length) + '">' +
          curMonth.slice(0, 4) + "년 " + +curMonth.slice(5, 7) + "월</td></tr>";
      }
      var wd = r.weekday;
      var cls = [];
      if (r.holiday) cls.push("hol");
      else if (wd === "토") cls.push("wknd-sat");
      else if (wd === "일") cls.push("wknd-sun");
      if (r.isToday) cls.push("today");
      var rowMine = boats.some(function (bt) { return mine[planKey(r.date, bt.id)]; });
      if (rowMine) cls.push("mine");

      var dcls = r.holiday || wd === "일" ? "sun" : wd === "토" ? "sat" : "";
      var day = +r.date.slice(8, 10);
      var h = sep + '<tr class="' + cls.join(" ") + '">';
      h += '<td class="c-date ' + dcls + '"><span class="d mono">' + day + '</span>' +
        '<span class="wd">' + wd + "</span>" +
        '<span class="lun' + (r.holiday ? " holname" : "") + '">' + (r.holiday ? esc(r.holiday) : r.lunar ? "음 " + r.lunar : "") + "</span></td>";

      // 물때 + 조류 세기(셀 배경 채움)를 한 칸에
      var mt = r.mulTier === "sari" ? "t-sari" : r.mulTier === "mid" ? "t-mid" : "";
      var fpct = r.flow != null ? Math.max(0, Math.min(100, r.flow)) : 0;
      var fnum = r.flow == null ? "" : r.est ? "≈" + r.flow
        : r.flowLabel === "최대" ? "최대" : r.flowLabel === "최소" ? "최소" : String(r.flow);
      h += '<td class="c-mul" style="--f:' + fpct + '%" title="조류 세기 ' + esc(r.flowLabel || "") + '">' +
        (r.mul
          ? '<span class="mul ' + mt + '">' + esc(r.mul) + (r.mulTier === "sari" ? '<span class="tag">사리</span>' : "") + "</span>"
          : "&mdash;") +
        (fnum ? '<span class="fnum' + (r.est ? " est" : "") + '">' + esc(fnum) + "</span>" : "") +
        "</td>";

      h += boats.map(function (bt) {
        var c = r.cells[bt.id];
        var starOn = mine[planKey(r.date, bt.id)] ? " on" : "";
        if (!c) {
          return '<td class="c-boat"><div class="cell miss s-unknown">' +
            '<span class="body" data-url="" title="예약 정보 없음"><span class="st">–</span></span>' +
            '<button class="star' + starOn + '" data-date="' + r.date + '" data-boat="' + esc(bt.id) + '" aria-label="나의 예약 토글">' + (starOn ? "★" : "☆") + "</button></div></td>";
        }
        if (c.status === "link") {
          return '<td class="c-boat"><div class="cell s-link">' +
            '<span class="body" data-url="' + esc(c.url) + '" title="' + esc(bt.name) + " 예약 페이지 (파싱 규칙 없음)\">" +
            '<span class="st">✕</span><span class="sub">예약 페이지 ↗</span></span>' +
            '<button class="star' + starOn + '" data-date="' + r.date + '" data-boat="' + esc(bt.id) + '" aria-label="나의 예약 토글">' + (starOn ? "★" : "☆") + "</button></div></td>";
        }
        var label, sub = "", open = c.status === "few" || c.status === "open";
        if (c.status === "full") { label = "마감"; sub = c.total ? c.total + "/" + c.total : ""; }
        else if (open) {
          label = "잔여 " + c.remain + "석";
          sub = c.total ? (c.total - c.remain) + "/" + c.total : "예약하기 ↗";
        } else { label = "예약 확인"; sub = "인원정보 없음"; }
        var fx = fishAbbr(c.fish);
        return '<td class="c-boat"><div class="cell s-' + c.status + (open ? " has-seat" : "") + '">' +
          '<span class="body" data-url="' + esc(c.url) + '" title="' + esc(bt.name) + " · " + r.date +
          (c.fish ? " · " + esc(c.fish) : "") + (open ? ' 예약하기' : ' 예약 페이지') + '">' +
          '<span class="st">' + (fx ? '<span class="fx">' + esc(fx) + "</span> " : "") + esc(label) + (open ? ' <span class="go">↗</span>' : "") + "</span>" +
          (sub ? '<span class="sub mono">' + esc(sub) + "</span>" : "") + "</span>" +
          '<button class="star' + starOn + '" data-date="' + r.date + '" data-boat="' + esc(bt.id) + '" aria-label="나의 예약 토글">' + (starOn ? "★" : "☆") + "</button>" +
          "</div></td>";
      }).join("");

      h += "</tr>";
      return h;
    }).join("");

    var hintRow = boats.length === 0
      ? '<tr><td class="empty" colspan="2">위 <b>배 표시</b> 에서 볼 배를 선택하세요 →</td></tr>'
      : "";
    el.body.innerHTML = (hintRow + rowsHtml) ||
      '<tr><td class="empty" colspan="' + (2 + boats.length) + '">이 달 데이터가 없습니다.</td></tr>';

    requestAnimationFrame(function () {
      // 배가 늘었으면(사이트 추가 등) 새 열이 보이도록 오른쪽 끝으로
      var sc = document.querySelector(".scroller");
      if (sc && state._boatN != null && boats.length > state._boatN) sc.scrollLeft = sc.scrollWidth;
      state._boatN = boats.length;
      updateHScroll();
    });

    var upd = document.getElementById("updAge");
    if (upd) {
      if (b.updatedAt) {
        var mins = Math.round((Date.now() - new Date(b.updatedAt)) / 60000);
        var rel = mins < 1 ? "방금" : mins < 60 ? mins + "분 전" : Math.round(mins / 60) + "시간 전";
        upd.textContent = "예약 " + rel;
        upd.classList.toggle("stale", mins > 180);
        upd.title = "예약 현황 마지막 갱신: " + new Date(b.updatedAt).toLocaleString("ko-KR");
      } else { upd.textContent = ""; }
    }

    var when = b.updatedAt ? new Date(b.updatedAt).toLocaleString("ko-KR") : "없음";
    el.footNote.innerHTML =
      "<b>물때·조류</b>는 국립해양조사원 인천 조석예보 기반. 조류 %는 그날 조차의 상대 세기, 물때는 음력 기준 계산. " +
      "<b>예약 현황</b> 마지막 갱신: " + esc(when) + " · 사이트 " + b.sites.filter(function (s) { return s.enabled !== false; }).length + "곳. " +
      "잔여석이 있는 칸은 클릭하면 해당 배 예약 페이지가 열립니다.";
  }

  // ---------- table interactions ----------
  el.body.addEventListener("click", function (e) {
    var star = e.target.closest(".star");
    if (star) {
      var date = star.getAttribute("data-date"), boat = star.getAttribute("data-boat");
      api("POST", "/api/myplan", { date: date, boatId: boat }).then(function (list) {
        state.board.myplan = list;
        render();
      }).catch(function (err) { toast("저장 실패: " + err.message); });
      return;
    }
    var body = e.target.closest(".body");
    if (body && body.getAttribute("data-url")) window.open(body.getAttribute("data-url"), "_blank", "noopener");
  });


  // ---------- 표 좌우 스크롤 ----------
  var hbar = document.getElementById("hscroll");
  var hHint = document.getElementById("hscrollHint");
  function scroller() { return document.querySelector(".scroller"); }
  function step() {
    var th = el.head.querySelector("th.boat-h");
    return (th ? th.getBoundingClientRect().width : 110) * 3;
  }
  function updateHScroll() {
    var sc = scroller();
    if (!sc) return;
    var can = sc.scrollWidth - sc.clientWidth > 4;
    hbar.hidden = !can;
    if (!can) return;
    var atStart = sc.scrollLeft < 4;
    var atEnd = sc.scrollLeft > sc.scrollWidth - sc.clientWidth - 4;
    document.getElementById("hLeft").disabled = atStart;
    document.getElementById("hRight").disabled = atEnd;
    var total = (state.board.boats || []).length;
    var vis = visibleBoats().length;
    hHint.textContent = "배 " + vis + "칸 · 좌우로 스크롤하세요";
  }
  document.getElementById("hLeft").onclick = function () {
    scroller().scrollBy({ left: -step(), behavior: "smooth" });
  };
  document.getElementById("hRight").onclick = function () {
    scroller().scrollBy({ left: step(), behavior: "smooth" });
  };
  (function () {
    var sc = scroller();
    if (sc) sc.addEventListener("scroll", updateHScroll, { passive: true });
  })();
  window.addEventListener("resize", updateHScroll);

  // ---------- refresh ----------
  document.getElementById("refreshBtn").onclick = function () {
    var btn = this;
    btn.disabled = true;
    btn.textContent = "…";
    api("POST", "/api/refresh").then(function (r) {
      var days = (r.summary || []).map(function (s) { return s.site + " " + s.days + "일"; }).join(" · ");
      toast(r.ok ? "새로고침 완료 — " + days : (r.message || "새로고침 실패"));
      return load();
    }).catch(function (err) { toast("새로고침 실패: " + err.message); })
      .finally(function () { btn.disabled = false; btn.textContent = "Refresh"; });
  };

  // ---------- overlay ----------
  var scrim = null;
  function openOverlay(kind, node) {
    closeOverlay();
    scrim = document.createElement("div");
    scrim.className = "scrim " + kind;
    scrim.appendChild(node);
    scrim.addEventListener("mousedown", function (e) { if (e.target === scrim) closeOverlay(); });
    document.addEventListener("keydown", escClose);
    document.body.appendChild(scrim);
  }
  function closeOverlay() {
    if (scrim) { scrim.remove(); scrim = null; document.removeEventListener("keydown", escClose); }
  }
  function escClose(e) { if (e.key === "Escape") closeOverlay(); }

  // ---------- settings ----------
  document.getElementById("settingsBtn").onclick = openSettings;
  function openSettings() {
    var p = document.createElement("div");
    p.className = "panel sheet";
    p.innerHTML =
      '<div class="panel-head"><h2>예약 사이트 추가·관리</h2><button class="icon-btn" data-close>✕</button></div>' +
      '<div class="panel-body" id="setBody"></div>' +
      '<div class="panel-foot"><button class="btn-primary" data-close>완료</button></div>';
    openOverlay("right", p);
    p.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = function () { closeOverlay(); load(); }; });
    drawSettings(p);
  }
  function drawSettings(p) {
    var body = p.querySelector("#setBody");
    api("GET", "/api/sites").then(function (sites) {
      body.innerHTML = sites.map(function (s) {
        return '<div class="site-edit" data-id="' + s.id + '">' +
          '<div class="top"><input type="text" data-f="name" value="' + esc(s.name) + '" />' +
          '<button class="link-btn" data-del>삭제</button></div>' +
          '<div class="row"><label><input type="checkbox" data-f="enabled"' + (s.enabled !== false ? " checked" : "") + '/> 표시</label>' +
          '<span class="kind">' + esc(s.kind || "generic") + "</span>" +
          '<span class="hint" style="margin:0">' + esc((s.listUrl || "").replace(/^https?:\/\//, "").split("?")[0]) + "</span></div>" +
          "</div>";
      }).join("") +
        '<div class="site-edit"><div class="top"><input type="text" id="newName" placeholder="사이트 이름 (선택)" /></div>' +
        '<input type="url" id="newUrl" class="mono" placeholder="https://... 예약 페이지 주소" />' +
        '<p class="hint">칸피싱·제일낚시(<code>mid=bk</code>) 계열과 <code>sunsang24</code> 계열은 배별 인원까지 자동 조회됩니다. 그 외는 링크 열만 생깁니다.</p>' +
        '<div class="row" style="margin-top:8px"><button class="btn-primary" id="addSite">추가하고 조회</button></div></div>';

      body.querySelectorAll(".site-edit[data-id]").forEach(function (card) {
        var id = card.getAttribute("data-id");
        var name = card.querySelector('[data-f="name"]');
        var enabled = card.querySelector('[data-f="enabled"]');
        function put() { api("PUT", "/api/sites/" + id, { name: name.value, enabled: enabled.checked }).catch(function (e) { toast(e.message); }); }
        name.onchange = put;
        enabled.onchange = put;
        card.querySelector("[data-del]").onclick = function () {
          if (!confirm(name.value + " 사이트를 삭제할까요?")) return;
          api("DELETE", "/api/sites/" + id).then(function () { drawSettings(p); toast("삭제했습니다"); });
        };
      });
      body.querySelector("#addSite").onclick = function () {
        var url = body.querySelector("#newUrl").value.trim();
        if (!/^https?:\/\//.test(url)) { toast("URL을 입력하세요"); return; }
        this.disabled = true;
        this.textContent = "조회 중…";
        api("POST", "/api/sites", { name: body.querySelector("#newName").value.trim(), url: url })
          .then(function (r) { toast("추가됨 (" + r.kind + ") — 잠시 후 배 목록이 채워집니다"); drawSettings(p); })
          .catch(function (e) { toast("추가 실패: " + e.message); this && (this.disabled = false); });
      };
    });
  }

  // ---------- my plan ----------
  document.getElementById("planBtn").onclick = function () {
    var p = document.createElement("div");
    p.className = "panel modal";
    var boatName = {};
    (state.board.boats || []).forEach(function (bt) { boatName[bt.id] = bt.name + " (" + bt.site + ")"; });
    var list = (state.board.myplan || []).slice().sort(function (a, b) { return a.date < b.date ? -1 : 1; });
    p.innerHTML =
      '<div class="panel-head"><h2>나의 예약 (' + list.length + ")</h2><button class=\"icon-btn\" data-close>✕</button></div>" +
      '<div class="panel-body">' +
      (list.length ? list.map(function (x) {
        return '<div class="plan-item"><span class="pd mono">' + esc(x.date) + '</span>' +
          '<span class="pb">' + esc(boatName[x.boatId] || x.boatId) + "</span>" +
          '<button class="link-btn" data-del data-date="' + x.date + '" data-boat="' + esc(x.boatId) + '">삭제</button></div>';
      }).join("") : '<p class="hint">표에서 ☆ 를 눌러 예약 계획을 저장하세요.</p>') +
      "</div>";
    openOverlay("center", p);
    p.querySelector("[data-close]").onclick = closeOverlay;
    p.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () {
        api("DELETE", "/api/myplan/" + b.getAttribute("data-date") + "/" + encodeURIComponent(b.getAttribute("data-boat")))
          .then(function (l) { state.board.myplan = l; closeOverlay(); render(); });
      };
    });
  };

  load().catch(function (e) {
    el.body.innerHTML = '<tr><td class="empty">불러오기 실패: ' + esc(e.message) + "</td></tr>";
  });
})();
