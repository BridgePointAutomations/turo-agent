import ReactMarkdown from 'react-markdown'

export const mdComponents: React.ComponentProps<typeof ReactMarkdown>['components'] = {
  p: ({ children }) => <p className="text-sm leading-relaxed mb-2 last:mb-0">{children}</p>,
  h2: ({ children }) => <p className="text-sm font-semibold mt-3 mb-1" style={{ color: '#0F172A' }}>{children}</p>,
  h3: ({ children }) => <p className="text-sm font-semibold mt-2 mb-0.5" style={{ color: '#0F172A' }}>{children}</p>,
  strong: ({ children }) => <strong className="font-semibold" style={{ color: '#0F172A' }}>{children}</strong>,
  ul: ({ children }) => <ul className="my-1.5 space-y-0.5 pl-4 list-disc marker:text-green-500">{children}</ul>,
  ol: ({ children }) => <ol className="my-1.5 space-y-1 pl-4 list-decimal marker:text-green-600 marker:font-medium">{children}</ol>,
  li: ({ children }) => <li className="text-sm leading-relaxed pl-0.5">{children}</li>,
  table: ({ children }) => (
    <div className="my-3 overflow-x-auto rounded-lg" style={{ border: '1px solid #E2E8F0' }}>
      <table className="w-full text-xs border-collapse">{children}</table>
    </div>
  ),
  thead: ({ children }) => <thead style={{ backgroundColor: '#F0FDF4' }}>{children}</thead>,
  th: ({ children }) => (
    <th className="px-3 py-2 text-left font-semibold" style={{ color: '#166534', borderBottom: '1px solid #E2E8F0' }}>{children}</th>
  ),
  tbody: ({ children }) => <tbody>{children}</tbody>,
  tr: ({ children }) => <tr className="border-b last:border-0" style={{ borderColor: '#F1F5F9' }}>{children}</tr>,
  td: ({ children }) => <td className="px-3 py-2 text-sm" style={{ color: '#1E293B' }}>{children}</td>,
  code: ({ children }) => <code className="px-1 py-0.5 rounded text-xs font-mono" style={{ backgroundColor: '#F1F5F9', color: '#0F172A' }}>{children}</code>,
  blockquote: ({ children }) => (
    <blockquote className="pl-3 my-2 text-sm italic" style={{ borderLeft: '3px solid #1D9E75', color: '#64748B' }}>{children}</blockquote>
  ),
  hr: () => <hr className="my-3" style={{ borderColor: '#E2E8F0' }} />,
}
