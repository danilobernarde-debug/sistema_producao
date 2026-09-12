import { useState, useEffect, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

const IDS_FAIXA_TO = new Set([17, 18, 19])

function fmt(n) {
  return Number(n || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function fmtData(d) {
  if (!d) return '—'
  const [ano, mes, dia] = String(d).slice(0, 10).split('-')
  return `${dia}/${mes}/${ano}`
}

function hojeStr() { return new Date().toISOString().slice(0, 10) }
function seteDiasAtras() {
  const d = new Date()
  d.setDate(d.getDate() - 6)
  return d.toISOString().slice(0, 10)
}

function statusCard(valorTotal, perc, paralisada) {
  if (valorTotal === 0) return { cor: '#dc2626', fundo: '#fef2f2', borda: '#fca5a5', label: 'PARADO' }
  if (paralisada)       return { cor: '#dc2626', fundo: '#fef2f2', borda: '#fca5a5', label: 'PARALISADA' }
  if (perc === null)    return { cor: '#6b7280', fundo: '#f9fafb', borda: '#e5e7eb', label: null }
  if (perc >= 100)      return { cor: '#16a34a', fundo: '#f0fdf4', borda: '#86efac', label: null }
  if (perc >= 50)       return { cor: '#d97706', fundo: '#fffbeb', borda: '#fcd34d', label: null }
  return                       { cor: '#dc2626', fundo: '#fef2f2', borda: '#fca5a5', label: null }
}

function pareceParalisada(texto) {
  return /paralisad/i.test(String(texto || ''))
}

async function lerMetas(dataInicio, dataFim) {
  const { data } = await supabase
    .from('d_metas_diarias')
    .select('tipo_equipe_id, meta_diaria')
    .gte('data', dataInicio)
    .lte('data', dataFim)
  const mapa = {}
  ;(data || []).forEach(row => {
    const tid = String(row.tipo_equipe_id)
    mapa[tid] = (mapa[tid] || 0) + Number(row.meta_diaria)
  })
  return mapa
}

export default function PainelEquipes() {
  const navegar = useNavigate()
  const [dataInicio, setDataInicio] = useState(seteDiasAtras())
  const [dataFim, setDataFim]       = useState(hojeStr())
  const [rows, setRows]               = useState([])
  const [metas, setMetas]             = useState({})
  const [colabByEquipe, setColabByEquipe] = useState({})
  const [carregando, setCarregando]   = useState(false)
  const [erro, setErro]               = useState('')
  const [expandido, setExpandido]     = useState(null)

  useEffect(() => {
    if (!expandido) return
    function fechar(e) {
      if (!e.target.closest(`[data-equipe="${expandido.id}"]`)) setExpandido(null)
    }
    document.addEventListener('mousedown', fechar)
    return () => document.removeEventListener('mousedown', fechar)
  }, [expandido])

  async function buscar(ini, fim) {
    setCarregando(true)
    setErro('')
    const [resRows, resMetas, resColab] = await Promise.all([
      supabase.rpc('fn_prod_relatorio_equipes', { p_inicio: ini, p_fim: fim, p_limit: 100000, p_offset: 0 }),
      lerMetas(ini, fim),
      supabase.rpc('fn_prod_relatorio_colaboradores', { p_inicio: ini, p_fim: fim, p_limit: 100000, p_offset: 0 }),
    ])
    if (resRows.error) {
      setErro(`Erro: ${resRows.error.message}`)
      setCarregando(false)
      return
    }
    setRows(resRows.data || [])
    setMetas(resMetas)

    // agrupa colaboradores por equipe: equipe_id → [{ nome, dias }] ordenado por dias desc
    const mapa = {}
    ;(resColab.data || []).forEach(r => {
      const eid = r.equipe_id
      if (!eid || !r.nome_colaborador) return
      if (!mapa[eid]) mapa[eid] = {}
      if (!mapa[eid][r.colaborador_id]) mapa[eid][r.colaborador_id] = { nome: r.nome_colaborador, dias: new Set() }
      mapa[eid][r.colaborador_id].dias.add(r.data_producao)
    })
    const colabMap = {}
    Object.entries(mapa).forEach(([eid, pessoas]) => {
      colabMap[eid] = Object.values(pessoas)
        .map(p => ({ nome: p.nome, dias: p.dias.size }))
        .sort((a, b) => b.dias - a.dias || a.nome.localeCompare(b.nome))
    })
    setColabByEquipe(colabMap)
    setCarregando(false)
  }

  useEffect(() => { buscar(dataInicio, dataFim) }, []) // eslint-disable-line react-hooks/exhaustive-deps

  const cards = useMemo(() => {
    // agrupa dados por equipe
    const map = {}
    rows.forEach(v => {
      const eid = v.equipe_id
      if (!eid) return
      if (!map[eid]) {
        map[eid] = {
          equipe_id:      eid,
          desc_equipe:    v.desc_equipe || `Equipe ${eid}`,
          contrato_id:    v.contrato_id,
          desc_contrato:  v.desc_contrato,
          tipo_equipe_id: v.tipo_equipe_id,
          desc_tipo:      v.desc_tipo_equipe,
          encarregado:    v.encarregado || null,
          valor_total:    0,
          data_ultimo:    null,
          textosUltimo:   [],
        }
      }
      map[eid].valor_total += Number(v.valor_producao || 0)
      if (!map[eid].encarregado && v.encarregado) map[eid].encarregado = v.encarregado
      const dataLinha = v.data_producao_original
      if (!map[eid].data_ultimo || dataLinha > map[eid].data_ultimo) {
        map[eid].data_ultimo = dataLinha
        map[eid].textosUltimo = [v.justificativa, v.metadata_registro?.observacoes]
      } else if (dataLinha === map[eid].data_ultimo) {
        map[eid].textosUltimo.push(v.justificativa, v.metadata_registro?.observacoes)
      }
    })

    // justificativas por equipe (dedup por registro_id + texto)
    const justVistos = new Set()
    const justByEquipe = {}
    rows.filter(v => v.justificativa && v.equipe_id).forEach(v => {
      const dedup = `${v.registro_id}|${v.justificativa}`
      if (justVistos.has(dedup)) return
      justVistos.add(dedup)
      ;(justByEquipe[v.equipe_id] = justByEquipe[v.equipe_id] || []).push({
        data: v.data_producao_original, texto: v.justificativa,
      })
    })

    // observações por equipe (uma por registro_id)
    const obsVistos = new Set()
    const obsByEquipe = {}
    rows.forEach(v => {
      if (!v.equipe_id || obsVistos.has(v.registro_id)) return
      const obs = v.metadata_registro?.observacoes
      if (!obs || !String(obs).trim()) return
      obsVistos.add(v.registro_id)
      ;(obsByEquipe[v.equipe_id] = obsByEquipe[v.equipe_id] || []).push({
        data: v.data_producao_original, texto: String(obs).trim(),
      })
    })

    return Object.values(map)
      .map(c => {
        const meta = metas[String(c.tipo_equipe_id)] || 0
        const perc = meta > 0 ? (c.valor_total / meta) * 100 : null
        const parada = c.textosUltimo.some(pareceParalisada)
        return {
          ...c, meta, perc, parada,
          justificativas: (justByEquipe[c.equipe_id] || []).sort((a, b) => a.data > b.data ? -1 : 1),
          observacoes:    (obsByEquipe[c.equipe_id]  || []).sort((a, b) => a.data > b.data ? -1 : 1),
        }
      })
      .sort((a, b) => {
        const dc = (a.desc_contrato || '').localeCompare(b.desc_contrato || '')
        if (dc !== 0) return dc
        const dt = (a.desc_tipo || '').localeCompare(b.desc_tipo || '')
        if (dt !== 0) return dt
        return (a.desc_equipe || '').localeCompare(b.desc_equipe || '')
      })
  }, [rows, metas])

  const secoes = useMemo(() => {
    const map = {}
    cards.forEach(c => {
      const chave = IDS_FAIXA_TO.has(Number(c.contrato_id)) ? '__faixa_to__' : String(c.contrato_id)
      const titulo = chave === '__faixa_to__' ? 'Faixa Tocantins' : (c.desc_contrato || `Contrato ${c.contrato_id}`)
      if (!map[chave]) map[chave] = { titulo, cards: [] }
      map[chave].cards.push(c)
    })
    return Object.values(map).sort((a, b) => a.titulo.localeCompare(b.titulo, 'pt-BR'))
  }, [cards])

  const paradas = cards.filter(c => c.valor_total === 0 || c.parada).length

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar(-1)}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Painel de Equipes</h1>
        </div>
      </div>

      <div className="card" style={{ marginBottom: 20 }}>
        <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap', alignItems: 'flex-end' }}>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Data início</label>
            <input type="date" className="campo-input" value={dataInicio}
              onChange={e => setDataInicio(e.target.value)} style={{ width: 160 }} />
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Data fim</label>
            <input type="date" className="campo-input" value={dataFim}
              onChange={e => setDataFim(e.target.value)} style={{ width: 160 }} />
          </div>
          <button className="btn btn-primario"
            onClick={() => buscar(dataInicio, dataFim)}
            disabled={carregando || !dataInicio || !dataFim}
            style={{ alignSelf: 'flex-end' }}>
            {carregando ? 'Carregando...' : 'Atualizar'}
          </button>
          {!carregando && cards.length > 0 && (
            <span style={{ alignSelf: 'center', fontSize: 13, color: '#6b7280' }}>
              {cards.length} equipes
              {paradas > 0 && <span style={{ color: '#dc2626', marginLeft: 8 }}>· {paradas} parada{paradas > 1 ? 's' : ''}</span>}
            </span>
          )}
        </div>
      </div>

      {erro && (
        <div style={{ background: '#fef2f2', color: '#dc2626', borderRadius: 6,
          padding: '8px 12px', marginBottom: 16, fontSize: 13 }}>{erro}</div>
      )}

      {carregando && (
        <div className="card" style={{ textAlign: 'center', color: '#9ca3af', padding: 40 }}>
          Carregando...
        </div>
      )}

      {!carregando && cards.length === 0 && !erro && (
        <div className="card" style={{ textAlign: 'center', color: '#9ca3af', fontSize: 13, padding: 40 }}>
          Nenhum dado encontrado no período.
        </div>
      )}

      {!carregando && secoes.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
          {secoes.map(secao => (
            <div key={secao.titulo}>

              {/* Cabeçalho da seção */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#374151', textTransform: 'uppercase', letterSpacing: '.06em' }}>
                  {secao.titulo}
                </div>
                <div style={{ flex: 1, height: 1, background: '#e5e7eb' }} />
                <div style={{ fontSize: 12, color: '#9ca3af' }}>
                  {secao.cards.length} equipe{secao.cards.length !== 1 ? 's' : ''}
                </div>
              </div>

              {/* Grid de cards */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 12 }}>
                {secao.cards.map(c => {
                  const st = statusCard(c.valor_total, c.perc, c.parada)
                  const temDetalhes = c.justificativas.length > 0 || c.observacoes.length > 0
                  return (
                    <div key={c.equipe_id} data-equipe={c.equipe_id} style={{ position: 'relative' }}>

                      {/* Card */}
                      <div style={{
                        background: st.fundo,
                        border: `2px solid ${st.borda}`,
                        borderRadius: 10,
                        padding: '14px 16px',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: 5,
                      }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 4, minHeight: 18 }}>
                          {(colabByEquipe[c.equipe_id] || []).length > 0 && (
                            <button onClick={e => {
                                if (expandido?.id === c.equipe_id && expandido?.tipo === 'colab') { setExpandido(null); return }
                                const rect = e.currentTarget.getBoundingClientRect()
                                const acima = window.innerHeight - rect.bottom < 420
                                setExpandido({ id: c.equipe_id, tipo: 'colab', acima, left: Math.min(rect.left, window.innerWidth - 336), posY: acima ? window.innerHeight - rect.top + 4 : rect.bottom + 4 })
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 13, lineHeight: 1, color: expandido?.id === c.equipe_id && expandido?.tipo === 'colab' ? '#2563eb' : '#9ca3af' }}
                              title="Ver colaboradores">
                              👥
                            </button>
                          )}
                          {temDetalhes && (
                            <button onClick={e => {
                                if (expandido?.id === c.equipe_id && expandido?.tipo === 'info') { setExpandido(null); return }
                                const rect = e.currentTarget.getBoundingClientRect()
                                const acima = window.innerHeight - rect.bottom < 420
                                setExpandido({ id: c.equipe_id, tipo: 'info', acima, left: Math.min(rect.left, window.innerWidth - 336), posY: acima ? window.innerHeight - rect.top + 4 : rect.bottom + 4 })
                              }}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0 2px', fontSize: 13, lineHeight: 1, color: expandido?.id === c.equipe_id && expandido?.tipo === 'info' ? '#2563eb' : '#9ca3af' }}
                              title="Ver justificativas e observações">
                              💬
                            </button>
                          )}
                          {st.label && (
                            <span style={{
                              fontSize: 10, fontWeight: 700, color: '#fff',
                              background: '#dc2626', borderRadius: 4, padding: '2px 7px', letterSpacing: '.05em',
                            }}>{st.label}</span>
                          )}
                        </div>

                        <div style={{ fontSize: 15, fontWeight: 700, color: '#1e2a3b', lineHeight: 1.2 }}>
                          {c.desc_equipe}
                        </div>

                        {c.encarregado && (
                          <div style={{ fontSize: 12, color: '#6b7280' }}>{c.encarregado}</div>
                        )}

                        <div style={{ borderTop: `1px solid ${st.borda}`, margin: '4px 0' }} />

                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline' }}>
                          <div style={{ fontSize: 16, fontWeight: 700, color: st.cor }}>
                            R$ {fmt(c.valor_total)}
                          </div>
                          {c.perc !== null && (
                            <div style={{ fontSize: 14, fontWeight: 700, color: st.cor }}>
                              {c.perc.toFixed(1)}%
                            </div>
                          )}
                        </div>

                        {c.meta > 0 && (
                          <div style={{ fontSize: 11, color: '#9ca3af' }}>
                            Meta: R$ {fmt(c.meta)}
                          </div>
                        )}

                        <div style={{ fontSize: 11, color: '#9ca3af', marginTop: 2 }}>
                          Último registro: {fmtData(c.data_ultimo)}
                        </div>

                      </div>

                      {/* Painel click */}
                      {expandido?.id === c.equipe_id && (
                        <div style={{
                          position: 'fixed',
                          ...(expandido.acima
                            ? { bottom: expandido.posY }
                            : { top: expandido.posY }),
                          left: expandido.left,
                          zIndex: 200,
                          background: '#fff',
                          border: '1px solid #e5e7eb',
                          borderRadius: 8,
                          padding: '10px 12px',
                          minWidth: 240,
                          maxWidth: 320,
                          boxShadow: '0 8px 24px rgba(0,0,0,0.12)',
                          fontSize: 11,
                          overflowY: 'auto',
                          maxHeight: 400,
                        }}>
                          {expandido.tipo === 'colab' ? (
                            /* Lista de colaboradores */
                            (colabByEquipe[c.equipe_id] || []).map((p, i) => (
                              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', gap: 12, marginBottom: 5, lineHeight: 1.5 }}>
                                <span style={{ color: '#374151', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.nome}</span>
                                <span style={{ color: '#9ca3af', flexShrink: 0 }}>{p.dias} dia{p.dias !== 1 ? 's' : ''}</span>
                              </div>
                            ))
                          ) : (
                            /* Justificativas e observações agrupadas por data */
                            (() => {
                              const diasMap = {}
                              c.justificativas.forEach(j => {
                                if (!diasMap[j.data]) diasMap[j.data] = { just: [], obs: [] }
                                diasMap[j.data].just.push(j.texto)
                              })
                              c.observacoes.forEach(o => {
                                if (!diasMap[o.data]) diasMap[o.data] = { just: [], obs: [] }
                                diasMap[o.data].obs.push(o.texto)
                              })
                              return Object.entries(diasMap)
                                .sort(([a], [b]) => b.localeCompare(a))
                                .map(([data, { just, obs }]) => {
                                  const partes = [just.join(' / '), obs.join(' / ')].filter(Boolean)
                                  return (
                                    <div key={data} style={{ marginBottom: 6, lineHeight: 1.5 }}>
                                      <span style={{ color: '#9ca3af', marginRight: 8, fontWeight: 600, whiteSpace: 'nowrap' }}>{fmtData(data)}</span>
                                      <span style={{ color: '#374151' }}>{partes.join(' | ')}</span>
                                    </div>
                                  )
                                })
                            })()
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
