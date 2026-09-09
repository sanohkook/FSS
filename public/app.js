(function () {
  "use strict";

  var WD_ORDER = ["일", "월", "화", "수", "목", "금", "토"];
  var state = { month: null, board: null, months: [] };

  // 앱 버전 (안드로이드 앱에서만). 화면 하단(footNote)에 표기.
  var APP_VER = "";
  try { if (window.FssNative && FssNative.appVersion) APP_VER = String(FssNative.appVersion() || ""); } catch (e) {}

  var el = {
    mLabel: document.getElementById("mLabel"),
    prevM: document.getElementById("prevM"),
    nextM: document.getElementById("nextM"),
    tabs: document.getElementById("tabs"),
    filterbar: document.getElementById("filterbar"),
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
      headers: body ? { "content-type": "application/json; charset=utf-8" } : undefined,
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
  function bySiteGroups() {
    var g = [];
    (state.board.boats || []).forEach(function (b) {
      var s = g.filter(function (x) { return x.site === b.site; })[0];
      if (!s) { s = { site: b.site, boats: [] }; g.push(s); }
      s.boats.push(b);
    });
    return g;
  }

  // ---------- 검색 조건 (예약 가능 · 조류 세기 · 선박) — 팝업 하나로 ----------
  var flowMax = (function () {
    try { return Number(localStorage.getItem("ijb.flowMax")) || 0; } catch (e) { return 0; }
  })();
  function setFlowMax(v) {
    flowMax = v;
    try { v ? localStorage.setItem("ijb.flowMax", String(v)) : localStorage.removeItem("ijb.flowMax"); } catch (e) {}
  }
  var seatOnly = (function () {
    try { return localStorage.getItem("ijb.seatOnly") === "1"; } catch (e) { return false; }
  })();
  function setSeatOnly(v) {
    seatOnly = v;
    try { v ? localStorage.setItem("ijb.seatOnly", "1") : localStorage.removeItem("ijb.seatOnly"); } catch (e) {}
  }
  // 요일 · 공휴일 필터: 비어 있으면 전체 표시. "공휴일" 선택 시 공휴일은 요일과 무관하게 통과
  var DOW_TOKENS = ["월", "화", "수", "목", "금", "토", "일", "공휴일"];
  var dowSel = (function () {
    try { return new Set(JSON.parse(localStorage.getItem("ijb.dow") || "[]")); }
    catch (e) { return new Set(); }
  })();
  function saveDow() {
    try {
      dowSel.size ? localStorage.setItem("ijb.dow", JSON.stringify([...dowSel]))
        : localStorage.removeItem("ijb.dow");
    } catch (e) {}
  }
  function toggleDow(t) {
    dowSel.has(t) ? dowSel.delete(t) : dowSel.add(t);
    saveDow();
  }
  function rowPassesDow(r) {
    if (!dowSel.size) return true;
    if (r.holiday && dowSel.has("공휴일")) return true;
    return dowSel.has(r.weekday);
  }

  // 메인 화면: '검색 조건' 버튼 + 활성 조건 요약
  function renderFilterBar() {
    var boats = state.board.boats || [];
    var vis = boats.length - boats.filter(function (b) { return hidden.has(b.id); }).length;
    var tags = [];
    if (seatOnly) tags.push("예약 가능");
    if (flowMax) tags.push("조류≤" + flowMax);
    if (dowSel.size) tags.push([...dowSel].join("·"));
    tags.push("선박 " + vis + "/" + boats.length);
    el.filterbar.innerHTML =
      '<button class="bb-open" data-open-filters>🔍 검색 조건 <b>' + esc(tags.join(" · ")) + "</b></button>";
    el.filterbar.querySelector("[data-open-filters]").onclick = openFilters;
  }

  function openFilters() {
    var p = document.createElement("div");
    p.className = "panel sheet";
    p.innerHTML =
      '<div class="panel-head"><h2>검색 조건</h2><button class="icon-btn" data-close>✕</button></div>' +
      '<div class="panel-body" id="fltBody"></div>' +
      '<div class="panel-foot"><button class="btn-primary" data-close>완료</button></div>';
    openOverlay("right", p);
    p.querySelectorAll("[data-close]").forEach(function (b) { b.onclick = closeOverlay; });
    drawFilters(p);
  }
  function drawFilters(p) {
    var body = p.querySelector("#fltBody");
    var boats = state.board.boats || [];
    var vis = boats.length - boats.filter(function (b) { return hidden.has(b.id); }).length;
    body.innerHTML =
      '<div class="flt-sec">' +
      '<button class="bb-chip" data-seatonly aria-pressed="' + seatOnly + '">예약 가능한 날만</button>' +
      "</div>" +
      '<div class="flt-sec"><span class="flt-h">조류 세기</span>' +
      '<button class="bb-chip" data-flow70 aria-pressed="' + (flowMax === 70) + '">70% 이하만</button>' +
      "</div>" +
      '<div class="flt-sec"><span class="flt-h">요일 · 공휴일' +
      (dowSel.size ? '<button class="bb-all" data-dow-clear>해제</button>' : "") + "</span>" +
      '<div class="bb-chips">' + DOW_TOKENS.map(function (t) {
        return '<button class="bb-chip" data-dow="' + esc(t) + '" aria-pressed="' + dowSel.has(t) + '">' + esc(t) + "</button>";
      }).join("") + "</div></div>" +
      '<div class="flt-sec"><span class="flt-h">선박 <b>' + vis + " / " + boats.length + "</b>" +
      '<button class="bb-all" data-all="show">전체</button><button class="bb-all" data-all="hide">해제</button></span>' +
      '<div class="bb-grid">' + bySiteGroups().map(function (g) {
        var allHidden = g.boats.every(function (b) { return hidden.has(b.id); });
        return '<div class="bb-sitename">' + esc(g.site) +
          '<button class="bb-all" data-site-toggle="' + esc(g.site) + '">' + (allHidden ? "＋전체" : "－해제") + "</button></div>" +
          '<div class="bb-chips">' + g.boats.map(function (b) {
            return '<button class="bb-chip" data-boat-toggle="' + esc(b.id) + '" aria-pressed="' + (!hidden.has(b.id)) + '">' + esc(b.name) + "</button>";
          }).join("") + "</div>";
      }).join("") + "</div></div>";

    var redraw = function () { saveHidden(); render(); drawFilters(p); };
    body.querySelector("[data-seatonly]").onclick = function () { setSeatOnly(!seatOnly); render(); drawFilters(p); };
    body.querySelector("[data-flow70]").onclick = function () { setFlowMax(flowMax === 70 ? 0 : 70); render(); drawFilters(p); };
    body.querySelectorAll("[data-dow]").forEach(function (btn) {
      btn.onclick = function () { toggleDow(btn.getAttribute("data-dow")); render(); drawFilters(p); };
    });
    var dowClear = body.querySelector("[data-dow-clear]");
    if (dowClear) dowClear.onclick = function () { dowSel.clear(); saveDow(); render(); drawFilters(p); };
    body.querySelector('[data-all="show"]').onclick = function () { hidden.clear(); redraw(); };
    body.querySelector('[data-all="hide"]').onclick = function () { boats.forEach(function (b) { hidden.add(b.id); }); redraw(); };
    body.querySelectorAll("[data-boat-toggle]").forEach(function (btn) {
      btn.onclick = function () {
        var id = btn.getAttribute("data-boat-toggle");
        hidden.has(id) ? hidden.delete(id) : hidden.add(id);
        redraw();
      };
    });
    body.querySelectorAll("[data-site-toggle]").forEach(function (btn) {
      btn.onclick = function () {
        var site = btn.getAttribute("data-site-toggle");
        var gb = boats.filter(function (b) { return b.site === site; });
        var allHidden = gb.every(function (b) { return hidden.has(b.id); });
        gb.forEach(function (b) { allHidden ? hidden.delete(b.id) : hidden.add(b.id); });
        redraw();
      };
    });
  }

  // 어종 축약: 주꾸미→쭈, 갑오징어→갑, 참돔→참, '광어·우럭' 조합→광/우.
  // 그 외 어종은 줄이지 않고 그대로 표시.
  var FISH_ABBR = { "주꾸미": "쭈", "갑오징어": "갑", "참돔": "참" };
  function fishAbbr(f) {
    if (!f) return "";
    var parts = String(f).split("·");
    if (parts.length === 2 && parts.indexOf("광어") >= 0 && parts.indexOf("우럭") >= 0) return "광/우";
    return parts.map(function (x) { return FISH_ABBR[x] || x; }).join("/");
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
      var firstRun = false;
      try { firstRun = localStorage.getItem("ijb.hiddenBoats") === null; } catch (e) {}
      if (firstRun) {
        (b.boats || []).forEach(function (x) { hidden.add(x.id); });
        saveHidden();
        setTimeout(openFilters, 300);
      }
    }
    if (el.mLabel) {
      var mm = state.months.map(function (m) { return +m.slice(5, 7) + "월"; });
      el.mLabel.innerHTML = '<span class="yr">' + state.months[0].slice(0, 4) + "</span> &nbsp;" + mm.join(" · ");
    }
    el.planCount.textContent = (b.myplan || []).length;
    renderFilterBar();

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
    var FROZEN_W = mobile ? 86 : 138;
    var BOAT_W = mobile ? 88 : 112;
    var tbl = el.head.closest("table");
    if (tbl) tbl.style.width = FROZEN_W + boats.length * BOAT_W + "px";

    var mine = planSet();
    var shownRows = b.rows.filter(function (r) {
      if (!rowPassesDow(r)) return false;
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
      var mulTxt = r.mulTier === "sari" ? "사리" : r.mul;
      h += '<td class="c-mul" style="--f:' + fpct + '%" title="' + esc(r.mul || "") + " · 조류 " + esc(r.flowLabel || "") + '">' +
        (mulTxt
          ? '<span class="mul ' + mt + '">' + esc(mulTxt) + "</span>"
          : "&mdash;") +
        (fnum ? '<span class="fnum' + (r.est ? " est" : "") + '">' + esc(fnum) + "</span>" : "") +
        "</td>";

      h += boats.map(function (bt) {
        var c = r.cells[bt.id];
        var mineCls = mine[planKey(r.date, bt.id)] ? " mine" : "";
        var da = ' data-date="' + r.date + '" data-boat="' + esc(bt.id) + '"';
        if (!c) {
          return '<td class="c-boat"><div class="cell miss s-unknown' + mineCls + '"' + da +
            '><span class="body" data-url=""><span class="st">–</span></span></div></td>';
        }
        if (c.status === "link") {
          return '<td class="c-boat"><div class="cell s-link' + mineCls + '"' + da +
            ' title="' + esc(bt.name) + ' 예약 페이지 (파싱 규칙 없음)">' +
            '<span class="body" data-url="' + esc(c.url) + '"><span class="st">✕</span><span class="sub">예약 페이지</span></span></div></td>';
        }
        var label, sub = "", open = c.status === "few" || c.status === "open";
        if (c.status === "full") { label = "마감"; sub = c.total ? c.total + "/" + c.total : ""; }
        else if (open) {
          label = c.remain + "석";
          sub = c.total ? (c.total - c.remain) + "/" + c.total : "";
        } else { label = "예약 확인"; sub = "인원정보 없음"; }
        var fx = fishAbbr(c.fish);
        return '<td class="c-boat"><div class="cell s-' + c.status + (open ? " has-seat" : "") + mineCls + '"' + da +
          ' title="' + esc(bt.name) + " · " + r.date + (c.fish ? " · " + esc(c.fish) : "") + '">' +
          '<span class="body" data-url="' + esc(c.url) + '">' +
          '<span class="st">' + (fx ? '<span class="fx">' + esc(fx) + "</span> " : "") + esc(label) + "</span>" +
          (sub ? '<span class="sub mono">' + esc(sub) + "</span>" : "") + "</span>" +
          "</div></td>";
      }).join("");

      h += "</tr>";
      return h;
    }).join("");

    var hintRow = boats.length === 0
      ? '<tr><td class="empty" colspan="2">위 <b>선박 선택</b> 에서 볼 배를 고르세요</td></tr>'
      : "";
    var emptyMsg = (b.rows.length && (dowSel.size || flowMax || seatOnly))
      ? "조건에 맞는 날이 없습니다."
      : "이 달 데이터가 없습니다.";
    el.body.innerHTML = (hintRow + rowsHtml) ||
      '<tr><td class="empty" colspan="' + (2 + boats.length) + '">' + emptyMsg + "</td></tr>";

    requestAnimationFrame(function () {
      // 배가 늘었으면(사이트 추가 등) 새 열이 보이도록 오른쪽 끝으로
      var sc = document.querySelector(".scroller");
      if (sc && state._boatN != null && boats.length > state._boatN) sc.scrollLeft = sc.scrollWidth;
      state._boatN = boats.length;
    });

    var upd = document.getElementById("updAge");
    if (upd) {
      if (b.updatedAt) {
        var dt = new Date(b.updatedAt);
        var pad2 = function (n) { return (n < 10 ? "0" : "") + n; };
        var stamp = dt.getFullYear() + "-" + pad2(dt.getMonth() + 1) + "-" + pad2(dt.getDate()) +
          " " + pad2(dt.getHours()) + ":" + pad2(dt.getMinutes());
        var mins = Math.round((Date.now() - dt) / 60000);
        upd.textContent = stamp + " 갱신";
        upd.classList.toggle("stale", mins > 360);
        upd.title = "예약 현황 마지막 갱신 (" + Math.round(mins / 60) + "시간 전)";
      } else { upd.textContent = "미조회"; }
    }

    var when = b.updatedAt ? new Date(b.updatedAt).toLocaleString("ko-KR") : "없음";
    el.footNote.innerHTML =
      "<b>물때·조류</b>는 국립해양조사원 인천 조석예보 기반. 조류 %는 그날 조차의 상대 세기, 물때는 음력 기준 계산. " +
      "<b>예약 현황</b> 마지막 갱신: " + esc(when) + " · 사이트 " + b.sites.filter(function (s) { return s.enabled !== false; }).length + "곳. " +
      "잔여석이 있는 칸은 클릭하면 해당 배 예약 페이지가 열립니다." +
      (APP_VER ? '<span class="ver"> · 버전 ' + esc(APP_VER) + "</span>" : "");
  }

  // ---------- table interactions ----------
  // 한 번 탭 = 나의 예약 토글(형광초록), 두 번 탭 = 예약 페이지 열기
  var tapCell = null, tapTimer;
  function toggleMine(date, boat) {
    api("POST", "/api/myplan", { date: date, boatId: boat }).then(function (list) {
      state.board.myplan = list; render();
    }).catch(function (err) { toast("저장 실패: " + err.message); });
  }
  el.body.addEventListener("click", function (e) {
    var cell = e.target.closest(".cell");
    if (!cell || !cell.getAttribute("data-date")) return;
    var date = cell.getAttribute("data-date"), boat = cell.getAttribute("data-boat");
    var url = (cell.querySelector(".body") || {}).getAttribute && cell.querySelector(".body").getAttribute("data-url");

    if (tapCell === cell) {
      clearTimeout(tapTimer); tapCell = null;
      if (url) window.open(url, "_blank", "noopener");
      return;
    }
    tapCell = cell;
    clearTimeout(tapTimer);
    tapTimer = setTimeout(function () {
      tapCell = null;
      toggleMine(date, boat);
    }, 300);
  });


  // ---------- 틀 고정 (날짜·물때 왼쪽 열 + 선박명 머리글 고정) ----------
  (function () {
    var chk = document.getElementById("freezeChk");
    if (!chk) return;
    var on = true;
    try { on = localStorage.getItem("ijb.freeze") !== "0"; } catch (e) {}
    var apply = function () {
      document.querySelector(".tablecard").classList.toggle("frz", chk.checked);
    };
    chk.checked = on;
    apply();
    chk.onchange = function () {
      try { localStorage.setItem("ijb.freeze", chk.checked ? "1" : "0"); } catch (e) {}
      apply();
    };
  })();

  // ---------- refresh ----------
  document.getElementById("refreshBtn").onclick = function () {
    var btn = this;
    btn.disabled = true;
    btn.classList.add("busy");
    btn.innerHTML = '<span class="lbl">waiting…</span><i class="prog"></i>';
    var bar = btn.querySelector(".prog");
    // 실제 진행률은 알 수 없음 → 약 40초에 걸쳐 92%까지 서서히 차오르고 응답 시 100%
    bar.style.width = "3%";
    void bar.offsetWidth; // 트랜지션 시작점 확정
    requestAnimationFrame(function () { bar.style.width = "92%"; });
    var finish = function () {
      bar.style.transition = "width .25s ease";
      bar.style.width = "100%";
      setTimeout(function () {
        btn.disabled = false;
        btn.classList.remove("busy");
        btn.textContent = "Refresh";
      }, 280);
    };
    api("POST", "/api/refresh").then(function (r) {
      var days = (r.summary || []).map(function (s) { return s.site + " " + s.days + "일"; }).join(" · ");
      toast(r.ok ? "새로고침 완료 — " + days : (r.message || "새로고침 실패"));
      return load();
    }).catch(function (err) { toast("새로고침 실패: " + err.message); })
      .finally(finish);
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

      // ---- 추천 사이트 (인천·영흥·충남 배낚시) ----
      var host = function (u) { try { return new URL(u).host.replace(/^www\./, ""); } catch (e) { return u; } };
      var have = {};
      sites.forEach(function (s) { have[host(s.listUrl || "")] = 1; });
      fetch("/suggested-sites.json").then(function (r) { return r.json(); }).then(function (list) {
        var todo = list.filter(function (x) { return !have[host(x.url)]; });
        var sec = document.createElement("div");
        sec.className = "sug-sec";
        sec.innerHTML = '<div class="flt-h">추천 사이트 <b>' + todo.length + "</b></div>" +
          (todo.length
            ? todo.map(function (x, i) {
                return '<div class="sug" data-i="' + i + '"><span class="rg">' + esc(x.region) + "</span>" +
                  '<span class="nm">' + esc(x.name) + "</span>" +
                  '<button class="link-btn" data-add>추가</button></div>';
              }).join("")
            : '<p class="hint" style="margin:6px 0">추천 사이트를 모두 추가했습니다.</p>');
        body.appendChild(sec);
        sec.querySelectorAll("[data-add]").forEach(function (btn) {
          btn.onclick = function () {
            var x = todo[+btn.closest(".sug").getAttribute("data-i")];
            btn.disabled = true; btn.textContent = "추가 중…";
            api("POST", "/api/sites", { name: x.name, url: x.url })
              .then(function (r) { toast(x.name + " 추가됨 (" + r.kind + ")"); drawSettings(p); })
              .catch(function (e) { toast("추가 실패: " + e.message); btn.disabled = false; btn.textContent = "추가"; });
          };
        });
      }).catch(function () { /* 추천 목록 없음 — 무시 */ });
    });
  }

  // ---------- my plan ----------
  document.getElementById("planBtn").onclick = function () {
    var p = document.createElement("div");
    p.className = "panel modal";
    openOverlay("center", p);
    drawPlan(p);
  };
  function drawPlan(p) {
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
      }).join("") : '<p class="hint">표에서 셀을 한 번 눌러 예약 계획을 저장하세요.</p>') +
      '<div class="plan-io"><button data-io="export">내보내기</button><button data-io="import">가져오기</button>' +
      '<span class="hint" style="margin:0">기기 변경·재설치 대비 백업</span></div>' +
      "</div>";
    p.querySelector("[data-close]").onclick = closeOverlay;
    p.querySelectorAll("[data-del]").forEach(function (b) {
      b.onclick = function () {
        api("DELETE", "/api/myplan/" + b.getAttribute("data-date") + "/" + encodeURIComponent(b.getAttribute("data-boat")))
          .then(function (l) { state.board.myplan = l; drawPlan(p); render(); });
      };
    });
    p.querySelector('[data-io="export"]').onclick = function () { planIO(p, "export", list); };
    p.querySelector('[data-io="import"]').onclick = function () { planIO(p, "import", list); };
  }
  function planIO(p, mode, list) {
    var isExp = mode === "export";
    var text = isExp ? JSON.stringify(list) : "";
    p.innerHTML =
      '<div class="panel-head"><h2>' + (isExp ? "내보내기" : "가져오기") + '</h2><button class="icon-btn" data-back>‹</button></div>' +
      '<div class="panel-body"><p class="hint">' +
      (isExp ? "아래 내용을 복사해 메모 등에 보관하세요." : "내보내기 한 내용을 붙여넣고 적용하세요. (기존 목록은 대체됩니다)") +
      '</p><textarea id="planText" class="mono"' + (isExp ? " readonly" : "") + ' rows="7">' + esc(text) + "</textarea>" +
      '<div class="row" style="margin-top:10px">' +
      (isExp ? '<button class="btn-primary" id="planCopy">복사</button>'
             : '<button class="btn-primary" id="planApply">적용</button>') +
      "</div></div>";
    p.querySelector("[data-back]").onclick = function () { drawPlan(p); };
    if (isExp) {
      p.querySelector("#planCopy").onclick = function () {
        var ta = p.querySelector("#planText"); ta.select();
        try { document.execCommand("copy"); toast("복사됨"); } catch (e) { toast("직접 선택해 복사하세요"); }
      };
    } else {
      p.querySelector("#planApply").onclick = function () {
        var raw = p.querySelector("#planText").value.trim();
        var arr;
        try { arr = JSON.parse(raw); if (!Array.isArray(arr)) throw 0; }
        catch (e) { toast("형식이 올바르지 않습니다"); return; }
        api("PUT", "/api/myplan", { list: arr }).then(function (l) {
          state.board.myplan = l; toast("가져왔습니다 (" + l.length + "건)"); drawPlan(p); render();
        }).catch(function (err) { toast("실패: " + err.message); });
      };
    }
  }

  // ---------- 업그레이드 (안드로이드 앱 전용) ----------
  // 로딩 시 조용히 새 버전 확인 → 있을 때만 버튼 노출. ✕ 로 이번 버전 알림 끄기.
  (function () {
    var wrap = document.getElementById("upgradeWrap");
    var ub = document.getElementById("upgradeBtn");
    var uc = document.getElementById("upgradeClose");
    if (!wrap || !ub || !window.FssNative) return;

    var latest = "";
    var clicked = false;
    var reset = function () {
      ub.disabled = false;
      ub.textContent = "업그레이드" + (latest ? " " + latest : "");
    };
    var dismissed = function () {
      try { return localStorage.getItem("ijb.upgDismiss"); } catch (e) { return null; }
    };

    ub.onclick = function () {
      clicked = true;
      ub.disabled = true;
      ub.textContent = "확인 중…";
      try { FssNative.upgrade(); } catch (e) { toast("업그레이드를 시작할 수 없습니다"); reset(); }
    };
    uc.onclick = function () {
      try { if (latest) localStorage.setItem("ijb.upgDismiss", latest); } catch (e) {}
      wrap.hidden = true;
    };

    window.__fssUpstate = function (s) {
      if (!s || !s.phase) return;
      if (s.phase === "available") {
        latest = s.latest || "";
        if (dismissed() === latest && latest) return; // 이 버전 알림은 사용자가 끔
        ub.title = (s.current ? "현재 " + s.current + " → " : "") + latest;
        reset();
        wrap.hidden = false;
      } else if (s.phase === "none") {
        wrap.hidden = true;
      } else if (s.phase === "checking") {
        ub.textContent = "확인 중…";
      } else if (s.phase === "downloading") {
        ub.textContent = "받는 중 " + (s.pct || 0) + "%";
      } else if (s.phase === "permission") {
        toast("설정에서 ‘이 출처의 앱 설치 허용’을 켠 뒤 다시 눌러주세요");
        reset();
      } else if (s.phase === "install") {
        toast("설치 화면에서 계속 진행하세요");
        reset();
      } else if (s.phase === "error") {
        if (clicked) toast("업데이트 실패: " + (s.msg || "")); // 로딩 체크 실패는 조용히
        reset();
      }
    };

    try { FssNative.checkUpdate(); } catch (e) {}
  })();

  load().catch(function (e) {
    el.body.innerHTML = '<tr><td class="empty">불러오기 실패: ' + esc(e.message) + "</td></tr>";
  });
})();
