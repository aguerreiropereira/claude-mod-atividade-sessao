export type Chamada = { id: string; tool: string; isDone: boolean }

declare module 'claude-code' {
  interface PluginState {
    'atividade-sessao': {
      chamadas: Shaped<Chamada[]>
      // Nomes das subpastas abertas, a partir da pasta de trabalho.
      trilha: Shaped<string[]>
      // Caminhos absolutos dos arquivos alterados na sessão, o mais recente primeiro.
      alterados: Shaped<string[]>
      // Texto da pesquisa na lista de arquivos. Vazio mostra todos.
      busca: Shaped<string>
      // Primeira linha da lista de arquivos que a janela mostra, a partir de 0.
      rolagem: Shaped<number>
    }
  }
}
