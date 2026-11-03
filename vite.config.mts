import { cpSync } from 'node:fs'
import { resolve } from 'node:path'
import react, { reactCompilerPreset } from '@vitejs/plugin-react'
import babel from '@rolldown/plugin-babel'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [
    react({}),
    babel({ presets: [reactCompilerPreset()] }),
    {
      name: 'copy-store-images',
      apply: 'build',
      writeBundle({ dir }) {
        if (!dir) throw new Error('O diretório de saída do Vite não foi definido.')
        cpSync(resolve('img'), resolve(dir, 'img'), { recursive: true })
      },
    },
  ],
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
})
