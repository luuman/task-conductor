// src/modules/perf/cards/shared.tsx
import { motion } from "framer-motion";
import type { HistPt } from "../types";
import { HIST_LEN, ZERO_PT } from "../types";

export const CC  = "#007AFF";
export const CR  = "#FF2D55";
export const CP  = "#BF5AF2";
export const CO  = "#FF9F0A";
export const CGR = "#34C759";

export function fmtGb(gb: number | null | undefined) {
  if (gb == null) return "—";
  return gb >= 1 ? `${gb.toFixed(1)} GB` : `${Math.round(gb * 1024)} MB`;
}
export function fmtKbps(k: number | null | undefined) {
  if (k == null) return "—";
  if (k >= 1024 * 1024) return `${(k / 1024 / 1024).toFixed(2)} GB/s`;
  if (k >= 1024) return `${(k / 1024).toFixed(1)} MB/s`;
  return `${k.toFixed(0)} KB/s`;
}
export function fmtMbps(m: number | null | undefined) {
  if (m == null) return "—";
  if (m >= 1024) return `${(m / 1024).toFixed(2)} GB/s`;
  return `${m.toFixed(2)} MB/s`;
}
export function fmtSentRecv(mb: number | null | undefined) {
  if (mb == null) return "—";
  if (mb >= 1024) return `${(mb / 1024).toFixed(1)} GB`;
  return `${mb} MB`;
}

