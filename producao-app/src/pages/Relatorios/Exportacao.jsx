import { useState, useEffect, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import * as XLSX from 'xlsx'
import { supabase } from '../../supabaseClient'

const CHUNK = 500

const IDS_FAIXA_TO = new Set([17, 18, 19])

const COLUNAS_FAIXA_TO = [
  { campo: 'registro_id',            header: 'REGISTRO ID' },
  { campo: 'data_producao_original', header: 'DATA' },
  { campo: 'os',                     header: 'OS' },
  { campo: 'tipo_rede',    header: 'TIPO DE REDE',
    transform: v => v === 'MONOFASICA' ? 'M' : v === 'TRIFASICA' ? 'T' : (v ?? '') },
  { campo: 'largura',                header: 'ABERTURA' },
  { campo: 'desc_atividade', header: 'SERVICO',
    transform: (v, row) => {
      const cod = row.cod_atividade
      if (cod === '102')   return 'TRECHO LIVRE'
      if (cod === '11508') return 'ÁRVORE ISOLADA'
      if (cod === '1593')  return 'LIMPEZA DE FAIXA'
      if (cod === '1594')  return 'REABERTURA DE FAIXA'
      return v ?? ''
    } },
  { campo: 'latitude_inicial',       header: 'LATITUDE INICIAL' },
  { campo: 'longitude_inicial',      header: 'LONGITUDE INICIAL' },
  { campo: 'latitude_final',         header: 'LATITUDE FINAL' },
  { campo: 'longitude_final',        header: 'LONGITUDE FINAL' },
  { campo: 'comprimento',            header: 'EXTENSAO' },
  { campo: 'quantidade',             header: 'ARVORES ISOLADAS', apenasAtividade: 11508 },
]

function prepararFaixaTO(dados) {
  return dados
    .filter(row => IDS_FAIXA_TO.has(Number(row.contrato_id)) && row.justificativa == null)
    .map(row => {
      const novo = {}
      for (const col of COLUNAS_FAIXA_TO) {
        if (col.apenasAtividade) {
          novo[col.header] = row.cod_atividade === String(col.apenasAtividade) ? (row[col.campo] ?? '') : ''
        } else if (col.transform) {
          novo[col.header] = col.transform(row[col.campo], row)
        } else {
          novo[col.header] = row[col.campo] ?? ''
        }
      }
      return novo
    })
}

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

const EXCEL_EPOCH = Date.UTC(1899, 11, 30) // 30/12/1899 UTC — epoch do Excel

function isoToExcelSerial(str) {
  const m = str.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  if (!m) return null
  return (Date.UTC(Number(m[1]), Number(m[2]) - 1, Number(m[3])) - EXCEL_EPOCH) / 86400000
}

function exportarXLSX(dados, colunas, nomeArquivo) {
  // detecta colunas com datas ISO (YYYY-MM-DD)
  const dateCols = new Set()
  for (const col of colunas) {
    for (const row of dados.slice(0, 20)) {
      if (typeof row[col] === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row[col])) {
        dateCols.add(col); break
      }
    }
  }

  const linhas = dados.map(row => {
    const obj = {}
    colunas.forEach(col => {
      const val = row[col] ?? ''
      if (dateCols.has(col) && typeof val === 'string') {
        const serial = isoToExcelSerial(val)
        obj[col] = serial !== null ? serial : val
      } else {
        obj[col] = val
      }
    })
    return obj
  })

  const ws = XLSX.utils.json_to_sheet(linhas)

  // aplica formato de data nas colunas detectadas
  if (ws['!ref']) {
    const range = XLSX.utils.decode_range(ws['!ref'])
    const dateColIdx = []
    for (let C = range.s.c; C <= range.e.c; C++) {
      const h = ws[XLSX.utils.encode_cell({ r: 0, c: C })]
      if (h && dateCols.has(String(h.v))) dateColIdx.push(C)
    }
    for (let R = 1; R <= range.e.r; R++) {
      for (const C of dateColIdx) {
        const cell = ws[XLSX.utils.encode_cell({ r: R, c: C })]
        if (cell && cell.t === 'n') cell.z = 'dd/mm/yyyy'
      }
    }
  }

  ws['!cols'] = colunas.map(col => {
    const maxLen = Math.max(
      col.length,
      ...dados.slice(0, 200).map(row => String(row[col] ?? '').length)
    )
    return { wch: Math.min(maxLen + 2, 60) }
  })

  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Dados')
  XLSX.writeFile(wb, `${nomeArquivo}_${new Date().toISOString().slice(0, 10)}.xlsx`)
}

