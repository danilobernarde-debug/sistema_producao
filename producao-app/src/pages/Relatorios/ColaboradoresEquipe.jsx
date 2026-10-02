import { useState, useEffect, useRef } from 'react'
import { supabase } from '../../supabaseClient'
import { CHUNK, exportarXLSX } from './exportUtils'
import SelectPesquisavel from '../../components/SelectPesquisavel'

// Contratos Faixa TO (17, 18, 19) compartilham as equipes do contrato 17
const contratoDasEquipes = id => ([17, 18, 19].includes(Number(id)) ? 17 : Number(id))

const HEADERS = ['Data', 'Equipe', 'Matrícula', 'Nome', 'Valor Produção']

// Filtros dinâmicos — mesmo esquema do Relatório Geral (campo / operador / valor)
const CAMPOS_DIN = [
  { key: 'equipe_id', label: 'Equipe',    tipo: 'sel_equipe', col: 'equipe_id' },
  { key: 'matricula', label: 'Matrícula', tipo: 'numero',     col: 'Matrícula' },
  { key: 'nome',      label: 'Nome',      tipo: 'texto',      col: 'Nome'      },
  { key: 'valor',     label: 'Valor Produção', tipo: 'numero', col: 'Valor Produção' },
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

const TH = { whiteSpace: 'nowrap', fontSize: 12, position: 'sticky', top: 0, background: '#f9fafb', zIndex: 1 }
const TD = { fontSize: 12, whiteSpace: 'nowrap', maxWidth: 260, overflow: 'hidden', textOverflow: 'ellipsis' }
const INPUT = { padding: '6px 10px', borderRadius: 6, border: '1px solid #d1d5db', fontSize: 13, background: 'white', color: '#1e2a3b' }

function formatarData(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/)
  return m ? `${m[3]}/${m[2]}/${m[1]}` : (iso || '')
}

const formatarValor = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })

// 1 linha por colaborador por dia por equipe. A equipe segue a mesma regra da
// view_prod_relatorio_colaborador: contratos com logica_contrato usam a equipe
// do colaborador no registro; os demais, a equipe do registro.
// valorPorRegCol: "registro_id|colaborador_id" → valor_por_colaborador da view;
// se o colaborador tem mais de um registro no dia/equipe, os valores somam.
function prepararLinhas(rows, contratosPorId, equipesPorId, valorPorRegCol) {
  const porChave = new Map()
  for (const row of rows) {
    const reg = row.f_prod_registro
    const col = row.d_colaboradores
    if (!reg || !col) continue
    const logica = contratosPorId.get(reg.contrato_id)?.logica_contrato === true
    const equipeId = logica ? row.equipe_id : reg.equipe_id
    const chave = `${reg.data_producao}|${equipeId}|${row.colaborador_id}`
    if (!porChave.has(chave)) {
      porChave.set(chave, {
        equipe_id:   equipeId,
        _registros:  new Set(),
        'Data':      reg.data_producao,
        'Equipe':    equipesPorId.get(equipeId) || '',
        'Matrícula': col.matricula ?? '',
        'Nome':      col.nome || '',
        'Valor Produção': 0,
      })
    }
    const linha = porChave.get(chave)
    if (linha._registros.has(row.registro_id)) continue
    linha._registros.add(row.registro_id)
    linha['Valor Produção'] += valorPorRegCol.get(`${row.registro_id}|${row.colaborador_id}`) || 0
  }
  const linhas = [...porChave.values()].map(({ _registros, ...l }) =>
    ({ ...l, 'Valor Produção': Math.round(l['Valor Produção'] * 100) / 100 }))
  return linhas.sort((a, b) =>
    a['Data'].localeCompare(b['Data']) ||
    a['Equipe'].localeCompare(b['Equipe']) ||
    a['Nome'].localeCompare(b['Nome']))
}

