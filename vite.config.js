import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Si despliegas en GitHub Pages en https://usuario.github.io/nombre-del-repo/,
  // descomenta la siguiente línea y reemplaza con el nombre real del repo.
  // Para Vercel/Netlify o un dominio propio, deja base: '/' (o quita la línea).
  // base: '/ventana-de-vuelo/',
})
