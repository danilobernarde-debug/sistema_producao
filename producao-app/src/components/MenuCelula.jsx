import { useState, useEffect, useRef } from 'react'

// Menu do botão direito numa célula: filtra a tabela pelo valor dela (comFiltro) e/ou oferece ações extras.
//   acoes: [{ label, onClick, desabilitada }]
export default function MenuCelula({ x, y, rotulo, texto, comFiltro, ativo, acoes = [], onFiltrar, onRemover, onFechar }) {
  const ref = useRef(null)
  const [pos, setPos] = useState({ left: x, top: y })
  useEffect(() => { // mantém o menu dentro da janela
    const r = ref.current?.getBoundingClientRect()
    if (r) setPos({ left: Math.max(8, Math.min(x, window.innerWidth - r.width - 8)), top: Math.max(8, Math.min(y, window.innerHeight - r.height - 8)) })
  }, [x, y])
  useEffect(() => {
    const fora = e => { if (ref.current && !ref.current.contains(e.target)) onFechar() }
    const tecla = e => { if (e.key === 'Escape') onFechar() }
    document.addEventListener('mousedown', fora)
    document.addEventListener('keydown', tecla)
    window.addEventListener('resize', onFechar)
    window.addEventListener('scroll', onFechar, true)
    return () => {
      document.removeEventListener('mousedown', fora); document.removeEventListener('keydown', tecla)
      window.removeEventListener('resize', onFechar); window.removeEventListener('scroll', onFechar, true)
    }
  }, [onFechar])

  const item = { display: 'block', width: '100%', textAlign: 'left', padding: '8px 14px', border: 'none', background: 'none', fontSize: 13, color: '#1e2a3b', cursor: 'pointer' }
  const realcar = e => { e.currentTarget.style.background = '#eff6ff' }
  const apagar = e => { e.currentTarget.style.background = 'none' }
  return (
    <div ref={ref} onContextMenu={e => e.preventDefault()}
      style={{ position: 'fixed', left: pos.left, top: pos.top, zIndex: 1000, minWidth: 220, maxWidth: 360, background: 'white', border: '1px solid #d1d5db', borderRadius: 8, boxShadow: '0 8px 24px rgba(0,0,0,.18)', padding: '4px 0' }}>
      {comFiltro && (
        <button type="button" style={{ ...item, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} onMouseEnter={realcar} onMouseLeave={apagar} onClick={onFiltrar}>
          🔎 Filtrar {rotulo}: <b>{texto}</b>
        </button>
      )}
      {comFiltro && ativo && (
        <button type="button" style={{ ...item, color: '#dc2626' }} onMouseEnter={realcar} onMouseLeave={apagar} onClick={onRemover}>
          ✕ Remover filtro de {rotulo}
        </button>
      )}
      {comFiltro && acoes.length > 0 && <div style={{ borderTop: '1px solid #f3f4f6', margin: '4px 0' }} />}
      {acoes.map(a => (
        <button key={a.label} type="button" disabled={a.desabilitada} style={{ ...item, opacity: a.desabilitada ? 0.5 : 1, cursor: a.desabilitada ? 'default' : 'pointer' }} onMouseEnter={realcar} onMouseLeave={apagar} onClick={a.onClick}>
          {a.label}
        </button>
      ))}
    </div>
  )
}
