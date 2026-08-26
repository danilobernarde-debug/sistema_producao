import { useState, useEffect, useRef } from 'react'
import * as XLSX from 'xlsx'
import TabelaCRUD from '../../components/TabelaCRUD'
import { Modal } from '../../components/TabelaCRUD'
import { supabase } from '../../supabaseClient'

const COLUNAS = [
  { nome: 'nome',              label: 'Nome',              tipo: 'texto',    obrigatorio: true,
    ajuda: 'Nome/identificação da subestação (ex: SE PIRANHAS)' },
  { nome: 'municipio',         label: 'Município',         tipo: 'texto',
    ajuda: 'Município onde a subestação está localizada' },
  { nome: 'contrato_id',       label: 'Contrato',          tipo: 'select',   obrigatorio: true,
    tabela_ref: 'd_contratos', coluna_valor: 'id', coluna_label: 'descricao', pesquisavel: true,
    ajuda: 'Contrato ao qual esta subestação pertence' },
  { nome: 'regional_id',       label: 'Regional',          tipo: 'select',
    tabela_ref: 'd_regional', coluna_valor: 'id', coluna_label: 'regional', pesquisavel: true,
    ajuda: 'Regional/superintendência responsável' },
  { nome: 'porte',             label: 'Porte',             tipo: 'select',   obrigatorio: true,
    opcoes: [
      { valor: 'P',  label: 'P — até 5.000 m²' },
      { valor: 'M',  label: 'M — 5.001 a 15.000 m²' },
      { valor: 'G',  label: 'G — 15.001 a 25.000 m²' },
      { valor: 'GG', label: 'GG — 25.001 a 50.001 m²' },
      { valor: 'XG', label: 'XG — acima de 50.001 m²' },
    ],
    ajuda: 'Categoria de tamanho — define o preço de Roçagem/Limpeza' },
  { nome: 'tipo',               label: 'Tipo',              tipo: 'select',   obrigatorio: true,
    opcoes: [
      { valor: 'MT',          label: 'MT — Média Tensão' },
      { valor: 'AT',          label: 'AT — Alta Tensão' },
      { valor: 'CHAVEAMENTO', label: 'Chaveamento' },
    ],
    ajuda: 'Classe da subestação — define o preço de Capina Química' },
  { nome: 'equipe_interna_id', label: 'Equipe Interna',    tipo: 'select',   ocultarLista: true,
    tabela_ref: 'd_equipes', coluna_valor: 'id', coluna_label: 'equipe', pesquisavel: true,
    ajuda: 'Equipe interna responsável por esta subestação' },
  { nome: 'is_ativo',          label: 'Ativa',              tipo: 'checkbox', padrao: true,
    ajuda: 'Desmarque para subestações desativadas (não aparecem mais no lançamento)' },
]

const COLUNAS_MODELO = ['nome', 'municipio', 'contrato_id', 'regional', 'porte', 'tipo', 'equipe_interna', 'is_ativo']

function baixarModelo() {
  const ws = XLSX.utils.aoa_to_sheet([COLUNAS_MODELO])
  const wb = XLSX.utils.book_new()
  XLSX.utils.book_append_sheet(wb, ws, 'Subestacoes')
  XLSX.writeFile(wb, 'modelo_subestacoes.xlsx')
}

