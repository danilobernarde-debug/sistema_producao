import { useState, useEffect, useMemo } from 'react'
import { listarAnexosRegistro } from '../utils/anexosFotos'

const EXT_IMAGEM = /\.(jpe?g|png|webp|gif|bmp|heic)$/i
const ehImagem = a => (a.tipo || '').startsWith('image/') || EXT_IMAGEM.test(a.nome || '')

function dataHoraBr(iso) {
  if (!iso) return ''
  return new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' })
}

// Miniaturas dos anexos de um registro; clicar abre o visualizador (← →, Esc).
export default function GaleriaFotos({ registroId }) {
  const [anexos, setAnexos] = useState(null) // null = carregando
  const [erro, setErro] = useState('')
  const [aberta, setAberta] = useState(null) // índice dentro de "fotos"

  useEffect(() => {
    let cancelado = false
    setAnexos(null); setErro('')
    listarAnexosRegistro(registroId)
      .then(l => { if (!cancelado) setAnexos(l) })
      .catch(e => { if (!cancelado) { setErro(e.message); setAnexos([]) } })
    return () => { cancelado = true }
  }, [registroId])

  const fotos = useMemo(() => (anexos || []).filter(a => ehImagem(a) && a.url), [anexos])
  const indisponiveis = (anexos || []).filter(a => ehImagem(a) && !a.url).length
  const outros = (anexos || []).filter(a => !ehImagem(a))

  if (anexos === null) return <div style={{ color: '#6b7280', fontSize: 13 }}>Carregando fotos...</div>
  if (erro) return <div className="campo-erro-msg">{erro}</div>
  if (anexos.length === 0) return <div style={{ color: '#6b7280', fontSize: 13 }}>Nenhuma foto neste lançamento.</div>

  return (
    <>
      {fotos.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {fotos.map((f, i) => (
            <button key={f.id} type="button" onClick={() => setAberta(i)} title="Clique para ampliar"
              style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}>
              <img src={f.url} alt={f.nome} loading="lazy"
                style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }} />
            </button>
          ))}
        </div>
      )}
      {indisponiveis > 0 && (
        <div style={{ color: '#c2410c', fontSize: 12, marginTop: 8 }}>{indisponiveis} foto(s) não puderam ser carregadas do SharePoint.</div>
      )}
      {outros.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {outros.map(o => (
            <a key={o.id} href={o.url || o.link} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 6, color: '#1d4ed8', textDecoration: 'none' }}>
              📄 {o.nome}
            </a>
          ))}
        </div>
      )}
      {aberta !== null && fotos[aberta] && (
        <Visualizador fotos={fotos} indice={aberta} onMudar={setAberta} onFechar={() => setAberta(null)} />
      )}
    </>
  )
}

// Foto ampliada com setas, teclado (← → Esc) e deslize no celular.
function Visualizador({ fotos, indice, onMudar, onFechar }) {
  const foto = fotos[indice]
  const anterior = indice > 0 ? indice - 1 : null
  const proxima = indice < fotos.length - 1 ? indice + 1 : null
  const [toqueX, setToqueX] = useState(null)

  useEffect(() => {
    function tecla(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onFechar() }
      else if (e.key === 'ArrowLeft' && anterior !== null) onMudar(anterior)
      else if (e.key === 'ArrowRight' && proxima !== null) onMudar(proxima)
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [anterior, proxima, onMudar, onFechar])

  function fimToque(e) {
    if (toqueX === null) return
    const dx = e.changedTouches[0].clientX - toqueX
    setToqueX(null)
    if (dx > 60 && anterior !== null) onMudar(anterior)
    else if (dx < -60 && proxima !== null) onMudar(proxima)
  }

  const seta = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.18)', color: 'white', border: 'none', borderRadius: '50%', width: 48, height: 48, fontSize: 28, cursor: 'pointer', lineHeight: 1 }

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2100, background: 'rgba(0,0,0,0.88)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onFechar() }}
      onTouchStart={e => setToqueX(e.touches[0].clientX)}
      onTouchEnd={fimToque}
    >
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, padding: '12px 16px', color: 'white' }}>
        <span style={{ fontSize: 14 }}>Foto {indice + 1} de {fotos.length}{foto.quando ? ` · ${dataHoraBr(foto.quando)}` : ''}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <a className="btn btn-primario" href={foto.url} target="_blank" rel="noopener noreferrer" download={foto.nome}>⬇ Baixar</a>
          <button type="button" className="btn btn-secundario" onClick={onFechar}>Fechar</button>
        </div>
      </div>
      {anterior !== null && <button type="button" style={{ ...seta, left: 16 }} onClick={() => onMudar(anterior)} aria-label="Foto anterior">‹</button>}
      <img src={foto.url} alt={foto.nome} style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 4 }} />
      {proxima !== null && <button type="button" style={{ ...seta, right: 16 }} onClick={() => onMudar(proxima)} aria-label="Próxima foto">›</button>}
    </div>
  )
}
