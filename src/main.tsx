import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import './index.css'
import App from './App.tsx'
import { FloatingBoard } from './components/FloatingBoard.tsx'
import { floatingBoardId } from './lib/floating.ts'

// Fenêtre flottante d'un moodboard (?board=…) : seulement le moodboard, sans sauvegarde ni rappels.
const floatingId = floatingBoardId()

createRoot(document.getElementById('root')!).render(
  <StrictMode>{floatingId ? <FloatingBoard id={floatingId} /> : <App />}</StrictMode>,
)
