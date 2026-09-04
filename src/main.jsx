import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.jsx'
import { LimiteDeErro } from './LimiteDeErro.jsx'

/**
 * O limite de fora é o último recurso, e não substitui o de dentro.
 *
 * O do `App.jsx` envolve só o conteúdo da aba, e é ele que faz a diferença no
 * dia a dia: o menu lateral sobrevive, e trocar de aba conserta. Este aqui
 * pega o que aquele não alcança — um erro no próprio `App`, no menu ou no
 * cabeçalho —, e nesses casos não há menu para sobrar. Ainda assim é melhor
 * que a página branca: sobra a mensagem, que é o que faltou em 04/09/2026.
 */
createRoot(document.getElementById('root')).render(
  <StrictMode>
    <LimiteDeErro>
      <App />
    </LimiteDeErro>
  </StrictMode>,
)
