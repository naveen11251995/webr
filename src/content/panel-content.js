// Draws a ContentResult (see providers.js) onto a 2D canvas that backs a
// THREE.CanvasTexture. This is the "native DOM rendering" approach the
// README describes: no iframe, no cross-origin pixel read, just data drawn
// directly with the canvas API.

const THEME = {
  bg: '#12161d',
  chrome: '#0d1016',
  ink: '#e7ecef',
  inkDim: '#8b98a5',
  signal: '#4fd1c5',
  warn: '#e2984b',
  line: '#232935',
  fontUI: 'Space Grotesk, system-ui, sans-serif',
  fontRead: '"Source Serif 4", Georgia, serif'
};

function wrapLines(ctx, text, maxWidth) {
  const words = text.split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const test = line ? `${line} ${word}` : word;
    if (ctx.measureText(test).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = test;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function paragraphs(text) {
  return text.split(/\n{2,}/).map((p) => p.replace(/\n/g, ' ').trim()).filter(Boolean);
}

function drawFrame(ctx, w, h, titleText) {
  ctx.fillStyle = THEME.bg;
  ctx.fillRect(0, 0, w, h);

  // title bar
  ctx.fillStyle = THEME.chrome;
  ctx.fillRect(0, 0, w, 64);
  ctx.strokeStyle = THEME.line;
  ctx.lineWidth = 2;
  ctx.strokeRect(1, 1, w - 2, h - 2);
  ctx.fillStyle = THEME.signal;
  ctx.beginPath();
  ctx.arc(34, 32, 7, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = THEME.ink;
  ctx.font = `600 30px ${THEME.fontUI}`;
  ctx.textBaseline = 'middle';
  const clipped = clipToWidth(ctx, titleText, w - 90);
  ctx.fillText(clipped, 60, 33);
}

function clipToWidth(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let t = text;
  while (t.length > 1 && ctx.measureText(t + '\u2026').width > maxWidth) t = t.slice(0, -1);
  return t + '\u2026';
}

export function drawLoading(ctx, w, h, label) {
  drawFrame(ctx, w, h, label);
  ctx.fillStyle = THEME.inkDim;
  ctx.font = `400 26px ${THEME.fontUI}`;
  ctx.textBaseline = 'middle';
  ctx.fillText('Loading\u2026', 40, h / 2 + 32);
}

export function drawMessage(ctx, w, h, result, tone) {
  drawFrame(ctx, w, h, result.title);
  ctx.fillStyle = tone === 'warn' ? THEME.warn : '#e17878';
  ctx.font = `600 24px ${THEME.fontUI}`;
  ctx.fillText(tone === 'warn' ? 'Not embeddable' : 'Couldn\u2019t load', 40, 110);
  ctx.fillStyle = THEME.inkDim;
  ctx.font = `400 24px ${THEME.fontRead}`;
  let y = 160;
  for (const para of paragraphs(result.message || '')) {
    for (const line of wrapLines(ctx, para, w - 80)) {
      ctx.fillText(line, 40, y);
      y += 34;
    }
    y += 16;
  }

  const rects = [];
  const isUrl = /^https?:\/\//i.test(result.title || '');
  if (isUrl) {
    const bw = 260;
    const bh = 46;
    const bx = 40;
    const by = h - 90;
    ctx.strokeStyle = THEME.signal;
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(bx, by, bw, bh, 6);
    ctx.stroke();
    ctx.fillStyle = THEME.signal;
    ctx.font = `500 20px ${THEME.fontUI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Open outside VR \u2197', bx + bw / 2, by + bh / 2 + 1);
    ctx.textAlign = 'left';
    rects.push({ x: bx, y: by, width: bw, height: bh, index: 0, external: true, url: result.title });
  }
  return rects;
}

export function drawText(ctx, w, h, result, image) {
  drawFrame(ctx, w, h, result.title);
  let y = 110;
  const textX = 40;
  let textW = w - 80;

  if (image) {
    const imgW = 260;
    const imgH = (image.height / image.width) * imgW;
    ctx.drawImage(image, w - imgW - 40, 90, imgW, imgH);
    textW = w - imgW - 120;
  }

  ctx.fillStyle = THEME.ink;
  ctx.font = `400 25px ${THEME.fontRead}`;
  ctx.textBaseline = 'alphabetic';
  for (const para of paragraphs(result.body || '')) {
    for (const line of wrapLines(ctx, para, textW)) {
      ctx.fillText(line, textX, y);
      y += 36;
      if (y > h - 50) break;
    }
    y += 18;
    if (y > h - 50) break;
  }

  if (result.sourceUrl) {
    ctx.fillStyle = THEME.signal;
    ctx.font = `400 20px ${THEME.fontUI}`;
    ctx.fillText(clipToWidth(ctx, result.sourceUrl, w - 80), textX, h - 26);
  }
}

/** Draws a list and returns the pixel row-rects for each item, for hit-testing. */
export function drawList(ctx, w, h, result) {
  drawFrame(ctx, w, h, result.title);
  const rowH = 76;
  const startY = 82;
  const rects = [];
  result.items.forEach((item, i) => {
    const y = startY + i * rowH;
    if (y > h - rowH) return;
    ctx.strokeStyle = THEME.line;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(30, y + rowH - 8);
    ctx.lineTo(w - 30, y + rowH - 8);
    ctx.stroke();

    ctx.fillStyle = THEME.ink;
    ctx.font = `500 24px ${THEME.fontUI}`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(clipToWidth(ctx, item.label, w - 80), 40, y + 30);

    if (item.meta) {
      ctx.fillStyle = THEME.inkDim;
      ctx.font = `400 19px ${THEME.fontUI}`;
      ctx.fillText(item.meta, 40, y + 58);
    }
    rects.push({ x: 30, y, width: w - 60, height: rowH - 8, index: i });
  });
  return rects;
}

/**
 * Draws the four nav buttons (back, forward, home, close) into the top-right
 * of the title bar and returns their hit rects for raycasting.
 * `state` = { canBack, canForward }
 */
export function drawNavButtons(ctx, w, state) {
  const size = 44;
  const gap = 8;
  const y = 10;
  const labels = ['\u2190', '\u2192', '\u2022', '\u2715'];
  const enabled = [state.canBack, state.canForward, true, true];
  const rects = [];
  labels.forEach((label, i) => {
    const x = w - (labels.length - i) * (size + gap) - 10;
    ctx.fillStyle = i === 3 ? '#2a1418' : THEME.chrome;
    ctx.strokeStyle = enabled[i] ? THEME.line : 'rgba(35,41,53,0.4)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.roundRect(x, y, size, size, 6);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = enabled[i] ? (i === 3 ? '#e17878' : THEME.signal) : 'rgba(139,152,165,0.35)';
    ctx.font = `600 22px ${THEME.fontUI}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + size / 2, y + size / 2 + 1);
    ctx.textAlign = 'left';
    rects.push({ x, y, width: size, height: size, action: ['back', 'forward', 'home', 'close'][i], enabled: enabled[i] });
  });
  return rects;
}

export { THEME };
