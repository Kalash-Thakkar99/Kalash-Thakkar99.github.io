(() => {
  const canvas = document.getElementById('cosmos');
  const ctx = canvas ? canvas.getContext('2d', { alpha: false }) : null;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const staticPage = document.body.classList.contains('static-content-page');
  const mobile = window.matchMedia('(max-width: 820px)').matches;
  const compactLaptop = !mobile && (
    window.matchMedia('(max-width: 1600px)').matches ||
    (window.devicePixelRatio || 1) > 1.25
  );
  const DPR = Math.min(window.devicePixelRatio || 1, mobile ? 1.2 : compactLaptop ? 1.4 : 1.6);

  let w = 0, h = 0;
  let particles = [], hubs = [], filaments = [];
  let mouse = { x: -9999, y: -9999 };
  let scrollRatio = 0;
  const start = performance.now();

  const lateCosmicImage = new Image();
  lateCosmicImage.decoding = 'async';
  lateCosmicImage.src = 'cosmic-final-optimized.jpg?v=1.4.2';

  const clamp01 = n => Math.max(0, Math.min(1, n));
  const mix = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, x) => {
    const t = clamp01((x - a) / (b - a));
    return t * t * (3 - 2 * t);
  };
  const mixRgb = (a, b, t) => a.map((v, i) => Math.round(mix(v, b[i], t)));
  const rgba = (rgb, a) => `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${a})`;
  const rand = (min = 0, max = 1) => min + Math.random() * (max - min);
  const gaussish = () => (Math.random() + Math.random() + Math.random() + Math.random() - 2) / 2;

  function phaseColor(t) {
    const stops = [
      [5, 5, 7],
      [58, 30, 15],
      [31, 25, 18],
      [18, 30, 52],
      [5, 8, 16],
      [5, 5, 7]
    ];
    const scaled = clamp01(t) * (stops.length - 1);
    const i = Math.min(stops.length - 2, Math.floor(scaled));
    const f = scaled - i;
    return mixRgb(stops[i], stops[i + 1], f);
  }

  function organicBiasPoint() {
    const x = (0.14 + Math.pow(Math.random(), 0.88) * 0.72) * w;
    const y = (0.12 + Math.pow(Math.random(), 1.02) * 0.72) * h;
    return { x, y };
  }

  function filamentCurve(a, b, seedTime = 0, idx = 0) {
    const mx = (a.x + b.x) * 0.5;
    const my = (a.y + b.y) * 0.5;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const bendBase = (Math.sin(idx * 1.71) * 0.5 + 0.5) * 2 - 1;
    const bend = len * (0.06 + 0.08 * ((idx * 0.37) % 1)) * bendBase;
    const wobble = Math.sin(seedTime * 0.00011 + idx * 0.87) * len * 0.015;
    return {
      cx: mx + nx * (bend + wobble),
      cy: my + ny * (bend + wobble)
    };
  }

  function setupStructure() {
    hubs = [];
    filaments = [];

    const target = Math.max(12, Math.min(18, Math.floor((w + h) / 190)));
    const minDist = Math.min(w, h) * 0.105;
    let attempts = 0;

    while (hubs.length < target && attempts < target * 70) {
      attempts += 1;
      const p = organicBiasPoint();
      const ok = hubs.every(h => Math.hypot(h.x - p.x, h.y - p.y) > minDist * rand(0.9, 1.18));
      if (!ok) continue;
      hubs.push({
        x: p.x,
        y: p.y,
        r: rand(30, 72),
        flatten: rand(0.52, 0.92),
        rotation: rand(0, Math.PI * 2),
        density: rand(0.8, 1.35),
        drift: rand(-1, 1)
      });
    }

    // Guarantee at least a few hubs even on narrow screens.
    if (hubs.length < 8) {
      for (let i = hubs.length; i < 8; i++) {
        hubs.push({
          x: rand(w * 0.14, w * 0.86),
          y: rand(h * 0.16, h * 0.84),
          r: rand(28, 66),
          flatten: rand(0.55, 0.9),
          rotation: rand(0, Math.PI * 2),
          density: rand(0.85, 1.3),
          drift: rand(-1, 1)
        });
      }
    }

    // Connect hubs organically: nearest-neighbor web + a few long bridges.
    const edgeSet = new Set();
    const pushEdge = (i, j) => {
      if (i === j) return;
      const a = Math.min(i, j), b = Math.max(i, j);
      const key = `${a}-${b}`;
      if (!edgeSet.has(key)) {
        edgeSet.add(key);
        filaments.push([a, b]);
      }
    };

    hubs.forEach((hub, i) => {
      const neighbors = hubs
        .map((other, j) => ({ j, d: j === i ? Infinity : Math.hypot(other.x - hub.x, other.y - hub.y) }))
        .sort((a, b) => a.d - b.d);
      const localCount = 3 + (i % 2 === 0 ? 1 : 0);
      neighbors.slice(0, localCount).forEach(n => pushEdge(i, n.j));
      const bridge = neighbors[Math.min(neighbors.length - 1, 5 + (i % 3))];
      if (bridge && bridge.d < Math.min(w, h) * 0.58) pushEdge(i, bridge.j);
    });

    // Build a loose backbone from left to right so the web spans the page.
    const order = hubs.map((_, i) => i).sort((a, b) => hubs[a].x - hubs[b].x);
    for (let i = 0; i < order.length - 1; i++) {
      pushEdge(order[i], order[i + 1]);
      if (i + 2 < order.length && i % 2 === 0) pushEdge(order[i], order[i + 2]);
    }
  }

  function createParticles() {
    const baseCount = Math.max(190, Math.min(360, Math.floor(w * h / 5200)));
    const count = mobile
      ? Math.round(baseCount * 0.55)
      : compactLaptop
        ? Math.round(baseCount * 0.72)
        : baseCount;
    particles = Array.from({ length: count }, (_, i) => {
      const typeSeed = Math.random();
      const segmentIndex = Math.floor(Math.random() * filaments.length);
      const hubIndex = Math.floor(Math.random() * hubs.length);
      const explodeRadius = rand(Math.min(w, h) * 0.18, Math.max(w, h) * 0.78);
      return {
        seed: Math.random() * 1000 + i,
        angle: Math.random() * Math.PI * 2,
        angleDrift: rand(-0.38, 0.38),
        explodeRadius,
        explodeBias: rand(0.48, 1.45),
        size: rand(0.55, 1.95),
        glow: rand(0.6, 1.6),
        twinkle: rand(0.6, 1.5),
        orbitAngle: Math.random() * Math.PI * 2,
        orbitRadius: rand(12, 118),
        orbitDir: Math.random() > 0.5 ? 1 : -1,
        hubIndex,
        segmentIndex,
        segmentT: Math.random(),
        offset: gaussish() * 32,
        type: typeSeed < 0.58 ? 'filament' : typeSeed < 0.92 ? 'halo' : 'field',
        fieldX: Math.random() * w,
        fieldY: Math.random() * h
      };
    });
  }

  function resize() {
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * DPR);
    canvas.height = Math.floor(h * DPR);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);

    setupStructure();
    createParticles();
  }

  function getFilamentPoint(edgeIndex, t, offset = 0, time = 0) {
    const [ia, ib] = filaments[edgeIndex];
    const a = hubs[ia];
    const b = hubs[ib];
    const curve = filamentCurve(a, b, time, edgeIndex);
    const omt = 1 - t;
    const x = omt * omt * a.x + 2 * omt * t * curve.cx + t * t * b.x;
    const y = omt * omt * a.y + 2 * omt * t * curve.cy + t * t * b.y;

    const dx = 2 * omt * (curve.cx - a.x) + 2 * t * (b.x - curve.cx);
    const dy = 2 * omt * (curve.cy - a.y) + 2 * t * (b.y - curve.cy);
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const wave = Math.sin(time * 0.0002 + edgeIndex * 1.37 + t * 6.2 + offset * 0.02) * 5;
    return { x: x + nx * (offset + wave), y: y + ny * (offset + wave) };
  }

  function getLateTarget(p, time) {
    if (p.type === 'halo') {
      const hub = hubs[p.hubIndex];
      const ang = p.orbitAngle + time * 0.00006 * p.orbitDir + p.seed * 0.001;
      const breathe = 1 + 0.11 * Math.sin(time * 0.00025 + p.seed);
      const rx = p.orbitRadius * (1.1 + hub.density * 0.18) * breathe;
      const ry = p.orbitRadius * hub.flatten * breathe;
      const cosR = Math.cos(hub.rotation), sinR = Math.sin(hub.rotation);
      const localX = Math.cos(ang) * rx;
      const localY = Math.sin(ang) * ry;
      return {
        x: hub.x + localX * cosR - localY * sinR,
        y: hub.y + localX * sinR + localY * cosR
      };
    }
    if (p.type === 'filament') {
      const t = clamp01(p.segmentT + Math.sin(time * 0.00011 + p.seed) * 0.015);
      return getFilamentPoint(p.segmentIndex, t, p.offset, time);
    }
    return {
      x: p.fieldX + Math.sin(time * 0.00008 + p.seed) * 8,
      y: p.fieldY + Math.cos(time * 0.00006 + p.seed * 1.4) * 6
    };
  }

  function getFormationTarget(p, time) {
    // Transitional state: density fluctuations begin to clump, halos start
    // to emerge, and filaments are hinted at but remain broad and messy.
    if (p.type === 'halo') {
      const hub = hubs[p.hubIndex];
      const ang = p.orbitAngle + time * 0.00012 * p.orbitDir + p.seed * 0.0016;
      const breathe = 1 + 0.18 * Math.sin(time * 0.00042 + p.seed * 0.7);
      const rx = p.orbitRadius * (1.75 + hub.density * 0.28) * breathe;
      const ry = p.orbitRadius * (1.28 + hub.flatten * 0.24) * breathe;
      const cosR = Math.cos(hub.rotation), sinR = Math.sin(hub.rotation);
      const localX = Math.cos(ang) * rx;
      const localY = Math.sin(ang) * ry;
      return {
        x: hub.x + localX * cosR - localY * sinR + Math.sin(time * 0.00016 + p.seed) * 10,
        y: hub.y + localX * sinR + localY * cosR + Math.cos(time * 0.00014 + p.seed * 1.2) * 8
      };
    }

    if (p.type === 'filament') {
      const t = clamp01(
        p.segmentT +
        Math.sin(time * 0.00018 + p.seed) * 0.035 +
        Math.cos(p.seed * 0.21) * 0.03
      );
      const broad = getFilamentPoint(p.segmentIndex, t, p.offset * 1.75, time);
      const [ia, ib] = filaments[p.segmentIndex];
      const a = hubs[ia];
      const b = hubs[ib];
      const pull = 0.3 + 0.2 * Math.sin(time * 0.00009 + p.seed);
      return {
        x: mix(broad.x, (a.x + b.x) * 0.5, pull),
        y: mix(broad.y, (a.y + b.y) * 0.5, pull)
      };
    }

    const hub = hubs[p.hubIndex];
    return {
      x: mix(p.fieldX, hub.x, 0.46) + Math.sin(time * 0.00011 + p.seed) * 18,
      y: mix(p.fieldY, hub.y, 0.46) + Math.cos(time * 0.00009 + p.seed * 1.7) * 15
    };
  }

  function getExplosionPoint(p, bangP, time) {
    const originX = w * 0.5;
    const originY = h * 0.44;
    const pulse = 0.96 + 0.06 * Math.sin(time * 0.0015 + p.seed * 1.9);
    const angle = p.angle + p.angleDrift * bangP + Math.sin(time * 0.0007 + p.seed) * 0.025;
    const radius = p.explodeRadius * Math.pow(Math.max(bangP, 0.02), 1.18) * p.explodeBias * pulse;
    const turbulence = (1 - bangP) * 8 + Math.sin(time * 0.001 + p.seed * 2.6) * 2.5;
    return {
      x: originX + Math.cos(angle) * radius + Math.cos(angle * 3 + p.seed) * turbulence,
      y: originY + Math.sin(angle) * radius + Math.sin(angle * 2 + p.seed) * turbulence * 0.78
    };
  }


  function drawWaveRipple(x, y, baseRadius, phase, alpha, bg) {
    const steps = mobile ? 40 : compactLaptop ? 56 : 72;
    const eccentricity = 1 + Math.sin(phase * 0.33) * 0.018;

    ctx.beginPath();
    for (let i = 0; i <= steps; i++) {
      const a = (i / steps) * Math.PI * 2;
      const ripple =
        Math.sin(a * 3 + phase) * baseRadius * 0.020 +
        Math.sin(a * 5 - phase * 0.7) * baseRadius * 0.013 +
        Math.sin(a * 8 + phase * 1.12) * baseRadius * 0.006;
      const r = baseRadius + ripple;
      const px = x + Math.cos(a) * r;
      const py = y + Math.sin(a) * r * eccentricity;
      if (i === 0) ctx.moveTo(px, py);
      else ctx.lineTo(px, py);
    }

    ctx.strokeStyle = `rgba(${Math.min(255, bg[0] + 185)}, ${Math.min(255, bg[1] + 135)}, 92, ${alpha})`;
    ctx.lineWidth = 1.15;
    ctx.stroke();
  }

  function drawLateCosmicImage(imageP) {
    if (imageP <= 0.01 || !lateCosmicImage.complete || !lateCosmicImage.naturalWidth) return;

    const iw = lateCosmicImage.naturalWidth;
    const ih = lateCosmicImage.naturalHeight;
    const scale = Math.max(w / iw, h / ih) * (1.02 + imageP * 0.05);
    const dw = iw * scale;
    const dh = ih * scale;
    const dx = (w - dw) / 2 - imageP * w * 0.018;
    const dy = (h - dh) / 2;

    ctx.save();
    ctx.globalAlpha = 0.08 + imageP * 0.48;
    ctx.drawImage(lateCosmicImage, dx, dy + imageP * h * 0.012, dw, dh);

    // Stronger dark wash so the image reads as atmosphere, not a poster.
    const wash = ctx.createLinearGradient(0, 0, w, 0);
    wash.addColorStop(0, `rgba(4,6,10,${0.24 + imageP * 0.10})`);
    wash.addColorStop(.45, `rgba(4,6,10,${0.16 + imageP * 0.08})`);
    wash.addColorStop(1, `rgba(4,6,10,${0.30 + imageP * 0.18})`);
    ctx.fillStyle = wash;
    ctx.fillRect(0, 0, w, h);

    // Vignette to keep the image integrated with the cinematic background
    const vignette = ctx.createRadialGradient(w * .5, h * .46, h * .06, w * .5, h * .46, Math.max(w, h) * .72);
    vignette.addColorStop(0, 'rgba(0,0,0,0)');
    vignette.addColorStop(.72, `rgba(0,0,0,${0.04 + imageP * 0.08})`);
    vignette.addColorStop(1, `rgba(0,0,0,${0.20 + imageP * 0.18})`);
    ctx.fillStyle = vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawBigBangCore(time, bangP, blendP, structureP, bg) {
    const x = w * 0.5;
    const y = h * 0.44;
    const minSide = Math.min(w, h);
    const fade = 1 - structureP * 0.78;

    const ambient = ctx.createRadialGradient(x, y, 0, x, y, minSide * 0.72);
    ambient.addColorStop(0, `rgba(255,244,216,${(0.21 + (1 - blendP) * 0.18) * fade})`);
    ambient.addColorStop(0.18, `rgba(247,231,195,${(0.16 + (1 - blendP) * 0.14) * fade})`);
    ambient.addColorStop(0.42, `rgba(216,154,69,${(0.12 + (1 - blendP) * 0.10) * fade})`);
    ambient.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = ambient;
    ctx.fillRect(0, 0, w, h);

    const coreRadius = minSide * (0.038 + bangP * 0.145) * fade;
    const core = ctx.createRadialGradient(x, y, 0, x, y, coreRadius * 2.5);
    core.addColorStop(0, `rgba(255,246,223,${(1.05 - blendP * 0.32) * fade})`);
    core.addColorStop(0.2, `rgba(247,231,195,${(0.68 - blendP * 0.14) * fade})`);
    core.addColorStop(0.55, `rgba(216,154,69,${(0.32 - blendP * 0.08) * fade})`);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.arc(x, y, coreRadius * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Diffuse particulate shell around the blast: many soft points, no vector trails.
    const dustCount = mobile ? 18 : compactLaptop ? 24 : 34;
    for (let i = 0; i < dustCount; i++) {
      const seed = i * 12.9898;
      const phase = ((time * 0.000045) + (i / dustCount)) % 1;
      const angle = i * 2.3999632297 + Math.sin(seed) * .45;
      const rr = minSide * (0.055 + phase * (0.16 + bangP * 0.46));
      const px = x + Math.cos(angle) * rr;
      const py = y + Math.sin(angle) * rr;
      const dustAlpha = (1 - phase) * (1 - blendP * .82) * fade * .16;
      const dustR = 0.55 + (i % 4) * .22;
      drawParticleGlow(px, py, dustR, dustAlpha * .55, true);
      ctx.fillStyle = `rgba(255,238,205,${dustAlpha})`;
      ctx.beginPath();
      ctx.arc(px, py, dustR, 0, Math.PI * 2);
      ctx.fill();
    }

    const waves = 7;
    for (let i = 0; i < waves; i++) {
      const cycle = ((time * 0.00008) + i * 0.26) % 1;
      const radius = minSide * (0.03 + cycle * (0.12 + bangP * 0.68));
      const alpha = (1 - cycle) * (0.28 + bangP * 0.22) * (1 - blendP * 0.76) * fade;

      if (!mobile && !compactLaptop) {
        ctx.save();
        ctx.filter = `blur(${Math.max(0, 1.8 - cycle * 1.1)}px)`;
        drawWaveRipple(x, y, radius, time * 0.0014 + i * 0.9, alpha * 0.45, bg);
        ctx.restore();
      }

      drawWaveRipple(x, y, radius, time * 0.0014 + i * 0.9, alpha, bg);
    }
  }


  function drawGalaxy(x, y, size, rotation, alpha, warmth = 0) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(rotation);

    const halo = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 3.3);
    halo.addColorStop(0, `rgba(${warmth > .5 ? '255,225,188' : '213,229,255'}, ${alpha * .42})`);
    halo.addColorStop(.28, `rgba(${warmth > .5 ? '224,174,118' : '122,159,211'}, ${alpha * .18})`);
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 3.4, size * 2.2, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(${warmth > .5 ? '250,231,205' : '225,236,252'}, ${alpha})`;
    ctx.beginPath();
    ctx.ellipse(0, 0, size * 1.45, size * .5, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = `rgba(255,246,224,${alpha * .92})`;
    ctx.beginPath();
    ctx.arc(0, 0, Math.max(.45, size * .32), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawFormationBackground(time, structureP) {
    if (structureP <= 0.02) return;

    const formationP = smoothstep(0.24, 0.52, scrollRatio);
    const protoFilamentP = smoothstep(0.30, 0.60, scrollRatio);

    // Broad density field clumps: this is the "something is happening" phase.
    const fogCenters = [
      [0.22, 0.34, 0.20],
      [0.48, 0.56, 0.24],
      [0.72, 0.42, 0.22],
      [0.34, 0.72, 0.18],
      [0.82, 0.70, 0.17]
    ];

    fogCenters.forEach((f, i) => {
      const fx = w * f[0] + Math.sin(time * 0.00005 + i * 1.8) * 26;
      const fy = h * f[1] + Math.cos(time * 0.000045 + i * 1.2) * 20;
      const fr = Math.min(w, h) * f[2] * (1 + 0.08 * Math.sin(time * 0.00012 + i));
      const fog = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      fog.addColorStop(0, `rgba(128, 154, 198, ${0.022 * formationP + 0.015 * structureP})`);
      fog.addColorStop(.3, `rgba(88, 116, 165, ${0.016 * formationP + 0.009 * structureP})`);
      fog.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
    });

    // Proto-filaments: faint, broad, and not yet a mature web.
    filaments.forEach(([ia, ib], idx) => {
      if ((mobile || compactLaptop) && idx % 2 === 1) return;
      const a = hubs[ia];
      const b = hubs[ib];
      const curve = filamentCurve(a, b, time * 0.58, idx);

      ctx.lineCap = 'round';
      ctx.strokeStyle = `rgba(82, 118, 178, ${0.045 * protoFilamentP})`;
      ctx.lineWidth = 10 + 8 * protoFilamentP;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(curve.cx, curve.cy, b.x, b.y);
      ctx.stroke();

      ctx.strokeStyle = `rgba(188, 210, 240, ${0.02 * protoFilamentP})`;
      ctx.lineWidth = 2.5;
      ctx.beginPath();
      ctx.moveTo(a.x, a.y);
      ctx.quadraticCurveTo(curve.cx, curve.cy, b.x, b.y);
      ctx.stroke();

      // Small moving knotlets along the future filaments.
      const knotCount = 2 + (idx % 2);
      for (let k = 0; k < knotCount; k++) {
        const t = clamp01((k + 1) / (knotCount + 1) + Math.sin(time * 0.00011 + idx + k) * 0.035);
        const p = getFilamentPoint(idx, t, Math.sin(idx * 1.3 + k) * 18, time);
        const rr = 10 + (k % 2) * 8;
        const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
        rg.addColorStop(0, `rgba(208, 224, 248, ${0.045 * formationP})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Proto-halos: clumps are larger and looser than the final clusters.
    hubs.forEach((hub, i) => {
      const grow = 1 + 0.08 * Math.sin(time * 0.00016 + i * 1.17);
      const outerR = hub.r * (1.15 + formationP * 0.7) * grow;
      const glow = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, outerR);
      glow.addColorStop(0, `rgba(222, 233, 255, ${0.028 * formationP})`);
      glow.addColorStop(.18, `rgba(118, 156, 212, ${0.04 * formationP})`);
      glow.addColorStop(.5, `rgba(48, 78, 126, ${0.022 * formationP})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, outerR, 0, Math.PI * 2);
      ctx.fill();

      const protoMembers = Math.round((5 + hub.r * 0.12) * hub.density + 8 * formationP);
      const cosR = Math.cos(hub.rotation), sinR = Math.sin(hub.rotation);
      for (let m = 0; m < protoMembers; m++) {
        const ang = m * 2.3999632297 + i * 0.73;
        const rr = hub.r * (0.24 + ((m * 0.618) % 1) * (1.4 + formationP * 0.28));
        const localX = Math.cos(ang) * rr;
        const localY = Math.sin(ang) * rr * (hub.flatten * 1.08);
        const gx = hub.x + localX * cosR - localY * sinR + Math.sin(time * 0.0001 + m) * 1.2;
        const gy = hub.y + localX * sinR + localY * cosR + Math.cos(time * 0.0001 + m) * 1.2;
        ctx.fillStyle = `rgba(210, 225, 246, ${0.06 * formationP})`;
        ctx.beginPath();
        ctx.arc(gx, gy, 0.5 + ((m * 0.37) % 1) * 1.0, 0, Math.PI * 2);
        ctx.fill();
      }
    });
  }

  function drawStructureBackground(time, structureP) {
    if (structureP <= 0.03) return;

    const lateP = smoothstep(0.44, 0.9, scrollRatio);
    const cinematicP = smoothstep(0.34, 0.8, scrollRatio);

    // Large, low-frequency density fog. This gives the web volume without
    // turning it into a clean graph/network illustration.
    const fogCenters = [
      [0.18, 0.38, 0.22, '68,94,142'],
      [0.42, 0.62, 0.28, '55,84,131'],
      [0.70, 0.34, 0.25, '76,112,164'],
      [0.82, 0.72, 0.23, '59,88,135'],
      [0.53, 0.45, 0.18, '146,111,77']
    ];
    fogCenters.forEach((f, i) => {
      const fx = w * f[0] + Math.sin(time * 0.000035 + i) * 18;
      const fy = h * f[1] + Math.cos(time * 0.00003 + i * 1.7) * 14;
      const fr = Math.min(w, h) * f[2];
      const fog = ctx.createRadialGradient(fx, fy, 0, fx, fy, fr);
      fog.addColorStop(0, `rgba(${f[3]}, ${0.018 * structureP + 0.018 * cinematicP})`);
      fog.addColorStop(.4, `rgba(${f[3]}, ${0.012 * structureP})`);
      fog.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.arc(fx, fy, fr, 0, Math.PI * 2);
      ctx.fill();
    });

    // Multi-pass filaments: broad diffuse matter first, then a narrower luminous spine.
    // Slightly offset passes keep the web irregular and simulation-like.
    filaments.forEach(([ia, ib], idx) => {
      const a = hubs[ia];
      const b = hubs[ib];
      const curve = filamentCurve(a, b, time * 0.62, idx);

      const passCount = mobile ? 2 : compactLaptop ? 2 : 3;
      for (let pass = 0; pass < passCount; pass++) {
        const offset = (pass - 1.5) * (6 + (idx % 4) * 1.8);
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) || 1;
        const nx = -dy / len, ny = dx / len;

        const ax = a.x + nx * offset;
        const ay = a.y + ny * offset;
        const bx = b.x + nx * offset;
        const by = b.y + ny * offset;
        const cx = curve.cx + nx * offset * 1.15;
        const cy = curve.cy + ny * offset * 1.15;

        ctx.lineCap = 'round';

        ctx.strokeStyle = `rgba(44, 70, 109, ${0.032 * structureP + 0.02 * lateP})`;
        ctx.lineWidth = 16 + pass * 3.2 + 10 * lateP;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx, cy, bx, by);
        ctx.stroke();

        ctx.strokeStyle = `rgba(91, 128, 180, ${0.072 * structureP + 0.035 * lateP})`;
        ctx.lineWidth = 1.25 + pass * .35 + lateP * .7;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(cx, cy, bx, by);
        ctx.stroke();
      }

      // Knotty overdensities along the filament, not evenly spaced.
      const knots = 3 + (idx % 3);
      for (let k = 0; k < knots; k++) {
        const baseT = (k + 1) / (knots + 1);
        const t = clamp01(baseT + Math.sin(idx * 2.1 + k * 1.7) * .045);
        const p = getFilamentPoint(idx, t, Math.sin(k + idx) * 12, time);
        const rr = 15 + ((idx * 17 + k * 13) % 22) + lateP * 14;
        const rg = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, rr);
        rg.addColorStop(0, `rgba(176, 205, 240, ${0.035 * structureP + 0.015 * lateP})`);
        rg.addColorStop(.3, `rgba(91, 129, 183, ${0.028 * structureP})`);
        rg.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(p.x, p.y, rr, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Irregular galaxy clusters with different masses, shapes and galaxy populations.
    hubs.forEach((hub, i) => {
      const breathing = 1 + Math.sin(time * 0.00016 + i * 1.23) * 0.025;
      const outerR = hub.r * (1.9 + lateP * 1.0) * breathing;

      const glow = ctx.createRadialGradient(hub.x, hub.y, 0, hub.x, hub.y, outerR);
      glow.addColorStop(0, `rgba(219, 232, 255, ${0.045 * structureP + 0.048 * lateP})`);
      glow.addColorStop(.11, `rgba(113, 155, 214, ${0.065 * structureP + 0.05 * lateP})`);
      glow.addColorStop(.34, `rgba(55, 90, 139, ${0.05 * structureP})`);
      glow.addColorStop(.72, `rgba(26, 48, 82, ${0.02 * structureP})`);
      glow.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = glow;
      ctx.beginPath();
      ctx.arc(hub.x, hub.y, outerR, 0, Math.PI * 2);
      ctx.fill();

      const members = Math.round((11 + hub.r * .22) * hub.density + 18 * lateP);
      const cosR = Math.cos(hub.rotation), sinR = Math.sin(hub.rotation);

      for (let m = 0; m < members; m++) {
        const phi = m * 2.3999632297 + i * .91;
        const frac = ((m * .61803398875 + i * .137) % 1);
        const rr = hub.r * (.16 + frac * (1.1 + lateP * .48));
        const lX = Math.cos(phi) * rr;
        const lY = Math.sin(phi) * rr * hub.flatten;
        const gx = hub.x + lX * cosR - lY * sinR;
        const gy = hub.y + lX * sinR + lY * cosR;

        const lum = .48 + ((m * .37 + i * .21) % 1) * 1.1;
        const alpha = (.07 + .17 * lateP) * structureP;
        const warm = ((m + i * 2) % 7 === 0) ? 1 : 0;

        if (lateP > .48 && m % 5 === 0) {
          drawGalaxy(gx, gy, lum * .95, hub.rotation + phi * .2, alpha * 1.6, warm);
        } else {
          ctx.fillStyle = `rgba(${warm ? '236,209,174' : '201,221,246'}, ${alpha})`;
          ctx.beginPath();
          ctx.arc(gx, gy, .45 + lum * .58, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Brightest cluster galaxy / central concentration.
      if (lateP > .25) {
        drawGalaxy(
          hub.x,
          hub.y,
          1.15 + hub.r * .018,
          hub.rotation,
          (.16 + .13 * lateP) * structureP,
          i % 3 === 0 ? 1 : 0
        );
      } else {
        ctx.fillStyle = `rgba(247,240,220, ${0.15 * structureP})`;
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, 1.6 + hub.r * .008, 0, Math.PI * 2);
        ctx.fill();
      }
    });

    // Very faint cinematic lensing-like arcs in the latest phase.
    if (lateP > .55) {
      ctx.save();
      ctx.globalAlpha = .08 * lateP;
      ctx.strokeStyle = 'rgba(168,197,233,.22)';
      ctx.lineWidth = .7;
      hubs.slice(0, 4).forEach((hub, i) => {
        ctx.beginPath();
        ctx.arc(hub.x, hub.y, hub.r * (1.7 + i * .17), .35 + i * .55, 1.7 + i * .62);
        ctx.stroke();
      });
      ctx.restore();
    }
  }


  function drawParticleGlow(x, y, radius, alpha, warm = true) {
    const glowR = Math.max(4, radius * 5.5);
    const g = ctx.createRadialGradient(x, y, 0, x, y, glowR);
    if (warm) {
      g.addColorStop(0, `rgba(255,246,223,${alpha})`);
      g.addColorStop(.28, `rgba(247,221,174,${alpha * .45})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
    } else {
      g.addColorStop(0, `rgba(218,232,255,${alpha})`);
      g.addColorStop(.3, `rgba(134,169,219,${alpha * .34})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
    }
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, glowR, 0, Math.PI * 2);
    ctx.fill();
  }

  let lastFrame = 0;

  function draw(now = performance.now()) {
    const targetFps = mobile ? 30 : compactLaptop ? 40 : 50;
    const targetFrameMs = 1000 / targetFps;
    if (!reduced && now - lastFrame < targetFrameMs) {
      requestAnimationFrame(draw);
      return;
    }
    lastFrame = now;
    const time = now - start;
    const bg = phaseColor(scrollRatio);
    ctx.fillStyle = `rgb(${bg[0]},${bg[1]},${bg[2]})`;
    ctx.fillRect(0, 0, w, h);

    const bangP = smoothstep(0, 0.18, scrollRatio + 0.045);
    const blendP = smoothstep(0.12, 0.42, scrollRatio);
    const structureP = smoothstep(0.22, 0.62, scrollRatio);
    const formationP = smoothstep(0.24, 0.52, scrollRatio);
    const matureP = smoothstep(0.48, 0.84, scrollRatio);
    const imageP = smoothstep(0.64, 0.92, scrollRatio);
    const coolP = smoothstep(0.18, 0.6, scrollRatio);

    drawBigBangCore(time, bangP, blendP, structureP, bg);
    drawFormationBackground(time, structureP);
    drawStructureBackground(time, structureP * matureP * (1 - imageP * 0.88));
    drawLateCosmicImage(imageP);

    const warmColor = [247, 231, 195];
    const coolColor = [173, 201, 232];
    const fieldColor = mixRgb(warmColor, coolColor, coolP);

    for (const p of particles) {
      const early = getExplosionPoint(p, bangP, time);
      const formation = getFormationTarget(p, time);
      const mature = getLateTarget(p, time);
      const stage = {
        x: mix(formation.x, mature.x, matureP),
        y: mix(formation.y, mature.y, matureP)
      };
      const x = mix(early.x, stage.x, blendP);
      const y = mix(early.y, stage.y, blendP);

      p.x = x;
      p.y = y;

      const lateP = smoothstep(0.46, 0.88, scrollRatio);


      // Very subtle late mouse interaction only.
      const distMouse = Math.hypot(x - mouse.x, y - mouse.y);
      if (structureP > 0.45 && distMouse < 85) {
        const mouseAlpha = (1 - distMouse / 85) * 0.03 * (1 - lateP * 0.75);
        ctx.strokeStyle = `rgba(216,154,69, ${mouseAlpha})`;
        ctx.lineWidth = 0.45;
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(mouse.x, mouse.y);
        ctx.stroke();
      }

      const twinkle = 0.82 + 0.18 * Math.sin(time * 0.001 * p.twinkle + p.seed);
      const formationActivity = smoothstep(0.24, 0.5, scrollRatio) * (1 - smoothstep(0.52, 0.74, scrollRatio));
      const finalImageP = smoothstep(0.64, 0.92, scrollRatio);
      const alpha = (blendP < 0.4 ? 0.48 : 0.22) + p.glow * 0.06 + structureP * 0.05 + formationActivity * 0.08;
      const radius = p.size * (
        blendP < 0.28
          ? 1.08 + bangP * 0.92
          : 0.74 + 0.16 * (1 - lateP) + formationActivity * 0.15
      );
      const fadePoint = (1 - lateP * 0.55) * (1 - finalImageP * 0.38);

      // Early-universe particles glow rather than carrying vector-like tails.
      if (blendP < 0.34 && (Math.floor(p.seed) % (mobile ? 4 : compactLaptop ? 3 : 2) === 0)) {
        const burstGlow = (1 - blendP / 0.34) * (0.09 + p.glow * 0.03);
        drawParticleGlow(x, y, radius, burstGlow * twinkle, true);
      }

      // During structure formation, add cool diffuse halos so the middle phase
      // visibly evolves instead of feeling empty.
      const formationHalo = smoothstep(0.24, 0.50, scrollRatio) * (1 - smoothstep(0.56, 0.78, scrollRatio));
      if (
        formationHalo > 0.02 &&
        p.type !== 'field' &&
        Math.floor(p.seed) % (mobile ? 5 : compactLaptop ? 4 : 3) === 0
      ) {
        drawParticleGlow(x, y, radius * 0.9, (0.028 + p.glow * 0.012) * formationHalo * twinkle, false);
      }

      ctx.fillStyle = rgba(fieldColor, Math.min(0.9, alpha * twinkle * fadePoint));
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.fill();
    }

    if (!reduced && !document.hidden) requestAnimationFrame(draw);
  }

  document.addEventListener('visibilitychange', () => {
    if (!staticPage && canvas && ctx && !reduced && !document.hidden) {
      lastFrame = performance.now();
      requestAnimationFrame(draw);
    }
  });

  const scrollPops = [...document.querySelectorAll('[data-scroll-pop]')];
  const equationPops = [...document.querySelectorAll('[data-equation-pop]')];

  function updateScrollPops() {
    if (!scrollPops.length || reduced) return;
    const vh = Math.max(1, innerHeight);
    scrollPops.forEach(el => {
      const host = el.closest('section') || el;
      const rect = host.getBoundingClientRect();
      const progress = clamp01((vh - rect.top) / (vh + rect.height));
      const enter = smoothstep(.08, .38, progress);
      const exit = smoothstep(.72, .96, progress);
      const opacity = enter * (1 - exit);
      const y = (1 - enter) * 58 - exit * 30;
      const scale = .94 + enter * .06 - exit * .018;
      const blur = (1 - enter) * 9 + exit * 3.5;
      el.style.setProperty('--pop-opacity', opacity.toFixed(3));
      el.style.setProperty('--pop-y', `${y.toFixed(1)}px`);
      el.style.setProperty('--pop-scale', scale.toFixed(4));
      el.style.setProperty('--pop-blur', `${blur.toFixed(2)}px`);
    });
  }

  function updateEquationPops() {
    if (!equationPops.length || reduced) return;
    const vh = Math.max(1, innerHeight);
    equationPops.forEach(el => {
      const rect = el.getBoundingClientRect();
      const center = rect.top + rect.height / 2;
      const distance = Math.abs(center - vh * .52);
      const proximity = 1 - clamp01(distance / (vh * .62));
      const eased = proximity * proximity * (3 - 2 * proximity);
      const opacity = .05 + eased * .58;
      const y = (1 - eased) * 18 - eased * 2;
      const scale = .985 + eased * .015;
      const blur = (1 - eased) * 4.2 + .2;
      el.style.setProperty('--eq-opacity', opacity.toFixed(3));
      el.style.setProperty('--eq-y', `${y.toFixed(1)}px`);
      el.style.setProperty('--eq-scale', scale.toFixed(4));
      el.style.setProperty('--eq-blur', `${blur.toFixed(2)}px`);
    });
  }

  function updateScroll() {
    const max = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    scrollRatio = clamp01(scrollY / max);
    const progress = document.getElementById('epoch-progress');
    if (progress) progress.style.height = `${scrollRatio * 100}%`;
    updateScrollPops();
    updateEquationPops();
  }

  if (!staticPage && canvas && ctx) {
    window.addEventListener('resize', resize, { passive: true });
    window.addEventListener('scroll', updateScroll, { passive: true });
    window.addEventListener('pointermove', e => { mouse.x = e.clientX; mouse.y = e.clientY; }, { passive: true });
    window.addEventListener('pointerleave', () => { mouse.x = -9999; mouse.y = -9999; });
  } else {
    window.addEventListener('scroll', () => {
      updateScrollPops();
      updateEquationPops();
    }, { passive: true });
  }

  if (!staticPage && canvas && ctx) {
    resize();
    updateScroll();
    draw();
  } else {
    updateScrollPops();
    updateEquationPops();
  }

  const revealObserver = new IntersectionObserver(entries => {
    entries.forEach(entry => {
      if (entry.isIntersecting) entry.target.classList.add('visible');
    });
  }, { threshold: .12 });
  document.querySelectorAll('.reveal').forEach(el => revealObserver.observe(el));

  const epochItems = [...document.querySelectorAll('.epoch-rail li')];
  const epochSections = [...document.querySelectorAll('[data-epoch]')];
  const hudEpoch = document.getElementById('hud-epoch');
  const hudTime = document.getElementById('hud-time');
  const hudRedshift = document.getElementById('hud-redshift');
  const epochHud = {
    '0': ['PRIMORDIAL', 't ≪ 1 s', 'z ≫ 1100'],
    '1': ['RECOMBINATION / CMB', 't ≈ 380 kyr', 'z ≈ 1100'],
    '2': ['COSMIC DAWN', 't ≈ 0.2 Gyr', 'z ≈ 15–20'],
    '3': ['STRUCTURE FORMATION', 't ≈ 1 Gyr', 'z ≈ 5–7'],
    '4': ['MATURE COSMIC WEB', 't → 13.8 Gyr', 'z → 0'],
    '5': ['OBSERVER', 'NOW', 'z = 0']
  };
  const epochObserver = new IntersectionObserver(entries => {
    const active = entries.filter(e => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
    if (!active) return;
    const n = active.target.dataset.epoch;
    epochItems.forEach(li => li.classList.toggle('active', li.dataset.epoch === n));
    const meta = epochHud[n];
    if (meta) {
      if (hudEpoch) hudEpoch.textContent = meta[0];
      if (hudTime) hudTime.textContent = meta[1];
      if (hudRedshift) hudRedshift.textContent = meta[2];
    }
  }, { threshold: [.18, .35, .55], rootMargin: '-15% 0px -35% 0px' });
  epochSections.forEach(s => epochObserver.observe(s));

  document.querySelectorAll('.epoch-rail a[href^="#"]').forEach(link => {
    link.addEventListener('click', e => {
      const target = document.querySelector(link.getAttribute('href'));
      if (!target) return;
      e.preventDefault();
      target.scrollIntoView({ behavior: reduced ? 'auto' : 'smooth', block: 'start' });
    });
  });

  // Research Notes filtering
  const noteFilters = [...document.querySelectorAll('[data-note-filter]')];
  const noteCards = [...document.querySelectorAll('[data-note-topic]')];
  noteFilters.forEach(button => {
    button.addEventListener('click', () => {
      const filter = button.dataset.noteFilter;
      noteFilters.forEach(b => b.classList.toggle('active', b === button));
      noteCards.forEach(card => {
        const topics = (card.dataset.noteTopic || '').split(' ');
        card.hidden = filter !== 'all' && !topics.includes(filter);
      });
    });
  });

  const menuButton = document.querySelector('.menu-button');
  const mobileMenu = document.getElementById('mobile-menu');
  function closeMenu() {
    mobileMenu.hidden = true;
    menuButton.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }
  menuButton?.addEventListener('click', () => {
    const open = mobileMenu.hidden;
    mobileMenu.hidden = !open;
    menuButton.setAttribute('aria-expanded', String(open));
    document.body.style.overflow = open ? 'hidden' : '';
  });
  mobileMenu?.querySelectorAll('a').forEach(a => a.addEventListener('click', closeMenu));

  const form = document.getElementById('contact-form');
  if (form) {
    const submitButton = document.getElementById('contact-submit');
    const status = document.getElementById('form-status');
    const defaultLabel = submitButton?.textContent || 'Send message';

    form.addEventListener('submit', async (event) => {
      event.preventDefault();

      if (status) {
        status.textContent = 'Sending…';
        status.className = 'form-status is-sending';
      }
      if (submitButton) {
        submitButton.disabled = true;
        submitButton.textContent = 'Sending…';
      }

      try {
        const formData = new FormData(form);
        const payload = Object.fromEntries(formData.entries());

        const response = await fetch('https://api.web3forms.com/submit', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json'
          },
          body: JSON.stringify(payload)
        });

        const result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.message || 'Submission failed');
        }

        form.reset();
        if (status) {
          status.textContent = '✓ Message sent successfully. Thank you for reaching out.';
          status.className = 'form-status is-success';
        }
      } catch (error) {
        console.error('Contact form submission failed:', error);
        if (status) {
          status.textContent = 'Could not send your message. Please email me directly instead.';
          status.className = 'form-status is-error';
        }
      } finally {
        if (submitButton) {
          submitButton.disabled = false;
          submitButton.textContent = defaultLabel;
        }
      }
    });
  }

  const yearEl = document.getElementById('year');
  if (yearEl) yearEl.textContent = new Date().getFullYear();
})();
