import { useState, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { CHUNK, expandirMetadata, exportarXLSX } from './exportUtils'

const COD_ROCAGEM   = new Set(['LSE-P', 'LSE-M', 'LSE-G', 'LSE-GG', 'LSE-XG'])
const COD_CAPINA    = new Set(['CQ-CHAV', 'CQ-MT', 'CQ-AT'])
const COD_ANDAMENTO = 'LSE-AND'

const HEADERS = [
  'SUPERINTENDÊNCIA', 'NOME DA SUBESTAÇÃO', 'MUNICÍPIO', 'PORTE', 'OS',
  'DATA INICIAL', 'DATA FINAL', 'ROÇAGEM', 'CAPINA QUIMICA', 'TIPO DE SUBESTAÇÃO',
  'STATUS', 'EQUIPE', 'EQUIPE INTERNO', 'VALOR DA CAP Q', 'VALOR DE LIMPEZA DE SUB',
]

// Colapsa as linhas (1 por atividade) em 1 objeto por registro (f_prod_registro).
function agruparPorRegistro(dados) {
  const porRegistro = new Map()
  for (const row of dados) {
    if (row.subestacao_id == null) continue
    const rid = row.registro_id
    if (!porRegistro.has(rid)) {
      porRegistro.set(rid, {
        registro_id: rid,
        data: row.data_producao_original,
        dataInicioManual: row.data_inicio || null,
        subestacao_id: row.subestacao_id,
        os: row.os || '',
        equipeRegional: row.equipe_regional || '',
        equipe_id: row.equipe_id,
        temAndamento: false,
        temConclusao: false,
        rocagemValor: 0,
        capinaValor: 0,
      })
    }
    const reg = porRegistro.get(rid)
    if (!reg.os && row.os) reg.os = row.os
    if (!reg.equipeRegional && row.equipe_regional) reg.equipeRegional = row.equipe_regional
    const cod = row.cod_atividade
    if (cod === COD_ANDAMENTO) {
      reg.temAndamento = true
    } else if (COD_ROCAGEM.has(cod)) {
      reg.rocagemValor += Number(row.valor_producao) || 0
      reg.temConclusao = true
    } else if (COD_CAPINA.has(cod)) {
      reg.capinaValor += Number(row.valor_producao) || 0
      reg.temConclusao = true
    }
  }
  return [...porRegistro.values()]
}

// Reconstrói "visitas" (1 linha = 1 OS concluída). Prioriza a Data Início
// digitada manualmente no próprio registro de conclusão (campo dinâmico
// data_inicio); na ausência dela, cai no comportamento antigo —
// casa a conclusão com o "Em Andamento" mais recente ainda aberto da
// mesma subestação (lançamentos anteriores a esse campo existir).
function montarVisitas(registros) {
  const porSubestacao = new Map()
  for (const r of registros) {
    if (!porSubestacao.has(r.subestacao_id)) porSubestacao.set(r.subestacao_id, [])
    porSubestacao.get(r.subestacao_id).push(r)
  }

  const visitas = []
  let pendentesAbertos = 0
  for (const lista of porSubestacao.values()) {
    lista.sort((a, b) => (a.data < b.data ? -1 : a.data > b.data ? 1 : 0))
    let pendente = null
    for (const r of lista) {
      if (r.temConclusao) {
        visitas.push({
          subestacao_id: r.subestacao_id,
          dataInicial:   r.dataInicioManual || (pendente ? pendente.data : r.data),
          dataFinal:     r.data,
          os:            r.os || pendente?.os || '',
          equipeRegional: r.equipeRegional || pendente?.equipeRegional || '',
          equipe_id:     r.equipe_id || pendente?.equipe_id || null,
          rocagemValor:  r.rocagemValor,
          capinaValor:   r.capinaValor,
        })
        pendente = null
      } else if (r.temAndamento) {
        pendente = r
      }
    }
    if (pendente) pendentesAbertos++
  }
  return { visitas, pendentesAbertos }
}

function prepararLinhas(visitas, subestacoesPorId, equipesPorId) {
  const ordenadas = [...visitas].sort((a, b) =>
    a.dataInicial < b.dataInicial ? -1 : a.dataInicial > b.dataInicial ? 1 : 0)

  return ordenadas.map(v => {
    const se   = subestacoesPorId.get(v.subestacao_id) || {}
    const nome = String(se.nome || '').replace(/^\[[A-Za-z]+\]\s*/, '')
    return {
      'SUPERINTENDÊNCIA':        se.superintendencia || '',
      'NOME DA SUBESTAÇÃO':      nome,
      'MUNICÍPIO':               se.municipio || '',
      'PORTE':                   se.porte || '',
      'OS':                      v.os,
      'DATA INICIAL':            v.dataInicial,
      'DATA FINAL':              v.dataFinal,
      'ROÇAGEM':                 v.rocagemValor > 0 ? 'SIM' : 'NÃO',
      'CAPINA QUIMICA':          v.capinaValor > 0 ? 'SIM' : 'NÃO',
      'TIPO DE SUBESTAÇÃO':      se.tipo || '',
      'STATUS':                  'FINALIZADO',
      'EQUIPE':                  v.equipeRegional || '',
      'EQUIPE INTERNO':          equipesPorId.get(v.equipe_id) || '',
      'VALOR DA CAP Q':          v.capinaValor,
      'VALOR DE LIMPEZA DE SUB': v.rocagemValor,
    }
  })
}

const TH = { whiteSpace: 'nowrap', fontSize: 12, position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }
const TD = { fontSize: 12, whiteSpace: 'nowrap', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis' }
const INPUT = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white', color: '#1e2a3b' }

export default function LimpezaSubestacao({ dataInicio, dataFim, setDataInicio, setDataFim }) {
  const cancelarRef                 = useRef(false)
  const [dados, setDados]           = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [progresso, setProgresso]   = useState({ atual: 0, total: 0 })
  const [erro, setErro]             = useState('')
  const [exportando, setExportando] = useState(false)
  const [filtroOS, setFiltroOS]     = useState('')
  const [emAndamento, setEmAndamento] = useState(0)

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
    setEmAndamento(0)
    setProgresso({ atual: 0, total: 0 })

    const todos = []
    let from = 0

    try {
      const [{ data: subestacoes }, { data: equipes }] = await Promise.all([
        supabase.from('d_subestacoes').select('id, nome, municipio, porte, tipo, superintendencia'),
        supabase.from('d_equipes').select('id, equipe'),
      ])
      const subestacoesPorId = new Map((subestacoes || []).map(s => [s.id, s]))
      const equipesPorId     = new Map((equipes || []).map(e => [e.id, e.equipe]))

      while (true) {
        const { data, error } = await supabase.rpc('fn_prod_exportar', {
          p_inicio:      dataInicio,
          p_fim:         calcularFim(),
          p_contrato_id: 21,
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

      const registros = agruparPorRegistro(expandirMetadata(todos))
      const { visitas, pendentesAbertos } = montarVisitas(registros)

      if (visitas.length === 0) {
        setErro('Nenhuma visita concluída de Limpeza de Subestação encontrada para o período.')
        setDados([])
        setEmAndamento(pendentesAbertos)
        setCarregando(false)
        return
      }

      setDados(prepararLinhas(visitas, subestacoesPorId, equipesPorId))
      setEmAndamento(pendentesAbertos)
    } catch (e) {
      setErro(`Erro inesperado: ${e.message}`)
      setCarregando(false)
      return
    }

    setCarregando(false)
  }

  const osValues      = dados ? [...new Set(dados.map(r => r['OS']).filter(Boolean))].sort() : []
  const dadosFiltrado = dados && filtroOS ? dados.filter(r => r['OS'] === filtroOS) : (dados || [])
  const preview        = dadosFiltrado.slice(0, 50)

  function fazerExport() {
    if (!dadosFiltrado.length) return
    setExportando(true)
    setTimeout(() => { exportarXLSX(dadosFiltrado, HEADERS, 'limpeza_subestacao'); setExportando(false) }, 50)
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
              {dadosFiltrado.length} visita{dadosFiltrado.length !== 1 ? 's' : ''} concluída{dadosFiltrado.length !== 1 ? 's' : ''}
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
        {!carregando && emAndamento > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#9a6700' }}>
            ⚠ {emAndamento} visita{emAndamento !== 1 ? 's' : ''} ainda em andamento (sem conclusão) no período — não incluída{emAndamento !== 1 ? 's' : ''} no relatório.
          </div>
        )}
        {erro && <div className="erro-mensagem" style={{ marginTop: 8 }}>{erro}</div>}
      </div>

      {!dados && !carregando && !erro && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>🧹</div>
          <div style={{ fontSize: 15, marginBottom: 4 }}>Selecione o período e clique em Carregar Dados</div>
          <div style={{ fontSize: 13 }}>1 linha por visita concluída — mesmas colunas da planilha original de controle.</div>
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
