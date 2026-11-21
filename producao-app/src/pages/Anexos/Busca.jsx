import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '../../supabaseClient'
import SelectPesquisavel from '../../components/SelectPesquisavel'
import VisualizadorAnexos from '../../components/VisualizadorAnexos'
import { linksDosArquivos, tamanhoBr, dataHoraBr } from '../../utils/anexosFotos'
import { COLUNAS_ANEXO, EMBED_REGISTRO_INNER, dataBr, Miniatura, paraItemVisualizador, botaoPaginacao } from './comum'

const POR_PAGINA = 30
const FILTROS_KEY = 'anexos-busca-filtros-v1'

// Mesmo modelo de filtros de /producao (Registros de Produção). Campos com prefixo "registro." filtram o
// lançamento a que o anexo pertence (f_prod_registro, via inner join).
//   sel_*  → lista (Selecionado/Não Selecionado)   data → Igual/Maior/Menor   texto → Contém/Não Contém/Igual
const CAMPOS_DEF = [
  { key: 'data_producao',  label: 'Data da Produção', tipo: 'data',         col: 'registro.data_producao' },
  { key: 'contrato_id',    label: 'Contrato',         tipo: 'sel_contrato', col: 'registro.contrato_id' },
  { key: 'equipe_id',      label: 'Equipe',           tipo: 'sel_equipe',   col: 'registro.equipe_id' },
  { key: 'encarregado_id', label: 'Encarregado',      tipo: 'sel_enc',      col: 'registro.encarregado_id' },
  { key: 'obra_id',        label: 'Nr. Obra',         tipo: 'sel_num',      col: 'registro.obra_id' },
  { key: 'registro_id',    label: 'ID do Lançamento', tipo: 'sel_num',      col: 'registro_id' },
  { key: 'nome',           label: 'Nome do Arquivo',  tipo: 'texto',        col: 'name' },
  { key: 'tipo_arquivo',   label: 'Tipo de Arquivo',  tipo: 'sel_tipo',     col: 'type' },
  { key: 'data_cadastro',  label: 'Enviado em',       tipo: 'data',         col: 'data_cadastro' }, // cobre o dia inteiro
]
const OPERADORES_TEXTO = [{ value: 'contem', label: 'Contém' }, { value: 'nao_contem', label: 'Não Contém' }, { value: 'igual', label: 'Igual a' }]
const OPERADORES_EXATO = [{ value: 'igual', label: 'Selecionado' }, { value: 'diferente', label: 'Não Selecionado' }]
const OPERADORES_DATA = [{ value: 'igual', label: 'Igual a' }, { value: 'maior', label: 'Maior que' }, { value: 'menor', label: 'Menor que' }]

const operadoresDoCampo = tipo => tipo.startsWith('sel_') ? OPERADORES_EXATO : tipo === 'data' ? OPERADORES_DATA : OPERADORES_TEXTO

function filtroNovo(campo = 'data_producao') {
  const def = CAMPOS_DEF.find(c => c.key === campo) || CAMPOS_DEF[0]
  return { _id: Date.now() + Math.random(), campo, operador: operadoresDoCampo(def.tipo)[0].value, valor: '' }
}

function lerFiltrosSalvos() {
  try {
    const s = JSON.parse(sessionStorage.getItem(FILTROS_KEY) || '[]')
    return Array.isArray(s) ? s : []
  } catch { return [] }
}

// filtro por tipo de arquivo (grupos de MIME)
function filtroTipo(q, valor, negar) {
  if (valor === 'imagem') return negar ? q.not('type', 'like', 'image/%') : q.like('type', 'image/%')
  if (valor === 'pdf') return negar ? q.neq('type', 'application/pdf') : q.eq('type', 'application/pdf')
  if (valor === 'planilha') {
    return negar ? q.not('type', 'ilike', '%spreadsheet%').neq('type', 'text/csv') : q.or('type.ilike.%spreadsheet%,type.eq.text/csv')
  }
  return q
}

