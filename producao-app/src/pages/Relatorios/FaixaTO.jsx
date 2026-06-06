import { useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { CHUNK, expandirMetadata, exportarXLSX } from './exportUtils'

const IDS_FAIXA_TO = new Set([17, 18, 19])

const COLUNAS = [
  { campo: 'registro_id',            header: 'REGISTRO ID' },
  { campo: 'data_producao_original', header: 'DATA' },
  { campo: 'os',                     header: 'OS' },
  { campo: 'tipo_rede',              header: 'TIPO DE REDE',
    transform: v => v === 'MONOFASICA' ? 'M' : v === 'TRIFASICA' ? 'T' : (v ?? '') },
  { campo: 'largura',                header: 'ABERTURA' },
  { campo: 'desc_atividade',         header: 'SERVICO',
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

const HEADERS = COLUNAS.map(c => c.header)

function preparar(dados) {
  return dados
    .filter(row => IDS_FAIXA_TO.has(Number(row.contrato_id)) && row.justificativa == null)
    .map(row => {
      const novo = {}
      for (const col of COLUNAS) {
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

const TH = { whiteSpace: 'nowrap', fontSize: 12, position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }
const TD = { fontSize: 12, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }

const INPUT = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white', color: '#1e2a3b' }

export default function FaixaTO({ dataInicio, dataFim, setDataInicio, setDataFim }) {
  const cancelarRef               = useRef(false)
  const [dados, setDados]         = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [progresso, setProgresso] = useState({ atual: 0, total: 0 })
  const [erro, setErro]           = useState('')
  const [exportando, setExportando] = useState(false)
  const [filtroOS, setFiltroOS]     = useState('')

  const pct = progresso.total > 0
    ? Math.min(Math.round((progresso.atual / progresso.total) * 100), carregando ? 99 : 100)
    : 0

  function calcularFim() {
    const d = new Date(dataFim + 'T00:00:00')
    d.setDate(d.getDate() + 1)
    return d.toISOString().slice(0, 10)
  }

  function cancelar() { cancelarRef.current = true; setCarregando(false) }

  async function carregar() {
    cancelarRef.current = false
    setErro('')
    setCarregando(true)
    setDados(null)
    setFiltroOS('')
    setProgresso({ atual: 0, total: 0 })

    const todos = []
    let from = 0

    try {
      while (true) {
        const { data, error } = await supabase.rpc('fn_prod_exportar', {
          p_inicio:      dataInicio,
          p_fim:         calcularFim(),
          p_contrato_id: null,
          p_limit:       CHUNK,
          p_offset:      from,
        })

        if (cancelarRef.current) { setCarregando(false); return }
        if (error) { setErro(`Erro: ${error.message}`); setCarregando(false); return }

        const linhas = data || []
        todos.push(...linhas)
        from += CHUNK
        setProgresso({ atual: from, total: linhas.length < CHUNK ? from : from + CHUNK })
        if (linhas.length < CHUNK) break
      }
    } catch (e) {
      setErro(`Erro inesperado: ${e.message}`)
      setCarregando(false)
      return
    }

    if (todos.length === 0) {
      setErro('Nenhum registro Faixa TO encontrado para o período.')
      setDados([])
      setCarregando(false)
      return
    }

    setDados(preparar(expandirMetadata(todos)))
    setCarregando(false)
  }

  const osValues      = dados ? [...new Set(dados.map(r => r['OS']).filter(Boolean))].sort() : []
  const dadosFiltrado = dados && filtroOS ? dados.filter(r => r['OS'] === filtroOS) : (dados || [])
  const preview       = dadosFiltrado.slice(0, 50)

  function fazerExport() {
    if (!dadosFiltrado.length) return
    setExportando(true)
    setTimeout(() => { exportarXLSX(dadosFiltrado, HEADERS, 'relatorio_faixa_to'); setExportando(false) }, 50)
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Data início</div>
            <input type="date" style={INPUT} value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Data fim</div>
            <input type="date" style={INPUT} value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
          {dados && !carregando && (
            <div>
              <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>OS</div>
              <select value={filtroOS} onChange={e => setFiltroOS(e.target.value)} style={INPUT}>
                <option value="">Todas</option>
                {osValues.map(os => <option key={os} value={os}>{os}</option>)}
              </select>
            </div>
          )}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primario" onClick={carregar} disabled={carregando}>
              {carregando ? 'Carregando...' : dados ? 'Recarregar' : 'Carregar Dados'}
            </button>
            {carregando && <button className="btn btn-secundario" onClick={cancelar}>Cancelar</button>}
          </div>
          {dados && !carregando && (
            <span style={{ fontSize: 13, color: '#6b7280', alignSelf: 'center' }}>
              {dadosFiltrado.length} registros
            </span>
          )}
        </div>

        {carregando && progresso.total > 0 && (
          <div style={{ marginTop: 10 }}>
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

      {!dados && !carregando && !erro && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>📍</div>
          <div style={{ fontSize: 15, marginBottom: 4 }}>Selecione o período e clique em Carregar Dados</div>
          <div style={{ fontSize: 13 }}>Atividades de justificativa são excluídas automaticamente.</div>
        </div>
      )}

      {dados && dadosFiltrado.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div>
            <button className="btn btn-primario" onClick={fazerExport} disabled={exportando}>
              {exportando ? 'Gerando...' : '⬇ Exportar XLSX'}
            </button>
          </div>
          <div className="card" style={{ padding: 0 }}>
            <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
              Prévia — primeiras {preview.length} de {dadosFiltrado.length} linhas
            </div>
            <div style={{ overflowX: 'auto', maxHeight: 420 }}>
              <table className="tabela">
                <thead>
                  <tr>{HEADERS.map(c => <th key={c} style={TH}>{c}</th>)}</tr>
                </thead>
                <tbody>
                  {preview.map((row, i) => (
                    <tr key={i}>
                      {HEADERS.map(c => (
                        <td key={c} style={TD}>
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
}
