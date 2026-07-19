import { defineConfig } from 'vite'

// 本番（GitHub Pages）だけサブリパス。ローカル開発は http://localhost:5173/
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/MIDIToVmu/' : '/',
}))
