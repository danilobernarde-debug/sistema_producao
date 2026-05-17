import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

const CHUNK = 500

const MESES = [
  { v: '01', l: 'Janeiro' }, { v: '02', l: 'Fevereiro' }, { v: '03', l: 'Março' },
  { v: '04', l: 'Abril' },   { v: '05', l: 'Maio' },      { v: '06', l: 'Junho' },
  { v: '07', l: 'Julho' },   { v: '08', l: 'Agosto' },    { v: '09', l: 'Setembro' },
  { v: '10', l: 'Outubro' }, { v: '11', l: 'Novembro' },  { v: '12', l: 'Dezembro' },
]

function expandirMetadata(rows) {
  return rows.map(row => {
    const { metadata_registro, metadata_atividades, ...resto } = row
    const metaReg = metadata_registro  && typeof metadata_registro  === 'object' ? metadata_registro  : {}
    const metaAct = metadata_atividades && typeof metadata_atividades === 'object' ? metadata_atividades : {}
    return { ...resto, ...metaReg, ...metaAct }
  })
}

function exportarXLSX(dados, colunas, nomeArquivo) {
  const linhas = dados.map(row => {
    const obj = {}
    colunas.forEach(col => { obj[col] = row[col] ?? '' })
    return obj
  })
  const ws = XLSX.utils.json_to_sheet(linhas)
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dados')
  XLSX.writeFile(wb, `${nomeArquivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export default function Exportacao() {
  const navegar   = useNavigate()
  const hoje      = new Date()
  const [mes, setMes]                         = useState(String(hoje.getMonth() + 1).padStart(2, '0'))
  const [ano, setAno]                         = useState(String(hoje.getFullYear()))
  const [mesAte, setMesAte]                   = useState(String(hoje.getMonth() + 1).padStart(2, '0'))
  const [anoAte, setAnoAte]                   = useState(String(hoje.getFullYear()))
  const [contratoId, setContratoId]           = useState('')
  const [contratos, setContratos]             = useState([])
  const [aba, setAba]                         = useState('geral')
  const [carregando, setCarregando]           = useState(false)
  const [progresso, setProgresso]             = useState({ atual: 0, total: 0 })
  const [dados, setDados]                     = useState(null)
  const [colunasBase, setColunasBase]         = useState([])
  const [colunasMeta, setColunasMeta]         = useState([])
  const [selecionadas, setSelecionadas]       = useState(new Set())
  const [exportando, setExportando]           = useState(false)
  const [totalRegistros, setTotalRegistros]   = useState(0)
  const [erro, setErro]                       = useState('')

  const anos = []
  for (let y = 2023; y <= hoje.getFullYear() + 1; y++) anos.push(String(y))

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao')
      .then(({ data }) => setContratos(data || []))
  }, [])

  function calcularPeriodo() {
    const inicio = `${ano}-${mes}-01`
    const mesProx = Number(mesAte) === 12 ? '01' : String(Number(mesAte) + 1).padStart(2, '0')
    const anoProx = Number(mesAte) === 12 ? String(Number(anoAte) + 1) : anoAte
    const fim = `${anoProx}-${mesProx}-01`
    return { inicio, fim }
  }

  async function carregar() {
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

        if (error) {
          setErro(`Erro: ${error.message}`)
          setCarregando(false)
          return
        }

        const linhas = data || []
        if (!primeiraLinha && linhas.length > 0) primeiraLinha = linhas[0]
        todos.push(...linhas)
        from += CHUNK
        if (total === null) total = linhas.length < CHUNK ? from : null
        setProgresso({ atual: from, total: total ?? from + 1 })
        if (linhas.length < CHUNK) { total = from; break }
      }
    } catch (e) {
      setErro(`Erro inesperado: ${e.message}`)
      setCarregando(false)
      return
    }

    if (todos.length === 0) {
      setErro(`Nenhum registro encontrado para o período ${inicio} até ${fim}.`)
      setDados([])
      setCarregando(false)
      return
    }

    const expandido = expandirMetadata(todos)
    setTotalRegistros(total ?? todos.length)

    function ocultarColuna(k) {
      if (k === 'metadata_registro' || k === 'metadata_atividades') return true
      if (k === 'data_producao') return true
      if (k !== 'registro_id' && k.endsWith('_id')) return true
      return false
    }

    const chavesOriginais = Object.keys(primeiraLinha).filter(k => !ocultarColuna(k))

    // Varre todas as linhas para descobrir todas as chaves de metadata
    const todasChavesMeta = new Set()
    expandido.forEach(row => {
      Object.keys(row).forEach(k => {
        if (!ocultarColuna(k) && !chavesOriginais.includes(k)) {
          todasChavesMeta.add(k)
        }
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

  function fazerExport(colunas, nome) {
    if (!dados || dados.length === 0) return
    setExportando(true)
    setTimeout(() => { exportarXLSX(dados, colunas, nome); setExportando(false) }, 50)
  }

  const todasColunas = [...colunasBase, ...colunasMeta]
  const colunasParaExportar = todasColunas.filter(c => selecionadas.has(c))
  const previewLinhas = dados ? dados.slice(0, 50) : []
  const pct = progresso.total > 0 ? Math.round((progresso.atual / progresso.total) * 100) : 0

  const selectStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white', color: '#1e2a3b' }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar(-1)}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Exportação de Dados</h1>
        </div>
      </div>

      {/* Filtros */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>De</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={selectStyle} value={mes} onChange={e => setMes(e.target.value)}>
                {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select style={selectStyle} value={ano} onChange={e => setAno(e.target.value)}>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Até</div>
            <div style={{ display: 'flex', gap: 6 }}>
              <select style={selectStyle} value={mesAte} onChange={e => setMesAte(e.target.value)}>
                {MESES.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select style={selectStyle} value={anoAte} onChange={e => setAnoAte(e.target.value)}>
                {anos.map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Contrato</div>
            <select style={{ ...selectStyle, minWidth: 200 }} value={contratoId} onChange={e => setContratoId(e.target.value)}>
              <option value="">Todos os contratos</option>
              {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
            </select>
          </div>
          <button className="btn btn-primario" onClick={carregar} disabled={carregando} style={{ alignSelf: 'flex-end' }}>
            {carregando ? 'Carregando...' : dados ? 'Recarregar' : 'Carregar Dados'}
          </button>
        </div>

        {/* Barra de progresso */}
        {carregando && progresso.total > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
              <span>Carregando registros...</span>
              <span>{progresso.atual} / {progresso.total} ({pct}%)</span>
            </div>
            <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6 }}>
              <div style={{ background: '#2563eb', borderRadius: 4, height: 6, width: `${pct}%`, transition: 'width 0.3s' }} />
            </div>
          </div>
        )}
        {erro && <div className="erro-mensagem" style={{ marginTop: 8 }}>{erro}</div>}
      </div>

      {/* Abas */}
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

      {/* Sem dados */}
      {!carregando && !dados && !erro && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📊</div>
          <div style={{ fontSize: 15, marginBottom: 4 }}>Selecione o período e clique em Carregar Dados</div>
          <div style={{ fontSize: 13 }}>Os campos dinâmicos do metadata serão expandidos automaticamente.</div>
        </div>
      )}

      {!carregando && dados && (
        <>
          {/* Aba: Relatório Geral */}
          {aba === 'geral' && (
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
                    <button className="btn btn-primario" onClick={() => fazerExport(todasColunas, 'relatorio_geral')} disabled={exportando || dados.length === 0}>
                      {exportando ? 'Gerando...' : '⬇ Exportar XLSX'}
                    </button>
                  </div>
                  <div className="card" style={{ padding: 0 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
                    Prévia — primeiras {previewLinhas.length} de {totalRegistros} linhas
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 420 }}>
                    <table className="tabela">
                      <thead>
                        <tr>{todasColunas.map(c => <th key={c} style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {previewLinhas.map((row, i) => (
                          <tr key={i}>
                            {todasColunas.map(c => (
                              <td key={c} style={{ fontSize: 12, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {row[c] === null || row[c] === undefined ? '' : String(row[c])}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
                </>
              )}
            </div>
          )}

          {/* Aba: Exportação Personalizada */}
          {aba === 'personalizado' && (
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
                        onClick={() => fazerExport(colunasParaExportar, 'exportacao_personalizada')}
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
                        <thead>
                          <tr>{colunasParaExportar.map(c => <th key={c} style={{ whiteSpace: 'nowrap', fontSize: 12 }}>{c}</th>)}</tr>
                        </thead>
                        <tbody>
                          {previewLinhas.map((row, i) => (
                            <tr key={i}>
                              {colunasParaExportar.map(c => (
                                <td key={c} style={{ fontSize: 12, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                  {row[c] === null || row[c] === undefined ? '' : String(row[c])}
                                </td>
                              ))}
                            </tr>
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
    </div>
  )
}
