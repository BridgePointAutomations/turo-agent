'use client'
import { useState, useRef, useEffect, useCallback } from 'react'
import type { ChatMessage, Conversation } from '@/lib/types'

const QUICK_PROMPTS = [
  'Which of my cars had the best ROI this year?',
  'What maintenance is overdue and what should I budget?',
  'What are my biggest tax deductions this year by category?',
  'Are there any gaps in my booking calendar this month?',
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

function timeAgo(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime()
  const mins = Math.floor(diff / 60000)
  if (mins < 1) return 'Just now'
  if (mins < 60) return `${mins}m ago`
  const hrs = Math.floor(mins / 60)
  if (hrs < 24) return `${hrs}h ago`
  return `${Math.floor(hrs / 24)}d ago`
}

const WELCOME: ChatMessage = {
  role: 'assistant',
  content: "Fleet Advisor — ask anything about pricing, guests, maintenance, or your financials.",
}

export default function ChatPanel() {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [activeConvId, setActiveConvId] = useState<string | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([WELCOME])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [sidebarOpen, setSidebarOpen] = useState(false)
  const [editingTitle, setEditingTitle] = useState<string | null>(null)
  const [titleInput, setTitleInput] = useState('')
  const [confirmDeleteConv, setConfirmDeleteConv] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const loadConversations = useCallback(async () => {
    const data = await fetch('/api/conversations').then(r => r.json())
    setConversations(Array.isArray(data) ? data : [])
  }, [])

  useEffect(() => { loadConversations() }, [loadConversations])

  async function selectConversation(conv: Conversation) {
    setActiveConvId(conv.id)
    setSidebarOpen(false)
    const data = await fetch(`/api/conversations/${conv.id}`).then(r => r.json())
    const msgs: ChatMessage[] = (data.conversation_messages ?? []).map((m: any) => ({
      role: m.role,
      content: m.content,
    }))
    setMessages(msgs.length > 0 ? msgs : [WELCOME])
  }

  async function newConversation() {
    setActiveConvId(null)
    setMessages([WELCOME])
    setSidebarOpen(false)
  }

  async function deleteConversation(id: string) {
    await fetch(`/api/conversations?id=${id}`, { method: 'DELETE' })
    setConfirmDeleteConv(null)
    if (activeConvId === id) {
      setActiveConvId(null)
      setMessages([WELCOME])
    }
    loadConversations()
  }

  async function updateTitle(id: string) {
    if (!titleInput.trim()) { setEditingTitle(null); return }
    await fetch(`/api/conversations/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: titleInput.trim() }),
    })
    setEditingTitle(null)
    loadConversations()
  }

  async function send(text?: string) {
    const content = text || input.trim()
    if (!content || loading) return
    setInput('')

    let convId = activeConvId

    // Create conversation on first user message
    if (!convId) {
      const res = await fetch('/api/conversations', { method: 'POST' })
      const conv = await res.json()
      convId = conv.id
      setActiveConvId(conv.id)
    }

    const userMsg: ChatMessage = { role: 'user', content }
    setMessages(prev => [...prev.filter(m => m !== WELCOME || prev.length > 1), userMsg])
    setLoading(true)

    // Add a placeholder assistant message that we'll fill in as tokens stream in
    const assistantPlaceholder: ChatMessage = { role: 'assistant', content: '' }
    setMessages(prev => [...prev, assistantPlaceholder])

    try {
      const res = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ messages: [userMsg], conversation_id: convId }),
      })

      if (!res.body) throw new Error('No response body')

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''
      let fullContent = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() ?? ''

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue
          try {
            const payload = JSON.parse(line.slice(6))
            if (payload.delta) {
              fullContent += payload.delta
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: fullContent }
                return updated
              })
            } else if (payload.done) {
              loadConversations()
            } else if (payload.error) {
              setMessages(prev => {
                const updated = [...prev]
                updated[updated.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }
                return updated
              })
            }
          } catch { /* malformed SSE line — skip */ }
        }
      }
    } catch {
      setMessages(prev => {
        const updated = [...prev]
        updated[updated.length - 1] = { role: 'assistant', content: 'Something went wrong. Please try again.' }
        return updated
      })
    } finally {
      setLoading(false)
    }
  }

  const activeTitle = conversations.find(c => c.id === activeConvId)?.title

  return (
    <div className="flex h-full bg-white rounded-xl overflow-hidden" style={{ border: '1px solid #E2E8F0', boxShadow: '0 4px 6px -1px rgba(0,0,0,0.07), 0 2px 4px -1px rgba(0,0,0,0.04)', borderTop: '2px solid #1D9E75' }}>
      {/* Sidebar */}
      {sidebarOpen && (
        <div className="w-60 flex-shrink-0 flex flex-col" style={{ borderRight: '1px solid #F1F5F9', backgroundColor: '#FAFAFA' }}>
          <div className="p-3" style={{ borderBottom: '1px solid #F1F5F9' }}>
            <button onClick={newConversation}
              className="w-full flex items-center justify-center gap-2 py-2 rounded-lg text-sm font-medium text-white"
              style={{ backgroundColor: '#1D9E75' }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
              </svg>
              New conversation
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {conversations.length === 0 && (
              <p className="text-xs text-center py-6" style={{ color: '#94A3B8' }}>No conversations yet</p>
            )}
            {conversations.map(conv => (
              <div key={conv.id}
                className="group relative rounded-lg px-3 py-2 cursor-pointer"
                style={{
                  backgroundColor: activeConvId === conv.id ? '#F0FDF4' : 'transparent',
                  border: activeConvId === conv.id ? '1px solid #BBF7D0' : '1px solid transparent',
                }}
                onClick={() => selectConversation(conv)}>
                {confirmDeleteConv === conv.id ? (
                  <div className="flex items-center gap-1" onClick={e => e.stopPropagation()}>
                    <span className="text-xs flex-1" style={{ color: '#E11D48' }}>Delete?</span>
                    <button onClick={() => deleteConversation(conv.id)} className="text-xs font-medium px-1.5 py-0.5 rounded" style={{ backgroundColor: '#E11D48', color: 'white' }}>Yes</button>
                    <button onClick={() => setConfirmDeleteConv(null)} className="text-xs px-1.5 py-0.5 rounded" style={{ border: '1px solid #E2E8F0', color: '#64748B' }}>No</button>
                  </div>
                ) : editingTitle === conv.id ? (
                  <input autoFocus type="text" value={titleInput}
                    onChange={e => setTitleInput(e.target.value)}
                    onBlur={() => updateTitle(conv.id)}
                    onKeyDown={e => { if (e.key === 'Enter') updateTitle(conv.id); if (e.key === 'Escape') setEditingTitle(null) }}
                    onClick={e => e.stopPropagation()}
                    className="w-full text-xs px-1 py-0.5 rounded"
                    style={{ border: '1px solid #1D9E75', outline: 'none', color: '#0F172A' }}/>
                ) : (
                  <>
                    <p className="text-xs font-medium truncate pr-8" style={{ color: '#0F172A' }}>{conv.title}</p>
                    <p className="text-xs mt-0.5" style={{ color: '#94A3B8' }}>{timeAgo(conv.updated_at)}</p>
                    <div className="absolute right-2 top-2 hidden group-hover:flex gap-1" onClick={e => e.stopPropagation()}>
                      <button onClick={() => { setEditingTitle(conv.id); setTitleInput(conv.title) }}
                        className="p-0.5 rounded hover:opacity-70" style={{ color: '#94A3B8' }} title="Rename">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                          <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                        </svg>
                      </button>
                      <button onClick={() => setConfirmDeleteConv(conv.id)}
                        className="p-0.5 rounded hover:opacity-70" style={{ color: '#E11D48' }} title="Delete">
                        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                          <polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14H6L5 6"/>
                        </svg>
                      </button>
                    </div>
                  </>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Main chat */}
      <div className="flex flex-col flex-1 min-w-0">
        {/* Header */}
        <div className="px-4 py-3.5 flex items-center gap-3" style={{ borderBottom: '1px solid #F1F5F9', backgroundColor: '#FAFAFA' }}>
          <button onClick={() => setSidebarOpen(p => !p)}
            className="p-1.5 rounded-lg hover:opacity-70 flex-shrink-0"
            style={{ border: '1px solid #E2E8F0', color: '#64748B', backgroundColor: 'white' }}
            title={sidebarOpen ? 'Hide history' : 'Show history'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className="w-8 h-8 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: '#ECFDF5' }}>
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#1D9E75" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
            </svg>
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold truncate" style={{ color: '#0F172A' }}>
              {activeTitle ?? 'Fleet Advisor'}
            </p>
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
        <div className="px-4 pt-3 pb-2 flex gap-1.5 overflow-x-auto" style={{ borderTop: '1px solid #F1F5F9', backgroundColor: 'white' }}>
          {QUICK_PROMPTS.map(p => (
            <button key={p} onClick={() => send(p)}
              className="quick-prompt text-xs px-2.5 py-1 rounded-full whitespace-nowrap flex-shrink-0">
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
            onFocus={e => { e.target.style.borderColor = '#1D9E75'; e.target.style.backgroundColor = 'white' }}
            onBlur={e => { e.target.style.borderColor = '#E2E8F0'; e.target.style.backgroundColor = '#F8FAFC' }}
          />
          <button onClick={() => send()} disabled={loading || !input.trim()}
            className="px-4 py-2 rounded-lg text-sm font-medium text-white self-end transition-all disabled:opacity-40"
            style={{ backgroundColor: '#1D9E75', minWidth: '64px' }}>
            Send
          </button>
        </div>
      </div>
    </div>
  )
}
