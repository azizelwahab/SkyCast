import { escapeHtml } from "./format.js";

function smoothPath(p) {
  let d = `M${p[0][0]},${p[0][1]}`;
  for (let i = 0; i < p.length - 1; i++) {
    const p0 = p[i - 1] || p[i], p1 = p[i], p2 = p[i + 1], p3 = p[i + 2] || p2;
    d += ` C${p1[0] + (p2[0] - p0[0]) / 6},${p1[1] + (p2[1] - p0[1]) / 6} ${p2[0] - (p3[0] - p1[0]) / 6},${p2[1] - (p3[1] - p1[1]) / 6} ${p2[0]},${p2[1]}`;
  }
  return d;
}

// `label` is a text description for screen readers (the chart itself is decorative).
export function areaChart(values, { id, label, fill = true }) {
  const v = values.filter(Number.isFinite);
  if (v.length < 2) return "";
  const W = 300, H = 100, pad = 8;
  const min = Math.min(...v), max = Math.max(...v), span = max - min || 1;
  const pts = v.map((n, i) => [(i / (v.length - 1)) * W, pad + (1 - (n - min) / span) * (H - pad * 2)]);
  const line = smoothPath(pts);
  return `<svg class="chart-svg" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img" aria-label="${escapeHtml(label)}">
    <defs><linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#7c6cf5" stop-opacity=".55"/><stop offset="1" stop-color="#7c6cf5" stop-opacity="0"/></linearGradient></defs>
    ${fill ? `<path d="${line} L${W},${H} L0,${H} Z" fill="url(#${id})"/>` : ""}
    <path d="${line}" fill="none" stroke="#a79bff" stroke-width="2.5" vector-effect="non-scaling-stroke"/></svg>`;
}

export function ring(pct, text, label) {
  const C = 2 * Math.PI * 46;
  const dash = (Math.max(0, Math.min(100, Number(pct) || 0)) / 100) * C;
  return `<svg class="ring" viewBox="0 0 110 110" role="img" aria-label="${escapeHtml(label)}">
    <circle cx="55" cy="55" r="46" fill="none" stroke="#2c2860" stroke-width="9"/>
    <circle cx="55" cy="55" r="46" fill="none" stroke="#8f81ff" stroke-width="9" stroke-linecap="round" stroke-dasharray="${dash} ${C}" transform="rotate(-90 55 55)"/>
    <text x="55" y="61" text-anchor="middle">${escapeHtml(text)}</text></svg>`;
}
