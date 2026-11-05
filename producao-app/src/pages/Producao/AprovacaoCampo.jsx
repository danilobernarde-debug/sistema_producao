import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { supabase } from '../../supabaseClient'

// Fila de aprovação da produção lançada pelo app de campo (app_campo).
// O encarregado grava em campo_registros_producao (+ filhas); aqui o escritório confere e
// aprova (copia para f_prod_* via fn_prod_aprovar_registro_campo) ou rejeita com motivo.
// SQL: supabase/aprovacao_producao_campo_04_11_2026.sql

const LIMITE = 100
const ABAS = [
  { key: 'pendente',  label: 'Pendentes' },
  { key: 'aprovado',  label: 'Aprovados' },
  { key: 'rejeitado', label: 'Rejeitados' },
]
const COR_STATUS = {
  pendente:  { background: '#fef3c7', color: '#b45309' },
  aprovado:  { background: '#dcfce7', color: '#16a34a' },
  rejeitado: { background: '#fee2e2', color: '#dc2626' },
}

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const numero = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 })

function dataBr(iso) {
  if (!iso) return '-'
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}
function dataHoraBr(iso) {
  if (!iso) return '-'
  return new Date(iso).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })
}
function valorAtividade(a) {
  if (a.upe === null || a.upe === undefined || a.preco_upe === null || a.preco_upe === undefined) return null
  return Number(a.upe) * Number(a.preco_upe) * Number(a.quantidade)
}
function textoValor(v) {
  if (v === null || v === undefined || v === '') return null
  if (typeof v === 'object') return JSON.stringify(v)
  return String(v)
}
function mensagemErro(error) {
  const msg = error?.message || 'Erro desconhecido.'
  if (error?.code === '42P01' || error?.code === 'PGRST205' || /does not exist|schema cache/i.test(msg)) {
    return 'As tabelas da fila de aprovação ainda não existem no banco. Rode o SQL da migração do app de campo (migracao_registro_producao.sql) e depois aprovacao_producao_campo_04_11_2026.sql.'
  }
  if (error?.code === 'PGRST202' || /Could not find the function/i.test(msg)) {
    return 'As funções de aprovação ainda não existem no banco. Rode aprovacao_producao_campo_04_11_2026.sql no SQL Editor do Supabase.'
  }
  return msg
}

