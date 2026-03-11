'use client'

import { useEffect, useRef, useState, useCallback } from 'react'

const WS_URL = 'ws://localhost:8080'

const ARROWS = { incoming: '←', outgoing: '→', system: '·' }

function useWebSocket(url) {
  const ws = useRef(null)
  const [status, setStatus] = useState('disconnected')
  const [log, setLog] = useState([])

  const addLog = useCallback((text, type = 'system') => {
    setLog(prev => [...prev, { text, type, id: Date.now() + Math.random() }])
  }, [])

  const connect = useCallback(() => {
    if (ws.current) return
    setStatus('connecting')
    addLog('Connecting to ' + url)
    ws.current = new WebSocket(url)

    ws.current.onopen    = () => { setStatus('connected');    addLog('Connected') }
    ws.current.onclose   = () => { setStatus('disconnected'); addLog('Disconnected'); ws.current = null }
    ws.current.onerror   = () => { setStatus('error');        addLog('Connection error') }
    ws.current.onmessage = (e) => addLog(e.data, 'incoming')
  }, [url, addLog])

  const disconnect = useCallback(() => ws.current?.close(), [])

  const send = useCallback((msg) => {
    if (!msg.trim() || ws.current?.readyState !== WebSocket.OPEN) return false
    ws.current.send(msg)
    addLog(msg, 'outgoing')
    return true
  }, [addLog])

  useEffect(() => { connect(); return () => disconnect() }, [connect, disconnect])

  return { status, log, connect, disconnect, send }
}

const DOT_COLORS = {
  connected:    'bg-green-400 shadow-[0_0_6px_#4ade8088]',
  connecting:   'bg-yellow-400',
  disconnected: 'bg-neutral-600',
  error:        'bg-red-400',
}

const LOG_COLORS = {
  incoming: 'text-green-400',
  outgoing: 'text-blue-400',
  system:   'text-neutral-500',
}

export default function JamshotPanel() {
  const { status, log, connect, disconnect, send } = useWebSocket(WS_URL)
  const [input, setInput] = useState('')
  const logEndRef = useRef(null)

  const handleSend = () => {
    if (send(input)) setInput('')
  }

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [log])

  const connected = status === 'connected'

  return (
    <div className="min-h-screen bg-[#0f0f0f] flex items-center justify-center">
      <div className="w-[420px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-xl p-6 flex flex-col gap-4">

        {/* Header */}
        <h1 className="text-white font-semibold tracking-widest text-sm">JAMSHOT</h1>

        {/* Status row */}
        <div className="flex items-center gap-2 text-sm text-neutral-400">
          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${DOT_COLORS[status]}`} />
          <span className="flex-1">{status}</span>
          <button
            onClick={connected ? disconnect : connect}
            className="border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white px-3 py-1 rounded-md text-xs transition-colors"
          >
            {connected ? 'disconnect' : 'connect'}
          </button>
        </div>

        {/* Log */}
        <div className="bg-[#111] border border-[#222] rounded-lg p-3 h-44 overflow-y-auto flex flex-col gap-1 font-mono text-xs">
          {log.map(entry => (
            <div key={entry.id} className="flex gap-2">
              <span className={`flex-shrink-0 ${LOG_COLORS[entry.type]}`}>
                {ARROWS[entry.type]}
              </span>
              <span className="text-neutral-300 break-all">{entry.text}</span>
            </div>
          ))}
          <div ref={logEndRef} />
        </div>

        {/* Input row */}
        <div className="flex gap-2">
          <input
            className="flex-1 bg-[#111] border border-[#2a2a2a] focus:border-[#444] rounded-lg px-3 py-2 text-sm text-neutral-200 placeholder-neutral-600 outline-none transition-colors disabled:opacity-40"
            value={input}
            onChange={e => setInput(e.target.value)}
            onKeyDown={e => e.key === 'Enter' && handleSend()}
            placeholder="Send message to plugin..."
            disabled={!connected}
          />
          <button
            onClick={handleSend}
            disabled={!connected}
            className="bg-blue-600 hover:bg-blue-500 disabled:opacity-30 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors cursor-pointer disabled:cursor-default"
          >
            Send
          </button>
        </div>

      </div>
    </div>
  )
}