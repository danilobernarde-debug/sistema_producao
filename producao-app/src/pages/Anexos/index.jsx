import Busca from './Busca'
import { useCadastros } from './comum'

// Anexos dos lançamentos de produção (fotos, PDFs, planilhas) guardados no SharePoint, achados por filtros.
// (A navegação por pastas estilo Explorer foi retirada; está no histórico do git, commit d89d534.)
export default function Anexos() {
  const cad = useCadastros(true)

  return (
    <div className="pagina">
      <div className="pagina-header">
        <h1 className="pagina-titulo">Anexos</h1>
      </div>
      <Busca cad={cad} />
    </div>
  )
}