export default function AprovacaoCampo() {
  const [aba, setAba] = useState('pendente')
  const [contagem, setContagem] = useState({ pendente: 0, aprovado: 0, rejeitado: 0 })
  const [registros, setRegistros] = useState([])
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState('')
  const [aviso, setAviso] = useState('')
  const [aberto, setAberto] = useState(null) // registro exibido no detalhe
  const [camposLabel, setCamposLabel] = useState({})

  useEffect(() => {
    supabase.from('config_campos').select('nome, label').then(({ data }) => {
      const m = {}
      ;(data || []).forEach(c => { m[c.nome] = c.label })
      setCamposLabel(m)
    })
  }, [])

  useEffect(() => { carregar(aba) }, [aba])

  // Quem chama já ligou setCarregando(true) (o efeito não pode chamar setState de forma síncrona).
  async function carregar(statusAba) {
    // Contagem por status (cabeçalho das abas)
    const contagens = await Promise.all(ABAS.map(a =>
      supabase.from('campo_registros_producao').select('id', { count: 'exact', head: true }).eq('status', a.key)
    ))
    const falha = contagens.find(c => c.error)
    if (falha) { setErro(mensagemErro(falha.error)); setRegistros([]); setCarregando(false); return }
    setErro('')
    setContagem(Object.fromEntries(ABAS.map((a, i) => [a.key, contagens[i].count || 0])))

    // Pendentes: mais antigos primeiro (fila); demais: mais recentes primeiro
    const asc = statusAba === 'pendente'
    const { data: rows, error } = await supabase
      .from('campo_registros_producao')
      .select('*')
      .eq('status', statusAba)
      .order('data_producao', { ascending: asc })
      .order('id', { ascending: asc })
      .limit(LIMITE)
    if (error) { setErro(mensagemErro(error)); setRegistros([]); setCarregando(false); return }

    const lista = rows || []
    const ids = lista.map(r => r.id)
    const un = arr => [...new Set(arr.filter(v => v !== null && v !== undefined))]

    const vazio = Promise.resolve({ data: [] })
    const [ativ, colab, fotos, contr, tipos, equipes, encs, usuarios] = await Promise.all([
      ids.length ? supabase.from('campo_registro_atividades').select('registro_id, quantidade, upe, preco_upe').in('registro_id', ids) : vazio,
      ids.length ? supabase.from('campo_registro_colaboradores').select('registro_id').in('registro_id', ids) : vazio,
      ids.length ? supabase.from('campo_registro_fotos').select('registro_id').in('registro_id', ids) : vazio,
      supabase.from('d_contratos').select('id, descricao, logica_contrato'),
      supabase.from('d_tipo_equipe').select('id, descricao'),
      supabase.from('d_equipes').select('id, equipe, sistema_producao'),
      un(lista.map(r => r.encarregado_id)).length
        ? supabase.from('d_colaboradores').select('id, matricula_nome').in('id', un(lista.map(r => r.encarregado_id)))
        : vazio,
      un(lista.map(r => r.criado_por_id)).length
        ? supabase.from('d_auth_user').select('uuid, nome').in('uuid', un(lista.map(r => r.criado_por_id)))
        : vazio,
    ])

    const porId = (res, chave) => Object.fromEntries((res.data || []).map(x => [x[chave], x]))
    const mContr = porId(contr, 'id'), mTipo = porId(tipos, 'id'), mEq = porId(equipes, 'id')
    const mEnc = porId(encs, 'id'), mUser = porId(usuarios, 'uuid')

    const agrupar = res => {
      const m = {}
      ;(res.data || []).forEach(x => { (m[x.registro_id] ||= []).push(x) })
      return m
    }
    const gAtiv = agrupar(ativ), gColab = agrupar(colab), gFotos = agrupar(fotos)

    setRegistros(lista.map(r => {
      const itens = gAtiv[r.id] || []
      const semPreco = itens.filter(a => valorAtividade(a) === null).length
      const valor = itens.reduce((s, a) => s + (valorAtividade(a) || 0), 0)
      const eq = mEq[r.equipe_id]
      return {
        ...r,
        _contrato: mContr[r.contrato_id]?.descricao || `#${r.contrato_id}`,
        _logica: !!mContr[r.contrato_id]?.logica_contrato,
        _tipo: mTipo[r.tipo_equipe_id]?.descricao || `#${r.tipo_equipe_id}`,
        _equipe: eq ? (eq.sistema_producao || eq.equipe) : null,
        _encarregado: mEnc[r.encarregado_id]?.matricula_nome || null,
        _enviado_por: mUser[r.criado_por_id]?.nome || null,
        _qtd_ativ: itens.length,
        _qtd_colab: (gColab[r.id] || []).length,
        _qtd_fotos: (gFotos[r.id] || []).length,
        _sem_preco: semPreco,
        _valor: valor,
      }
    }))
    setCarregando(false)
  }


  function recarregar() {
    setCarregando(true)
    carregar(aba)
  }

  function trocarAba(chave) {
    if (chave === aba) return
    setCarregando(true)
    setAba(chave)
  }

  function aoConcluir(mensagem) {
    setAberto(null)
    setAviso(mensagem)
    recarregar()
  }

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Aprovação — Produção do Campo</h1>
        <button className="btn btn-secundario" onClick={recarregar} disabled={carregando}>
          ↻ Atualizar
        </button>
      </div>

      {aviso && (
        <div style={{ ...estilos.faixa, background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }}>
          <span>{aviso}</span>
          <button onClick={() => setAviso('')} style={estilos.fechar} aria-label="Fechar">×</button>
        </div>
      )}
      {erro && (
        <div style={{ ...estilos.faixa, background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }}>
          <span>{erro}</span>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
        {ABAS.map(a => (
          <button
            key={a.key}
            onClick={() => trocarAba(a.key)}
            className={`btn ${aba === a.key ? 'btn-primario' : 'btn-secundario'}`}
          >
            {a.label}
            <span style={{
              background: aba === a.key ? 'rgba(255,255,255,0.25)' : '#e5e7eb',
              color: aba === a.key ? 'white' : '#374151',
              borderRadius: 10, padding: '0 7px', fontSize: 12, fontWeight: 600,
            }}>{contagem[a.key]}</span>
          </button>
        ))}
      </div>

      <div className="card" style={{ padding: 0 }}>
        {carregando ? (
          <div className="loading" style={{ padding: 40 }}><div className="spinner" />Carregando...</div>
        ) : registros.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#6b7280' }}>
            {erro ? '' : aba === 'pendente' ? 'Nenhum registro aguardando aprovação. 🎉' : 'Nenhum registro nesta aba.'}
          </div>
        ) : (
          <div className="tabela-container">
            <table className="tabela">
              <thead>
                <tr>
                  <th>Data</th>
                  <th>Contrato</th>
                  <th>Tipo de equipe</th>
                  <th>Equipe</th>
                  <th>Encarregado</th>
                  <th>Enviado por</th>
                  <th>Recebido em</th>
                  <th style={{ textAlign: 'right' }}>Ativ.</th>
                  <th style={{ textAlign: 'right' }}>Colab.</th>
                  <th style={{ textAlign: 'right' }}>Fotos</th>
                  <th style={{ textAlign: 'right' }}>Valor estimado</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {registros.map(r => (
                  <tr key={r.id} onClick={() => setAberto(r)} style={{ cursor: 'pointer' }}>
                    <td>{dataBr(r.data_producao)}</td>
                    <td>{r._contrato}</td>
                    <td>{r._tipo}</td>
                    <td>{r._logica ? <span style={{ color: '#6b7280' }}>por colaborador</span> : (r._equipe || '-')}</td>
                    <td>{r._encarregado || '-'}</td>
                    <td>{r._enviado_por || '-'}</td>
                    <td>{dataHoraBr(r.recebido_em)}</td>
                    <td style={{ textAlign: 'right' }}>{r._qtd_ativ}</td>
                    <td style={{ textAlign: 'right' }}>{r._qtd_colab}</td>
                    <td style={{ textAlign: 'right' }}>{r._qtd_fotos}</td>
                    <td style={{ textAlign: 'right' }}>
                      {reais.format(r._valor)}
                      {r._sem_preco > 0 && (
                        <span title={`${r._sem_preco} atividade(s) sem preço calculado no celular`} style={{ marginLeft: 6, color: '#b45309' }}>⚠</span>
                      )}
                    </td>
                    <td><span className="badge" style={COR_STATUS[r.status]}>{r.status}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {!carregando && contagem[aba] > LIMITE && (
        <div style={{ fontSize: 12, color: '#6b7280', marginTop: 8 }}>
          Mostrando {aba === 'pendente' ? `os ${LIMITE} mais antigos` : `os ${LIMITE} mais recentes`} de {contagem[aba]}.
        </div>
      )}

      {aberto && (
        <Detalhe
          registro={aberto}
          camposLabel={camposLabel}
          onFechar={() => setAberto(null)}
          onConcluir={aoConcluir}
        />
      )}
    </div>
  )
}

// ── Detalhe + decisão ─────────────────────────────────────────────────────────
function Detalhe({ registro: r, camposLabel, onFechar, onConcluir }) {
  const [carregando, setCarregando] = useState(true)
  const [atividades, setAtividades] = useState([])
  const [colaboradores, setColaboradores] = useState([])
  const [fotos, setFotos] = useState([])
  const [erroCarga, setErroCarga] = useState('')
  const [fotoAberta, setFotoAberta] = useState(null) // índice da foto ampliada
  const [modo, setModo] = useState('ver') // ver | rejeitar
  const [motivo, setMotivo] = useState('')
  const [salvando, setSalvando] = useState(false)
  const [erro, setErro] = useState('')

  useEffect(() => {
    let vivo = true
    ;(async () => {
      const [ativ, colab, ft] = await Promise.all([
        supabase.from('campo_registro_atividades').select('*').eq('registro_id', r.id),
        supabase.from('campo_registro_colaboradores').select('*').eq('registro_id', r.id),
        supabase.from('campo_registro_fotos').select('*').eq('registro_id', r.id).order('tirada_em'),
      ])
      if (!vivo) return
      const falha = ativ.error || colab.error || ft.error
      if (falha) { setErroCarga(mensagemErro(falha)); setCarregando(false); return }

      const idsAtv = [...new Set((ativ.data || []).map(a => a.atividade_id))]
      const idsCol = [...new Set((colab.data || []).map(c => c.colaborador_id))]
      const idsEq = [...new Set((colab.data || []).map(c => c.equipe_id).filter(Boolean))]
      const [dAtv, dCol, dEq] = await Promise.all([
        idsAtv.length ? supabase.from('d_atividades').select('id, codigo_op, descricao, unidade').in('id', idsAtv) : { data: [] },
        idsCol.length ? supabase.from('d_colaboradores').select('id, matricula_nome').in('id', idsCol) : { data: [] },
        idsEq.length ? supabase.from('d_equipes').select('id, equipe, sistema_producao').in('id', idsEq) : { data: [] },
      ])
      if (!vivo) return
      const mAtv = Object.fromEntries((dAtv.data || []).map(a => [a.id, a]))
      const mCol = Object.fromEntries((dCol.data || []).map(c => [c.id, c.matricula_nome]))
      const mEq = Object.fromEntries((dEq.data || []).map(e => [e.id, e.sistema_producao || e.equipe]))

      setAtividades((ativ.data || []).map(a => ({ ...a, _atv: mAtv[a.atividade_id], _valor: valorAtividade(a) })))
      setColaboradores((colab.data || []).map(c => ({
        ...c, _nome: mCol[c.colaborador_id] || `#${c.colaborador_id}`, _equipe: mEq[c.equipe_id] || null,
      })))

      // Fotos ficam num bucket privado: gera links temporários (1 h)
      const caminhos = (ft.data || []).map(f => f.storage_path)
      let urls = {}
      if (caminhos.length) {
        const { data: assinadas } = await supabase.storage.from('campo-fotos').createSignedUrls(caminhos, 3600)
        ;(assinadas || []).forEach(s => { if (s.signedUrl) urls[s.path] = s.signedUrl })
      }
      if (!vivo) return
      setFotos((ft.data || []).map(f => ({ ...f, _url: urls[f.storage_path] || null })))
      setCarregando(false)
    })()
    return () => { vivo = false }
  }, [r.id])

  const total = atividades.reduce((s, a) => s + (a._valor || 0), 0)
  const semPreco = atividades.filter(a => a._valor === null).length
  const pendente = r.status === 'pendente'
  const metaRegistro = Object.entries(r.metadata_registro || {}).filter(([, v]) => textoValor(v) !== null)

  async function aprovar() {
    if (semPreco > 0 && !window.confirm(
      `${semPreco} atividade(s) estão sem preço calculado no celular e serão lançadas com valor em branco ` +
      '(depois dá para corrigir em Produção → Editar). Aprovar mesmo assim?'
    )) return
    setSalvando(true); setErro('')
    const { data, error } = await supabase.rpc('fn_prod_aprovar_registro_campo', { p_id: r.id })
    setSalvando(false)
    if (error) { setErro(mensagemErro(error)); return }
    onConcluir(`Registro aprovado e lançado em Produção (nº ${data}).`)
  }

  async function rejeitar() {
    if (!motivo.trim()) { setErro('Informe o motivo da rejeição.'); return }
    setSalvando(true); setErro('')
    const { error } = await supabase.rpc('fn_prod_rejeitar_registro_campo', { p_id: r.id, p_motivo: motivo })
    setSalvando(false)
    if (error) { setErro(mensagemErro(error)); return }
    onConcluir('Registro rejeitado. O encarregado verá o motivo no app.')
  }

  return (
    <div style={estilos.overlay} onMouseDown={e => { if (e.target === e.currentTarget && !salvando) onFechar() }}>
      <div style={estilos.modal}>
        <div style={estilos.modalTopo}>
          <div>
            <div style={{ fontSize: 17, fontWeight: 700, color: '#1e2a3b' }}>
              Produção de {dataBr(r.data_producao)} — {r._contrato}
            </div>
            <div style={{ fontSize: 13, color: '#6b7280', marginTop: 2 }}>
              {r._tipo}{r._equipe ? ` · ${r._equipe}` : ''}
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <span className="badge" style={COR_STATUS[r.status]}>{r.status}</span>
            <button onClick={onFechar} style={estilos.fechar} aria-label="Fechar" disabled={salvando}>×</button>
          </div>
        </div>

        <div style={estilos.modalCorpo}>
          <div style={estilos.gridInfo}>
            <Info rotulo="Encarregado" valor={r._encarregado} />
            <Info rotulo="Enviado por" valor={r._enviado_por} />
            <Info rotulo="Nr. Obra" valor={r.obra_id} />
            <Info rotulo="Registrado no celular" valor={dataHoraBr(r.criado_em)} />
            <Info rotulo="Recebido em" valor={dataHoraBr(r.recebido_em)} />
            {r.avaliado_em && <Info rotulo="Avaliado em" valor={dataHoraBr(r.avaliado_em)} />}
          </div>

          {metaRegistro.length > 0 && (
            <Bloco titulo="Campos do registro">
              <div style={estilos.gridInfo}>
                {metaRegistro.map(([k, v]) => (
                  <Info key={k} rotulo={camposLabel[k] || k} valor={textoValor(v)} />
                ))}
              </div>
            </Bloco>
          )}

          {r.status === 'rejeitado' && r.motivo_rejeicao && (
            <div style={{ ...estilos.faixa, background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }}>
              <span><strong>Motivo da rejeição:</strong> {r.motivo_rejeicao}</span>
            </div>
          )}
          {r.status === 'aprovado' && r.f_prod_registro_id && (
            <div style={{ ...estilos.faixa, background: '#dcfce7', color: '#166534', borderColor: '#bbf7d0' }}>
              <span>
                Lançado em Produção como registro nº {r.f_prod_registro_id}.{' '}
                <Link to={`/producao/${r.f_prod_registro_id}/editar`} style={{ color: '#166534', fontWeight: 600 }}>
                  Abrir registro
                </Link>
              </span>
            </div>
          )}

          {erroCarga && (
            <div style={{ ...estilos.faixa, background: '#fee2e2', color: '#991b1b', borderColor: '#fecaca' }}>
              <span>{erroCarga}</span>
            </div>
          )}

          {carregando ? (
            <div className="loading" style={{ padding: 30 }}><div className="spinner" />Carregando...</div>
          ) : (
            <>
              <Bloco titulo={`Atividades (${atividades.length})`}>
                <div className="tabela-container">
                  <table className="tabela">
                    <thead>
                      <tr>
                        <th>Atividade</th>
                        <th style={{ textAlign: 'right' }}>Quantidade</th>
                        <th style={{ textAlign: 'right' }}>UPE</th>
                        <th style={{ textAlign: 'right' }}>Preço UPE</th>
                        <th style={{ textAlign: 'right' }}>Valor</th>
                      </tr>
                    </thead>
                    <tbody>
                      {atividades.map(a => {
                        const meta = Object.entries(a.metadata_atividades || {}).filter(([, v]) => textoValor(v) !== null)
                        return (
                          <tr key={a.id}>
                            <td style={{ whiteSpace: 'normal', minWidth: 220 }}>
                              <div>{a._atv ? `${a._atv.codigo_op ? `[${a._atv.codigo_op}] ` : ''}${a._atv.descricao}` : `Atividade #${a.atividade_id}`}</div>
                              {meta.length > 0 && (
                                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 2 }}>
                                  {meta.map(([k, v]) => `${camposLabel[k] || k}: ${textoValor(v)}`).join(' · ')}
                                </div>
                              )}
                            </td>
                            <td style={{ textAlign: 'right' }}>{numero.format(a.quantidade)}{a._atv?.unidade ? ` ${a._atv.unidade}` : ''}</td>
                            <td style={{ textAlign: 'right' }}>{a.upe === null ? '-' : numero.format(a.upe)}</td>
                            <td style={{ textAlign: 'right' }}>{a.preco_upe === null ? '-' : numero.format(a.preco_upe)}</td>
                            <td style={{ textAlign: 'right' }}>
                              {a._valor === null
                                ? <span style={{ color: '#b45309' }} title="Sem preço calculado no celular">sem preço ⚠</span>
                                : reais.format(a._valor)}
                            </td>
                          </tr>
                        )
                      })}
                    </tbody>
                    <tfoot>
                      <tr>
                        <td colSpan={4} style={{ textAlign: 'right', fontWeight: 600 }}>Total estimado</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{reais.format(total)}</td>
                      </tr>
                    </tfoot>
                  </table>
                </div>
                <div style={{ fontSize: 11, color: '#6b7280', marginTop: 6 }}>
                  Valor calculado no celular (UPE × preço do UPE × quantidade). O valor final em Produção é recalculado pelo banco
                  (atividades de disponibilidade, por exemplo, entram com quantidade 1).
                </div>
              </Bloco>

              <Bloco titulo={`Colaboradores presentes (${colaboradores.length})`}>
                {colaboradores.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Nenhum colaborador informado.</div>
                ) : (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                    {colaboradores.map(c => (
                      <span key={c.colaborador_id} style={estilos.chip}>
                        {c._nome}{c._equipe ? <span style={{ color: '#6b7280' }}> · {c._equipe}</span> : null}
                      </span>
                    ))}
                  </div>
                )}
              </Bloco>

              <Bloco titulo={`Fotos (${fotos.length})`}>
                {fotos.length === 0 ? (
                  <div style={{ color: '#6b7280', fontSize: 13 }}>Nenhuma foto enviada.</div>
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
                    {fotos.map((f, i) => (
                      f._url ? (
                        <button key={f.id} type="button" onClick={() => setFotoAberta(i)} title={`Tirada em ${dataHoraBr(f.tirada_em)} — clique para ampliar`}
                          style={{ padding: 0, border: 'none', background: 'none', cursor: 'zoom-in' }}>
                          <img src={f._url} alt="Foto do registro" loading="lazy"
                            style={{ width: '100%', height: 130, objectFit: 'cover', borderRadius: 6, border: '1px solid #e5e7eb', display: 'block' }} />
                        </button>
                      ) : (
                        <div key={f.id} style={{ ...estilos.chip, height: 130, justifyContent: 'center', color: '#6b7280' }}>
                          Foto indisponível
                        </div>
                      )
                    ))}
                  </div>
                )}
              </Bloco>
            </>
          )}
        </div>

        {fotoAberta !== null && fotos[fotoAberta]?._url && (
          <VisualizadorFoto
            fotos={fotos}
            indice={fotoAberta}
            onMudar={setFotoAberta}
            onFechar={() => setFotoAberta(null)}
            nomeBase={`registro-${dataBr(r.data_producao).replaceAll('/', '-')}`}
          />
        )}

        {pendente && (
          <div style={estilos.modalRodape}>
            {modo === 'ver' ? (
              <>
                {erro && <div className="campo-erro-msg" style={{ flex: 1 }}>{erro}</div>}
                <button className="btn btn-perigo" disabled={salvando || carregando} onClick={() => { setModo('rejeitar'); setErro('') }}>
                  Rejeitar
                </button>
                <button className="btn btn-sucesso" disabled={salvando || carregando || atividades.length === 0} onClick={aprovar}>
                  {salvando ? 'Aprovando...' : '✓ Aprovar e lançar em Produção'}
                </button>
              </>
            ) : (
              <div style={{ width: '100%' }}>
                <label className="campo-label">Motivo da rejeição (o encarregado verá no app)</label>
                <textarea
                  className="campo-textarea"
                  rows={3}
                  value={motivo}
                  onChange={e => setMotivo(e.target.value)}
                  placeholder="Ex.: quantidade de poda diferente da medição; refaça o lançamento."
                  autoFocus
                />
                {erro && <div className="campo-erro-msg" style={{ marginTop: 6 }}>{erro}</div>}
                <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 10 }}>
                  <button className="btn btn-secundario" disabled={salvando} onClick={() => { setModo('ver'); setErro('') }}>Voltar</button>
                  <button className="btn btn-perigo" disabled={salvando} onClick={rejeitar}>
                    {salvando ? 'Rejeitando...' : 'Confirmar rejeição'}
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// Foto ampliada dentro do sistema, com navegação (← →, Esc) e download.
function VisualizadorFoto({ fotos, indice, onMudar, onFechar, nomeBase }) {
  const [baixando, setBaixando] = useState(false)
  const foto = fotos[indice]
  const vizinhas = fotos.map((f, i) => (f._url ? i : -1)).filter(i => i >= 0)
  const pos = vizinhas.indexOf(indice)
  const anterior = pos > 0 ? vizinhas[pos - 1] : null
  const proxima = pos >= 0 && pos < vizinhas.length - 1 ? vizinhas[pos + 1] : null

  useEffect(() => {
    function tecla(e) {
      if (e.key === 'Escape') { e.stopPropagation(); onFechar() }
      else if (e.key === 'ArrowLeft' && anterior !== null) onMudar(anterior)
      else if (e.key === 'ArrowRight' && proxima !== null) onMudar(proxima)
    }
    window.addEventListener('keydown', tecla, true)
    return () => window.removeEventListener('keydown', tecla, true)
  }, [anterior, proxima, onMudar, onFechar])

  async function baixar() {
    setBaixando(true)
    try {
      // Baixa como arquivo (o atributo "download" não funciona em link de outro domínio).
      const resp = await fetch(foto._url)
      if (!resp.ok) throw new Error('falha ao baixar')
      const url = URL.createObjectURL(await resp.blob())
      const a = document.createElement('a')
      a.href = url
      a.download = `${nomeBase}-foto-${indice + 1}.jpg`
      document.body.appendChild(a)
      a.click()
      a.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    } catch {
      window.open(foto._url, '_blank', 'noopener') // plano B: abre a imagem em outra aba
    } finally {
      setBaixando(false)
    }
  }

  const botaoSeta = { position: 'absolute', top: '50%', transform: 'translateY(-50%)', background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none', borderRadius: '50%', width: 44, height: 44, fontSize: 24, cursor: 'pointer' }

  return (
    <div style={{ ...estilos.overlay, zIndex: 2100, background: 'rgba(0,0,0,0.85)', flexDirection: 'column' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onFechar() }}>
      <div style={{ position: 'absolute', top: 0, left: 0, right: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 16px', color: 'white' }}>
        <span style={{ fontSize: 14 }}>
          Foto {pos + 1} de {vizinhas.length} · tirada em {dataHoraBr(foto.tirada_em)}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button className="btn btn-primario" onClick={baixar} disabled={baixando}>
            {baixando ? 'Baixando...' : '⬇ Baixar foto'}
          </button>
          <button className="btn btn-secundario" onClick={onFechar}>Fechar</button>
        </div>
      </div>
      {anterior !== null && <button style={{ ...botaoSeta, left: 16 }} onClick={() => onMudar(anterior)} aria-label="Foto anterior">‹</button>}
      <img src={foto._url} alt="Foto do registro" style={{ maxWidth: '92vw', maxHeight: '82vh', objectFit: 'contain', borderRadius: 4 }} />
      {proxima !== null && <button style={{ ...botaoSeta, right: 16 }} onClick={() => onMudar(proxima)} aria-label="Próxima foto">›</button>}
    </div>
  )
}

function Info({ rotulo, valor }) {
  return (
    <div>
      <div style={{ fontSize: 11, color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.04em' }}>{rotulo}</div>
      <div style={{ fontSize: 14, color: '#1e2a3b' }}>{valor === null || valor === undefined || valor === '' ? '-' : valor}</div>
    </div>
  )
}

function Bloco({ titulo, children }) {
  return (
    <div style={{ marginTop: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#1e2a3b', marginBottom: 8, paddingBottom: 6, borderBottom: '1px solid #e5e7eb' }}>
        {titulo}
      </div>
      {children}
    </div>
  )
}

const estilos = {
  faixa: {
    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12,
    border: '1px solid', borderRadius: 8, padding: '10px 14px', marginBottom: 16, fontSize: 14,
  },
  fechar: {
    background: 'none', border: 'none', cursor: 'pointer', fontSize: 22, lineHeight: 1, color: '#6b7280',
  },
  overlay: {
    position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 2000,
    display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16,
  },
  modal: {
    background: 'white', borderRadius: 10, width: '100%', maxWidth: 860, maxHeight: '92vh',
    display: 'flex', flexDirection: 'column', boxShadow: '0 8px 32px rgba(0,0,0,0.25)',
  },
  modalTopo: {
    display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12,
    padding: '16px 20px', borderBottom: '1px solid #e5e7eb',
  },
  modalCorpo: { padding: '16px 20px 20px', overflowY: 'auto', flex: 1 },
  modalRodape: {
    display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 10,
    padding: '14px 20px', borderTop: '1px solid #e5e7eb', background: '#f9fafb',
    borderRadius: '0 0 10px 10px',
  },
  gridInfo: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(190px, 1fr))', gap: 14 },
  chip: {
    display: 'inline-flex', alignItems: 'center', gap: 4, background: '#f3f4f6',
    border: '1px solid #e5e7eb', borderRadius: 14, padding: '4px 10px', fontSize: 13,
  },
}
