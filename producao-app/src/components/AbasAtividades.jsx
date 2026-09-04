import { useNavigate, useLocation } from 'react-router-dom'

const ABAS = [
  { caminho: '/configuracoes/atividades',            label: 'Cadastro' },
  { caminho: '/configuracoes/atividades-preco-fixa',  label: 'Preço Fixo' },
  { caminho: '/configuracoes/contratos-preco-upe',    label: 'Preço UPE' },
]

export default function AbasAtividades() {
  const navegar  = useNavigate()
  const location = useLocation()

  return (
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
  )
}
