'use client'
import { useState, useEffect, useCallback } from 'react'
import ChatPanel from './ChatPanel'

type PopupState = 'closed' | 'open' | 'maximized'

export default function ChatPopup() {
  const [state, setState] = useState<PopupState>('closed')
  const [pendingPrompt, setPendingPrompt] = useState<string | null>(null)

  const open = useCallback((prompt?: string) => {
    setState('open')
    if (prompt) setPendingPrompt(prompt)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent<{ prompt?: string }>).detail
      open(detail?.prompt)
    }
    window.addEventListener('open-chat', handler)
    return () => window.removeEventListener('open-chat', handler)
  }, [open])

  const isVisible = state !== 'closed'

  return (
    <>
      {/* Backdrop for maximized state */}
      {state === 'maximized' && (
        <div
          className="fixed inset-0 z-40"
          style={{ backgroundColor: 'rgba(15, 23, 42, 0.5)', backdropFilter: 'blur(2px)' }}
          onClick={() => setState('open')}
        />
      )}

      {/* Floating Action Button — shown when closed */}
      {!isVisible && (
        <button
          onClick={() => open()}
          className="fixed bottom-6 right-6 z-50 flex items-center gap-2.5 px-4 py-3 rounded-2xl text-white text-sm font-semibold shadow-lg transition-all hover:opacity-90 hover:scale-105 active:scale-95"
          style={{ backgroundColor: '#1D9E75', boxShadow: '0 4px 14px rgba(29,158,117,0.4)' }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
          </svg>
          Fleet Advisor
        </button>
      )}

      {/* Popup panel */}
      {isVisible && (
        <div
          className={`fixed z-50 flex flex-col overflow-hidden ${
            state === 'maximized'
              ? 'inset-6 rounded-2xl'
              : 'inset-0 rounded-none md:inset-auto md:bottom-6 md:right-6 md:w-[420px] md:h-[600px] md:rounded-2xl'
          }`}
          style={{
            boxShadow: state === 'maximized'
              ? '0 25px 50px -12px rgba(0,0,0,0.35)'
              : '0 20px 40px -10px rgba(0,0,0,0.25)',
            animation: state !== 'maximized' ? 'slideUp 0.2s ease-out' : undefined,
          }}>
          {/* Popup chrome header */}
          <div
            className="flex items-center gap-2 px-4 py-2.5 flex-shrink-0"
            style={{ backgroundColor: '#0F6E56', color: 'white' }}>
            <div className="flex-1 flex items-center gap-2 min-w-0">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
              </svg>
              <span className="text-sm font-semibold">Fleet Advisor</span>
            </div>

            {/* Maximize / restore */}
            <button
              onClick={() => setState(s => s === 'maximized' ? 'open' : 'maximized')}
              className="p-2.5 rounded-lg hover:opacity-70 flex-shrink-0"
              title={state === 'maximized' ? 'Restore' : 'Maximize'}>
              {state === 'maximized' ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="4 14 10 14 10 20"/><polyline points="20 10 14 10 14 4"/>
                  <line x1="10" y1="14" x2="3" y2="21"/><line x1="21" y1="3" x2="14" y2="10"/>
                </svg>
              ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 3 21 3 21 9"/><polyline points="9 21 3 21 3 15"/>
                  <line x1="21" y1="3" x2="14" y2="10"/><line x1="3" y1="21" x2="10" y2="14"/>
                </svg>
              )}
            </button>

            {/* Minimize / close */}
            <button
              onClick={() => setState('closed')}
              className="p-2.5 rounded-lg hover:opacity-70 flex-shrink-0"
              title="Close">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="18 15 12 21 6 15"/>
              </svg>
            </button>
          </div>

          {/* Chat content fills the rest */}
          <div className="flex-1 min-h-0">
            <ChatPanel pendingPrompt={pendingPrompt} onPromptConsumed={() => setPendingPrompt(null)} />
          </div>
        </div>
      )}

      <style>{`
        @keyframes slideUp {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
      `}</style>
    </>
  )
}
