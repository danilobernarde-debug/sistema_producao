import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import TabelaCRUD from '../../components/TabelaCRUD'
import { Modal } from '../../components/TabelaCRUD'
import { supabase } from '../../supabaseClient'

const COLUNAS = [
  { nome: 'codigo_op',              label: 'Código OP',        tipo: 'texto',
    ajuda: 'Código da ordem de produção (exibido entre colchetes no lançamento)' },
  { nome: 'DESCRICAO_BASICA_SISTEMA', label: 'Descrição',       tipo: 'texto',    obrigatorio: true,
    ajuda: 'Nome da atividade exibido no lançamento de produção' },
  { nome: 'contrato_id',            label: 'Contrato',         tipo: 'select',   obrigatorio: false,
    tabela_ref: 'd_contratos', coluna_valor: 'id', coluna_label: 'descricao', pesquisavel: true,
    ajuda: 'Contrato ao qual a atividade pertence. Deixe vazio para aparecer em todos os contratos.' },
  { nome: 'unidade',                label: 'Unidade',          tipo: 'texto',
    ajuda: 'Unidade de medida da quantidade (ex: m, un, m²)' },
  { nome: 'tipo_upe_fixa',          label: 'Tipo UPE',         tipo: 'select',
    opcoes: [
      { valor: 'UPE',  label: 'UPE — usa preço por contrato/período' },
      { valor: 'FIXA', label: 'FIXA — preço fixo (UPE = 1)' },
    ],
    ajuda: 'UPE: usa tabela de preço do contrato. FIXA: valor fixo unitário.' },
  { nome: 'UPE',                    label: 'Valor UPE',        tipo: 'decimal',  ocultarLista: true,
    ajuda: 'Valor fixo da UPE (usado apenas quando Tipo UPE = FIXA)' },
  { nome: 'tipo_lm_lv',             label: 'LM / LV',          tipo: 'select',   ocultarLista: true,
    opcoes: [
      { valor: 'LM', label: 'LM — Linha de Média tensão' },
      { valor: 'LV', label: 'LV — Linha de Baixa tensão' },
    ],
    ajuda: 'Define qual preço UPE usar (LM ou LV). Relevante quando Tipo UPE = UPE.' },
  { nome: 'comprimento_lagura',     label: 'Usa C × L',        tipo: 'checkbox', ocultarLista: true,
    ajuda: 'Quando marcado, a quantidade é calculada como Comprimento × Largura' },
  { nome: 'tipo_equipe_id',         label: 'Grupo Equipe',     tipo: 'numero',   ocultarLista: true,
    ajuda: 'Código do grupo de equipe. Use 0 ou deixe vazio para aparecer para todos os tipos de equipe.' },
]

// Colunas do modelo Excel na ordem certa
const COLUNAS_MODELO = [
  'codigo_op', 'DESCRICAO_BASICA_SISTEMA', 'contrato_id', 'unidade',
  'tipo_upe_fixa', 'UPE', 'tipo_lm_lv', 'comprimento_lagura', 'tipo_equipe_id',
]

function baixarModelo() {
  const ws = XLSX.utils.aoa_to_sheet([COLUNAS_MODELO])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Atividades')
  XLSX.writeFile(wb, 'modelo_atividades.xlsx')
}

