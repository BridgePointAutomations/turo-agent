'use client'
import { useState, useRef, useEffect } from 'react'
import type { ChatMessage } from '@/lib/types'

const QUICK_PROMPTS = [
  'How should I price my car this weekend?',
  'Write a welcome message for my next guest',
  'What maintenance is due and what will it cost?',
  'Summarize my tax deductions this year',
  'How do I improve my listing ranking?',
  'Which protection plan should I use?',
  'Analyze my most profitable vehicle',
  'Write a post-trip review request message',
]

function formatMessage(text: string) {
  const lines = text.split('\n')
  return lines.map((line, i) => {
    if (line.startsWith('## ') || line.startsWith('### '))
      return <p key={i} className="font-semibold text-sm mt-2 mb-0.5" style={{ color: '#0F172A' }}>{line.replace(/^#{2,3} /, '')}</p>
    if (line.startsWith('**') && line.endsWith('**'))
      return <p key={i} className="font-semibold text-sm">{line.slice(2, -2)}</p>
    if (line.startsWith('- ') || line.startsWith('• '))
      return <li key={i} className="ml-4 text-sm list-disc leading-relaxed">{line.slice(2)}</li>
    if (line.trim() === '') return <br key={i} />
    return <p key={i} className="text-sm leading-relaxed">{line}</p>
  })
}

export default function ChatPanel() {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: "Hi! I'm your TuroAgent advisor with full context on your fleet, trips, and financials. Ask me anything about pricing, guests, maintenance, or growing your Turo business." }
  ])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  async function send(text?: string) {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')
    const newMessages: ChatMessage[] = [...messages, { role: 'user', content }]
    setMessages(newMessages)
    setLoading(true)

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: newMessages }),
      })
      const data = await res.json()
      setMessages(prev => [...prev, { role: 'assistant', content: data.reply }])
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }])
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="flex flex-col h-full bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
      {/* Header */}
      <div className="px-4 py-3.5 flex items-center gap-3" style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#FAFAFA' }}>
        <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#ECFDF5' }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
        </div>
        <div>
          <p className="text-sm font-semibold" style={{ color: '#0F172A' }}>AI Advisor</p>
          <div className="flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-green-400 inline-block" />
            <p className="text-xs" style={{ color: '#64748B' }}>Knows your fleet & financials</p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4" style={{ backgroundColor: '#F8FAFC' }}>
        {messages.map((msg, i) => (
          <div key={i} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: '#ECFDF5' }}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
                </svg>
              </div>
            )}
            <div className={`max-w-[82%] px-3.5 py-2.5 rounded-xl text-sm leading-relaxed ${
              msg.role === 'user' ? 'rounded-br-sm' : 'rounded-bl-sm'
            }`} style={msg.role === 'user'
              ? { backgroundColor: '#1D9E75', color: 'white' }
              : { backgroundColor: 'white', color: '#1E293B', border: '1px solid #E2E8F0', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }
            }>
              {msg.role === 'assistant' ? (
                <div className="space-y-0.5">{formatMessage(msg.content)}</div>
              ) : (
                <p>{msg.content}</p>
              )}
            </div>
          </div>
        ))}
        {loading && (
          <div className="flex gap-2.5 justify-start">
            <div className="w-6 h-6 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: '#ECFDF5' }}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
            </div>
            <div className="px-3.5 py-3 rounded-xl rounded-bl-sm" style={{ backgroundColor: 'white', border: '1px solid #E2E8F0' }}>
              <div className="flex gap-1 items-center">
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '0ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '150ms' }} />
                <div className="w-1.5 h-1.5 rounded-full bg-green-400 animate-bounce" style={{ animationDelay: '300ms' }} />
              </div>
            </div>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Quick prompts */}
      <div className="px-4 pt-3 pb-2 flex flex-wrap gap-1.5" style={{ borderTop: '1px solid #F1F5F9', backgroundColor: 'white' }}>
        {QUICK_PROMPTS.map(p => (
          <button
            key={p}
            onClick={() => send(p)}
            className="text-xs px-2.5 py-1 rounded-full transition-colors hover:text-white hover:border-transparent"
            style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}
            onMouseEnter={e => { (e.target as HTMLButtonElement).style.backgroundColor = '#1D9E75'; (e.target as HTMLButtonElement).style.color = 'white'; (e.target as HTMLButtonElement).style.borderColor = 'transparent'; }}
            onMouseLeave={e => { (e.target as HTMLButtonElement).style.backgroundColor = 'white'; (e.target as HTMLButtonElement).style.color = '#64748B'; (e.target as HTMLButtonElement).style.borderColor = '#E2E8F0'; }}
          >
            {p}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="px-4 py-3 flex gap-2" style={{ backgroundColor: 'white', borderTop: '1px solid #F1F5F9' }}>
        <textarea
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send() } }}
          placeholder="Ask anything about your Turo business…"
          rows={2}
          className="flex-1 text-sm px-3 py-2 rounded-lg resize-none transition-all"
          style={{ border: '1px solid #E2E8F0', backgroundColor: '#F8FAFC', color: '#0F172A', outline: 'none' }}
          onFocus={e => { e.target.style.borderColor = '#1D9E75'; e.target.style.backgroundColor = 'white'; }}
          onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.backgroundColor = '#F8FAFC'; }}
        />
        <button
          onClick={() => send()}
          disabled={loading || !input.trim()}
          className="px-4 py-2 rounded-lg text-sm font-medium text-white self-end transition-all disabled:opacity-40"
          style={{ backgroundColor: '#1D9E75', minWidth: '64px' }}
        >
          Send
        </button>
      </div>
    </div>
  )
}