export default function Subestacoes() {
  const [modalImport, setModalImport] = useState(false)
  const [linhas, setLinhas]           = useState([])
  const [erroImport, setErroImport]   = useState('')
  const [importando, setImportando]   = useState(false)
  const [importOk, setImportOk]       = useState(null) // { inseridos }
  const [contratos, setContratos]     = useState([])
  const [regionais, setRegionais]     = useState([])
  const [equipes, setEquipes]         = useState([])
  const [recarregar, setRecarregar]   = useState(0)
  const fileRef = useRef(null)

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao')
      .then(({ data }) => setContratos(data || []))
    supabase.from('d_regional').select('id, regional').order('regional')
      .then(({ data }) => setRegionais(data || []))
    supabase.from('d_equipes').select('id, equipe, contrato_id').order('equipe')
      .then(({ data }) => setEquipes(data || []))
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

    const regionalVal = row['regional']
    let regional_id = null
    if (regionalVal) {
      const porId   = regionais.find(r => String(r.id) === String(regionalVal))
      const porNome = regionais.find(r => r.regional?.trim().toLowerCase() === String(regionalVal).trim().toLowerCase())
      regional_id = porId?.id ?? porNome?.id ?? null
    }

    const equipeVal = row['equipe_interna']
    let equipe_interna_id = null
    if (equipeVal) {
      const candidatas = equipes.filter(e => e.equipe?.trim().toLowerCase() === String(equipeVal).trim().toLowerCase())
      const naDoContrato = candidatas.find(e => String(e.contrato_id) === String(contrato_id))
      equipe_interna_id = naDoContrato?.id ?? candidatas[0]?.id ?? null
    }

    const ativoStr = String(row['is_ativo'] ?? '').trim().toLowerCase()
    const is_ativo = !['false', '0', 'não', 'nao', 'no'].includes(ativoStr)

    return {
      nome:              String(row['nome'] || '').trim() || null,
      municipio:         row['municipio'] || null,
      contrato_id,
      regional_id,
      porte:             String(row['porte'] || '').trim().toUpperCase() || null,
      tipo:              String(row['tipo'] || '').trim().toUpperCase() || null,
      equipe_interna_id,
      is_ativo,
    }
  }

  async function importar() {
    setImportando(true)
    setErroImport('')
    const registros = linhas.map(parseLinha).filter(r => r.nome && r.contrato_id && r.porte && r.tipo)
    if (registros.length === 0) {
      setErroImport('Nenhuma linha válida encontrada. Confira se Nome, Contrato, Porte e Tipo estão preenchidos e se o contrato existe.')
      setImportando(false)
      return
    }

    const { error } = await supabase.from('d_subestacoes').insert(registros)
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
        titulo="Subestações"
        tabela="d_subestacoes"
        colunas={COLUNAS}
        ordenarPor="nome"
        buscaPor="nome"
        voltarPara="/configuracoes"
        filtros={['contrato_id', 'porte', 'tipo', 'is_ativo']}
        botoesExtra={botoesExtra}
        key={recarregar}
      />

      {modalImport && (
        <Modal titulo="Importar Subestações — XLSX" onFechar={() => setModalImport(false)}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

            <div style={{ background: '#f8fafc', border: '1px solid #e2e8f0', borderRadius: 8, padding: '12px 14px', fontSize: 13 }}>
              <div style={{ fontWeight: 600, marginBottom: 6, color: '#1e2a3b' }}>Como usar</div>
              <ol style={{ margin: 0, paddingLeft: 18, color: '#374151', lineHeight: 1.7 }}>
                <li>Baixe o modelo com os cabeçalhos corretos</li>
                <li>Preencha as linhas na planilha</li>
                <li>Selecione o arquivo aqui para importar</li>
              </ol>
              <div style={{ marginTop: 4, fontSize: 12, color: '#6b7280' }}>
                <strong>contrato_id:</strong> ID numérico ou nome do contrato &nbsp;|&nbsp;
                <strong>regional:</strong> nome da regional (opcional) &nbsp;|&nbsp;
                <strong>porte:</strong> P, M, G, GG ou XG &nbsp;|&nbsp;
                <strong>tipo:</strong> MT, AT ou CHAVEAMENTO &nbsp;|&nbsp;
                <strong>equipe_interna:</strong> nome da equipe (opcional) &nbsp;|&nbsp;
                <strong>is_ativo:</strong> deixe vazio ou "sim" (ativa) / "não" (inativa)
              </div>
              <button className="btn btn-secundario" style={{ marginTop: 10, fontSize: 12 }} onClick={baixarModelo}>
                ⬇ Baixar modelo .xlsx
              </button>
            </div>

            {!importOk && (
              <div>
                <input ref={fileRef} type="file" accept=".xlsx,.xls" style={{ display: 'none' }} onChange={lerArquivo} />
                <button className="btn btn-secundario" onClick={() => fileRef.current.click()}>
                  📂 Selecionar arquivo
                </button>
              </div>
            )}

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

            {importOk && (
              <div style={{ background: '#f0fdf4', border: '1px solid #bbf7d0', borderRadius: 8, padding: '12px 14px', color: '#16a34a', fontSize: 14 }}>
                ✓ {importOk.inseridos} subestaç{importOk.inseridos !== 1 ? 'ões' : 'ão'} importada{importOk.inseridos !== 1 ? 's' : ''} com sucesso!
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
