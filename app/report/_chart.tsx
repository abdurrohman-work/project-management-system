'use client'

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts'

type DataPoint = {
  period:     string
  efficiency: number
  load:       number
}

const MUTED  = 'rgba(255,255,255,0.4)'
const BORDER = '#2a3f52'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div style={{
      backgroundColor: '#111b24',
      border: '1px solid #2a3f52',
      borderRadius: 6,
      padding: '10px 14px',
      fontSize: 12,
      color: '#ffffff',
    }}>
      <p style={{ margin: '0 0 6px', fontWeight: 600 }}>{label}</p>
      {payload.map((entry: { name: string; color: string; value: number }) => (
        <p key={entry.name} style={{ margin: '2px 0', color: entry.color }}>
          {entry.name}: {entry.value.toFixed(2)}%
        </p>
      ))}
    </div>
  )
}

export default function Chart({ data }: { data: DataPoint[] }) {
  return (
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={BORDER} strokeDasharray="3 3" />
        <XAxis
          dataKey="period"
          tick={{ fill: MUTED, fontSize: 11 }}
          axisLine={{ stroke: BORDER }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: MUTED, fontSize: 11 }}
          axisLine={false}
          tickLine={false}
          tickFormatter={(v) => `${v}%`}
          width={48}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: MUTED, paddingTop: 12 }}
        />
        <Line
          type="monotone"
          dataKey="efficiency"
          name="Efficiency %"
          stroke="#3f9cfb"
          strokeWidth={2}
          dot={{ fill: '#3f9cfb', r: 3 }}
          activeDot={{ r: 5 }}
        />
        <Line
          type="monotone"
          dataKey="load"
          name="Load %"
          stroke="#f87171"
          strokeWidth={2}
          dot={{ fill: '#f87171', r: 3 }}
          activeDot={{ r: 5 }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
