import { useNavigate, useLocation } from 'react-router-dom'

const ABAS = [
  { caminho: '/configuracoes/atividades',            label: 'Cadastro' },
  { caminho: '/configuracoes/atividades-preco-fixa',  label: 'Preço Fixo' },
  { caminho: '/configuracoes/contratos-preco-upe',    label: 'Preço UPE' },
  { caminho: '/configuracoes/atividades-disponibilidade', label: 'Disponibilidade' },
]

// Lembrete para quem reajusta contratos que têm UPE: o reajuste é feito em dois lugares.
export function AvisoReajusteUpe() {
  return (
    <div className="alerta" style={{ background: '#fffbeb', color: '#92400e', border: '1px solid #fde68a' }}>
      <strong>Atenção ao reajustar contratos com UPE:</strong> o reajuste precisa ser feito em <strong>dois lugares</strong> —
      o <strong>valor da UPE</strong> (aba Preço UPE) e as <strong>atividades de preço fixo</strong> do contrato (aba Preço Fixo / Reajuste de Preço Fixo).
      É fácil esquecer a segunda parte: confira as duas.
    </div>
  )
}

export default function AbasAtividades() {
  const navegar  = useNavigate()
  const location = useLocation()

  const mostrarAviso = ['/configuracoes/atividades-preco-fixa', '/configuracoes/contratos-preco-upe'].includes(location.pathname)

  return (
    <>
    <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--cor-borda)', marginBottom: 16 }}>
      {ABAS.map(aba => {
        const ativa = location.pathname === aba.caminho
        return (
          <button
            key={aba.caminho}
            onClick={() => navegar(aba.caminho)}
            style={{
              background: 'none',
              border: 'none',
              borderBottom: ativa ? '2px solid var(--cor-primaria)' : '2px solid transparent',
              padding: '10px 16px',
              marginBottom: -1,
              fontSize: 13,
              fontWeight: 600,
              color: ativa ? 'var(--cor-primaria)' : 'var(--cor-texto-suave)',
              cursor: 'pointer',
            }}
          >
            {aba.label}
          </button>
        )
      })}
    </div>
    {mostrarAviso && <AvisoReajusteUpe />}
    </>
  )
}
