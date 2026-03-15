import React from 'react'
import ReactDOM from 'react-dom/client'
import { AppRouter } from './app/Router'
import { Providers } from './app/Providers'
import './i18n'
import './styles/reset.css'
import './styles/global.css'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <Providers>
      <AppRouter />
    </Providers>
  </React.StrictMode>
)
