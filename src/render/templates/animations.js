// v2 Animation Engine — template-specific entrance animations
// HyperFrames runtime drives playback by seeking the timeline.
//
// IMPORTANT: Only use supported GSAP props: opacity, x, y, scale, scaleX, scaleY, rotation, width, height, visibility.
// Do NOT use `delay:` in vars — use position parameter (3rd arg) instead.
// Do NOT use `attr:` settings. No complex easings.

window.__timelines = window.__timelines || {};
const tl = gsap.timeline({ paused: true });
window.__timelines["news-video"] = tl;

(function () {
  // ── Inject shimmer masks into all .shimmer-sweep-target elements ──────────
  document.querySelectorAll(".shimmer-sweep-target").forEach((el) => {
    if (!el.querySelector(".shimmer-mask")) {
      const mask = document.createElement("div");
      mask.className = "shimmer-mask";
      el.appendChild(mask);
    }
  });

  const stage = document.getElementById("stage");
  const scenes = Array.from(stage.querySelectorAll(".scene"));

  // ── Scene dispatch ──────────────────────────────────────────────────────
  scenes.forEach((scene) => {
    const start = parseFloat(scene.dataset.start);
    const dur   = parseFloat(scene.dataset.duration);
    const layout = scene.dataset.layout;

    // Scene visibility: fade in/out
    tl.set(scene, { opacity: 1 }, start);
    tl.set(scene, { opacity: 0 }, start + dur);

    // Ken Burns animation for scene media (M2)
    const mediaImg = scene.querySelector(".scene-media-img.fx-kenburns");
    if (mediaImg) {
      tl.fromTo(mediaImg, { scale: 1.0, x: 0 }, { scale: 1.15, x: -25, duration: dur, ease: "none" }, start);
    }

    if (layout === "hook") {
      animateHook(scene, tl, start);
    } else if (layout === "comparison") {
      animateComparison(scene, tl, start);
    } else if (layout === "stat-hero") {
      animateStatHero(scene, tl, start);
    } else if (layout === "feature-list") {
      animateFeatureList(scene, tl, start);
    } else if (layout === "callout") {
      animateCallout(scene, tl, start);
    } else if (layout === "outro") {
      animateOutro(scene, tl, start, dur);
    } else if (layout === "spec-table") {
      animateSpecTable(scene, tl, start);
    } else if (layout === "pros-cons") {
      animateProsCons(scene, tl, start);
    } else if (layout === "verdict-score") {
      animateVerdictScore(scene, tl, start);
    } else if (layout === "price-tag") {
      animatePriceTag(scene, tl, start);
    } else if (layout === "image-gallery") {
      animateImageGallery(scene, tl, start);
    } else if (layout === "phone-mockup") {
      animatePhoneMockup(scene, tl, start);
    }
  });

  // ── HOOK ──────────────────────────────────────────────────────────────
  function animateHook(scene, tl, start) {
    const headline = scene.querySelector(".hook-headline");
    if (headline) {
      // Scale pop in
      tl.fromTo(headline, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6 }, start + 0.15);
      // Shimmer sweep after entrance
      const mask = headline.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 1.0 }, start + 0.7);
      }
    }

    const subhead = scene.querySelector(".hook-subhead");
    if (subhead) {
      tl.fromTo(subhead, { y: 60, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, start + 0.55);
    }
  }

  // ── COMPARISON ────────────────────────────────────────────────────────
  function animateComparison(scene, tl, start) {
    const leftCard = scene.querySelector(".cmp-left");
    if (leftCard) {
      tl.fromTo(leftCard, { x: -80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, start + 0.15);
    }

    const vs = scene.querySelector(".cmp-vs");
    if (vs) {
      tl.fromTo(vs, { scale: 0.5, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35 }, start + 0.45);
    }

    const rightCard = scene.querySelector(".cmp-right");
    if (rightCard) {
      tl.fromTo(rightCard, { x: 80, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, start + 0.6);
    }
  }

  // ── STAT HERO ─────────────────────────────────────────────────────────
  function animateStatHero(scene, tl, start) {
    const value = scene.querySelector(".stat-value");
    if (value) {
      tl.fromTo(value, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.6 }, start + 0.15);
      // Shimmer sweep on the stat value
      const mask = value.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 1.0 }, start + 0.7);
      }
    }

    const label = scene.querySelector(".stat-label");
    if (label) {
      tl.fromTo(label, { y: 40, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, start + 0.55);
    }

    const context = scene.querySelector(".stat-context");
    if (context) {
      tl.fromTo(context, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.85);
    }
  }

  // ── FEATURE LIST ──────────────────────────────────────────────────────
  function animateFeatureList(scene, tl, start) {
    const card = scene.querySelector(".feat-card");
    if (card) {
      tl.fromTo(card, { y: 60, scale: 0.95, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5 }, start + 0.1);
    }

    const rule = scene.querySelector(".feat-rule");
    if (rule) {
      tl.fromTo(rule, { scaleX: 0, opacity: 1 }, { scaleX: 1, opacity: 1, duration: 0.4 }, start + 0.45);
    }

    const bullets = scene.querySelectorAll(".feat-bullet");
    bullets.forEach((b, i) => {
      tl.fromTo(b, { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 }, start + 0.6 + i * 0.15);
    });
  }

  // ── CALLOUT ───────────────────────────────────────────────────────────
  function animateCallout(scene, tl, start) {
    const card = scene.querySelector(".callout-card");
    if (card) {
      tl.fromTo(card, { y: 50, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.55 }, start + 0.2);
    }
  }

  // ── OUTRO ─────────────────────────────────────────────────────────────
  function animateOutro(scene, tl, start, dur) {
    const cta = scene.querySelector(".out-cta-top");
    if (cta) {
      tl.fromTo(cta, { opacity: 0, y: -30 }, { opacity: 1, y: 0, duration: 0.45 }, start + 0.2);
    }

    const channel = scene.querySelector(".out-channel");
    if (channel) {
      tl.fromTo(channel, { scale: 0.6, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55 }, start + 0.55);
    }

    const underline = scene.querySelector(".out-underline");
    if (underline) {
      tl.fromTo(underline, { width: 0 }, { width: "600px", duration: 0.5 }, start + 0.9);
    }

    const source = scene.querySelector(".out-source");
    if (source) {
      tl.fromTo(source, { opacity: 0, y: 20 }, { opacity: 1, y: 0, duration: 0.4 }, start + 1.3);
    }

    // ── TikTok follow card animation (last ~3.5s of outro) ──────────────
    // Adapted from HyperFrames `tiktok-follow` block.
    // Card lives inside the outro scene (id="tt-card"); slide up + button click sequence.
    const ttCard = scene.querySelector("#tt-card");
    if (ttCard) {
      const ttBtn      = scene.querySelector("#tt-follow-btn");
      const ttFollow   = scene.querySelector("#tt-btn-follow");
      const ttFollwing = scene.querySelector("#tt-btn-following");
      const ttBase     = start + 1.6;  // start TikTok sequence 1.6s into outro

      // Slide in from bottom + fade in
      tl.fromTo(ttCard,
        { opacity: 0, y: 300 },
        { opacity: 1, y: 0, duration: 0.5 },
        ttBase
      );

      // Button press (scale down)
      if (ttBtn) {
        tl.to(ttBtn, { scale: 0.92, duration: 0.15 }, ttBase + 0.9);
        // Release with slight bounce (use scale up)
        tl.to(ttBtn, { scale: 1, duration: 0.4 }, ttBase + 1.05);
      }

      // Swap "Follow" → "Following" (opacity)
      if (ttFollow) {
        tl.to(ttFollow, { opacity: 0, duration: 0.08 }, ttBase + 1.05);
      }
      if (ttFollwing) {
        tl.to(ttFollwing, { opacity: 1, duration: 0.08 }, ttBase + 1.08);
      }

      // Hold + subtle zoom-in to focus viewer attention on the card.
      // Slow zoom from scale 1 → 1.08 over the remaining outro duration.
      const holdStart = ttBase + 1.3;             // after click animation
      const holdEnd   = start + dur - 0.1;        // ends just before scene ends
      const holdLen   = Math.max(0.5, holdEnd - holdStart);
      tl.to(ttCard, { scale: 1.08, duration: holdLen }, holdStart);
    }
  }

  // ── SPEC TABLE (M3) ───────────────────────────────────────────────────
  function animateSpecTable(scene, tl, start) {
    const header = scene.querySelector(".spec-header");
    if (header) {
      tl.fromTo(header, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.5 }, start + 0.15);
      const mask = header.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 0.9 }, start + 0.65);
      }
    }
    const subtitle = scene.querySelector(".spec-subtitle");
    if (subtitle) {
      tl.fromTo(subtitle, { opacity: 0 }, { opacity: 1, duration: 0.4 }, start + 0.35);
    }
    const rows = scene.querySelectorAll(".spec-row");
    rows.forEach((row, i) => {
      tl.fromTo(row, { x: -40, opacity: 0 }, { x: 0, opacity: 1, duration: 0.4 }, start + 0.5 + i * 0.12);
    });
  }

  // ── PROS CONS (M3) ────────────────────────────────────────────────────
  function animateProsCons(scene, tl, start) {
    const title = scene.querySelector(".pros-cons-title");
    if (title) {
      tl.fromTo(title, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.15);
    }
    const prosCol = scene.querySelector(".pros-col");
    if (prosCol) {
      tl.fromTo(prosCol, { x: -60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, start + 0.3);
    }
    const consCol = scene.querySelector(".cons-col");
    if (consCol) {
      tl.fromTo(consCol, { x: 60, opacity: 0 }, { x: 0, opacity: 1, duration: 0.5 }, start + 0.45);
    }
    const proItems = scene.querySelectorAll(".pro-item");
    proItems.forEach((item, i) => {
      tl.fromTo(item, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35 }, start + 0.55 + i * 0.1);
    });
    const conItems = scene.querySelectorAll(".con-item");
    conItems.forEach((item, i) => {
      tl.fromTo(item, { scale: 0.8, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.35 }, start + 0.7 + i * 0.1);
    });
  }

  // ── VERDICT SCORE (M3) ────────────────────────────────────────────────
  function animateVerdictScore(scene, tl, start) {
    const prod = scene.querySelector(".verdict-product");
    if (prod) {
      tl.fromTo(prod, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.15);
    }
    const badge = scene.querySelector(".verdict-score-badge");
    if (badge) {
      tl.fromTo(badge, { scale: 0.3, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55 }, start + 0.35);
      const mask = badge.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 0.9 }, start + 0.85);
      }
    }
    const tag = scene.querySelector(".verdict-tag");
    if (tag) {
      tl.fromTo(tag, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.95);
    }
    const summary = scene.querySelector(".verdict-summary");
    if (summary) {
      tl.fromTo(summary, { y: 30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.45 }, start + 1.2);
    }
  }

  // ── PRICE TAG (M3) ────────────────────────────────────────────────────
  function animatePriceTag(scene, tl, start) {
    const prod = scene.querySelector(".price-product");
    if (prod) {
      tl.fromTo(prod, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.15);
    }
    const variant = scene.querySelector(".price-variant");
    if (variant) {
      tl.fromTo(variant, { opacity: 0 }, { opacity: 1, duration: 0.35 }, start + 0.35);
    }
    const heroBox = scene.querySelector(".price-hero-box");
    if (heroBox) {
      tl.fromTo(heroBox, { scale: 0.4, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.55 }, start + 0.45);
      const mask = heroBox.querySelector(".shimmer-mask");
      if (mask) {
        tl.fromTo(mask, { x: "-120%" }, { x: "120%", duration: 0.9 }, start + 0.95);
      }
    }
    const note = scene.querySelector(".price-note");
    if (note) {
      tl.fromTo(note, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 1.15);
    }
  }

  // ── IMAGE GALLERY (M3) ────────────────────────────────────────────────
  function animateImageGallery(scene, tl, start) {
    const title = scene.querySelector(".gallery-title");
    if (title) {
      tl.fromTo(title, { y: -20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.15);
    }
    const cards = scene.querySelectorAll(".gallery-card");
    cards.forEach((card, i) => {
      tl.fromTo(card, { y: 50, scale: 0.92, opacity: 0 }, { y: 0, scale: 1, opacity: 1, duration: 0.5 }, start + 0.35 + i * 0.18);
    });
  }

  // ── PHONE MOCKUP (M3) ─────────────────────────────────────────────────
  function animatePhoneMockup(scene, tl, start) {
    const title = scene.querySelector(".mockup-title");
    if (title) {
      tl.fromTo(title, { y: -30, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.15);
    }
    const frame = scene.querySelector(".phone-frame");
    if (frame) {
      tl.fromTo(frame, { y: 150, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6 }, start + 0.35);
    }
    const caption = scene.querySelector(".mockup-caption");
    if (caption) {
      tl.fromTo(caption, { y: 20, opacity: 0 }, { y: 0, opacity: 1, duration: 0.4 }, start + 0.85);
    }
  }

  // ── CAPTIONS ANIMATION (M1) ──────────────────────────────────────────────
  const captionCues = Array.from(stage.querySelectorAll(".caption-cue"));
  captionCues.forEach((cue) => {
    const cueStart = parseFloat(cue.dataset.start);
    const cueDur   = parseFloat(cue.dataset.duration || "1.0");
    const cueEnd   = cueStart + cueDur;

    // Initial cue state: hidden
    tl.set(cue, { opacity: 0, visibility: "hidden" }, 0);
    // Show cue during its active time window
    tl.set(cue, { opacity: 1, visibility: "visible" }, cueStart);
    tl.set(cue, { opacity: 0, visibility: "hidden" }, cueEnd);

    // Word-level highlight
    const words = Array.from(cue.querySelectorAll(".caption-word"));
    words.forEach((w) => {
      const wStart = parseFloat(w.dataset.wordStart || w.dataset.start || "0");
      const wDur   = parseFloat(w.dataset.wordDuration || w.dataset.duration || "0.2");
      const wEnd   = wStart + wDur;
      const highlight = w.querySelector(".word-highlight");

      // Initial word state
      tl.set(w, { scale: 1.0 }, 0);
      if (highlight) tl.set(highlight, { opacity: 0 }, 0);

      // Active word state: scale up and reveal highlight
      tl.set(w, { scale: 1.15 }, wStart);
      if (highlight) tl.set(highlight, { opacity: 1 }, wStart);

      // Finished word state: reset to normal
      tl.set(w, { scale: 1.0 }, wEnd);
      if (highlight) tl.set(highlight, { opacity: 0 }, wEnd);
    });
  });
})();
