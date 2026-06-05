import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import { CHUNK, expandirMetadata, exportarXLSX } from './exportUtils'
import FaixaTO from './FaixaTO'
import SelectPesquisavel from '../../components/SelectPesquisavel'

const CAMPOS_DIN = [
  { key: 'registro_id',   label: 'ID',            tipo: 'numero'      },
  { key: 'equipe_id',      label: 'Equipe',        tipo: 'sel_equipe'  },
  { key: 'tipo_equipe_id', label: 'Tipo de Equipe', tipo: 'sel_tequipe' },
  { key: 'encarregado_id', label: 'Encarregado',   tipo: 'sel_enc'     },
  { key: 'origem',         label: 'Origem',         tipo: 'sel_origem'  },
  { key: 'obra_id',        label: 'Nr. Obra',       tipo: 'texto'       },
  { key: 'obs',            label: 'Observações',    tipo: 'texto'       },
]
const OPERADORES_TEXTO = [
  { value: 'contem',     label: 'Contém'      },
  { value: 'nao_contem', label: 'Não Contém'  },
  { value: 'igual',      label: 'Igual a'     },
]
const OPERADORES_EXATO = [
  { value: 'igual',     label: 'Selecionado'     },
  { value: 'diferente', label: 'Não Selecionado' },
]
const OPERADORES_NUMERO = [
  { value: 'igual', label: 'Igual a'   },
  { value: 'maior', label: 'Maior que' },
  { value: 'menor', label: 'Menor que' },
]
function opsDoCampo(tipo) {
  if (tipo === 'numero') return OPERADORES_NUMERO
  return tipo.startsWith('sel_') ? OPERADORES_EXATO : OPERADORES_TEXTO
}
function novoFiltro(campo = 'equipe_id') {
  const def = CAMPOS_DIN.find(c => c.key === campo) || CAMPOS_DIN[0]
  return { _id: Date.now() + Math.random(), campo, operador: opsDoCampo(def.tipo)[0].value, valor: '' }
}

const RELATORIOS = [
  { id: 'geral',    icone: '📊', titulo: 'Relatório Geral',
    desc: 'Exportação completa com todas as colunas. Filtro por contrato e seleção de colunas personalizável.' },
  { id: 'faixa-to', icone: '📍', titulo: 'Faixa Tocantins',
    desc: 'Colunas fixas para os contratos TO Norte, Sul e Centro. Atividades de justificativa excluídas automaticamente.' },
]

