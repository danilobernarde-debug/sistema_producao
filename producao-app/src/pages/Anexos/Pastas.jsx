import { useState, useEffect, useMemo } from 'react'
import { supabase } from '../../supabaseClient'
import VisualizadorAnexos from '../../components/VisualizadorAnexos'
import { tipoAnexo, linksDosArquivos, tamanhoBr, dataHoraBr } from '../../utils/anexosFotos'
import { COLUNAS_ANEXO, EMBED_REGISTRO, dataBr, Miniatura, paraItemVisualizador } from './comum'

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro']
const toqueGrosso = typeof window !== 'undefined' && window.matchMedia?.('(pointer: coarse)').matches

async function carregarTodos() {
  const linhas = []
  for (let de = 0; ; de += 1000) {
    const { data, error } = await supabase.from('f_prod_arquivos')
      .select(`${COLUNAS_ANEXO}, ${EMBED_REGISTRO}`).order('id').range(de, de + 999)
    if (error) throw error
    linhas.push(...data)
    if (data.length < 1000) break
  }
  return linhas
}

// Navegação por pastas, como no Explorer: Contrato › Equipe › Mês › Dia › arquivos.
// As pastas são virtuais: vêm do lançamento (contrato, equipe, data da produção) a que o anexo pertence.
// Contrato em que nenhum anexo tem equipe (ex.: contratos por colaborador) pula o nível Equipe.
export default function Pastas({ cad }) {
  const [linhas, setLinhas] = useState(null)
  const [erro, setErro] = useState('')
  const [caminho, setCaminho] = useState([]) // chaves das pastas abertas
  const [selecionado, setSelecionado] = useState(null)
  const [modo, setModo] = useState(() => { try { return sessionStorage.getItem('anexos-pastas-modo') || 'icones' } catch { return 'icones' } })
  const [links, setLinks] = useState(new Map())
  const [aberto, setAberto] = useState(null)

  useEffect(() => {
    let vivo = true
    carregarTodos().then(l => { if (vivo) setLinhas(l) }).catch(e => { if (vivo) { setErro(e.message); setLinhas([]) } })
    return () => { vivo = false }
  }, [])

  function mudarModo(m) { setModo(m); try { sessionStorage.setItem('anexos-pastas-modo', m) } catch {} }

  // cada anexo ganha o caminho de pastas onde "mora"
  const itens = useMemo(() => {
    if (!linhas) return []
    const contratoComEquipe = new Set(linhas.filter(l => l.registro?.equipe_id != null).map(l => l.registro.contrato_id))
    return linhas.filter(l => l.registro).map(l => {
      const r = l.registro
      const dia = String(r.data_producao).slice(0, 10)
      const chaves = [String(r.contrato_id)]
      const rotulos = [cad.nomeContrato(r.contrato_id)]
      const tipos = ['nome']
      if (contratoComEquipe.has(r.contrato_id)) {
        chaves.push(r.equipe_id == null ? 'sem-equipe' : String(r.equipe_id))
        rotulos.push(cad.nomeEquipe(r.equipe_id) || 'Sem equipe')
        tipos.push('nome')
      }
      chaves.push(dia.slice(0, 7)); rotulos.push(`${MESES[Number(dia.slice(5, 7)) - 1]} de ${dia.slice(0, 4)}`); tipos.push('data')
      chaves.push(dia); rotulos.push(dataBr(dia)); tipos.push('data')
      return { ...l, chaves, rotulos, tipos }
    })
  }, [linhas, cad.contratos, cad.equipes])

  const nivel = caminho.length
  const { pastas, arquivos } = useMemo(() => {
    const filhas = new Map()
    const arqs = []
    for (const it of itens) {
      if (caminho.some((k, i) => it.chaves[i] !== k)) continue
      if (it.chaves.length === nivel) { arqs.push(it); continue }
      const k = it.chaves[nivel]
      const f = filhas.get(k) || { chave: k, rotulo: it.rotulos[nivel], tipo: it.tipos[nivel], qtd: 0 }
      f.qtd++
      filhas.set(k, f)
    }
    const lista = [...filhas.values()].sort((a, b) =>
      a.tipo === 'data' ? b.chave.localeCompare(a.chave) : a.rotulo.localeCompare(b.rotulo, 'pt-BR', { numeric: true }))
    arqs.sort((a, b) => a.id - b.id)
    return { pastas: lista, arquivos: arqs }
  }, [itens, caminho, nivel])

  // links de leitura dos arquivos da pasta aberta (SharePoint pede ao servidor)
  useEffect(() => {
    if (!arquivos.length) return
    let vivo = true
    linksDosArquivos(arquivos).then(m => { if (vivo) setLinks(m) })
    return () => { vivo = false }
  }, [arquivos])

  // trilha (Anexos › Contrato › ...)
  const trilha = caminho.map((k, i) => {
    const ref = itens.find(it => caminho.slice(0, i + 1).every((c, j) => it.chaves[j] === c))
    return { rotulo: ref?.rotulos[i] || k, ate: i + 1 }
  })

  function abrirPasta(chave) { setCaminho([...caminho, chave]); setSelecionado(null) }
  function irPara(n) { setCaminho(caminho.slice(0, n)); setSelecionado(null) }

  const visiveis = arquivos.filter(a => links.get(a.id) && tipoAnexo(a) !== 'outro')
  function abrirArquivo(a) {
    const url = links.get(a.id)
    if (!url) return
    if (tipoAnexo(a) === 'outro') { window.open(url, '_blank', 'noopener'); return }
    setAberto(visiveis.findIndex(v => v.id === a.id))
  }
  const subtitulo = a => `lançamento #${a.registro_id}${trilha.length ? ' · ' + trilha.map(t => t.rotulo).join(' › ') : ''}`

  function ativar(id, aoAbrir) {
    if (toqueGrosso || selecionado === id) aoAbrir()
    else setSelecionado(id)
  }

  if (linhas === null) return <div className="card" style={{ color: '#6b7280' }}>Carregando anexos...</div>
  if (erro) return <div className="alerta alerta-erro">{erro}</div>

  const estiloItem = sel => ({
    display: 'flex', cursor: 'pointer', borderRadius: 6, border: `1px solid ${sel ? '#93c5fd' : 'transparent'}`,
    background: sel ? '#dbeafe' : 'transparent', padding: 6, userSelect: 'none',
  })
  const vazio = pastas.length === 0 && arquivos.length === 0

  return (
    <div className="card" style={{ padding: 0 }}>
      {/* barra: subir, trilha e modo de exibição */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderBottom: '1px solid #f3f4f6', flexWrap: 'wrap' }}>
        <button className="btn btn-secundario" style={{ padding: '4px 10px' }} disabled={nivel === 0} onClick={() => irPara(nivel - 1)} title="Subir um nível">↑</button>
        <div style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 4, fontSize: 14 }}>
          <button onClick={() => irPara(0)} style={{ background: 'none', border: 'none', color: '#1d4ed8', cursor: 'pointer', fontSize: 14, padding: '2px 4px' }}>📁 Anexos</button>
          {trilha.map(t => (
            <span key={t.ate} style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
              <span style={{ color: '#9ca3af' }}>›</span>
              <button onClick={() => irPara(t.ate)} disabled={t.ate === nivel}
                style={{ background: 'none', border: 'none', color: t.ate === nivel ? '#1e2a3b' : '#1d4ed8', fontWeight: t.ate === nivel ? 600 : 400, cursor: t.ate === nivel ? 'default' : 'pointer', fontSize: 14, padding: '2px 4px' }}>
                {t.rotulo}
              </button>
            </span>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 4 }}>
          <button className={`btn ${modo === 'icones' ? 'btn-primario' : 'btn-secundario'}`} style={{ padding: '4px 10px' }} onClick={() => mudarModo('icones')} title="Ícones">▦</button>
          <button className={`btn ${modo === 'detalhes' ? 'btn-primario' : 'btn-secundario'}`} style={{ padding: '4px 10px' }} onClick={() => mudarModo('detalhes')} title="Detalhes">☰</button>
        </div>
      </div>

      <div style={{ padding: 14, minHeight: 260 }} onMouseDown={e => { if (e.target === e.currentTarget) setSelecionado(null) }}>
        {vazio && <div style={{ color: '#6b7280', fontSize: 13 }}>Nenhum anexo aqui.</div>}

        {modo === 'icones' ? (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 8 }}>
            {pastas.map(p => (
              <div key={p.chave} style={{ ...estiloItem(selecionado === 'p' + p.chave), flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4 }}
                onClick={() => ativar('p' + p.chave, () => abrirPasta(p.chave))} onDoubleClick={() => abrirPasta(p.chave)}>
                <span style={{ fontSize: 54, lineHeight: 1 }}>📁</span>
                <span style={{ fontSize: 13, color: '#1e2a3b', wordBreak: 'break-word' }}>{p.rotulo}</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{p.qtd} anexo{p.qtd !== 1 ? 's' : ''}</span>
              </div>
            ))}
            {arquivos.map(a => (
              <div key={a.id} style={{ ...estiloItem(selecionado === 'a' + a.id), flexDirection: 'column', alignItems: 'center', textAlign: 'center', gap: 4 }}
                onClick={() => ativar('a' + a.id, () => abrirArquivo(a))} onDoubleClick={() => abrirArquivo(a)} title={`${a.name}\nEnviado em ${dataHoraBr(a.data_cadastro)}`}>
                <Miniatura anexo={a} url={links.get(a.id)} tamanho={110} raio={6} />
                <span style={{ fontSize: 12, color: '#1e2a3b', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.name}</span>
                <span style={{ fontSize: 11, color: '#6b7280' }}>{tamanhoBr(a.size)}</span>
              </div>
            ))}
          </div>
        ) : (
          !vazio && (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ textAlign: 'left', color: '#374151', fontSize: 12 }}>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb' }}>Nome</th>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb' }}>Enviado em</th>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb' }}>Lançamento</th>
                  <th style={{ padding: '6px 8px', borderBottom: '2px solid #e5e7eb', textAlign: 'right' }}>Tamanho</th>
                </tr>
              </thead>
              <tbody>
                {pastas.map(p => (
                  <tr key={p.chave} style={{ cursor: 'pointer', background: selecionado === 'p' + p.chave ? '#dbeafe' : undefined }}
                    onClick={() => ativar('p' + p.chave, () => abrirPasta(p.chave))} onDoubleClick={() => abrirPasta(p.chave)}>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6' }}>📁 {p.rotulo}</td>
                    <td style={{ padding: '6px 8px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>{p.qtd} anexo{p.qtd !== 1 ? 's' : ''}</td>
                    <td style={{ borderBottom: '1px solid #f3f4f6' }} /><td style={{ borderBottom: '1px solid #f3f4f6' }} />
                  </tr>
                ))}
                {arquivos.map(a => (
                  <tr key={a.id} style={{ cursor: 'pointer', background: selecionado === 'a' + a.id ? '#dbeafe' : undefined }}
                    onClick={() => ativar('a' + a.id, () => abrirArquivo(a))} onDoubleClick={() => abrirArquivo(a)}>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6' }}>
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8 }}><Miniatura anexo={a} url={links.get(a.id)} tamanho={32} />{a.name}</span>
                    </td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>{dataHoraBr(a.data_cadastro)}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', color: '#6b7280' }}>#{a.registro_id}</td>
                    <td style={{ padding: '4px 8px', borderBottom: '1px solid #f3f4f6', color: '#6b7280', textAlign: 'right' }}>{tamanhoBr(a.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )
        )}
      </div>

      <div style={{ padding: '8px 14px', borderTop: '1px solid #f3f4f6', fontSize: 12, color: '#6b7280' }}>
        {pastas.length > 0 && `${pastas.length} pasta${pastas.length !== 1 ? 's' : ''}`}
        {pastas.length > 0 && arquivos.length > 0 && ' · '}
        {arquivos.length > 0 && `${arquivos.length} arquivo${arquivos.length !== 1 ? 's' : ''}`}
        {!toqueGrosso && ' — clique duas vezes para abrir'}
      </div>

      {aberto !== null && visiveis[aberto] && (
        <VisualizadorAnexos
          itens={visiveis.map(a => paraItemVisualizador(a, links.get(a.id), subtitulo(a)))}
          indice={aberto} onMudar={setAberto} onFechar={() => setAberto(null)}
        />
      )}
    </div>
  )
}
