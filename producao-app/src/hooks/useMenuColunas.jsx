import { useState } from 'react'
import FiltroRapidoColuna from '../components/FiltroRapidoColuna'
import MenuCelula from '../components/MenuCelula'
import { operadoresDoTipo, rotulosDoTipo } from '../utils/filtroColunas'

// Botão direito nas colunas de uma tabela: no título abre "Filtro rápido + ordenação"; na célula, "Filtrar pelo valor".
//
// Uso:
//   const menu = useMenuColunas({
//     nome:  { titulo: 'Nome',  tipo: 'texto' },
//     valor: { titulo: 'Valor', tipo: 'numero' },
//     tipo:  { titulo: 'Tipo',  tipo: 'lista', opcoes: [{ valor: 1, label: 'A' }] },   // 'pesquisavel' = lista com busca
//     // ordenavel: false → só filtra
//   })
//   <th {...menu.thProps('nome')}>Nome{menu.marca('nome')}</th>
//   <td {...menu.tdProps('nome', linha.nome, linha.nome)}>…</td>      // (chave, valor cru, texto exibido)
//   {menu.janelas}                                                   // renderizar uma vez, no fim da tela
//
// Resultado: menu.filtros { chave: { operador, valor } } e menu.ordem { chave, asc } | null.
//   - tabela carregada inteira: filtrarEOrdenar(linhas, menu.filtros, menu.ordem, colunas)  (utils/filtroColunas)
//   - tabela paginada no servidor: aplicarNoQuery(...) e refazer a busca quando menu.versao mudar
export default function useMenuColunas(colunas) {
  const [filtros, setFiltros] = useState({})
  const [ordem, setOrdem] = useState(null)
  const [versao, setVersao] = useState(0) // sobe a cada mudança: gatilho para refazer a busca no servidor
  const [janela, setJanela] = useState(null) // chave da coluna com a janela de filtro/ordem aberta
  const [celula, setCelula] = useState(null) // { x, y, chave, valor, texto }

  function aplicar(chave, operador, valor, dir) {
    setFiltros(prev => {
      const novo = { ...prev }
      if (valor === '' || valor == null) delete novo[chave]; else novo[chave] = { operador, valor: String(valor) }
      return novo
    })
    if (dir === 'asc' || dir === 'desc') setOrdem({ chave, asc: dir === 'asc' })
    else setOrdem(atual => (atual?.chave === chave ? null : atual)) // "manter a ordem atual" só desfaz a ordem desta coluna
    setVersao(v => v + 1)
  }
  function definirOrdem(nova) { setOrdem(nova); setVersao(v => v + 1) }
  function limpar() { setFiltros({}); setOrdem(null); setVersao(v => v + 1) }

  const config = chave => colunas[chave]
  const filtrada = chave => !!filtros[chave]

  const thProps = chave => {
    const c = config(chave)
    if (!c) return {}
    return {
      title: 'Botão direito: filtro rápido e ordenação',
      onContextMenu: e => { e.preventDefault(); setJanela(chave) },
    }
  }
  const tdProps = (chave, valor, texto) => {
    if (!config(chave) || valor == null || valor === '') return {} // célula vazia: sem menu
    return { onContextMenu: e => { e.preventDefault(); setCelula({ x: e.clientX, y: e.clientY, chave, valor: String(valor), texto: texto ?? String(valor) }) } }
  }
  const marca = chave => (
    <>
      {ordem?.chave === chave && <span style={{ color: '#1a56db', marginLeft: 4 }}>{ordem.asc ? '▲' : '▼'}</span>}
      {filtrada(chave) && <span style={{ color: '#1a56db', marginLeft: 4 }} title="Filtro ativo">●</span>}
    </>
  )

  const cj = janela && config(janela)
  const cc = celula && config(celula.chave)
  const janelas = (
    <>
      {cj && (
        <FiltroRapidoColuna
          key={janela} titulo={cj.titulo} tipo={cj.tipo} ops={operadoresDoTipo(cj.tipo)} opcoes={cj.opcoes || []}
          rotulos={cj.ordenavel === false ? null : rotulosDoTipo(cj.tipo)}
          filtroAtual={filtros[janela]}
          ordemAtual={ordem?.chave === janela ? (ordem.asc ? 'asc' : 'desc') : 'atual'}
          onOk={(op, valor, dir) => { const chave = janela; setJanela(null); aplicar(chave, op, valor, dir) }}
          onCancelar={() => setJanela(null)}
        />
      )}
      {cc && (
        <MenuCelula
          x={celula.x} y={celula.y} rotulo={cc.titulo} texto={celula.texto}
          comFiltro={celula.valor != null} ativo={filtrada(celula.chave)}
          onFiltrar={() => { const c = celula; setCelula(null); aplicar(c.chave, 'igual', c.valor, 'atual') }}
          onRemover={() => { const c = celula; setCelula(null); aplicar(c.chave, 'igual', '', 'atual') }}
          onFechar={() => setCelula(null)}
        />
      )}
    </>
  )

  return { filtros, ordem, versao, thProps, tdProps, marca, filtrada, janelas, definirOrdem, limpar }
}