export default function Exportacao() {
  const navegar    = useNavigate()
  const hoje       = new Date()
  const primDiaMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const hojeISO    = hoje.toISOString().slice(0, 10)

  const [dataInicio, setDataInicio]         = useState(primDiaMes)
  const [dataFim, setDataFim]               = useState(hojeISO)
  const [relatorioAtivo, setRelatorioAtivo] = useState(null)
  const [aba, setAba]                       = useState('geral')
  const [contratoId, setContratoId]         = useState('')
  const [contratos, setContratos]           = useState([])
  const [carregando, setCarregando]         = useState(false)
  const [progresso, setProgresso]           = useState({ atual: 0, total: 0 })
  const [dados, setDados]                   = useState(null)
  const [colunasBase, setColunasBase]       = useState([])
  const [colunasMeta, setColunasMeta]       = useState([])
  const [selecionadas, setSelecionadas]     = useState(new Set())
  const [exportando, setExportando]         = useState(false)
  const [totalRegistros, setTotalRegistros] = useState(0)
  const [erro, setErro]                     = useState('')
  const cancelarRef = useRef(false)

  const [filtrosDin, setFiltrosDin]         = useState([])
  const [tiposEquipe, setTiposEquipe]       = useState([])
  const [equipes, setEquipes]               = useState([])
  const [encarregados, setEncarregados]     = useState([])

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao')
      .then(({ data }) => setContratos(data || []))
    supabase.from('d_tipo_equipe').select('id, descricao')
      .then(({ data }) => setTiposEquipe(data || []))
    supabase.from('d_equipes').select('id, equipe').order('equipe')
      .then(({ data }) => setEquipes((data || []).map(e => ({ valor: e.id, label: e.equipe }))))
    supabase.from('d_colaboradores').select('id, matricula_nome').not('id', 'is', null).order('matricula_nome')
      .then(({ data }) => setEncarregados((data || []).map(e => ({ valor: e.id, label: e.matricula_nome }))))
  }, [])

  function calcularPeriodo() {
    const d = new Date(dataFim + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return { inicio: dataInicio, fim: d.toISOString().slice(0, 10) }
  }

  function cancelar() { cancelarRef.current = true; setCarregando(false) }

  function alterarFiltrosDin(idx, chave, valor) {
    setFiltrosDin(prev => {
      const novo = [...prev]
      if (chave === 'campo') {
        const def = CAMPOS_DIN.find(c => c.key === valor) || CAMPOS_DIN[0]
        novo[idx] = { ...novo[idx], campo: valor, operador: opsDoCampo(def.tipo)[0].value, valor: '' }
      } else {
        novo[idx] = { ...novo[idx], [chave]: valor }
      }
      return novo
    })
  }

  function aplicarFiltrosDin(rows) {
    if (filtrosDin.length === 0) return rows
    return rows.filter(row =>
      filtrosDin.every(({ campo, operador, valor }) => {
        if (!valor && valor !== 0) return true
        const col = campo === 'obs' ? 'observacoes' : campo
        const colVal = row[col]
        const v = String(colVal ?? '')
        const fv = String(valor)
        if (operador === 'igual')      return colVal != null && colVal == valor
        if (operador === 'diferente')  return colVal == null || colVal != valor
        if (operador === 'maior')      return colVal != null && Number(colVal) > Number(valor)
        if (operador === 'menor')      return colVal != null && Number(colVal) < Number(valor)
        if (operador === 'contem')     return v.toLowerCase().includes(fv.toLowerCase())
        if (operador === 'nao_contem') return !v.toLowerCase().includes(fv.toLowerCase())
        return true
      })
    )
  }

  async function carregar() {
    cancelarRef.current = false
    setErro('')
    setCarregando(true)
    setDados(null)
    setProgresso({ atual: 0, total: 0 })

    const { inicio, fim } = calcularPeriodo()
    const todos = []
    let primeiraLinha = null
    let total = null
    let from = 0

    try {
      while (true) {
        const { data, error } = await supabase.rpc('exportar_r07', {
          p_inicio:      inicio,
          p_fim:         fim,
          p_contrato_id: contratoId ? Number(contratoId) : null,
          p_limit:       CHUNK,
          p_offset:      from,
        })

        if (cancelarRef.current) { setCarregando(false); return }
        if (error) { setErro(`Erro: ${error.message}`); setCarregando(false); return }

        const linhas = data || []
        if (!primeiraLinha && linhas.length > 0) primeiraLinha = linhas[0]
        todos.push(...linhas)
        from += CHUNK
        if (total === null) total = linhas.length < CHUNK ? from : null
        setProgresso({ atual: from, total: total ?? from + CHUNK })
        if (linhas.length < CHUNK) { total = from; break }
      }
    } catch (e) {
      setErro(`Erro inesperado: ${e.message}`)
      setCarregando(false)
      return
    }

    if (todos.length === 0) {
      setErro(`Nenhum registro encontrado para o período.`)
      setDados([])
      setCarregando(false)
      return
    }

    const expandido = aplicarFiltrosDin(expandirMetadata(todos))
    setTotalRegistros(expandido.length)

    function ocultarColuna(k) {
      if (k === 'metadata_registro' || k === 'metadata_atividades') return true
      if (k === 'data_producao') return true
      if (k !== 'registro_id' && k.endsWith('_id')) return true
      return false
    }

    const chavesOriginais = Object.keys(primeiraLinha).filter(k => !ocultarColuna(k))
    const todasChavesMeta = new Set()
    expandido.forEach(row => {
      Object.keys(row).forEach(k => {
        if (!ocultarColuna(k) && !chavesOriginais.includes(k)) todasChavesMeta.add(k)
      })
    })
    const chavesMeta = [...todasChavesMeta]

    setColunasBase(chavesOriginais)
    setColunasMeta(chavesMeta)
    setSelecionadas(new Set([...chavesOriginais, ...chavesMeta]))
    setDados(expandido)
    setCarregando(false)
  }

  function toggleColuna(col) {
    setSelecionadas(prev => {
      const novo = new Set(prev)
      novo.has(col) ? novo.delete(col) : novo.add(col)
      return novo
    })
  }

  function selecionarTodas() { setSelecionadas(new Set([...colunasBase, ...colunasMeta])) }
  function limparTodas()     { setSelecionadas(new Set()) }

  function fazerExport(dadosParam, colunas, nome) {
    if (!dadosParam || dadosParam.length === 0) return
    setExportando(true)
    setTimeout(() => { exportarXLSX(dadosParam, colunas, nome); setExportando(false) }, 50)
  }

  const todasColunas        = [...colunasBase, ...colunasMeta]
  const colunasParaExportar = todasColunas.filter(c => selecionadas.has(c))
  const previewLinhas       = dados ? dados.slice(0, 50) : []
  const pct = progresso.total > 0
    ? Math.min(Math.round((progresso.atual / progresso.total) * 100), carregando ? 99 : 100)
    : 0

  const selectStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white', color: '#1e2a3b' }
  const TH = { whiteSpace: 'nowrap', fontSize: 12, position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }
  const TD = { fontSize: 12, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }

  return (
    <div className="pagina">

      {/* Header */}
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {relatorioAtivo ? (
            <button className="btn btn-secundario"
              onClick={() => { setRelatorioAtivo(null); setDados(null); setErro('') }}
              style={{ padding: '6px 12px', fontSize: 13 }}>← Relatórios</button>
          ) : (
            <button className="btn btn-secundario" onClick={() => navegar(-1)}
              style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          )}
          <h1 className="pagina-titulo" style={{ margin: 0 }}>
            {relatorioAtivo
              ? RELATORIOS.find(r => r.id === relatorioAtivo)?.titulo
              : 'Exportação de Dados'}
          </h1>
        </div>
      </div>

      {/* Seleção de relatório */}
      {!relatorioAtivo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: 620 }}>
          {RELATORIOS.map(r => (
            <button key={r.id} onClick={() => setRelatorioAtivo(r.id)}
              style={{ textAlign: 'left', padding: 24, borderRadius: 12, border: '2px solid #e5e7eb', background: 'white', cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 8 }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#2563eb'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#e5e7eb'}>
              <div style={{ fontSize: 32 }}>{r.icone}</div>
              <div style={{ fontWeight: 700, fontSize: 17, color: '#1e2a3b' }}>{r.titulo}</div>
              <div style={{ fontSize: 13, color: '#6b7280', lineHeight: 1.5 }}>{r.desc}</div>
            </button>
          ))}
        </div>
      )}

      {/* Filtros — só para Relatório Geral (FTO tem o seu próprio) */}
      {relatorioAtivo === 'geral' && (
        <div className="card" style={{ marginBottom: 16 }}>

          {/* Filtros fixos */}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Data início</div>
              <input type="date" style={selectStyle} value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Data fim</div>
              <input type="date" style={selectStyle} value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Contrato</div>
              <select style={{ ...selectStyle, minWidth: 200 }} value={contratoId} onChange={e => setContratoId(e.target.value)}>
                <option value="">Todos os contratos</option>
                {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
              </select>
            </div>
          </div>

          {/* Filtros dinâmicos */}
          {filtrosDin.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 12, paddingTop: 12, borderTop: '1px solid #f3f4f6' }}>
              {filtrosDin.map((f, idx) => {
                const def = CAMPOS_DIN.find(c => c.key === f.campo) || CAMPOS_DIN[0]
                const ops = opsDoCampo(def.tipo)
                return (
                  <div key={f._id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                    <select value={f.campo} onChange={e => alterarFiltrosDin(idx, 'campo', e.target.value)} style={{ ...selectStyle, minWidth: 160 }}>
                      {CAMPOS_DIN.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                    </select>
                    <select value={f.operador} onChange={e => alterarFiltrosDin(idx, 'operador', e.target.value)} style={{ ...selectStyle, minWidth: 140 }}>
                      {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    {def.tipo === 'numero' ? (
                      <input type="number" value={f.valor} onChange={e => alterarFiltrosDin(idx, 'valor', e.target.value)} style={{ ...selectStyle, minWidth: 120 }} placeholder="Digite..." />
                    ) : def.tipo === 'sel_equipe' ? (
                      <div style={{ minWidth: 220 }}>
                        <SelectPesquisavel opcoes={equipes} valor={f.valor} onChange={v => alterarFiltrosDin(idx, 'valor', v)} placeholder="Pesquisar equipe..." />
                      </div>
                    ) : def.tipo === 'sel_tequipe' ? (
                      <select value={f.valor} onChange={e => alterarFiltrosDin(idx, 'valor', e.target.value)} style={{ ...selectStyle, minWidth: 180 }}>
                        <option value="">Selecione...</option>
                        {tiposEquipe.map(t => <option key={t.id} value={t.id}>{t.descricao}</option>)}
                      </select>
                    ) : def.tipo === 'sel_enc' ? (
                      <div style={{ minWidth: 220 }}>
                        <SelectPesquisavel opcoes={encarregados} valor={f.valor} onChange={v => alterarFiltrosDin(idx, 'valor', v)} placeholder="Pesquisar encarregado..." />
                      </div>
                    ) : def.tipo === 'sel_origem' ? (
                      <select value={f.valor} onChange={e => alterarFiltrosDin(idx, 'valor', e.target.value)} style={{ ...selectStyle, minWidth: 160 }}>
                        <option value="">Selecione...</option>
                        <option value="sistema-claude">Sistema</option>
                        <option value="sistema-weweb">WeWeb</option>
                        <option value="Coletum">Coletum</option>
                      </select>
                    ) : (
                      <input type="text" value={f.valor} onChange={e => alterarFiltrosDin(idx, 'valor', e.target.value)} style={{ ...selectStyle, minWidth: 200 }} placeholder="Digite..." />
                    )}
                    <button onClick={() => setFiltrosDin(p => p.filter((_, i) => i !== idx))}
                      style={{ padding: '4px 10px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 12, cursor: 'pointer', height: 34 }}>
                      ✕ Remover
                    </button>
                  </div>
                )
              })}
            </div>
          )}

          {/* Ações */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
            <button className="btn btn-secundario" onClick={() => setFiltrosDin(p => [...p, novoFiltro()])} style={{ fontSize: 13 }}>
              + Adicionar filtro
            </button>
            <div style={{ display: 'flex', gap: 8 }}>
              {filtrosDin.length > 0 && (
                <button className="btn btn-secundario" onClick={() => setFiltrosDin([])}
                  style={{ fontSize: 13, color: '#dc2626', borderColor: '#fca5a5' }}>
                  Limpar filtros
                </button>
              )}
              <button className="btn btn-primario" onClick={carregar} disabled={carregando}>
                {carregando ? 'Carregando...' : dados ? 'Recarregar' : 'Carregar Dados'}
              </button>
              {carregando && <button className="btn btn-secundario" onClick={cancelar}>Cancelar</button>}
            </div>
          </div>

          {carregando && progresso.total > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                <span>Carregando registros...</span><span>{progresso.atual} / {progresso.total} ({pct}%)</span>
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6 }}>
                <div style={{ background: '#2563eb', borderRadius: 4, height: 6, width: `${pct}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          {erro && <div className="erro-mensagem" style={{ marginTop: 8 }}>{erro}</div>}
        </div>
      )}

      {/* Conteúdo: Relatório Geral */}
      {relatorioAtivo === 'geral' && !carregando && (
        <>
          {dados && (
            <div style={{ display: 'flex', gap: 0, marginBottom: 16, borderBottom: '2px solid #e5e7eb' }}>
              {[
                { id: 'geral',         label: 'Relatório Geral' },
                { id: 'personalizado', label: 'Exportação Personalizada' },
              ].map(a => (
                <button key={a.id} onClick={() => setAba(a.id)}
                  style={{
                    padding: '8px 20px', border: 'none', background: 'none', cursor: 'pointer',
                    fontSize: 14, fontWeight: aba === a.id ? 600 : 400,
                    color: aba === a.id ? '#2563eb' : '#6b7280',
                    borderBottom: aba === a.id ? '2px solid #2563eb' : '2px solid transparent',
                    marginBottom: -2,
                  }}>
                  {a.label}
                </button>
              ))}
            </div>
          )}

          {!dados && !erro && (
            <div className="card" style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
              <div style={{ fontSize: 15, marginBottom: 4 }}>Selecione o período e clique em Carregar Dados</div>
              <div style={{ fontSize: 13 }}>Os campos dinâmicos do metadata serão expandidos automaticamente.</div>
            </div>
          )}

          {dados && aba === 'geral' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div className="card">
                <div style={{ fontWeight: 600, fontSize: 15, color: '#1e2a3b' }}>Exportar todos os dados</div>
                <div style={{ fontSize: 13, color: '#6b7280', marginTop: 4 }}>
                  {totalRegistros} registros · {todasColunas.length} colunas
                  {colunasMeta.length > 0 && ` (${colunasBase.length} da view + ${colunasMeta.length} do metadata)`}
                </div>
              </div>
              {previewLinhas.length > 0 && (
                <>
                  <div>
                    <button className="btn btn-primario" onClick={() => fazerExport(dados, todasColunas, 'relatorio_geral')} disabled={exportando || dados.length === 0}>
                      {exportando ? 'Gerando...' : '⬇ Exportar XLSX'}
                    </button>
                  </div>
                  <div className="card" style={{ padding: 0 }}>
                    <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
                      Prévia — primeiras {previewLinhas.length} de {totalRegistros} linhas
                    </div>
                    <div style={{ overflowX: 'auto', maxHeight: 420 }}>
                      <table className="tabela">
                        <thead><tr>{todasColunas.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                        <tbody>
                          {previewLinhas.map((row, i) => (
                            <tr key={i}>{todasColunas.map(c => (
                              <td key={c} style={TD}>{row[c] === null || row[c] === undefined ? '' : String(row[c])}</td>
                            ))}</tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {dados && aba === 'personalizado' && (
            <div style={{ display: 'grid', gridTemplateColumns: '260px 1fr', gap: 16, alignItems: 'start' }}>
              <div className="card" style={{ padding: 0, position: 'sticky', top: 16 }}>
                <div style={{ padding: '12px 14px', borderBottom: '1px solid #f3f4f6' }}>
                  <div style={{ fontWeight: 600, fontSize: 14, color: '#1e2a3b', marginBottom: 8 }}>Colunas</div>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <button className="btn btn-secundario" style={{ flex: 1, fontSize: 12, padding: '4px 0' }} onClick={selecionarTodas}>Todas</button>
                    <button className="btn btn-secundario" style={{ flex: 1, fontSize: 12, padding: '4px 0' }} onClick={limparTodas}>Nenhuma</button>
                  </div>
                </div>
                <div style={{ overflowY: 'auto', maxHeight: 'calc(100vh - 340px)', padding: '8px 0' }}>
                  {colunasBase.length > 0 && (
                    <>
                      <div style={{ padding: '6px 14px 4px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Dados da View</div>
                      {colunasBase.map(col => (
                        <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>
                          <input type="checkbox" checked={selecionadas.has(col)} onChange={() => toggleColuna(col)} style={{ cursor: 'pointer' }} />
                          {col}
                        </label>
                      ))}
                    </>
                  )}
                  {colunasMeta.length > 0 && (
                    <>
                      <div style={{ padding: '10px 14px 4px', fontSize: 11, fontWeight: 600, color: '#9ca3af', textTransform: 'uppercase', letterSpacing: '0.05em' }}>Campos Dinâmicos</div>
                      {colunasMeta.map(col => (
                        <label key={col} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 14px', cursor: 'pointer', fontSize: 13 }}>
                          <input type="checkbox" checked={selecionadas.has(col)} onChange={() => toggleColuna(col)} style={{ cursor: 'pointer' }} />
                          {col}
                        </label>
                      ))}
                    </>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div className="card">
                  <div style={{ fontSize: 13, color: '#6b7280' }}>
                    {colunasParaExportar.length} coluna{colunasParaExportar.length !== 1 ? 's' : ''} selecionada{colunasParaExportar.length !== 1 ? 's' : ''} · {totalRegistros} registros
                  </div>
                </div>
                {colunasParaExportar.length > 0 && previewLinhas.length > 0 ? (
                  <>
                    <div>
                      <button className="btn btn-primario"
                        onClick={() => fazerExport(dados, colunasParaExportar, 'exportacao_personalizada')}
                        disabled={exportando || colunasParaExportar.length === 0}>
                        {exportando ? 'Gerando...' : '⬇ Exportar XLSX'}
                      </button>
                    </div>
                    <div className="card" style={{ padding: 0 }}>
                      <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
                        Prévia — primeiras {previewLinhas.length} de {totalRegistros} linhas
                      </div>
                      <div style={{ overflowX: 'auto', maxHeight: 420 }}>
                        <table className="tabela">
                          <thead><tr>{colunasParaExportar.map(c => <th key={c} style={TH}>{c}</th>)}</tr></thead>
                          <tbody>
                            {previewLinhas.map((row, i) => (
                              <tr key={i}>{colunasParaExportar.map(c => (
                                <td key={c} style={TD}>{row[c] === null || row[c] === undefined ? '' : String(row[c])}</td>
                              ))}</tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="card" style={{ textAlign: 'center', padding: 32, color: '#9ca3af' }}>
                    Selecione ao menos uma coluna para ver a prévia.
                  </div>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {/* Conteúdo: Faixa Tocantins */}
      {relatorioAtivo === 'faixa-to' && (
        <FaixaTO
          dataInicio={dataInicio} dataFim={dataFim}
          setDataInicio={setDataInicio} setDataFim={setDataFim}
        />
      )}

    </div>
  )
}
