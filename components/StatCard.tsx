interface StatCardProps {
  label: string
  value: string | number
  sub?: string
  color?: 'green' | 'blue' | 'amber' | 'red' | 'gray'
  icon?: React.ReactNode
}

const accents = {
  green: { bar: '#1D9E75', bg: '#ecfdf5', text: '#065F46', sub: '#059669' },
  blue:  { bar: '#3B82F6', bg: '#eff6ff', text: '#1D4ED8', sub: '#2563EB' },
  amber: { bar: '#F59E0B', bg: '#fffbeb', text: '#92400E', sub: '#D97706' },
  red:   { bar: '#EF4444', bg: '#fef2f2', text: '#991B1B', sub: '#DC2626' },
  gray:  { bar: '#94A3B8', bg: '#F8FAFC', text: '#334155', sub: '#64748B' },
}

export default function StatCard({ label, value, sub, color = 'gray', icon }: StatCardProps) {
  const a = accents[color]
  return (
    <div className="relative bg-white rounded-xl overflow-hidden"
      style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {/* Left accent bar */}
      <div className="absolute left-0 top-0 bottom-0 w-1 rounded-l-xl" style={{ backgroundColor: a.bar }} />
      <div className="pl-5 pr-4 py-4">
        <div className="flex items-start justify-between mb-1.5">
          <p className="text-xs font-medium uppercase tracking-wider" style={{ color: '#94A3B8', letterSpacing: '0.06em' }}>{label}</p>
          {icon && (
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0"
              style={{ backgroundColor: a.bg, color: a.bar }}>
              {icon}
            </div>
          )}
        </div>
        <p className="text-2xl font-bold tracking-tight" style={{ color: '#0F172A' }}>{value}</p>
        {sub && <p className="text-xs mt-1 font-medium" style={{ color: a.sub }}>{sub}</p>}
      </div>
    </div>
  )
}
