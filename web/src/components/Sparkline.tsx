import { useState } from 'react'
import { fmtNum } from '../lib/score'

export default function Sparkline({ labels, values, suffix = '' }: { labels: string[]; values: (number | null)[]; suffix?: string }) {
  const [hover, setHover] = useState<number | null>(null)
  const W = 320
  const H = 72
  const pts = values.map((v, i) => [i, v] as const).filter((x): x is readonly [number, number] => x[1] != null)
  if (pts.length < 2) return null
  const min = Math.min(...pts.map((p) => p[1]))
  const max = Math.max(...pts.map((p) => p[1]))
  const x = (i: number) => (i / (values.length - 1)) * W
  const y = (v: number) => H - 6 - ((v - min) / (max - min || 1)) * (H - 14)
  const d = pts.map(([i, v], k) => `${k ? 'L' : 'M'}${x(i).toFixed(1)},${y(v).toFixed(1)}`).join(' ')
  const area = `${d} L${x(pts[pts.length - 1][0])},${H} L${x(pts[0][0])},${H} Z`
  const hi = hover != null ? pts.find((p) => p[0] === hover) : pts[pts.length - 1]
  return (
    <div className="spark">
      <div className="spark-head">
        <span>Kr/m² senaste 48 mån</span>
        {hi && (
          <b>
            {labels[hi[0]]}: {fmtNum(hi[1])}
            {suffix}
          </b>
        )}
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        onMouseMove={(e) => {
          const r = (e.currentTarget as SVGSVGElement).getBoundingClientRect()
          setHover(Math.round(((e.clientX - r.left) / r.width) * (values.length - 1)))
        }}
        onMouseLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id="sg" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#7dd3c0" stopOpacity="0.35" />
            <stop offset="1" stopColor="#7dd3c0" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={area} fill="url(#sg)" />
        <path d={d} fill="none" stroke="#7dd3c0" strokeWidth="2" vectorEffect="non-scaling-stroke" />
        {hi && <circle cx={x(hi[0])} cy={y(hi[1])} r="3.5" fill="#fff" />}
      </svg>
      <div className="spark-axis">
        <span>{labels[0]}</span>
        <span>{labels[labels.length - 1]}</span>
      </div>
    </div>
  )
}
