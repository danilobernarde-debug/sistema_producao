import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { tipoAnexo, dataHoraBr } from '../utils/anexosFotos'

// Visualizador em tela cheia de anexos: imagem e PDF, com setas (← →), Esc, deslizar no celular,
// botão de tela cheia do navegador e download.
// itens: [{ id, nome, tipo, url, quando, subtitulo? }]
export default function VisualizadorAnexos({ itens, indice, onMudar, onFechar }) {
  const item = itens[indice]
  const anterior = indice > 0 ? indice - 1 : null
  const proxima = indice < itens.length - 1 ? indice + 1 : null
  const raiz = useRef(null)
  const [toqueX, setToqueX] = useState(null)
  const [telaCheia, setTelaCheia] = useState(false)
  const tipo = tipoAnexo(item)

  useEffect(() => {
    function tecla(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onFechar() }
      else if (e.key === 'ArrowLeft' && anterior !== null) onMudar(anterior)
      else if (e.key === 'ArrowRight' && proxima !== null) onMudar(proxima)
    }
    const aoMudarTela = () => setTelaCheia(!!document.fullscreenElement)
    window.addEventListener('keydown', tecla, true)
    document.addEventListener('fullscreenchange', aoMudarTela)
    return () => {
      window.removeEventListener('keydown', tecla, true)
      document.removeEventListener('fullscreenchange', aoMudarTela)
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    }
  }, [anterior, proxima, onMudar, onFechar])

  function alternarTelaCheia() {
    if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {})
    else raiz.current?.requestFullscreen?.().catch(() => {})
  }

  function fimToque(e) {
    if (toqueX === null) return
    const dx = e.changedTouches[0].clientX - toqueX
    setToqueX(null)
    if (dx > 60 && anterior !== null) onMudar(anterior)
    else if (dx < -60 && proxima !== null) onMudar(proxima)
  }

  const seta = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.18)', color: 'white', border: 'none', borderRadius: '50%', width: 48, height: 48, fontSize: 28, cursor: 'pointer', lineHeight: 1, zIndex: 2 }

  // no body: assim não herda opacity/pointer-events do formulário (modo Visualizar)
  return createPortal(
    <div
      ref={raiz}
      style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.9)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onFechar() }}
      onTouchStart={e => tipo === 'imagem' && setToqueX(e.touches[0].clientX)}
      onTouchEnd={fimToque}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '10px 16px', color: 'white', zIndex: 3, background: 'linear-gradient(rgba(0,0,0,.6), transparent)' }}>
        <div style={{ minWidth: 0 }}>
          <div style={{ fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {item.nome}
          </div>
          <div style={{ fontSize: 12, opacity: 0.75 }}>
            {indice + 1} de {itens.length}{item.subtitulo ? ` · ${item.subtitulo}` : ''}{item.quando ? ` · enviado em ${dataHoraBr(item.quando)}` : ''}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, flexShrink: 0 }}>
          <button type="button" className="btn btn-secundario" onClick={alternarTelaCheia} title="Tela cheia">{telaCheia ? '⤢ Sair da tela cheia' : '⛶ Tela cheia'}</button>
          <a className="btn btn-primario" href={item.url} target="_blank" rel="noopener noreferrer" download={item.nome}>⬇ Baixar</a>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Fechar</button>
        </div>
      </div>

      {anterior !== null && <button type="button" style={{ ...seta, left: 16 }} onClick={() => onMudar(anterior)} aria-label="Anterior">‹</button>}

      {tipo === 'imagem' && (
        <img src={item.url} alt={item.nome} style={{ maxWidth: '94vw', maxHeight: '88vh', objectFit: 'contain', borderRadius: 4 }} />
      )}
      {tipo === 'pdf' && <QuadroPdf key={item.id} url={item.url} nome={item.nome} />}
      {tipo === 'outro' && (
        <div style={{ color: 'white', textAlign: 'center' }}>
          <div style={{ fontSize: 56 }}>📎</div>
          <div style={{ marginTop: 8, fontSize: 16 }}>{item.nome}</div>
          <div style={{ margin: '4px 0 16px', opacity: 0.75 }}>Este tipo de arquivo não tem visualização. Baixe para abrir no seu computador.</div>
          <a className="btn btn-primario" href={item.url} target="_blank" rel="noopener noreferrer" download={item.nome}>⬇ Baixar {item.nome}</a>
        </div>
      )}

      {proxima !== null && <button type="button" style={{ ...seta, right: 16 }} onClick={() => onMudar(proxima)} aria-label="Próximo">›</button>}
    </div>,
    document.body,
  )
}

// PDF dentro da tela. O Storage responde com cabeçalhos que impedem mostrar o PDF direto num iframe,
// então baixa o arquivo e mostra a cópia local (blob); se o download falhar, tenta o link direto.
function QuadroPdf({ url, nome }) {
  const [src, setSrc] = useState(null)
  useEffect(() => {
    let cancelado = false
    let blobUrl = null
    setSrc(null)
    fetch(url)
      .then(r => { if (!r.ok) throw new Error(); return r.blob() })
      .then(b => {
        blobUrl = URL.createObjectURL(new Blob([b], { type: 'application/pdf' }))
        if (!cancelado) setSrc(blobUrl)
      })
      .catch(() => { if (!cancelado) setSrc(url) })
    return () => { cancelado = true; if (blobUrl) URL.revokeObjectURL(blobUrl) }
  }, [url])

  if (!src) return <div style={{ color: 'white' }}>Carregando PDF...</div>
  return <iframe title={nome} src={src} style={{ width: '88vw', height: '88vh', border: 'none', background: 'white', borderRadius: 4, marginTop: 24 }} />
}
