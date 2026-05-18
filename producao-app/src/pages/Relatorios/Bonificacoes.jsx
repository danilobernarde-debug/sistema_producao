import { useState, useMemo, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'

function fmtBRL(v) {
  return `R$ ${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })}`
}
function fmtPct(v) {
  return `${Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
}
function fmtUpe(v) {
  return Number(v || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 })
}

function calcularBonus(contratoId, tipoEquipeId, upe, producao) {
  const c = Number(contratoId)
  const t = Number(tipoEquipeId)
  const u = Number(upe)
  const p = Number(producao)
  if (!u || !p) return null

  function split(limite, pctBase, pctExcesso) {
    const ratio = limite / u
    return { bonus: p * ratio * pctBase + p * (1 - ratio) * pctExcesso, label: `2,5% + ${pctExcesso * 100}%` }
  }

  if (c === 1 && t === 1) {
    if (u < 949)   return null
    if (u <= 1043) return { bonus: p * 0.01,  label: '1%'   }
    if (u <= 1150) return { bonus: p * 0.025, label: '2,5%' }
    return split(1150, 0.025, 0.05)
  }
  if (c === 3 && t === 1) {
    if (u < 790)   return null
    if (u <= 894)  return { bonus: p * 0.01,  label: '1%'   }
    if (u <= 1053) return { bonus: p * 0.025, label: '2,5%' }
    return split(1053, 0.025, 0.10)
  }
  if (c === 3 && t === 2) {
    if (u < 590)   return null
    if (u <= 694)  return { bonus: p * 0.01,  label: '1%'   }
    if (u <= 795)  return { bonus: p * 0.025, label: '2,5%' }
    return split(795, 0.025, 0.10)
  }
  if (c === 3 && t === 5) {
    if (u < 590)   return null
    if (u <= 694)  return { bonus: p * 0.01,  label: '1%'   }
    if (u <= 795)  return { bonus: p * 0.025, label: '2,5%' }
    return split(795, 0.025, 0.10)
  }
  if (c === 3 && t === 6) {
    if (u < 230)   return null
    if (u <= 296)  return { bonus: p * 0.01,  label: '1%'   }
    if (u <= 329)  return { bonus: p * 0.025, label: '2,5%' }
    return split(329, 0.025, 0.10)
  }
  return null
}

const COR_FAIXA = {
  '1%':    { bg: '#fef9c3', cor: '#854d0e' },
  '2,5%':  { bg: '#dcfce7', cor: '#166534' },
  '2,5% + 5%':  { bg: '#dbeafe', cor: '#1e40af' },
  '2,5% + 10%': { bg: '#ede9fe', cor: '#5b21b6' },
}

export default function Bonificacoes() {
  const hoje = new Date()
  const primeiroDiaMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const ultimoDiaMes   = new Date(hoje.getFullYear(), hoje.getMonth() + 1, 0).toISOString().split('T')[0]

  const [inicio, setInicio]         = useState(primeiroDiaMes)
  const [fim, setFim]               = useState(ultimoDiaMes)
  const [rawData, setRawData]       = useState([])
  const [carregando, setCarregando] = useState(false)
  const [buscou, setBuscou]         = useState(false)
  const [expandidos, setExpandidos] = useState({})
  const [detalhe, setDetalhe]       = useState(null)
  const [modalRegras, setModalRegras] = useState(false)
  const detalheRef = useRef(null)
  const [filtroContrato, setFiltroContrato] = useState('')
  const [filtroEquipe, setFiltroEquipe]     = useState('')
  const [filtroColab, setFiltroColab]       = useState('')

  async function buscar() {
    if (!inicio || !fim) return
    setCarregando(true)
    setBuscou(false)
    setExpandidos({})
    setFiltroContrato('')
    setFiltroEquipe('')
    setFiltroColab('')

    const { data, error } = await supabase
      .from('view_powerbi_producao_colab')
      .select('colaborador_id, nome_colaborador, contrato_id, desc_contrato, equipe_id, desc_equipe, tipo_equipe_id, quantidade_total_upe_por_colaborador, valor_por_colaborador, data_producao')
      .gte('data_producao', inicio)
      .lte('data_producao', fim)
      .limit(20000)

    setCarregando(false)
    setBuscou(true)

    if (error) { alert('Erro: ' + error.message); return }
    setRawData(data || [])
  }

  // Agrupa por equipe e por equipe+colaborador
  const equipes = useMemo(() => {
    if (!rawData.length) return []

    // Totais por equipe
    const mapEquipe = {}
    rawData.forEach(r => {
      const keyEq = `${r.contrato_id}||${r.tipo_equipe_id}||${r.equipe_id}`
      if (!mapEquipe[keyEq]) {
        mapEquipe[keyEq] = {
          key: keyEq,
          equipe_id:     r.equipe_id,
          equipe:        r.desc_equipe    || '—',
          contrato_id:   r.contrato_id,
          desc_contrato: r.desc_contrato  || `Contrato ${r.contrato_id}`,
          tipo_equipe_id: r.tipo_equipe_id,
          upe:   0,
          valor: 0,
          colabs: {},
        }
      }
      const eq = mapEquipe[keyEq]
      eq.upe   += Number(r.quantidade_total_upe_por_colaborador) || 0
      eq.valor += Number(r.valor_por_colaborador)                || 0

      // Totais por colaborador dentro da equipe
      const idColab = r.colaborador_id
      if (!eq.colabs[idColab]) {
        eq.colabs[idColab] = { id: idColab, nome: r.nome_colaborador || `ID ${idColab}`, valor: 0 }
      }
      eq.colabs[idColab].valor += Number(r.valor_por_colaborador) || 0
    })

    return Object.values(mapEquipe).map(eq => {
      const faixa = calcularBonus(eq.contrato_id, eq.tipo_equipe_id, eq.upe, eq.valor)
      const colabs = Object.values(eq.colabs).map(c => ({
        ...c,
        contribuicao: eq.valor > 0 ? c.valor / eq.valor : 0,
        bonusIndividual: faixa ? faixa.bonus * (eq.valor > 0 ? c.valor / eq.valor : 0) : null,
      })).sort((a, b) => b.valor - a.valor)

      return { ...eq, faixa, colabs }
    }).sort((a, b) => {
      if (a.contrato_id !== b.contrato_id) return a.contrato_id - b.contrato_id
      return a.equipe.localeCompare(b.equipe)
    })
  }, [rawData])

  // Opções dos filtros (cascata)
  const opcoesContrato = useMemo(() =>
    [...new Map(equipes.map(e => [e.contrato_id, e.desc_contrato])).entries()]
      .map(([id, nome]) => ({ id, nome }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  , [equipes])

  const opcoesEquipe = useMemo(() =>
    equipes
      .filter(e => !filtroContrato || String(e.contrato_id) === filtroContrato)
      .map(e => ({ id: String(e.equipe_id), nome: e.equipe }))
      .sort((a, b) => a.nome.localeCompare(b.nome))
  , [equipes, filtroContrato])

  const opcoesColab = useMemo(() => {
    const map = {}
    equipes
      .filter(e => !filtroContrato || String(e.contrato_id) === filtroContrato)
      .filter(e => !filtroEquipe || String(e.equipe_id) === filtroEquipe)
      .forEach(e => e.colabs.forEach(c => { map[c.id] = c.nome }))
    return Object.entries(map).map(([id, nome]) => ({ id, nome })).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [equipes, filtroContrato, filtroEquipe])

  // Equipes após filtros
  const equipesFiltradas = useMemo(() => {
    return equipes
      .filter(e => !filtroContrato || String(e.contrato_id) === filtroContrato)
      .filter(e => !filtroEquipe   || String(e.equipe_id)   === filtroEquipe)
      .map(e => {
        if (!filtroColab) return e
        const colabs = e.colabs.filter(c => String(c.id) === filtroColab)
        return colabs.length ? { ...e, colabs } : null
      })
      .filter(Boolean)
  }, [equipes, filtroContrato, filtroEquipe, filtroColab])

  const totais = useMemo(() => ({
    equipes:    equipesFiltradas.length,
    comBonus:   equipesFiltradas.filter(e => e.faixa).length,
    totalProd:  equipesFiltradas.reduce((s, e) => s + e.valor, 0),
    totalBonus: equipesFiltradas.filter(e => e.faixa).reduce((s, e) => s + e.faixa.bonus, 0),
  }), [equipesFiltradas])

  useEffect(() => {
    if (!detalhe) return
    function handleClick(e) {
      if (detalheRef.current && !detalheRef.current.contains(e.target)) setDetalhe(null)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [detalhe])

  function toggleExpand(key) {
    setExpandidos(prev => ({ ...prev, [key]: !prev[key] }))
  }

  function renderDetalhe(eq) {
    const { faixa, upe, valor } = eq
    if (!faixa) return null
    const u = Number(upe), p = Number(valor)
    const label = faixa.label

    let linhas = []
    if (label === '1%') {
      linhas = [
        `UPE da equipe: ${fmtUpe(u)}`,
        `Produção: ${fmtBRL(p)}`,
        ``,
        `Bonificação = ${fmtBRL(p)} × 1% = ${fmtBRL(faixa.bonus)}`,
      ]
    } else if (label === '2,5%') {
      linhas = [
        `UPE da equipe: ${fmtUpe(u)}`,
        `Produção: ${fmtBRL(p)}`,
        ``,
        `Bonificação = ${fmtBRL(p)} × 2,5% = ${fmtBRL(faixa.bonus)}`,
      ]
    } else {
      // Tier com split
      const pctExcesso = label.includes('10%') ? 0.10 : 0.05
      const limite = label.includes('10%')
        ? (eq.contrato_id === 3 && eq.tipo_equipe_id === 1 ? 1053 : eq.tipo_equipe_id === 6 ? 329 : 795)
        : 1150
      const ratio = limite / u
      const valorBase    = p * ratio
      const valorExcesso = p * (1 - ratio)
      const bonusBase    = valorBase * 0.025
      const bonusExcesso = valorExcesso * pctExcesso

      linhas = [
        `UPE da equipe: ${fmtUpe(u)}`,
        `Limite do tier 2,5%: ${fmtUpe(limite)} UPE`,
        `Produção total: ${fmtBRL(p)}`,
        ``,
        `Proporção dentro do limite: ${fmtPct(ratio * 100)}`,
        `  Valor base: ${fmtBRL(valorBase)} × 2,5% = ${fmtBRL(bonusBase)}`,
        ``,
        `Proporção excesso: ${fmtPct((1 - ratio) * 100)}`,
        `  Valor excesso: ${fmtBRL(valorExcesso)} × ${pctExcesso * 100}% = ${fmtBRL(bonusExcesso)}`,
        ``,
        `Bonificação total: ${fmtBRL(faixa.bonus)}`,
      ]
    }
    return linhas
  }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <h1 className="pagina-titulo">Bonificações</h1>
          <button
            onClick={() => setModalRegras(true)}
            title="Ver regras de bonificação"
            style={{
              background: 'none', border: '1px solid #e2e8f0', borderRadius: 6,
              padding: '4px 8px', cursor: 'pointer', fontSize: 16,
              color: '#64748b', display: 'flex', alignItems: 'center', gap: 4,
            }}
          >
            📋 <span style={{ fontSize: 12, fontWeight: 500 }}>Regras</span>
          </button>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 20, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div className="campo-grupo" style={{ marginBottom: 0 }}>
          <label className="campo-label">Data início</label>
          <input type="date" className="campo-input" value={inicio} onChange={e => setInicio(e.target.value)} style={{ width: 160 }} />
        </div>
        <div className="campo-grupo" style={{ marginBottom: 0 }}>
          <label className="campo-label">Data fim</label>
          <input type="date" className="campo-input" value={fim} onChange={e => setFim(e.target.value)} style={{ width: 160 }} />
        </div>
        <button className="btn btn-primario" onClick={buscar} disabled={carregando}>
          {carregando ? 'Buscando...' : 'Buscar'}
        </button>

        {buscou && equipes.length > 0 && <>
          <div style={{ width: 1, height: 32, background: '#e2e8f0', alignSelf: 'center' }} />
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Contrato</label>
            <select className="campo-input" value={filtroContrato}
              onChange={e => { setFiltroContrato(e.target.value); setFiltroEquipe(''); setFiltroColab('') }}
              style={{ width: 180 }}>
              <option value="">Todos</option>
              {opcoesContrato.map(o => <option key={o.id} value={String(o.id)}>{o.nome}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Equipe</label>
            <select className="campo-input" value={filtroEquipe}
              onChange={e => { setFiltroEquipe(e.target.value); setFiltroColab('') }}
              style={{ width: 180 }}>
              <option value="">Todas</option>
              {opcoesEquipe.map(o => <option key={o.id} value={o.id}>{o.nome}</option>)}
            </select>
          </div>
          <div className="campo-grupo" style={{ marginBottom: 0 }}>
            <label className="campo-label">Colaborador</label>
            <select className="campo-input" value={filtroColab}
              onChange={e => setFiltroColab(e.target.value)}
              style={{ width: 200 }}>
              <option value="">Todos</option>
              {opcoesColab.map(o => <option key={o.id} value={String(o.id)}>{o.nome}</option>)}
            </select>
          </div>
        </>}
      </div>

      {/* Cards resumo */}
      {buscou && equipes.length > 0 && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12, marginBottom: 20 }}>
          {[
            { label: 'Equipes consultadas',     valor: totais.equipes   },
            { label: 'Equipes com bonificação', valor: totais.comBonus  },
            { label: 'Produção total',          valor: fmtBRL(totais.totalProd)  },
            { label: 'Total bonificação',       valor: fmtBRL(totais.totalBonus), destaque: true },
          ].map(c => (
            <div key={c.label} className="card" style={{ padding: '14px 16px', background: c.destaque ? '#f0fdf4' : undefined }}>
              <div style={{ fontSize: 11, color: '#64748b', marginBottom: 4 }}>{c.label}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: c.destaque ? '#166534' : '#1e2a3b' }}>{c.valor}</div>
            </div>
          ))}
        </div>
      )}

      {carregando && <div className="loading"><div className="spinner" /> Calculando bonificações...</div>}

      {buscou && !carregando && equipes.length === 0 && (
        <div className="card" style={{ textAlign: 'center', color: '#6b7280', padding: 40 }}>
          Nenhum dado encontrado para o período selecionado.
        </div>
      )}

      {buscou && !carregando && equipes.length > 0 && (
        <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '2px solid #e2e8f0' }}>
                  {['', 'Equipe / Colaborador', 'Contrato', 'UPE Total', 'Produção', 'Contribuição', 'Faixa', 'Bonificação'].map(h => (
                    <th key={h} style={{
                      padding: '10px 14px',
                      textAlign: ['', 'Equipe / Colaborador', 'Contrato'].includes(h) ? 'left' : 'right',
                      fontWeight: 600, color: '#374151', whiteSpace: 'nowrap',
                    }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {equipesFiltradas.map(eq => {
                  const faixaCor = eq.faixa ? COR_FAIXA[eq.faixa.label] : null
                  const aberto = expandidos[eq.key]
                  return [
                    // Linha da equipe
                    <tr key={eq.key}
                      onClick={() => toggleExpand(eq.key)}
                      style={{ borderBottom: '1px solid #e2e8f0', background: '#f8fafc', cursor: 'pointer' }}
                    >
                      <td style={{ padding: '10px 10px', width: 32, textAlign: 'center', color: '#64748b', fontSize: 11 }}>
                        {aberto ? '▼' : '▶'}
                      </td>
                      <td style={{ padding: '10px 14px', fontWeight: 700, color: '#1e2a3b' }}>{eq.equipe}</td>
                      <td style={{ padding: '10px 14px', color: '#475569', fontSize: 12 }}>{eq.desc_contrato}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtUpe(eq.upe)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums' }}>{fmtBRL(eq.valor)}</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                      <td style={{ padding: '10px 14px', textAlign: 'right' }}>
                        {eq.faixa ? (
                          <span style={{
                            display: 'inline-block', padding: '2px 10px', borderRadius: 12,
                            fontSize: 12, fontWeight: 600, background: faixaCor?.bg, color: faixaCor?.cor,
                          }}>{eq.faixa.label}</span>
                        ) : <span style={{ color: '#94a3b8', fontSize: 12 }}>—</span>}
                      </td>
                      <td style={{ padding: '10px 14px', textAlign: 'right', fontWeight: 700, color: eq.faixa ? '#166534' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6, position: 'relative' }}>
                          {eq.faixa ? fmtBRL(eq.faixa.bonus) : '—'}
                          {eq.faixa && (
                            <div style={{ position: 'relative' }} ref={detalhe === eq.key ? detalheRef : null}>
                              <button
                                onClick={e => { e.stopPropagation(); setDetalhe(detalhe === eq.key ? null : eq.key) }}
                                title="Ver detalhes do cálculo"
                                style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 14, color: '#94a3b8', padding: '0 2px', lineHeight: 1 }}
                              >ℹ️</button>

                              {detalhe === eq.key && (
                                <div style={{
                                  position: 'absolute', right: 0, bottom: '100%', marginBottom: 6, zIndex: 100,
                                  background: '#1e2a3b', color: '#e2e8f0', borderRadius: 8,
                                  padding: '12px 16px', width: 320, boxShadow: '0 4px 20px rgba(0,0,0,0.3)',
                                  fontSize: 12, lineHeight: 1.8, whiteSpace: 'pre',
                                }}>
                                  <div style={{ fontWeight: 700, marginBottom: 8, color: 'white', fontSize: 13 }}>
                                    Detalhes do cálculo — {eq.equipe}
                                  </div>
                                  {renderDetalhe(eq)?.map((l, i) =>
                                    l === ''
                                      ? <div key={i} style={{ height: 4 }} />
                                      : <div key={i} style={{ color: l.startsWith('  ') ? '#93c5fd' : l.startsWith('Bonificação total') ? '#4ade80' : '#e2e8f0' }}>{l}</div>
                                  )}
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>,

                    // Linhas dos colaboradores (expandível)
                    ...(aberto ? eq.colabs.map(c => (
                      <tr key={`${eq.key}||${c.id}`} style={{ borderBottom: '1px solid #f1f5f9', background: 'white' }}>
                        <td />
                        <td style={{ padding: '8px 14px 8px 28px', color: '#475569' }}>
                          <span style={{ fontSize: 11, color: '#94a3b8', marginRight: 6 }}>└</span>
                          {c.nome}
                        </td>
                        <td />
                        <td style={{ padding: '8px 14px', textAlign: 'right', color: '#94a3b8' }}>—</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontVariantNumeric: 'tabular-nums', color: '#374151' }}>{fmtBRL(c.valor)}</td>
                        <td style={{ padding: '8px 14px', textAlign: 'right', color: '#374151' }}>{fmtPct(c.contribuicao * 100)}</td>
                        <td />
                        <td style={{ padding: '8px 14px', textAlign: 'right', fontWeight: 600, color: c.bonusIndividual ? '#166534' : '#94a3b8', fontVariantNumeric: 'tabular-nums' }}>
                          {c.bonusIndividual ? fmtBRL(c.bonusIndividual) : '—'}
                        </td>
                      </tr>
                    )) : []),
                  ]
                })}
              </tbody>
              <tfoot>
                <tr style={{ borderTop: '2px solid #e2e8f0', background: '#f8fafc', fontWeight: 700 }}>
                  <td colSpan={4} style={{ padding: '10px 14px', color: '#374151' }}>Total</td>
                  <td style={{ padding: '10px 14px', textAlign: 'right' }}>{fmtBRL(totais.totalProd)}</td>
                  <td />
                  <td />
                  <td style={{ padding: '10px 14px', textAlign: 'right', color: '#166534' }}>{fmtBRL(totais.totalBonus)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      {/* Modal de regras */}
      {modalRegras && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)',
          zIndex: 300, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
        }} onClick={() => setModalRegras(false)}>
          <div style={{
            background: 'white', borderRadius: 12, padding: 28,
            maxWidth: 700, width: '100%', maxHeight: '85vh', overflowY: 'auto',
            boxShadow: '0 8px 40px rgba(0,0,0,0.2)',
          }} onClick={e => e.stopPropagation()}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
              <h2 style={{ fontSize: 16, fontWeight: 700, color: '#1e2a3b', margin: 0 }}>
                Regras de Bonificação por Equipe
              </h2>
              <button onClick={() => setModalRegras(false)}
                style={{ background: 'none', border: 'none', fontSize: 20, cursor: 'pointer', color: '#94a3b8' }}>✕</button>
            </div>

            {[
              {
                titulo: 'TO — Construção (contrato 1 / tipo 1)',
                cor: '#dbeafe', corTitulo: '#1e40af',
                faixas: [
                  { label: 'Sem bônus',   upe: '< 949',         formula: '—' },
                  { label: '1%',          upe: '949 – 1.043',   formula: 'Produção × 1%' },
                  { label: '2,5%',        upe: '1.043 – 1.150', formula: 'Produção × 2,5%' },
                  { label: '2,5% + 5%',  upe: '> 1.150',       formula: 'Produção × (1.150/UPE) × 2,5%  +  Produção × (1 − 1.150/UPE) × 5%' },
                ],
              },
              {
                titulo: 'MS — Construção B2 (contrato 3 / tipo 1)',
                cor: '#ede9fe', corTitulo: '#5b21b6',
                faixas: [
                  { label: 'Sem bônus',    upe: '< 790',         formula: '—' },
                  { label: '1%',           upe: '790 – 894',     formula: 'Produção × 1%' },
                  { label: '2,5%',         upe: '894 – 1.053',   formula: 'Produção × 2,5%' },
                  { label: '2,5% + 10%',  upe: '> 1.053',       formula: 'Produção × (1.053/UPE) × 2,5%  +  Produção × (1 − 1.053/UPE) × 10%' },
                ],
              },
              {
                titulo: 'MS — Manutenção Pesada B1 (contrato 3 / tipo 2)',
                cor: '#dcfce7', corTitulo: '#166534',
                faixas: [
                  { label: 'Sem bônus',    upe: '< 590',       formula: '—' },
                  { label: '1%',           upe: '590 – 694',   formula: 'Produção × 1%' },
                  { label: '2,5%',         upe: '694 – 795',   formula: 'Produção × 2,5%' },
                  { label: '2,5% + 10%',  upe: '> 795',       formula: 'Produção × (795/UPE) × 2,5%  +  Produção × (1 − 795/UPE) × 10%' },
                ],
              },
              {
                titulo: 'MS — Manutenção Leve A1 (contrato 3 / tipo 5)',
                cor: '#fef9c3', corTitulo: '#854d0e',
                faixas: [
                  { label: 'Sem bônus',    upe: '< 590',       formula: '—' },
                  { label: '1%',           upe: '590 – 694',   formula: 'Produção × 1%' },
                  { label: '2,5%',         upe: '694 – 795',   formula: 'Produção × 2,5%' },
                  { label: '2,5% + 10%',  upe: '> 795',       formula: 'Produção × (795/UPE) × 2,5%  +  Produção × (1 − 795/UPE) × 10%' },
                ],
              },
              {
                titulo: 'MS — Linha Viva C1/C2 (contrato 3 / tipo 6)',
                cor: '#fce7f3', corTitulo: '#9d174d',
                faixas: [
                  { label: 'Sem bônus',    upe: '< 230',       formula: '—' },
                  { label: '1%',           upe: '230 – 296',   formula: 'Produção × 1%' },
                  { label: '2,5%',         upe: '296 – 329',   formula: 'Produção × 2,5%' },
                  { label: '2,5% + 10%',  upe: '> 329',       formula: 'Produção × (329/UPE) × 2,5%  +  Produção × (1 − 329/UPE) × 10%' },
                ],
              },
            ].map(grupo => (
              <div key={grupo.titulo} style={{ marginBottom: 20 }}>
                <div style={{
                  background: grupo.cor, color: grupo.corTitulo,
                  padding: '6px 12px', borderRadius: 6, fontWeight: 700, fontSize: 13, marginBottom: 8,
                }}>
                  {grupo.titulo}
                </div>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: '#f8fafc' }}>
                      {['Faixa', 'UPE no período', 'Fórmula'].map(h => (
                        <th key={h} style={{ padding: '6px 10px', textAlign: 'left', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {grupo.faixas.map((f, i) => (
                      <tr key={i} style={{ borderBottom: '1px solid #f1f5f9' }}>
                        <td style={{ padding: '6px 10px', fontWeight: 600, color: f.label === 'Sem bônus' ? '#94a3b8' : grupo.corTitulo, whiteSpace: 'nowrap' }}>{f.label}</td>
                        <td style={{ padding: '6px 10px', color: '#374151', whiteSpace: 'nowrap' }}>{f.upe}</td>
                        <td style={{ padding: '6px 10px', color: '#374151', fontSize: 11 }}>{f.formula}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}

            <div style={{ marginTop: 8, padding: '10px 12px', background: '#f8fafc', borderRadius: 6, fontSize: 11, color: '#64748b' }}>
              <strong>Nota:</strong> Para o tier 2,5% + 5%/10%, a produção é dividida proporcionalmente: a fração que corresponde à UPE dentro do limite recebe 2,5%, e o excesso recebe o percentual adicional.
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
