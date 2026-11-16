/* InView Medical — interactions */
(function () {
  "use strict";
  var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var doc = document.documentElement;

  /* header state + back-to-top */
  var header = document.querySelector(".site-header");
  var toTop = document.querySelector(".to-top");
  function onScroll() {
    var y = window.scrollY;
    if (header && !header.classList.contains("solid")) header.classList.toggle("scrolled", y > 20);
    if (toTop) toTop.classList.toggle("show", y > 900);
  }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  if (toTop) toTop.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: reduce ? "auto" : "smooth" }); });

  /* mobile menu */
  var burger = document.querySelector(".burger");
  if (burger) {
    burger.addEventListener("click", function () {
      var open = doc.classList.toggle("menu-open");
      burger.setAttribute("aria-expanded", open ? "true" : "false");
    });
    document.querySelectorAll(".nav a").forEach(function (a) {
      a.addEventListener("click", function () { doc.classList.remove("menu-open"); burger.setAttribute("aria-expanded", "false"); });
    });
    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && doc.classList.contains("menu-open")) { doc.classList.remove("menu-open"); burger.setAttribute("aria-expanded", "false"); burger.focus(); }
    });
  }

  /* reveal on scroll */
  var rv = document.querySelectorAll(".rv");
  if ("IntersectionObserver" in window && !reduce) {
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (en) { if (en.isIntersecting) { en.target.classList.add("in"); io.unobserve(en.target); } });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.08 });
    rv.forEach(function (el) { io.observe(el); });
  } else {
    rv.forEach(function (el) { el.classList.add("in"); });
  }

  /* light road canvas */
  function Road(canvas) {
    var ctx = canvas.getContext("2d");
    var w, h, dpr, t = 0, streaks = [], motes = [];
    var curve = parseFloat(canvas.dataset.curve || "0.18");
    var hx = parseFloat(canvas.dataset.hx || "0.6"), hy = parseFloat(canvas.dataset.hy || "0.58");
    function size() {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = canvas.clientWidth; h = canvas.clientHeight;
      canvas.width = w * dpr; canvas.height = h * dpr;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    // point on road centerline for depth z (0 = horizon, 1 = viewer), offset lane in [-1,1]
    function pt(z, lane) {
      var ez = z * z;
      var cx = w * hx + Math.sin((1 - z) * 2.4 + 0.6) * w * curve * z;
      var cy = h * hy + (h * (1 - hy) + 40) * ez;
      var half = (w * 0.02) + w * 0.62 * ez;
      return [cx + lane * half, cy];
    }
    function seed() {
      streaks = []; motes = [];
      for (var i = 0; i < 26; i++) streaks.push({ z: Math.random(), lane: (Math.random() * 2 - 1) * 0.8, v: 0.0025 + Math.random() * 0.004, len: 0.05 + Math.random() * 0.09 });
      for (var j = 0; j < 40; j++) motes.push({ x: Math.random(), y: Math.random() * 0.8, r: 0.6 + Math.random() * 1.8, a: Math.random() * 6.28, s: 0.2 + Math.random() * 0.6 });
    }
    function lanePath(lane, z0, z1) {
      ctx.beginPath();
      for (var z = z0; z <= z1 + 1e-6; z += 0.01) { var p = pt(z, lane); if (z === z0) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
    }
    function draw() {
      ctx.clearRect(0, 0, w, h);
      // road surface
      ctx.beginPath();
      for (var z = 0; z <= 1.0001; z += 0.01) { var p = pt(z, -1); if (!z) ctx.moveTo(p[0], p[1]); else ctx.lineTo(p[0], p[1]); }
      for (var z2 = 1; z2 >= 0; z2 -= 0.01) { var q = pt(z2, 1); ctx.lineTo(q[0], q[1]); }
      ctx.closePath();
      var g = ctx.createLinearGradient(0, h * hy, 0, h);
      g.addColorStop(0, "rgba(255,255,255,0.0)");
      g.addColorStop(0.25, "rgba(214,231,255,0.55)");
      g.addColorStop(1, "rgba(160,196,245,0.55)");
      ctx.fillStyle = g; ctx.fill();
      // edge glow lines
      ctx.lineCap = "round";
      [[-1, 2.2], [1, 2.2], [-0.33, 1], [0.33, 1]].forEach(function (L, i) {
        lanePath(L[0], 0.02, 1);
        ctx.strokeStyle = i < 2 ? "rgba(255,255,255,0.95)" : "rgba(255,255,255,0.5)";
        ctx.lineWidth = L[1]; ctx.shadowColor = "rgba(61,155,245,0.9)"; ctx.shadowBlur = i < 2 ? 16 : 6;
        if (i >= 2) ctx.setLineDash([18, 22]); else ctx.setLineDash([]);
        ctx.stroke();
      });
      ctx.setLineDash([]);
      // light streaks
      streaks.forEach(function (s) {
        var z0 = Math.max(0.02, s.z - s.len), z1 = Math.min(1, s.z);
        lanePath(s.lane, z0, z1);
        var a = pt(z0, s.lane), b = pt(z1, s.lane);
        var gg = ctx.createLinearGradient(a[0], a[1], b[0], b[1]);
        gg.addColorStop(0, "rgba(61,155,245,0)"); gg.addColorStop(1, "rgba(255,255,255,0.95)");
        ctx.strokeStyle = gg; ctx.lineWidth = 1 + s.z * 3.5; ctx.shadowColor = "rgba(37,99,235,1)"; ctx.shadowBlur = 14;
        ctx.stroke();
        if (!reduce) { s.z += s.v * (0.5 + s.z); if (s.z - s.len > 1) { s.z = 0; s.lane = (Math.random() * 2 - 1) * 0.8; } }
      });
      ctx.shadowBlur = 0;
      // floating motes
      motes.forEach(function (m) {
        var x = m.x * w + Math.sin(t * 0.0006 * m.s + m.a) * 20, y = m.y * h + Math.cos(t * 0.0005 * m.s + m.a) * 14;
        ctx.beginPath(); ctx.arc(x, y, m.r, 0, 6.283); ctx.fillStyle = "rgba(255,255,255,0.75)"; ctx.fill();
      });
    }
    var running = false, visible = true;
    function loop(ts) { t = ts; draw(); if (running) requestAnimationFrame(loop); }
    function start() { if (running || reduce) return; running = true; requestAnimationFrame(loop); }
    function stop() { running = false; }
    size(); seed(); draw();
    window.addEventListener("resize", function () { size(); draw(); });
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; if (visible) start(); else stop(); }).observe(canvas);
    } else start();
    document.addEventListener("visibilitychange", function () { if (document.hidden) stop(); else if (visible) start(); });
  }
  document.querySelectorAll("canvas.road").forEach(function (c) { Road(c); });

  /* pinned journey */
  var journey = document.querySelector(".journey");
  if (journey) {
    var steps = journey.querySelectorAll(".journey-step");
    var dots = journey.querySelectorAll(".journey-dots i");
    var words = journey.querySelectorAll(".journey-words li");
    var orbs = journey.querySelectorAll(".jo");
    var last = -1;
    var update = function () {
      var r = journey.getBoundingClientRect();
      var total = journey.offsetHeight - window.innerHeight;
      var p = Math.min(1, Math.max(0, -r.top / total));
      var idx = Math.min(steps.length - 1, Math.floor(p * steps.length));
      journey.style.setProperty("--p", p.toFixed(3));
      if (idx === last) return;
      last = idx;
      steps.forEach(function (s, i) { s.classList.toggle("on", i === idx); s.setAttribute("aria-hidden", i === idx ? "false" : "true"); });
      dots.forEach(function (d, i) { d.classList.toggle("on", i === idx); });
      words.forEach(function (w, i) { w.classList.toggle("on", i <= idx && idx < steps.length - 1); });
      orbs.forEach(function (o) { o.classList.toggle("on", +o.dataset.stage <= idx && idx < steps.length - 1); });
    };
    window.addEventListener("scroll", update, { passive: true });
    window.addEventListener("resize", update);
    update();
  }

  /* horizontal rails */
  document.querySelectorAll("[data-rail]").forEach(function (wrap) {
    var rail = wrap.querySelector(".rail");
    wrap.querySelectorAll("[data-dir]").forEach(function (b) {
      b.addEventListener("click", function () { rail.scrollBy({ left: +b.dataset.dir * rail.clientWidth * 0.8, behavior: reduce ? "auto" : "smooth" }); });
    });
  });

  /* filters */
  document.querySelectorAll("[data-filter-group]").forEach(function (grp) {
    var target = document.querySelector(grp.dataset.filterGroup);
    var btns = grp.querySelectorAll("button");
    btns.forEach(function (b) {
      b.addEventListener("click", function () {
        btns.forEach(function (x) { x.setAttribute("aria-pressed", x === b ? "true" : "false"); });
        var f = b.dataset.filter;
        target.querySelectorAll("[data-tags]").forEach(function (el) {
          el.hidden = !(f === "*" || el.dataset.tags.split("|").indexOf(f) > -1);
        });
      });
    });
  });

  /* professional gate (medical device advertising law) */
  var gate = document.getElementById("gate");
  if (gate) {
    var KEY = "inview-pro";
    var ok = null;
    try { ok = localStorage.getItem(KEY); } catch (e) {}
    if (ok !== "1") {
      var prev = document.activeElement;
      gate.classList.add("open"); gate.removeAttribute("hidden");
      document.body.style.overflow = "hidden";
      var yes = gate.querySelector("[data-yes]");
      setTimeout(function () { yes && yes.focus(); }, 50);
      yes.addEventListener("click", function () {
        try { localStorage.setItem(KEY, "1"); } catch (e) {}
        gate.classList.remove("open"); document.body.style.overflow = "";
        setTimeout(function () { gate.hidden = true; }, 400);
        if (prev && prev.focus) prev.focus();
      });
      gate.addEventListener("keydown", function (e) {
        if (e.key !== "Tab") return;
        var f = gate.querySelectorAll("a,button"); var first = f[0], lastEl = f[f.length - 1];
        if (e.shiftKey && document.activeElement === first) { e.preventDefault(); lastEl.focus(); }
        else if (!e.shiftKey && document.activeElement === lastEl) { e.preventDefault(); first.focus(); }
      });
    }
  }

  /* contact form → e-mail client */
  var form = document.querySelector("form[data-mailto]");
  if (form) {
    var q = new URLSearchParams(location.search);
    var topic = q.get("temat");
    if (topic && form.subject) form.subject.value = "Zapytanie: " + topic;
    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (!form.reportValidity()) return;
      var body = form.message.value + "\n\n— \n" + form.name.value + (form.org.value ? "\n" + form.org.value : "") + "\n" + form.email.value + (form.phone.value ? "\n" + form.phone.value : "");
      location.href = "mailto:" + form.dataset.mailto + "?subject=" + encodeURIComponent(form.subject.value || "Zapytanie ze strony") + "&body=" + encodeURIComponent(body);
      var s = form.querySelector(".status"); if (s) s.hidden = false;
    });
  }
})();
