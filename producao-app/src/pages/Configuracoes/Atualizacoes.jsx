import { useNavigate } from 'react-router-dom'

// Cada entrada é uma versão publicada. Mais recente primeiro.
// Ao fazer uma mudança relevante no sistema, adicionar uma entrada nova aqui.
const VERSOES = [
  {
    versao: 'bff33ad',
    data: '2026-08-28',
    resumo: 'Preço UPE por Contrato também simplificado: só Vigência Início',
    itens: [
      'Mesma lógica do Preço Fixa aplicada ao Preço UPE — sem precisar fechar vigência ao cadastrar um novo preço',
      'Diferente do Preço Fixa, essa resolução acontece no front-end (Novo Registro / Editar Registro), não em trigger do banco — não precisou de SQL manual desta vez',
      'Tela "Preço UPE por Contrato": campo Vigência Fim removido',
    ],
  },
  {
    versao: '7491ff6',
    data: '2026-08-28',
    resumo: 'Preço Fixa simplificado: só Vigência Início, sem Vigência Fim',
    itens: [
      'O preço vigente numa data é sempre o de maior Vigência Início que seja menor ou igual a ela — não precisa mais fechar o preço anterior ao cadastrar um novo',
      'Reajuste de Preço Fixa e Preço Fixa por Vigência: campo Vigência Fim removido da tela',
      'Requer rodar sql_preco_fixa_sem_vigencia_fim.sql no Supabase (atualiza o trigger que resolve o preço no lançamento)',
    ],
  },
  {
    versao: 'c66aeed',
    data: '2026-08-28',
    resumo: 'Reajuste de Preço Fixa por contrato',
    itens: [
      'Nova tela (Atividades → "Reajuste de Preço Fixa"): escolhe o contrato, lista as atividades tipo FIXA com o preço vigente, aplica um percentual geral (recalcula todas de uma vez, ainda editável linha a linha) ou digita o valor manualmente',
      'Ao salvar, encerra o preço atual e cria um novo a partir da data do reajuste — mantém o histórico completo em d_atividades_preco_fixa',
      'Página de Atualizações (esta aqui): histórico de versões publicadas, visível só para danilo@dbmachado.com',
    ],
  },
  {
    versao: '60f2a2b',
    data: '2026-08-28',
    resumo: 'Sincronização com o histórico principal (GitHub) e novo cadastro de Metas',
    itens: [
      'Metas: substitui upload/download de planilha Excel por cadastro direto de meta mensal por tipo de equipe e período',
      'Feriados: nova tela de cadastro de feriados nacionais, usados no cálculo da meta diária (desconta domingos e feriados, sábado conta meio dia)',
      'Limpeza de Subestação: novo módulo — cadastro de subestações, atividade "Em Andamento", preço FIXA por vigência, relatório de exportação próprio',
      'Editor de Formulário: campo Equipe virou configurável (dá pra remover por tipo de equipe) e parou de aparecer/obrigar indevidamente em contratos de presença',
      'Dashboard de Análise: navegação simplificada, um só botão "Voltar" no topo',
      'Planejamento: camada de rodovias e divisas estaduais sobreposta ao mapa de satélite; correções de zoom e camadas do CARTO',
      'Log de acesso migrado de d_login_log para d_pageview_log',
      'Colaboradores: novo filtro por contrato na listagem',
    ],
  },
]

function fmtData(d) {
  if (!d) return '—'
  const [a, m, dia] = d.split('-')
  return `${dia}/${m}/${a}`
}

export default function Atualizacoes() {
  const navegar = useNavigate()

  return (
    <div className="pagina">
      <div className="pagina-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <button className="btn btn-secundario" onClick={() => navegar('/configuracoes')}
            style={{ padding: '6px 12px', fontSize: 13 }}>← Voltar</button>
          <h1 className="pagina-titulo" style={{ margin: 0 }}>Atualizações do Sistema</h1>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {VERSOES.map(v => (
          <div key={v.versao} className="card">
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, flexWrap: 'wrap', marginBottom: 8 }}>
              <span style={{
                fontFamily: 'monospace', fontSize: 12, fontWeight: 700, color: '#1a56db',
                background: '#eff6ff', border: '1px solid #bfdbfe', borderRadius: 6, padding: '2px 8px',
              }}>{v.versao}</span>
              <span style={{ fontSize: 12, color: '#9ca3af' }}>{fmtData(v.data)}</span>
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#1e2a3b', marginBottom: 10 }}>{v.resumo}</div>
            <ul style={{ margin: 0, paddingLeft: 20, display: 'flex', flexDirection: 'column', gap: 5 }}>
              {v.itens.map((item, i) => (
                <li key={i} style={{ fontSize: 13, color: '#374151', lineHeight: 1.5 }}>{item}</li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </div>
  )
}