export default function Busca({ cad }) {
  const navegar = useNavigate()
  const [filtros, setFiltros] = useState(lerFiltrosSalvos)
  const [linhas, setLinhas] = useState([])
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [links, setLinks] = useState(new Map())
  const [aberto, setAberto] = useState(null)

  useEffect(() => { sessionStorage.setItem(FILTROS_KEY, JSON.stringify(filtros)) }, [filtros])
  useEffect(() => { buscar(pagina) }, [pagina])

  function aplicarFiltros(q, lista) {
    for (const { campo, operador, valor } of lista) {
      if (!valor && valor !== 0) continue
      const def = CAMPOS_DEF.find(c => c.key === campo)
      if (!def) continue
      const col = def.col
      const numerico = def.tipo === 'sel_num' || def.tipo === 'sel_contrato' || def.tipo === 'sel_equipe' || def.tipo === 'sel_enc'
      if (def.tipo === 'sel_tipo') { q = filtroTipo(q, valor, operador === 'diferente'); continue }
      if (campo === 'data_cadastro') {
        if (operador === 'igual') q = q.gte(col, `${valor}T00:00:00-03:00`).lte(col, `${valor}T23:59:59-03:00`)
        else if (operador === 'maior') q = q.gt(col, `${valor}T23:59:59-03:00`)
        else if (operador === 'menor') q = q.lt(col, `${valor}T00:00:00-03:00`)
      } else if (operador === 'maior') q = q.gt(col, valor)
      else if (operador === 'menor') q = q.lt(col, valor)
      else if (operador === 'igual') q = q.eq(col, numerico ? Number(valor) : valor)
      else if (operador === 'diferente') q = q.neq(col, numerico ? Number(valor) : valor)
      else if (operador === 'contem') q = q.ilike(col, `%${valor}%`)
      else if (operador === 'nao_contem') q = q.not(col, 'ilike', `%${valor}%`)
    }
    return q
  }

  async function buscar(pag = 1, lista = filtros) {
    setCarregando(true); setErro('')
    const de = (pag - 1) * POR_PAGINA
    const base = supabase.from('f_prod_arquivos')
      .select(`${COLUNAS_ANEXO}, ${EMBED_REGISTRO_INNER}`, { count: 'exact' })
      .order('data_cadastro', { ascending: false }).order('id', { ascending: false })
      .range(de, de + POR_PAGINA - 1)
    const { data, count, error } = await aplicarFiltros(base, lista)
    if (error) { setErro(error.message); setLinhas([]); setTotal(0); setCarregando(false); return }
    setLinhas(data || []); setTotal(count || 0); setCarregando(false)
    linksDosArquivos(data || []).then(setLinks)
  }

  const pesquisar = () => (pagina === 1 ? buscar(1) : setPagina(1))
  function limpar() {
    setFiltros([])
    sessionStorage.removeItem(FILTROS_KEY)
    if (pagina === 1) buscar(1, []); else setPagina(1) // o efeito de pagina busca; filtros já zerados
  }
  const alterarFiltro = (idx, k, v) => setFiltros(prev => prev.map((f, i) => {
    if (i !== idx) return f
    if (k !== 'campo') return { ...f, [k]: v }
    const def = CAMPOS_DEF.find(c => c.key === v) || CAMPOS_DEF[0]
    return { ...f, campo: v, operador: operadoresDoCampo(def.tipo)[0].value, valor: '' }
  }))

  const totalPaginas = Math.ceil(total / POR_PAGINA)
  const filtrosAtivos = filtros.filter(f => f.valor !== '').length
  const visiveis = linhas.filter(l => links.get(l.id)) // todo anexo com link abre no visualizador (os sem visualização mostram Baixar)
  const subtitulo = l => `lançamento #${l.registro_id} · ${cad.nomeContrato(l.registro.contrato_id)}${l.registro.equipe_id ? ' · ' + cad.nomeEquipe(l.registro.equipe_id) : ''} · ${dataBr(l.registro.data_producao)}`
  function abrirArquivo(l) {
    const url = links.get(l.id)
    if (!url) return
    setAberto(visiveis.findIndex(v => v.id === l.id))
  }

  const inputStyle = { padding: '6px 10px', border: '1px solid #d1d5db', borderRadius: 6, fontSize: 13, background: 'white', color: '#1e2a3b', height: 34 }
  const celula = { padding: '6px 12px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap' }

  return (
    <>
      {/* Filtros (mesmo padrão de /producao) */}
      <div className="card" style={{ marginBottom: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: '#1a56db' }}>▼ FILTROS</span>
          <span style={{ fontSize: 12, color: '#6b7280' }}>
            [{filtrosAtivos > 0 ? `${filtrosAtivos} filtro${filtrosAtivos > 1 ? 's' : ''} ativo${filtrosAtivos > 1 ? 's' : ''}` : 'Mostrando todos os anexos'}]
          </span>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtros.map((f, idx) => {
            const def = CAMPOS_DEF.find(c => c.key === f.campo) || CAMPOS_DEF[0]
            const ops = operadoresDoCampo(def.tipo)
            return (
              <div key={f._id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                <select value={f.campo} onChange={e => alterarFiltro(idx, 'campo', e.target.value)} style={{ ...inputStyle, minWidth: 170 }}>
                  {CAMPOS_DEF.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
                </select>
                <select value={f.operador} onChange={e => alterarFiltro(idx, 'operador', e.target.value)} style={{ ...inputStyle, minWidth: 140 }}>
                  {ops.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
                {def.tipo === 'sel_contrato' ? (
                  <select value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
                    <option value="">Selecione...</option>
                    {cad.contratos.map(c => <option key={c.id} value={c.id}>{c.descricao}</option>)}
                  </select>
                ) : def.tipo === 'sel_equipe' ? (
                  <select value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 200 }}>
                    <option value="">Selecione...</option>
                    {cad.equipes.map(e => <option key={e.id} value={e.id}>{e.equipe}</option>)}
                  </select>
                ) : def.tipo === 'sel_enc' ? (
                  <div style={{ minWidth: 220 }}>
                    <SelectPesquisavel opcoes={cad.encarregados} valor={f.valor} onChange={v => alterarFiltro(idx, 'valor', v)} placeholder="Pesquisar encarregado..." />
                  </div>
                ) : def.tipo === 'sel_tipo' ? (
                  <select value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 160 }}>
                    <option value="">Selecione...</option>
                    <option value="imagem">Imagem</option>
                    <option value="pdf">PDF</option>
                    <option value="planilha">Planilha / CSV</option>
                  </select>
                ) : def.tipo === 'data' ? (
                  <input type="date" value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 160 }} />
                ) : def.tipo === 'sel_num' ? (
                  <input type="number" value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} style={{ ...inputStyle, minWidth: 120 }} placeholder="Digite..." />
                ) : (
                  <input type="text" value={f.valor} onChange={e => alterarFiltro(idx, 'valor', e.target.value)} onKeyDown={e => e.key === 'Enter' && pesquisar()} style={{ ...inputStyle, minWidth: 220 }} placeholder="Digite..." />
                )}
                <button onClick={() => setFiltros(prev => prev.filter((_, i) => i !== idx))}
                  style={{ padding: '4px 10px', border: '1px solid #fca5a5', borderRadius: 6, background: '#fef2f2', color: '#dc2626', fontSize: 12, cursor: 'pointer', height: 34 }}>
                  ✕ Remover filtro
                </button>
              </div>
            )
          })}
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 12, flexWrap: 'wrap', gap: 8 }}>
          <button className="btn btn-secundario" onClick={() => setFiltros(prev => [...prev, filtroNovo()])} style={{ fontSize: 13 }}>+ Adicionar filtro</button>
          <div style={{ display: 'flex', gap: 8 }}>
            {filtros.length > 0 && (
              <button className="btn btn-secundario" onClick={limpar} style={{ fontSize: 13, color: '#dc2626', borderColor: '#fca5a5' }}>🗑 Limpar filtros</button>
            )}
            <button className="btn btn-primario" onClick={pesquisar} style={{ fontSize: 13 }}>🔎 Buscar</button>
          </div>
        </div>
      </div>

      {erro && <div className="alerta alerta-erro">{erro}</div>}

      {/* Resultados */}
      <div className="card" style={{ padding: 0 }}>
        <div style={{ padding: '12px 16px', borderBottom: '1px solid #f3f4f6', fontSize: 13, color: '#6b7280' }}>
          {carregando ? 'Carregando...' : `${total} anexo${total !== 1 ? 's' : ''} — página ${pagina} de ${totalPaginas || 1}`}
        </div>
        {!carregando && linhas.length === 0 ? (
          <div style={{ padding: 24, color: '#6b7280', fontSize: 13 }}>Nenhum anexo encontrado.</div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ minWidth: 'max-content', width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#f9fafb', textAlign: 'left', fontSize: 12, color: '#374151' }}>
                  {['', 'Nome', 'Lançamento', 'Data da Produção', 'Contrato', 'Equipe', 'Enviado em', 'Tamanho'].map((t, i) => (
                    <th key={i} style={{ padding: '10px 12px', borderBottom: '2px solid #e5e7eb', whiteSpace: 'nowrap', textAlign: t === 'Tamanho' ? 'right' : 'left' }}>{t}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {linhas.map(l => (
                  <tr key={l.id} onMouseEnter={e => { e.currentTarget.style.background = '#eff6ff' }} onMouseLeave={e => { e.currentTarget.style.background = '' }}>
                    <td style={{ ...celula, width: 56 }}>
                      <button type="button" onClick={() => abrirArquivo(l)} style={{ padding: 0, border: 'none', background: 'none', cursor: links.get(l.id) ? 'zoom-in' : 'default' }}>
                        <Miniatura anexo={l} url={links.get(l.id)} />
                      </button>
                    </td>
                    <td style={celula}>
                      <button type="button" onClick={() => abrirArquivo(l)} style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', cursor: 'pointer', fontSize: 13, textAlign: 'left' }}>{l.name}</button>
                    </td>
                    <td style={celula}>
                      <button type="button" onClick={() => navegar(`/producao/${l.registro_id}/editar?modo=visualizar`)}
                        style={{ background: 'none', border: 'none', padding: 0, color: '#1d4ed8', cursor: 'pointer', fontSize: 13 }}>#{l.registro_id}</button>
                    </td>
                    <td style={celula}>{dataBr(l.registro.data_producao)}</td>
                    <td style={celula}>{cad.nomeContrato(l.registro.contrato_id)}</td>
                    <td style={celula}>{cad.nomeEquipe(l.registro.equipe_id) || '—'}</td>
                    <td style={celula}>{dataHoraBr(l.data_cadastro)}</td>
                    <td style={{ ...celula, textAlign: 'right' }}>{tamanhoBr(l.size)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {totalPaginas > 1 && (
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 16px', borderTop: '1px solid #f3f4f6', flexWrap: 'wrap', gap: 8 }}>
            <span style={{ fontSize: 13, color: '#6b7280' }}>{total} anexos — página {pagina} de {totalPaginas}</span>
            <div style={{ display: 'flex', gap: 6 }}>
              <button className="btn btn-secundario" style={botaoPaginacao} onClick={() => setPagina(1)} disabled={pagina === 1}>«</button>
              <button className="btn btn-secundario" style={botaoPaginacao} onClick={() => setPagina(p => p - 1)} disabled={pagina === 1}>‹</button>
              <button className="btn btn-secundario" style={botaoPaginacao} onClick={() => setPagina(p => p + 1)} disabled={pagina >= totalPaginas}>›</button>
              <button className="btn btn-secundario" style={botaoPaginacao} onClick={() => setPagina(totalPaginas)} disabled={pagina >= totalPaginas}>»</button>
            </div>
          </div>
        )}
      </div>

      {aberto !== null && visiveis[aberto] && (
        <VisualizadorAnexos
          itens={visiveis.map(l => paraItemVisualizador(l, links.get(l.id), subtitulo(l)))}
          indice={aberto} onMudar={setAberto} onFechar={() => setAberto(null)}
        />
      )}
    </>
  )
}
