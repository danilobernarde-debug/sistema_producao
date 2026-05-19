import { useState } from 'react'

const ABAS = [
  {
    label: 'Planejamento RMB',
    src: '/planejamento_RMB.html',
    planilha: 'https://docs.google.com/spreadsheets/d/19BFi7vgQqdWYzkKU24G_fgHz5ctuIJfDry24tpZHa9A/edit?usp=sharing',
  },
  {
    label: 'Planejamento RIP',
    src: '/planejamento_RIP.html',
    planilha: 'https://docs.google.com/spreadsheets/d/1v98fOa7OlNYrIp12dF19qyt0FSLTO6jnBB-pCmZokHo/edit?usp=sharing',
  },
]

export default function Planejamento() {
  const [aba, setAba] = useState(0)

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      <div style={{ display: 'flex', alignItems: 'center', background: '#1e2a3b', flexShrink: 0 }}>
        <div style={{ display: 'flex', flex: 1 }}>
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
        <a
          href={ABAS[aba].planilha}
          target="_blank"
          rel="noreferrer"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            marginRight: 16,
            padding: '6px 14px',
            borderRadius: 6,
            background: '#166534',
            color: '#bbf7d0',
            fontSize: 13,
            fontWeight: 500,
            textDecoration: 'none',
            whiteSpace: 'nowrap',
            transition: 'background 0.15s',
          }}
          onMouseEnter={e => e.currentTarget.style.background = '#15803d'}
          onMouseLeave={e => e.currentTarget.style.background = '#166534'}
        >
          📊 Abrir Planilha
        </a>
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
