import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// `base` precisa ser exatamente "/<nome-do-repositorio>/".
// O site é servido em https://<usuario>.github.io/vagasatalhointeligenteparati/,
// então sem isso o HTML pede /assets/... na raiz do domínio, o CSS e o JS
// retornam 404 e a página abre sem estilo nenhum.
export default defineConfig({
  base: '/vagasatalhointeligenteparati/',
  plugins: [react(), tailwindcss()],
})
