import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App'
import ChatPage from './ChatPage'
import './index.css'

const pathname = window.location.pathname
const RootComponent = pathname.startsWith('/chat') ? ChatPage : App

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <RootComponent />
  </React.StrictMode>,
)
