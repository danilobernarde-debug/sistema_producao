const PAGINAS = [
  { match: p => p === '/', titulo: 'Dashboard' },
  { match: p => p === '/producao', titulo: 'Produção' },
  { match: p => p === '/producao/novo', titulo: 'Novo Registro' },
  { match: p => /^\/producao\/[^/]+\/editar$/.test(p), titulo: 'Editar Registro' },
  { match: p => p === '/relatorios', titulo: 'Relatórios' },
  { match: p => p === '/relatorios/exportacao', titulo: 'Exportação' },
  { match: p => p === '/relatorios/bonificacoes', titulo: 'Bonificações' },
  { match: p => p === '/relatorios/equipes', titulo: 'Relatório de Equipes' },
  { match: p => p === '/relatorios/dashboard', titulo: 'Dashboard (Análise)' },
  { match: p => p === '/relatorios/painel', titulo: 'Painel de Equipes' },
  { match: p => p === '/configuracoes', titulo: 'Configurações' },
  { match: p => p === '/configuracoes/contratos', titulo: 'Contratos' },
  { match: p => p === '/configuracoes/tipos-equipe', titulo: 'Tipos de Equipe' },
  { match: p => p === '/configuracoes/equipes', titulo: 'Equipes' },
  { match: p => p === '/configuracoes/colaboradores', titulo: 'Colaboradores' },
  { match: p => p === '/configuracoes/config-campos', titulo: 'Configuração de Campos' },
  { match: p => p === '/configuracoes/obras', titulo: 'Obras' },
  { match: p => p === '/configuracoes/contratos-preco-upe', titulo: 'Contratos Preço UPE' },
  { match: p => p === '/configuracoes/usuarios', titulo: 'Gerenciar Usuários' },
  { match: p => p === '/configuracoes/logins', titulo: 'Últimos Logins' },
  { match: p => /^\/configuracoes\/logins\/[^/]+$/.test(p), titulo: 'Páginas Acessadas' },
  { match: p => p === '/configuracoes/atividades', titulo: 'Atividades' },
  { match: p => p === '/configuracoes/form-builder', titulo: 'Form Builder' },
  { match: p => p === '/configuracoes/metas', titulo: 'Metas' },
  { match: p => p === '/configuracoes/feriados', titulo: 'Feriados' },
  { match: p => p === '/planejamento', titulo: 'Planejamento' },
  { match: p => p === '/login', titulo: 'Login' },
]

export function tituloPagina(caminho) {
  return PAGINAS.find(p => p.match(caminho))?.titulo || caminho
}
