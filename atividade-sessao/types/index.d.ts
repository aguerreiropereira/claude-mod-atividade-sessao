export type Chamada = { id: string; tool: string; isDone: boolean }

declare module 'claude-code' {
  interface PluginState {
    'atividade-sessao': {
      chamadas: Shaped<Chamada[]>
      // Nomes das subpastas abertas, a partir da pasta de trabalho.
      trilha: Shaped<string[]>
      // Caminhos absolutos dos arquivos alterados na sessão, o mais recente primeiro.
      alterados: Shaped<string[]>
    }
  }
}
