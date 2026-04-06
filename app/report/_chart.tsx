'use client'

import {
  LineChart, Line, XAxis, YAxis, CartesianGrid,
  Tooltip, Legend, ResponsiveContainer,
} from 'recharts'

type DataPoint = { period: string; efficiency: number; load: number }

const GRID   = '#363940'
const MUTED  = '#6B7280'
const LEGEND = '#9BA0AB'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null
  return (
    <div
      style={{
        backgroundColor: '#2A2D35',
        border:          '1px solid #363940',
        borderRadius:    8,
        padding:         '10px 14px',
        fontSize:        12,
        color:           '#E2E4E9',
        boxShadow:       '0 8px 24px rgba(0,0,0,0.3)',
      }}
    >
      <p style={{ margin: '0 0 8px', fontWeight: 600, color: '#E2E4E9', fontSize: 12 }}>{label}</p>
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
    <ResponsiveContainer width="100%" height={280}>
      <LineChart data={data} margin={{ top: 4, right: 20, left: 0, bottom: 4 }}>
        <CartesianGrid stroke={GRID} strokeDasharray="3 3" vertical={false} />
        <XAxis
          dataKey="period"
          tick={{ fill: MUTED, fontSize: 11, fontFamily: 'Inter, sans-serif' }}
          axisLine={{ stroke: GRID }}
          tickLine={false}
          interval="preserveStartEnd"
        />
        <YAxis
          tick={{ fill: MUTED, fontSize: 11, fontFamily: 'Inter, sans-serif' }}
          axisLine={false}
          tickLine={false}
          tickFormatter={v => `${v}%`}
          width={44}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend
          wrapperStyle={{ fontSize: 12, color: LEGEND, paddingTop: 16, fontFamily: 'Inter, sans-serif' }}
        />
        <Line
          type="monotone"
          dataKey="efficiency"
          name="Efficiency %"
          stroke="#7B68EE"
          strokeWidth={2}
          dot={{ fill: '#7B68EE', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#7B68EE' }}
        />
        <Line
          type="monotone"
          dataKey="load"
          name="Load %"
          stroke="#F87171"
          strokeWidth={2}
          dot={{ fill: '#F87171', r: 3, strokeWidth: 0 }}
          activeDot={{ r: 5, fill: '#F87171' }}
        />
      </LineChart>
    </ResponsiveContainer>
  )
}
