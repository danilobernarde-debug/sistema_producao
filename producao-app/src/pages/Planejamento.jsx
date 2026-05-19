import { useState } from 'react'

const ABAS = [
  { label: 'Planejamento RMB', src: '/planejamento_RMB.html' },
  { label: 'Planejamento RIP', src: '/planejamento_RIP.html' },
]

export default function Planejamento() {
  const [aba, setAba] = useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', gap: 0, background: '#1e2a3b', flexShrink: 0 }}>
        {ABAS.map((a, i) => (
          <button
            key={i}
            onClick={() => setAba(i)}
            style={{
              padding: '12px 24px',
              border: 'none',
              borderBottom: i === aba ? '3px solid #60a5fa' : '3px solid transparent',
              background: 'none',
              color: i === aba ? '#60a5fa' : '#94a3b8',
              fontWeight: i === aba ? 600 : 400,
              fontSize: 14,
              cursor: 'pointer',
              transition: 'color 0.15s',
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      {ABAS.map((a, i) => (
        <iframe
          key={a.src}
          src={a.src}
          title={a.label}
          allow="fullscreen"
          style={{
            flex: 1,
            border: 'none',
            display: i === aba ? 'block' : 'none',
          }}
        />
      ))}
    </div>
  )
}