export default function Atividades() {
  const [modalImport, setModalImport] = useState(false)
  const [linhas, setLinhas]           = useState([])
  const [erroImport, setErroImport]   = useState('')
  const [importando, setImportando]   = useState(false)
  const [importOk, setImportOk]       = useState(null) // { inseridos, erros }
  const [contratos, setContratos]     = useState([])
  const [recarregar, setRecarregar]   = useState(0)
  const fileRef = useRef(null)

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao')
      .then(({ data }) => setContratos(data || []))
  }, [])

  function abrirImport() {
    setLinhas([])
    setErroImport('')
    setImportOk(null)
    setModalImport(true)
  }

  function lerArquivo(e) {
    const file = e.target.files[0]
    if (!file) return
    e.target.value = ''
    const reader = new FileReader()
    reader.onload = ev => {
      try {
        const wb  = XLSX.read(ev.target.result, { type: 'array' })
        const ws  = wb.Sheets[wb.SheetNames[0]]
        const raw = XLSX.utils.sheet_to_json(ws, { defval: '' })
        if (raw.length === 0) { setErroImport('Planilha vazia.'); return }
        setLinhas(raw)
        setErroImport('')
      } catch {
        setErroImport('Erro ao ler o arquivo. Certifique-se que é um .xlsx válido.')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  function parseLinha(row) {
    const contratoVal = row['contrato_id']
    let contrato_id = null
    if (contratoVal) {
      const porId   = contratos.find(c => String(c.id) === String(contratoVal))
      const porNome = contratos.find(c => c.descricao?.toLowerCase() === String(contratoVal).toLowerCase())
      contrato_id = porId?.id ?? porNome?.id ?? null
    }

    return {
      codigo_op:              row['codigo_op']              || null,
      DESCRICAO_BASICA_SISTEMA: row['DESCRICAO_BASICA_SISTEMA'] || null,
      contrato_id,
      unidade:                row['unidade']               || null,
      tipo_upe_fixa:          row['tipo_upe_fixa']         || null,
      UPE:                    row['UPE'] !== '' && row['UPE'] != null ? Number(row['UPE']) : null,
      tipo_lm_lv:             row['tipo_lm_lv']            || null,
      comprimento_lagura:     ['true','1','sim','yes'].includes(String(row['comprimento_lagura']).toLowerCase()),
      tipo_equipe_id:         row['tipo_equipe_id'] !== '' && row['tipo_equipe_id'] != null ? Number(row['tipo_equipe_id']) : null,
    }
  }

  async function importar() {
    setImportando(true)
    setErroImport('')
    const registros = linhas.map(parseLinha).filter(r => r.DESCRICAO_BASICA_SISTEMA)
    if (registros.length === 0) {
      setErroImport('Nenhuma linha com Descrição preenchida encontrada.')
      setImportando(false)
      return
    }

    const { error } = await supabase.from('d_atividades').insert(registros)
    setImportando(false)

    if (error) { setErroImport(`Erro: ${error.message}`); return }

    setImportOk({ inseridos: registros.length })
    setLinhas([])
    setRecarregar(r => r + 1)
  }

  const botoesExtra = (
    <button className="btn btn-secundario" onClick={abrirImport}>
      ⬆ Importar XLSX
    </button>
  )

  return (
    <>
      <TabelaCRUD
        titulo="Atividades"
        tabela="d_atividades"
        colunas={COLUNAS}
        ordenarPor="DESCRICAO_BASICA_SISTEMA"
        buscaPor="DESCRICAO_BASICA_SISTEMA"
        voltarPara="/configuracoes"
        filtros={['contrato_id', 'tipo_upe_fixa', 'tipo_lm_lv']}
        botoesExtra={botoesExtra}
        key={recarregar}
      />

      {modalImport && (
        <Modal titulo="Importar Atividades — XLSX" onFechar={() => setModalImport(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            {/* Instruções + modelo */}
            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#1e2a3b' }}>Como usar</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: '#374151', lineHeight: 1.7 }}>
                <li>Baixe o modelo com os cabeçalhos corretos</li>
                <li>Preencha as linhas na planilha</li>
                <li>Selecione o arquivo aqui para importar</li>
              </ol>
              <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                <strong>contrato_id:</strong> ID numérico ou nome do contrato &nbsp;|&nbsp;
                <strong>tipo_upe_fixa:</strong> UPE ou FIXA &nbsp;|&nbsp;
                <strong>tipo_lm_lv:</strong> LM ou LV &nbsp;|&nbsp;
                <strong>comprimento_lagura:</strong> true ou false
              </div>
              <button className="btn btn-secundario" style={{ marginTop: 10, fontSize: 12 }} onClick={baixarModelo}>
                ⬇ Baixar modelo .xlsx
              </button>
            </div>

            {/* Seleção de arquivo */}
            {!importOk && (
              <div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={lerArquivo} />
                <button className="btn btn-secundario" onClick={() => fileRef.current.click()}>
                  📂 Selecionar arquivo
                </button>
              </div>
            )}

            {/* Preview */}
            {linhas.length > 0 && !importOk && (
              <div>
                <div style={{ fontSize: 13, color: '#6b7280', marginBottom: 6 }}>
                  {linhas.length} linha{linhas.length !== 1 ? 's' : ''} encontrada{linhas.length !== 1 ? 's' : ''} — prévia:
                </div>
                <div style={{ overflowX: 'auto', maxHeight: 200, border: '1px solid #e5e7eb', borderRadius: 6 }}>
                  <table style={{ fontSize: 12, borderCollapse: 'collapse', width: '100%' }}>
                    <thead>
                      <tr>{COLUNAS_MODELO.map(c => (
                        <th key={c} style={{ padding: '6px 10px', background: '#f9fafb', borderBottom: '1px solid #e5e7eb', whiteSpace: 'nowrap', textAlign: 'left' }}>{c}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {linhas.slice(0, 10).map((row, i) => (
                        <tr key={i}>
                          {COLUNAS_MODELO.map(c => (
                            <td key={c} style={{ padding: '5px 10px', borderBottom: '1px solid #f3f4f6', whiteSpace: 'nowrap', maxWidth: 150, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                              {String(row[c] ?? '')}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                {linhas.length > 10 && (
                  <div style={{ fontSize: 12, color: '#9ca3af', marginTop: 4 }}>Mostrando 10 de {linhas.length} linhas.</div>
                )}
              </div>
            )}

            {/* Sucesso */}
            {importOk && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', color: '#16a34a', fontSize: 14 }}>
                ✓ {importOk.inseridos} atividade{importOk.inseridos !== 1 ? 's' : ''} importada{importOk.inseridos !== 1 ? 's' : ''} com sucesso!
              </div>
            )}

            {erroImport && <div className="erro-mensagem">{erroImport}</div>}

            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button className="btn btn-secundario" onClick={() => setModalImport(false)}>
                {importOk ? 'Fechar' : 'Cancelar'}
              </button>
              {linhas.length > 0 && !importOk && (
                <button className="btn btn-primario" onClick={importar} disabled={importando}>
                  {importando ? 'Importando...' : `Importar ${linhas.length} linha${linhas.length !== 1 ? 's' : ''}`}
                </button>
              )}
            </div>
          </div>
        </Modal>
      )}
    </>
  )
}
