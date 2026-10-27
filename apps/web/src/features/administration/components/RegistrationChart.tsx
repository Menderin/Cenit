import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { dateLabel } from '../../purchases/model/fields.js';

// Selected shadcn Bar Chart composition, adapted to Cenit's single daily series.
export function RegistrationChart({ days }: { days: { date: string; count: number }[] }) {
  const upper = Math.max(5, Math.ceil(Math.max(0, ...days.map(day => day.count)) / 5) * 5);
  return <>
    <div className="dashboard-chart">
      <div className="dashboard-chart-canvas">
        <ResponsiveContainer width="100%" height="100%" minWidth={0}>
          <BarChart accessibilityLayer data={days} margin={{ top: 8, right: 4, bottom: 0, left: 0 }} aria-label="Compras incorporadas por día">
            <CartesianGrid vertical={false} stroke="var(--admin-line)" strokeDasharray="3 3" />
            <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={24}
              tick={{ fill: 'var(--admin-muted)', fontSize: 11 }} tickFormatter={date => dateLabel(String(date)).slice(0, 5)} />
            <YAxis allowDecimals={false} axisLine={false} tickLine={false} width={28} tickCount={Math.min(9, upper / 5 + 1)}
              domain={[0, upper]} tick={{ fill: 'var(--admin-muted)', fontSize: 11 }} />
            <Tooltip isAnimationActive={false} cursor={{ fill: 'var(--admin-line)', fillOpacity: 0.5 }}
              content={({ active, payload, label }) => active && payload?.[0] ? <div className="dashboard-chart-tooltip" role="status" aria-live="polite">
                <span>{dateLabel(String(label))}</span>
                <strong>{payload[0].value} {payload[0].value === 1 ? 'compra incorporada' : 'compras incorporadas'}</strong>
              </div> : null} />
            <Bar dataKey="count" name="Compras incorporadas" fill="#a5b4d8" radius={[3, 3, 0, 0]} maxBarSize={24} isAnimationActive={false} />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
    <ul className="purchase-sr-only" aria-label="Detalle de compras incorporadas por día">
      {days.map(day => <li key={day.date}>{dateLabel(day.date)}: {day.count} {day.count === 1 ? 'compra' : 'compras'}</li>)}
    </ul>
  </>;
}