export default function Exportacao() {
  const navegar    = useNavigate()
  const hoje       = new Date()
  const primDiaMes = `${hoje.getFullYear()}-${String(hoje.getMonth() + 1).padStart(2, '0')}-01`
  const hojeISO    = hoje.toISOString().slice(0, 10)
  const [dataInicio, setDataInicio]           = useState(primDiaMes)
  const [dataFim, setDataFim]                 = useState(hojeISO)
  const [relatorioAtivo, setRelatorioAtivo]   = useState(null)
  const [aba, setAba]                         = useState('geral')
  const [contratoId, setContratoId]           = useState('')
  const [contratos, setContratos]             = useState([])
  const [carregando, setCarregando]           = useState(false)
  const [progresso, setProgresso]             = useState({ atual: 0, total: 0 })
  const [dados, setDados]                     = useState(null)
  const [colunasBase, setColunasBase]         = useState([])
  const [colunasMeta, setColunasMeta]         = useState([])
  const [selecionadas, setSelecionadas]       = useState(new Set())
  const [exportando, setExportando]           = useState(false)
  const [totalRegistros, setTotalRegistros]   = useState(0)
  const [erro, setErro]                       = useState('')

  const cancelarRef    = useRef(false)
  const cancelarFTORef = useRef(false)

  const [dadosFTO, setDadosFTO]           = useState(null)
  const [carregandoFTO, setCarregandoFTO] = useState(false)
  const [progressoFTO, setProgressoFTO]   = useState({ atual: 0, total: 0 })
  const [erroFTO, setErroFTO]             = useState('')

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao')
      .then(({ data }) => setContratos(data || []))
  }, [])

  function calcularPeriodo() {
    const d = new Date(dataFim + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return { inicio: dataInicio, fim: d.toISOString().slice(0, 10) }
  }

  function cancelar() {
    cancelarRef.current = true
    setCarregando(false)
  }

  function cancelarFTO() {
    cancelarFTORef.current = true
    setCarregandoFTO(false)
  }

  async function carregarFaixaTO() {
    cancelarFTORef.current = false
    setErroFTO('')
    setCarregandoFTO(true)
    setDadosFTO(null)
    setProgressoFTO({ atual: 0, total: 0 })

    const { inicio, fim } = calcularPeriodo()
    const todos = []
    let from = 0

    try {
      while (true) {
        const { data, error } = await supabase.rpc('exportar_r07', {
          p_inicio:      inicio,
          p_fim:         fim,
          p_contrato_id: null,
          p_limit:       CHUNK,
          p_offset:      from,
        })

        if (cancelarFTORef.current) { setCarregandoFTO(false); return }
        if (error) { setErroFTO(`Erro: ${error.message}`); setCarregandoFTO(false); return }

        const linhas = data || []
        todos.push(...linhas)
        from += CHUNK
        setProgressoFTO({ atual: from, total: linhas.length < CHUNK ? from : from + CHUNK })
        if (linhas.length < CHUNK) break
      }
    } catch (e) {
      setErroFTO(`Erro inesperado: ${e.message}`)
      setCarregandoFTO(false)
      return
    }

    if (todos.length === 0) {
      setErroFTO(`Nenhum registro Faixa TO encontrado para o período.`)
      setDadosFTO([])
      setCarregandoFTO(false)
      return
    }

    setDadosFTO(prepararFaixaTO(expandirMetadata(todos)))
    setCarregandoFTO(false)
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
        setProgresso({ atual: from, total: total ?? from + CHUNK })
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
    setTotalRegistros(expandido.length)

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

  function fazerExport(dadosParam, colunas, nome) {
    if (!dadosParam || dadosParam.length === 0) return
    setExportando(true)
    setTimeout(() => { exportarXLSX(dadosParam, colunas, nome); setExportando(false) }, 50)
  }

  const todasColunas        = [...colunasBase, ...colunasMeta]
  const colunasParaExportar = todasColunas.filter(c => selecionadas.has(c))
  const previewLinhas       = dados ? dados.slice(0, 50) : []
  const pct    = progresso.total    > 0 ? Math.min(Math.round((progresso.atual    / progresso.total)    * 100), carregando    ? 99 : 100) : 0
  const pctFTO = progressoFTO.total > 0 ? Math.min(Math.round((progressoFTO.atual / progressoFTO.total) * 100), carregandoFTO ? 99 : 100) : 0

  const selectStyle = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white', color: '#1e2a3b' }

  return (
    <div className="pagina">

      {/* Header */}
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          {relatorioAtivo ? (
            <button className="btn btn-secundario"
              onClick={() => { setRelatorioAtivo(null); setDados(null); setDadosFTO(null); setErro(''); setErroFTO('') }}
              style={{ padding: '6px 12px', fontSize: 13 }}>← Relatórios</button>
          ) : (
            <button className="btn btn-secundario" onClick={() => navegar(-1)}
              style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          )}
          <h1 className="pagina-titulo" style={{ margin: 0 }}>
            {relatorioAtivo === 'geral' ? 'Relatório Geral'
              : relatorioAtivo === 'faixa-to' ? 'Faixa Tocantins'
              : 'Exportação de Dados'}
          </h1>
        </div>
      </div>

      {/* Tela de seleção */}
      {!relatorioAtivo && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 16, maxWidth: 620 }}>
          {[
            { id: 'geral',    icone: '📊', titulo: 'Relatório Geral',
              desc: 'Exportação completa com todas as colunas. Filtro por contrato e seleção de colunas personalizável.' },
            { id: 'faixa-to', icone: '📍', titulo: 'Faixa Tocantins',
              desc: 'Colunas fixas para os contratos TO Norte, Sul e Centro. Atividades de justificativa excluídas automaticamente.' },
          ].map(r => (
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

      {/* Filtros (compartilhado) */}
      {relatorioAtivo && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'flex-end' }}>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Data início</div>
              <input type="date" style={selectStyle} value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
            </div>
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Data fim</div>
              <input type="date" style={selectStyle} value={dataFim} onChange={e => setDataFim(e.target.value)} />
            </div>
            {relatorioAtivo === 'geral' && (
              <div>
                <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Contrato</div>
                <select style={{ ...selectStyle, minWidth: 200 }} value={contratoId} onChange={e => setContratoId(e.target.value)}>
                  <option value="">Todos os contratos</option>
                  {contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                </select>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, alignSelf: 'flex-end' }}>
              {relatorioAtivo === 'geral' && (
                <>
                  <button className="btn btn-primario" onClick={carregar} disabled={carregando}>
                    {carregando ? 'Carregando...' : dados ? 'Recarregar' : 'Carregar Dados'}
                  </button>
                  {carregando && <button className="btn btn-secundario" onClick={cancelar}>Cancelar</button>}
                </>
              )}
              {relatorioAtivo === 'faixa-to' && (
                <>
                  <button className="btn btn-primario" onClick={carregarFaixaTO} disabled={carregandoFTO}>
                    {carregandoFTO ? 'Carregando...' : dadosFTO ? 'Recarregar' : 'Carregar Dados'}
                  </button>
                  {carregandoFTO && <button className="btn btn-secundario" onClick={cancelarFTO}>Cancelar</button>}
                </>
              )}
            </div>
          </div>

          {relatorioAtivo === 'geral' && carregando && progresso.total > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                <span>Carregando registros...</span><span>{progresso.atual} / {progresso.total} ({pct}%)</span>
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6 }}>
                <div style={{ background: '#2563eb', borderRadius: 4, height: 6, width: `${pct}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          {relatorioAtivo === 'geral' && erro && <div className="erro-mensagem" style={{ marginTop: 8 }}>{erro}</div>}

          {relatorioAtivo === 'faixa-to' && carregandoFTO && progressoFTO.total > 0 && (
            <div style={{ marginTop: 12 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6b7280', marginBottom: 4 }}>
                <span>Carregando registros...</span><span>{progressoFTO.atual} / {progressoFTO.total} ({pctFTO}%)</span>
              </div>
              <div style={{ background: '#e5e7eb', borderRadius: 4, height: 6 }}>
                <div style={{ background: '#2563eb', borderRadius: 4, height: 6, width: `${pctFTO}%`, transition: 'width 0.3s' }} />
              </div>
            </div>
          )}
          {relatorioAtivo === 'faixa-to' && erroFTO && <div className="erro-mensagem" style={{ marginTop: 8 }}>{erroFTO}</div>}
          {relatorioAtivo === 'faixa-to' && dadosFTO && !carregandoFTO && (
            <div style={{ marginTop: 8, fontSize: 13, color: '#6b7280' }}>
              {dadosFTO.length} registros · {COLUNAS_FAIXA_TO.length} colunas fixas
            </div>
          )}
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
                        <thead>
                          <tr>{todasColunas.map(c => <th key={c} style={{ whiteSpace: 'nowrap', fontSize: 12, position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>{c}</th>)}</tr>
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
                          <thead>
                            <tr>{colunasParaExportar.map(c => <th key={c} style={{ whiteSpace: 'nowrap', fontSize: 12, position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>{c}</th>)}</tr>
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

      {/* Conteúdo: Faixa Tocantins */}
      {relatorioAtivo === 'faixa-to' && !carregandoFTO && (() => {
        const colunasFTO = COLUNAS_FAIXA_TO.map(c => c.header)
        const previewFTO = dadosFTO ? dadosFTO.slice(0, 50) : []
        return (
          <>
            {!dadosFTO && !erroFTO && (
              <div className="card" style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
                <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
                <div style={{ fontSize: 15, marginBottom: 4 }}>Selecione o período e clique em Carregar Dados</div>
                <div style={{ fontSize: 13 }}>Atividades de justificativa são excluídas automaticamente.</div>
              </div>
            )}
            {dadosFTO && dadosFTO.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <button className="btn btn-primario"
                    onClick={() => fazerExport(dadosFTO, colunasFTO, 'relatorio_faixa_to')}
                    disabled={exportando}>
                    {exportando ? 'Gerando...' : '⬇ Exportar XLSX'}
                  </button>
                </div>
                <div className="card" style={{ padding: 0 }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
                    Prévia — primeiras {previewFTO.length} de {dadosFTO.length} linhas
                  </div>
                  <div style={{ overflowX: 'auto', maxHeight: 420 }}>
                    <table className="tabela">
                      <thead>
                        <tr>{colunasFTO.map(c => <th key={c} style={{ whiteSpace: 'nowrap', fontSize: 12, position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }}>{c}</th>)}</tr>
                      </thead>
                      <tbody>
                        {previewFTO.map((row, i) => (
                          <tr key={i}>
                            {colunasFTO.map(c => (
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
              </div>
            )}
          </>
        )
      })()}

    </div>
  )
}
