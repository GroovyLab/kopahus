import { createRoot } from 'react-dom/client'
import './styles.css'
import App from './App.tsx'

// Utan StrictMode: MapLibre-kartan skapas en gång och dubbelmontering i utvecklingsläge ger tomma kartor
createRoot(document.getElementById('root')!).render(<App />)