/** iStatMenus scrolling bar chart */
export function Sparkline({ pts, getA, getB, getC, colorA = CC, colorB = CR, colorC = CP, h = 40 }: {
  pts: HistPt[];
  getA: (p: HistPt) => number;
  getB?: (p: HistPt) => number;
  getC?: (p: HistPt) => number;
  colorA?: string; colorB?: string; colorC?: string; h?: number;
}) {
  const padded = [...Array(Math.max(0, HIST_LEN - pts.length)).fill(ZERO_PT), ...pts.slice(-HIST_LEN)];
  const maxVal = Math.max(...padded.map(p => getA(p) + (getB ? getB(p) : 0) + (getC ? getC(p) : 0)), 0.001);
  const bW = 2, gap = 1, W = HIST_LEN * (bW + gap) - gap;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" className="block">
      {padded.map((p, i) => {
        const x  = i * (bW + gap);
        const aH = Math.max(0, (getA(p) / maxVal) * h);
        const bH = getB ? Math.max(0, (getB(p) / maxVal) * h) : 0;
        const cH = getC ? Math.max(0, (getC(p) / maxVal) * h) : 0;
        return (
          <g key={i}>
            {cH > 0 && <rect x={x} y={h - aH - bH - cH} width={bW} height={cH} fill={colorC} />}
            {bH > 0 && <rect x={x} y={h - aH - bH}       width={bW} height={bH} fill={colorB} />}
            {aH > 0 && <rect x={x} y={h - aH}             width={bW} height={aH} fill={colorA} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Dual sparkline — bars up/down from center line */
export function DualSparkline({ pts, getTop, getBottom, colorTop = CR, colorBottom = CC, h = 50 }: {
  pts: HistPt[];
  getTop:    (p: HistPt) => number;
  getBottom: (p: HistPt) => number;
  colorTop?: string; colorBottom?: string; h?: number;
}) {
  const padded = [...Array(Math.max(0, HIST_LEN - pts.length)).fill(ZERO_PT), ...pts.slice(-HIST_LEN)];
  const maxVal = Math.max(...padded.map(p => Math.max(getTop(p), getBottom(p))), 0.001);
  const bW = 2, gap = 1, W = HIST_LEN * (bW + gap) - gap;
  const mid = h / 2;
  return (
    <svg width="100%" viewBox={`0 0 ${W} ${h}`} preserveAspectRatio="none" className="block">
      <line x1="0" y1={mid} x2={W} y2={mid} stroke="#2a2a2a" strokeWidth="0.5" />
      {padded.map((p, i) => {
        const x    = i * (bW + gap);
        const topH = Math.max(0, (getTop(p)    / maxVal) * (mid - 1));
        const botH = Math.max(0, (getBottom(p) / maxVal) * (mid - 1));
        return (
          <g key={i}>
            {topH > 0 && <rect x={x} y={mid - topH} width={bW} height={topH} fill={colorTop}    fillOpacity={0.9} />}
            {botH > 0 && <rect x={x} y={mid + 1}    width={bW} height={botH} fill={colorBottom} fillOpacity={0.9} />}
          </g>
        );
      })}
    </svg>
  );
}

/** Ring gauge with framer-motion animation */
export function RingGauge({ pct, color = CC, label, size = 96, valueText }: {
  pct: number; color?: string; label: string; size?: number; valueText?: string;
}) {
  const sw = 6, r = (size - sw - 2) / 2, c = size / 2;
  const circ = 2 * Math.PI * r;
  const offset = circ - (circ * Math.max(0, Math.min(100, pct)) / 100);
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="absolute" style={{ transform: "rotate(-90deg)", overflow: "visible" }}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#222222" strokeWidth={sw} />
        <motion.circle
          cx={c} cy={c} r={r} fill="none"
          stroke={color} strokeWidth={sw} strokeLinecap="round"
          strokeDasharray={circ}
          initial={{ strokeDashoffset: circ }}
          animate={{ strokeDashoffset: offset }}
          transition={{ duration: 1, ease: "circOut" }}
          style={{}}
        />
      </svg>
      <div className="flex flex-col items-center justify-center" style={{ zIndex: 1 }}>
        <span className="font-bold font-mono leading-none text-white" style={{ fontSize: size / 4.6 }}>
          {valueText ?? `${Math.round(pct)}%`}
        </span>
        <span className="font-mono" style={{ fontSize: size / 7.5, color: "#8a8a8e" }}>{label}</span>
      </div>
    </div>
  );
}

/** iStatMenus card container — Orion style */
export function ICard({ title, children, right, showTitle = true }: {
  title: string; children: React.ReactNode; right?: React.ReactNode; showTitle?: boolean;
}) {
  return (
    <div className="rounded-2xl flex flex-col overflow-hidden relative"
         style={{ background: "#0b0b18", border: "1px solid #1e2038",
           boxShadow: "0 4px 24px rgba(0,0,0,0.55), inset 0 1px 0 rgba(255,255,255,0.03)" }}>
      <div className="absolute top-0 left-0 right-0"
           style={{ height: 1, background: "linear-gradient(90deg,var(--accent,#4477ff) 0%,transparent 55%)" }} />
      {showTitle && (
        <div className="flex items-center justify-between px-4 py-3" style={{ borderBottom: "1px solid #16162a" }}>
          <span className="text-[11px] font-semibold uppercase tracking-[0.08em]"
                style={{ color: "var(--accent,#4477ff)" }}>{title}</span>
          {right}
        </div>
      )}
      <div className="flex-1 px-4 py-3 space-y-3">{children}</div>
    </div>
  );
}

/** Process row */
export function PhoneProc({ name, value, valueColor = CC }: { name: string; value: string; valueColor?: string }) {
  return (
    <div className="flex items-center gap-2 py-[3px]">
      <div className="w-5 h-5 rounded-md flex items-center justify-center shrink-0" style={{ background: "#1a1a1a" }}>
        <span className="text-[7px] font-mono" style={{ color: "#636366" }}>{name.slice(0, 1).toUpperCase()}</span>
      </div>
      <span className="flex-1 text-xs truncate" style={{ color: "#d1d5db" }}>{name}</span>
      <span className="text-xs font-mono tabular-nums" style={{ color: valueColor }}>{value}</span>
    </div>
  );
}

export function tColor(v: number) { return v >= 90 ? CR : v >= 70 ? CO : CC; }
