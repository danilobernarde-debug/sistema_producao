import { useState, useEffect } from 'react'
import { supabase } from '../../supabaseClient'
import { tipoAnexo, ehSharePoint } from '../../utils/anexosFotos'

// Colunas de f_prod_arquivos + dados do lançamento (FK registro_id -> f_prod_registro)
export const COLUNAS_ANEXO = 'id, registro_id, name, type, size, url, fullpath, data_cadastro'
export const EMBED_REGISTRO = 'registro:f_prod_registro(data_producao, contrato_id, equipe_id, encarregado_id, obra_id)'
// !inner: só traz anexos cujo lançamento passa nos filtros "registro.*"
export const EMBED_REGISTRO_INNER = 'registro:f_prod_registro!inner(data_producao, contrato_id, equipe_id, encarregado_id, obra_id)'

// Nomes de contratos, equipes e (opcional) encarregados para rótulos e filtros
export function useCadastros(comEncarregados = false) {
  const [contratos, setContratos] = useState([])
  const [equipes, setEquipes] = useState([])
  const [encarregados, setEncarregados] = useState([])

  useEffect(() => {
    supabase.from('d_contratos').select('id, descricao').order('descricao').then(({ data }) => setContratos(data || []))
    supabase.from('d_equipes').select('id, equipe').order('equipe').then(({ data }) => setEquipes(data || []))
    if (comEncarregados) {
      supabase.from('d_colaboradores').select('id, matricula_nome').not('id', 'is', null).order('matricula_nome')
        .then(({ data }) => setEncarregados((data || []).map(e => ({ valor: e.id, label: e.matricula_nome }))))
    }
  }, [comEncarregados])

  return {
    contratos, equipes, encarregados,
    nomeContrato: id => contratos.find(c => c.id === id)?.descricao || (id != null ? `Contrato ${id}` : '—'),
    nomeEquipe: id => (id == null ? null : equipes.find(e => e.id === id)?.equipe || `Equipe ${id}`),
  }
}

export function dataBr(iso) {
  if (!iso) return ''
  const [a, m, d] = String(iso).slice(0, 10).split('-')
  return `${d}/${m}/${a}`
}

// Miniatura de um anexo: foto quando há link; ícone para PDF/outros
export function Miniatura({ anexo, url, tamanho = 48, raio = 4 }) {
  const tipo = tipoAnexo(anexo)
  const caixa = { width: tamanho, height: tamanho, borderRadius: raio, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f3f4f6', border: '1px solid #e5e7eb', overflow: 'hidden' }
  if (tipo === 'imagem' && url) {
    return <img src={url} alt="" loading="lazy" style={{ ...caixa, objectFit: 'cover', display: 'block' }} />
  }
  const icone = tipo === 'pdf' ? '📄' : tipo === 'imagem' ? (ehSharePoint(anexo) && !url ? '⏳' : '🖼️') : '📎'
  return <div style={{ ...caixa, fontSize: tamanho * 0.5 }}>{icone}</div>
}

// Item para o VisualizadorAnexos; só entra quem tem link e é imagem/PDF
export function paraItemVisualizador(anexo, url, subtitulo) {
  return { id: anexo.id, nome: anexo.name, tipo: anexo.type, url, quando: anexo.data_cadastro, subtitulo }
}

export const botaoPaginacao = { padding: '4px 12px' }