export default function ColaboradoresEquipe({ dataInicio, dataFim, setDataInicio, setDataFim }) {
  const cancelarRef                 = useRef(false)
  const [contratos, setContratos]   = useState([])
  const [contratoId, setContratoId] = useState('')
  const [dados, setDados]           = useState(null)
  const [carregando, setCarregando] = useState(false)
  const [progresso, setProgresso]   = useState(0)
  const [erro, setErro]             = useState('')
  const [exportando, setExportando] = useState(false)
  const [equipes, setEquipes]       = useState([])
  const [filtrosDin, setFiltrosDin] = useState([])

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao, logica_contrato').order('descricao')
      .then(({ data }) => setContratos(data || []))
    supabase.from('d_equipes').select('id, equipe, contrato_id').order('equipe')
      .then(({ data }) => setEquipes(data || []))
  }, [])

  const doContrato = (e, id) => !id || e.contrato_id === contratoDasEquipes(id)
  const opcoesEquipe = equipes
    .filter(e => doContrato(e, contratoId))
    .map(e => ({ valor: e.id, label: e.equipe }))

  // Ao trocar o contrato, limpa filtros de equipe que não pertencem a ele
  function alterarContrato(id) {
    setContratoId(id)
    setFiltrosDin(prev => prev.map(f => {
      if (f.campo !== 'equipe_id' || !f.valor) return f
      const eq = equipes.find(e => String(e.id) === String(f.valor))
      return eq && doContrato(eq, id) ? f : { ...f, valor: '' }
    }))
  }

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

  // Aplicado sobre as linhas já carregadas — mudar filtro não exige recarregar
  function aplicarFiltrosDin(rows) {
    if (filtrosDin.length === 0) return rows
    return rows.filter(row =>
      filtrosDin.every(({ campo, operador, valor }) => {
        if (!valor && valor !== 0) return true
        const def = CAMPOS_DIN.find(c => c.key === campo) || CAMPOS_DIN[0]
        const colVal = row[def.col]
        const v = String(colVal ?? '')
        const fv = String(valor)
        if (operador === 'igual' && def.tipo === 'texto') return v.toLowerCase() === fv.toLowerCase()
        if (operador === 'igual')      return colVal != null && colVal !== '' && colVal == valor
        if (operador === 'diferente')  return colVal == null || colVal != valor
        if (operador === 'maior')      return colVal !== '' && colVal != null && Number(colVal) > Number(valor)
        if (operador === 'menor')      return colVal !== '' && colVal != null && Number(colVal) < Number(valor)
        if (operador === 'contem')     return v.toLowerCase().includes(fv.toLowerCase())
        if (operador === 'nao_contem') return !v.toLowerCase().includes(fv.toLowerCase())
        return true
      })
    )
  }

  function cancelar() { cancelarRef.current = true; setCarregando(false) }

  async function carregar() {
    cancelarRef.current = false
    setErro('')
    setCarregando(true)
    setDados(null)
    setProgresso(0)

    const todos = []
    let from = 0

    try {
      const equipesPorId   = new Map(equipes.map(e => [e.id, e.equipe]))
      const contratosPorId = new Map(contratos.map(c => [c.id, c]))

      while (true) {
        let q = supabase.from('f_prod_colaboradores')
          .select('id, registro_id, colaborador_id, equipe_id, f_prod_registro!inner(data_producao, contrato_id, equipe_id), d_colaboradores(matricula, nome)')
          .gte('f_prod_registro.data_producao', dataInicio)
          .lte('f_prod_registro.data_producao', dataFim)
        if (contratoId) q = q.eq('f_prod_registro.contrato_id', Number(contratoId))
        const { data, error } = await q.order('id').range(from, from + CHUNK - 1)

        if (cancelarRef.current) { setCarregando(false); return }
        if (error) { setErro(`Erro: ${error.message}`); setCarregando(false); return }

        const linhas = data || []
        todos.push(...linhas)
        from += CHUNK
        setProgresso(todos.length)
        if (linhas.length < CHUNK) break
      }

      // Valor da produção por colaborador (view_prod_relatorio_colaborador via RPC segura)
      const valorPorRegCol = new Map()
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await supabase.rpc('fn_prod_relatorio_colaboradores', {
          p_inicio: dataInicio, p_fim: dataFim, p_limit: 1000, p_offset: offset,
        })
        if (cancelarRef.current) { setCarregando(false); return }
        if (error) { setErro(`Erro ao buscar valores: ${error.message}`); setCarregando(false); return }
        for (const v of data || []) {
          valorPorRegCol.set(`${v.registro_id}|${v.colaborador_id}`, Number(v.valor_por_colaborador) || 0)
        }
        if ((data || []).length < 1000) break
      }

      const linhas = prepararLinhas(todos, contratosPorId, equipesPorId, valorPorRegCol)
      if (linhas.length === 0) setErro('Nenhum colaborador encontrado para o período.')
      setDados(linhas)
    } catch (e) {
      setErro(`Erro inesperado: ${e.message}`)
    }

    setCarregando(false)
  }

  const dadosFiltrado = dados ? aplicarFiltrosDin(dados) : []
  const preview       = dadosFiltrado.slice(0, 50)

  function fazerExport() {
    if (!dadosFiltrado.length) return
    setExportando(true)
    setTimeout(() => { exportarXLSX(dadosFiltrado, HEADERS, 'colaboradores_equipe'); setExportando(false) }, 50)
  }

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>

        {/* Filtros fixos */}
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Data início</div>
            <input type="date" style={INPUT} value={dataInicio} onChange={e => setDataInicio(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Data fim</div>
            <input type="date" style={INPUT} value={dataFim} onChange={e => setDataFim(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: 12, color: '#6b7280', marginBottom: 4 }}>Contrato</div>
            <select style={{ ...INPUT, minWidth: 200 }} value={contratoId} onChange={e => alterarContrato(e.target.value)}>
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
                  <select value={f.campo} onChange={e => alterarFiltrosDin(idx, 'campo', e.target.value)} style={{ ...INPUT, minWidth: 160 }}>
                    {CAMPOS_DIN.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                  <select value={f.operador} onChange={e => alterarFiltrosDin(idx, 'operador', e.target.value)} style={{ ...INPUT, minWidth: 140 }}>
                    {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                  {def.tipo === 'numero' ? (
                    <input type="number" value={f.valor} onChange={e => alterarFiltrosDin(idx, 'valor', e.target.value)} style={{ ...INPUT, minWidth: 120 }} placeholder="Digite..." />
                  ) : def.tipo === 'sel_equipe' ? (
                    <div style={{ minWidth: 220 }}>
                      <SelectPesquisavel opcoes={opcoesEquipe} valor={f.valor} onChange={v => alterarFiltrosDin(idx, 'valor', v)} placeholder="Pesquisar equipe..." />
                    </div>
                  ) : (
                    <input type="text" value={f.valor} onChange={e => alterarFiltrosDin(idx, 'valor', e.target.value)} style={{ ...INPUT, minWidth: 200 }} placeholder="Digite..." />
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
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {dados && !carregando && dadosFiltrado.length > 0 && (
              <span style={{ fontSize: 13, color: '#6b7280' }}>
                {dadosFiltrado.length} linha{dadosFiltrado.length !== 1 ? 's' : ''}
              </span>
            )}
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

        {carregando && progresso > 0 && (
          <div style={{ marginTop: 10, fontSize: 12, color: '#6b7280' }}>
            Carregando... {progresso} lançamentos de colaboradores lidos
          </div>
        )}
        {erro && <div className="erro-mensagem" style={{ marginTop: 8 }}>{erro}</div>}
        {!carregando && dados?.length > 0 && dadosFiltrado.length === 0 && (
          <div style={{ marginTop: 10, fontSize: 13, color: '#6b7280' }}>Nenhum colaborador atende aos filtros.</div>
        )}
      </div>

      {!dados && !carregando && !erro && (
        <div className="card" style={{ textAlign: 'center', padding: 48, color: '#9ca3af' }}>
          <div style={{ fontSize: 36, marginBottom: 12 }}>👷</div>
          <div style={{ fontSize: 15, marginBottom: 4 }}>Selecione o período e clique em Carregar Dados</div>
          <div style={{ fontSize: 13 }}>1 linha por colaborador, por dia, por equipe.</div>
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
                      <td style={TD}>{formatarData(row['Data'])}</td>
                      <td style={TD}>{row['Equipe']}</td>
                      <td style={TD}>{row['Matrícula']}</td>
                      <td style={TD}>{row['Nome']}</td>
                      <td style={{ ...TD, textAlign: 'right' }}>{formatarValor(row['Valor Produção'])}</td>
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
