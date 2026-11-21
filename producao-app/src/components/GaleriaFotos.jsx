import { useState, useEffect, useMemo, useRef } from 'react'
import { listarAnexosRegistro, enviarAnexoRegistro, excluirAnexo, tipoAnexo, MAX_ARQUIVO } from '../utils/anexosFotos'
import VisualizadorAnexos from './VisualizadorAnexos'

// Anexos de um lançamento. Foto e PDF abrem no visualizador em tela cheia (← →, Esc); os outros tipos só baixam.
// Com editavel, também adiciona e remove anexos.
export default function GaleriaFotos({ registroId, editavel = false }) {
  const [anexos, setAnexos] = useState(null) // null = carregando
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState(null) // índice dentro de "visiveis"
  const [recarga, setRecarga] = useState(0)
  const [enviando, setEnviando] = useState(null) // { atual, total, nome }
  const [avisos, setAvisos] = useState([])
  const entrada = useRef(null)

  useEffect(() => {
    let cancelado = false
    setErro('')
    listarAnexosRegistro(registroId)
      .then(l => { if (!cancelado) setAnexos(l) })
      .catch(e => { if (!cancelado) { setErro(e.message); setAnexos([]) } })
    return () => { cancelado = true }
  }, [registroId, recarga])

  // imagem e PDF com link abrem no visualizador
  const visiveis = useMemo(() => (anexos || []).filter(a => a.url && tipoAnexo(a) !== 'outro'), [anexos])
  const indiceDe = id => visiveis.findIndex(v => v.id === id)

  async function adicionar(e) {
    const arquivos = Array.from(e.target.files || [])
    e.target.value = ''
    if (!arquivos.length) return
    setAvisos([])
    const falhas = []
    for (let i = 0; i < arquivos.length; i++) {
      setEnviando({ atual: i + 1, total: arquivos.length, nome: arquivos[i].name })
      try { await enviarAnexoRegistro(registroId, arquivos[i]) } catch (er) { falhas.push(`${arquivos[i].name}: ${er.message}`) }
    }
    setEnviando(null)
    setAvisos(falhas)
    setRecarga(n => n + 1)
  }

  async function remover(a) {
    if (!window.confirm(`Remover "${a.nome}" deste lançamento?`)) return
    setAvisos([])
    try {
      await excluirAnexo(a.id)
      setRecarga(n => n + 1)
    } catch (er) {
      setAvisos([`Não foi possível remover "${a.nome}": ${er.message}`])
    }
  }

  const botaoRemover = a => editavel && (
    <button type="button" onClick={ev => { ev.stopPropagation(); remover(a) }} aria-label={`Remover ${a.nome}`} title="Remover"
      style={{ position: 'absolute', top: 3, right: 3, width: 24, height: 24, borderRadius: '50%', border: 'none', background: 'rgba(0,0,0,.7)', color: '#fff', cursor: 'pointer', lineHeight: 1, fontSize: 15 }}>×</button>
  )

  const cartao = { height: 110, borderRadius: 6, border: '1px solid #e5e7eb', background: '#f9fafb', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 4, padding: 6, width: '100%', boxSizing: 'border-box' }
  const legenda = { fontSize: 11, color: '#374151', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }

  return (
    <div style={{ pointerEvents: 'auto' /* o modo Visualizar desliga cliques no formulário; aqui precisa ampliar */ }}>
      {editavel && (
        <div style={{ marginBottom: 12 }}>
          <button type="button" className="btn btn-secundario" disabled={!!enviando} onClick={() => entrada.current?.click()}>
            {enviando ? `Enviando ${enviando.atual} de ${enviando.total}...` : '＋ Adicionar arquivos'}
          </button>
          <input ref={entrada} type="file" multiple hidden onChange={adicionar} />
          <span style={{ marginLeft: 10, fontSize: 12, color: '#6b7280' }}>
            Fotos e PDF abrem no visualizador; outros tipos só baixam. Máx. {MAX_ARQUIVO / 1024 / 1024} MB por arquivo.
          </span>
        </div>
      )}

      {avisos.length > 0 && (
        <div className="campo-erro-msg" style={{ marginBottom: 10 }}>
          {avisos.map((a, i) => <div key={i}>{a}</div>)}
        </div>
      )}

      {anexos === null ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>Carregando anexos...</div>
      ) : erro ? (
        <div className="campo-erro-msg">{erro}</div>
      ) : anexos.length === 0 ? (
        <div style={{ color: '#6b7280', fontSize: 13 }}>Nenhum anexo neste lançamento.</div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: 8 }}>
          {anexos.map(a => {
            const tipo = tipoAnexo(a)
            let conteudo
            if (!a.url) {
              conteudo = <div style={{ ...cartao, color: '#c2410c' }}><span style={{ fontSize: 24 }}>⚠️</span><span style={legenda}>{a.nome}</span><span style={{ fontSize: 10 }}>indisponível</span></div>
            } else if (tipo === 'imagem') {
              conteudo = (
                <button type="button" onClick={() => setAberto(indiceDe(a.id))} title="Clique para ampliar" style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', width: '100%' }}>
                  <img src={a.url} alt={a.nome} loading="lazy" style={{ width: '100%', height: 110, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }} />
                </button>
              )
            } else if (tipo === 'pdf') {
              conteudo = (
                <button type="button" onClick={() => setAberto(indiceDe(a.id))} title="Clique para abrir" style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in', width: '100%' }}>
                  <div style={cartao}><span style={{ fontSize: 30 }}>📄</span><span style={legenda}>{a.nome}</span></div>
                </button>
              )
            } else {
              conteudo = (
                <a href={a.url} target="_blank" rel="noopener noreferrer" download={a.nome} title="Clique para baixar" style={{ textDecoration: 'none', display: 'block', width: '100%' }}>
                  <div style={cartao}><span style={{ fontSize: 30 }}>📎</span><span style={legenda}>{a.nome}</span><span style={{ fontSize: 11, color: '#1d4ed8' }}>⬇ baixar</span></div>
                </a>
              )
            }
            return <div key={a.id} style={{ position: 'relative' }}>{conteudo}{botaoRemover(a)}</div>
          })}
        </div>
      )}

      {aberto !== null && visiveis[aberto] && (
        <VisualizadorAnexos itens={visiveis} indice={aberto} onMudar={setAberto} onFechar={() => setAberto(null)} />
      )}
    </div>
  )
}
