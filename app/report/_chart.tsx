'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

type DataPoint = { period: string; efficiency: number; load: number }

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        backgroundColor: '#1e2d3d',
        border: '1px solid #2a3f52',
        borderRadius: 6,
        padding: '10px 14px',
        fontSize: 12,
        color: '#fff',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
      }}
    >
      <p style={{ margin: '0 0 6px', fontWeight: 600, color: '#fff', fontSize: 12 }}>{label}</p>
      {payload.map((entry: { name: string; color: string; value: number }) => (
        <p key={entry.name} style={{ margin: '2px 0', color: entry.color, fontSize: 12 }}>
          {entry.name}: <strong>{entry.value.toFixed(1)}%</strong>
        </p>
      ))}
    </div>
  )
}

export default function Chart({ data }: { data: DataPoint[] }) {
  return (
    <div>
      <p className="text-sm font-medium text-white/60 mb-3">Efficiency &amp; Load Trend</p>
      <ResponsiveContainer width="100%" height={280}>
        <LineChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
          <CartesianGrid stroke="#2a3f52" strokeDasharray="3 3" vertical={false} />
          <XAxis
            dataKey="period"
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={{ stroke: '#2a3f52' }}
            tickLine={false}
            interval="preserveStartEnd"
          />
          <YAxis
            tick={{ fill: 'rgba(255,255,255,0.4)', fontSize: 11 }}
            axisLine={{ stroke: '#2a3f52' }}
            tickLine={false}
            tickFormatter={(v) => `${v}%`}
            width={44}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend
            wrapperStyle={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, paddingTop: 16 }}
          />
          <Line
            type="monotone"
            dataKey="efficiency"
            name="Efficiency %"
            stroke="#3f9cfb"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#3f9cfb' }}
          />
          <Line
            type="monotone"
            dataKey="load"
            name="Load %"
            stroke="#f87171"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: '#f87171' }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  )
}
