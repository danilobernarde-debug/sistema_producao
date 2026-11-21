import { useState, useEffect, useMemo } from 'react'
import { listarAnexosRegistro, tipoAnexo } from '../utils/anexosFotos'
import VisualizadorAnexos from './VisualizadorAnexos'

// Anexos de um lançamento: miniaturas das fotos e PDFs; clicar abre o visualizador em tela cheia (← →, Esc).
export default function GaleriaFotos({ registroId }) {
  const [anexos, setAnexos] = useState(null) // null = carregando
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState(null) // índice dentro de "visiveis"

  useEffect(() => {
    let cancelado = false
    setAnexos(null); setErro('')
    listarAnexosRegistro(registroId)
      .then(l => { if (!cancelado) setAnexos(l) })
      .catch(e => { if (!cancelado) { setErro(e.message); setAnexos([]) } })
    return () => { cancelado = true }
  }, [registroId])

  // imagem e PDF com link abrem no visualizador; o resto vira link de download
  const visiveis = useMemo(() => (anexos || []).filter(a => a.url && tipoAnexo(a) !== 'outro'), [anexos])
  const indiceDe = id => visiveis.findIndex(v => v.id === id)
  const indisponiveis = (anexos || []).filter(a => !a.url).length
  const outros = (anexos || []).filter(a => a.url && tipoAnexo(a) === 'outro')

  if (anexos === null) return <div style={{ color: '#6b7280', fontSize: 13 }}>Carregando fotos...</div>
  if (erro) return <div className="campo-erro-msg">{erro}</div>
  if (anexos.length === 0) return <div style={{ color: '#6b7280', fontSize: 13 }}>Nenhum anexo neste lançamento.</div>

  return (
    <>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
        {visiveis.map(a => (
          <button key={a.id} type="button" onClick={() => setAberto(indiceDe(a.id))} title="Clique para ampliar"
            style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}>
            {tipoAnexo(a) === 'imagem' ? (
              <img src={a.url} alt={a.nome} loading="lazy"
                style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }} />
            ) : (
              <div style={{ height: 110, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6 }}>
                <span style={{ fontSize: 30 }}>📄</span>
                <span style={{ fontSize: 11, color: '#374151', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.nome}</span>
              </div>
            )}
          </button>
        ))}
      </div>
      {indisponiveis > 0 && (
        <div style={{ color: '#c2410c', fontSize: 12, marginTop: 8 }}>{indisponiveis} anexo(s) não puderam ser carregados.</div>
      )}
      {outros.length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
          {outros.map(o => (
            <a key={o.id} href={o.url} target="_blank" rel="noopener noreferrer"
              style={{ fontSize: 13, padding: '4px 10px', border: '1px solid #e5e7eb', borderRadius: 6, color: '#1d4ed8', textDecoration: 'none' }}>
              ⬇ {o.nome}
            </a>
          ))}
        </div>
      )}
      {aberto !== null && visiveis[aberto] && (
        <VisualizadorAnexos itens={visiveis} indice={aberto} onMudar={setAberto} onFechar={() => setAberto(null)} />
      )}
    </>
  )
}
