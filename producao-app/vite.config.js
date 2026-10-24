import { createRequire } from 'node:module'
import { fileURLToPath } from 'node:url'
import { defineConfig, loadEnv } from 'vite'
import react from '@vitejs/plugin-react'

// Só no `npm run dev`: o Vite não serve a pasta api/ (que na Vercel fica na raiz do repo),
// então monta a função api/frota-veiculos.js aqui. As variáveis FROTA_* vêm do .env local.
function apiFrotaVeiculosDev() {
  return {
    name: 'api-frota-veiculos-dev',
    configureServer(server) {
      server.middlewares.use('/api/frota-veiculos', (req, res) => {
        Object.assign(process.env, loadEnv(server.config.mode, server.config.envDir || process.cwd(), 'FROTA_'))
        // recarrega a função a cada chamada, para refletir edições sem reiniciar o Vite
        const caminho = fileURLToPath(new URL('../api/frota-veiculos.js', import.meta.url))
        const require = createRequire(import.meta.url)
        delete require.cache[caminho]
        const handler = require(caminho)
        const url = new URL(req.url, 'http://localhost')
        const resposta = {
          status(codigo) { res.statusCode = codigo; return this },
          setHeader: (k, v) => res.setHeader(k, v),
          json(corpo) { res.setHeader('Content-Type', 'application/json; charset=utf-8'); res.end(JSON.stringify(corpo)) },
        }
        handler({ method: req.method, headers: req.headers, query: Object.fromEntries(url.searchParams) }, resposta)
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig({
  plugins: [react(), apiFrotaVeiculosDev()],
  optimizeDeps: {
    include: ['xlsx'],
  },
})
