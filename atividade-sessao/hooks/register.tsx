import { atom, read, update } from 'claude-code'
import type { FsEntry, Register } from 'claude-code'

import type { Chamada } from '../types'

const PAINEL = 'atividade-sessao'
const TITULO = 'Arquivos e atividade'
const RECENTES = 5
const MAX_ALTERADOS = 5
const GUARDA_ALTERADOS = 100

// Cores de tema: seguem o tema claro ou escuro da pessoa.
const COR_ARQUIVOS = 'claude'
const COR_ALTERADOS = 'warning'
const COR_ATIVIDADE = 'suggestion'
const COR_SESSAO = 'permission'
const COR_BORDA = 'subtle'
const LARGURA_ROTULO = 12
const LARGURA_BARRA = 10
const LARGURA_ICONE = 3

// Ícones: um emoji de um só ponto de código cada, sem seletor de variação.
// Cada emoji ocupa 2 colunas. Se o terminal desenhar algum fora de
// alinhamento, troque o emoji aqui.
const ICONE_PASTA = '📁'
const ICONE_LINK = '🔗'
const ICONE_PADRAO = '📄'
const ICONES: Record<string, string> = {
  md: '📝',
  txt: '📝',
  log: '📝',
  json: '🔧',
  yml: '🔧',
  yaml: '🔧',
  toml: '🔧',
  ini: '🔧',
  xml: '🔧',
  env: '🔧',
  ts: '💻',
  tsx: '💻',
  js: '💻',
  jsx: '💻',
  py: '💻',
  pas: '💻',
  dfm: '💻',
  sql: '💻',
  cs: '💻',
  java: '💻',
  go: '💻',
  rs: '💻',
  sh: '💻',
  ps1: '💻',
  bat: '💻',
  html: '🌐',
  css: '🎨',
  png: '🎨',
  jpg: '🎨',
  jpeg: '🎨',
  gif: '🎨',
  svg: '🎨',
  webp: '🎨',
  ico: '🎨',
  bmp: '🎨',
  pdf: '📕',
  doc: '📘',
  docx: '📘',
  xls: '📊',
  xlsx: '📊',
  csv: '📊',
  zip: '📦',
  rar: '📦',
  '7z': '📦',
  tar: '📦',
  gz: '📦',
  exe: '🧩',
  dll: '🧩',
  fdb: '💾',
  db: '💾',
  sqlite: '💾',
}

function iconeArquivo(nome: string): string {
  const ponto = nome.lastIndexOf('.')
  const extensao = ponto > 0 ? nome.slice(ponto + 1).toLowerCase() : ''

  return ICONES[extensao] ?? ICONE_PADRAO
}

function tamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function barras(caminho: string): string {
  return caminho.replace(/\\/g, '/')
}

// Chave de comparação: o Windows não diferencia maiúsculas de minúsculas.
function chave(caminho: string): string {
  return barras(caminho).toLowerCase()
}

// Devolve o caminho relativo à raiz, ou null quando o arquivo fica fora dela.
function relativo(raiz: string, absoluto: string): string | null {
  const base = barras(raiz).replace(/\/+$/, '')
  const alvo = barras(absoluto)
  return alvo.toLowerCase().startsWith(`${base.toLowerCase()}/`)
    ? alvo.slice(base.length + 1)
    : null
}

// Barra de progresso em texto, em duas partes: a cheia (`████`) e a vazia
// (`░░░░`). Assim cada parte recebe uma cor. Limita o valor entre 0 e 100.
function partesBarra(percentual: number, largura: number): [string, string] {
  const limitado = Math.min(100, Math.max(0, percentual))
  const cheio = Math.round((limitado / 100) * largura)

  return ['█'.repeat(cheio), '░'.repeat(largura - cheio)]
}

function iconeLimite(tipo: string): string {
  if (tipo === 'five_hour') return '⏳'
  if (tipo === 'seven_day') return '📅'
  if (tipo === 'spend_limit') return '💰'

  return '📈'
}

// Verde até 70%, amarelo até 85%, vermelho acima disso.
function corDoUso(percentual: number): string {
  if (percentual >= 85) return 'error'
  if (percentual >= 70) return 'warning'

  return 'success'
}

// 84200 vira `84k`; 1200000 vira `1.2M`.
function abreviar(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`

  return String(n)
}

// Mostra o remote sem esquema nem usuário, para não exibir credencial.
// `https://token@github.com/dono/repo.git` vira `github.com/dono/repo`.
function nomeDoRemote(remote: string): string {
  return remote
    .replace(/^[a-z+]+:\/\//i, '')
    .replace(/^[^@/]*@/, '')
    .replace(/\.git$/, '')
}

function rotuloLimite(tipo: string): string {
  if (tipo === 'five_hour') return '5 horas'
  if (tipo === 'seven_day') return '7 dias'
  if (tipo === 'spend_limit') return 'Gasto'

  return tipo
}

// Tempo até a janela reiniciar: `reinicia em 2h15`, `em 3d 4h`, `em 40 min`.
function reinicio(reinicia: string | undefined, agora: number): string {
  if (reinicia === undefined) return ''
  const alvo = Date.parse(reinicia)
  if (Number.isNaN(alvo)) return ''
  const minutos = Math.ceil((alvo - agora) / 60_000)
  if (minutos <= 0) return 'reiniciando'
  if (minutos >= 1440) {
    return `reinicia em ${Math.floor(minutos / 1440)}d ${Math.floor((minutos % 1440) / 60)}h`
  }
  if (minutos >= 60) {
    return `reinicia em ${Math.floor(minutos / 60)}h${String(minutos % 60).padStart(2, '0')}`
  }

  return `reinicia em ${minutos} min`
}

// Mude a tag quando os campos de uma chamada mudarem.
// O motor recusa o que uma versão anterior guardou.
const chamadas = atom(
  { plugin: 'atividade-sessao', key: 'chamadas' } as const,
  [],
  { shape: 'chamadas-1' },
)

const trilha = atom(
  { plugin: 'atividade-sessao', key: 'trilha' } as const,
  [],
  { shape: 'trilha-1' },
)

const alterados = atom(
  { plugin: 'atividade-sessao', key: 'alterados' } as const,
  [],
  { shape: 'alterados-1' },
)

export const register: Register = on => {
  on('session.start', async ($, e, next) => {
    await $.command.register({
      name: 'atividade',
      description: 'Abre o painel com as chamadas de ferramenta da sessão',
    })
    void $.ui.open({ id: PAINEL, title: TITULO })

    return next(e)
  })

  on('command.run', { command: 'atividade' }, async $ => {
    await $.ui.open({ id: PAINEL, title: TITULO })

    return { text: 'Painel de atividade aberto.' }
  })

  on('tool.call', async ($, e, next) => {
    const chamada: Chamada = {
      id: e.tool_use_id,
      tool: e.tool,
      isDone: false,
    }
    await update($, chamadas, lista => [...lista, chamada].slice(-200))
    const resultado = await next(e)
    await update($, chamadas, lista =>
      lista.map(c => (c.id === chamada.id ? { ...c, isDone: true } : c)),
    )

    // Registra o arquivo só quando a ferramenta de escrita deu certo.
    const deuCerto = resultado.deny === undefined && resultado.isError !== true
    const arquivo =
      e.tool === 'Edit' || e.tool === 'Write'
        ? e.file_path
        : e.tool === 'NotebookEdit'
          ? e.notebook_path
          : undefined
    if (deuCerto && arquivo !== undefined) {
      await update($, alterados, lista =>
        [arquivo, ...lista.filter(a => chave(a) !== chave(arquivo))].slice(
          0,
          GUARDA_ALTERADOS,
        ),
      )
    }

    return resultado
  })

  on('ui.render', { component: 'Pane', requestId: PAINEL }, async ($, e) => {
    const { Box, Button, Text } = $.ui.resolve(e)
    const lista = await read($, chamadas)
    const caminho = await read($, trilha)
    const todosAlterados = await read($, alterados)
    const emExecucao = lista.filter(c => !c.isDone).length
    const recentes = lista.slice(-RECENTES).reverse()

    // Lê a pasta a cada desenho. Cada chamada de ferramenta redesenha o painel.
    const raiz = await $.session.cwd()

    // Dados da sessão. Cada leitura que falha vira um valor vazio e não
    // derruba o painel. Os valores se atualizam quando o painel redesenha.
    const [modelo, raizProjeto, repo, uso, agora] = await Promise.all([
      $.session.model().catch(() => ''),
      $.session.root().catch(() => raiz),
      $.session.repo().catch(() => null),
      $.session.usage().catch(() => null),
      $.clock.now(),
    ])
    const projeto =
      barras(raizProjeto).split('/').filter(Boolean).pop() ?? raizProjeto
    const nomeRepo =
      repo === null
        ? null
        : (repo.name ?? (repo.remote === null ? null : nomeDoRemote(repo.remote)))
    const contexto = uso?.context
    const limites = uso?.rateLimits ?? []

    const pasta =[raiz, ...caminho].join('/')
    let entradas: FsEntry[] = []
    let erro = ''
    try {
      // Lista sempre pelo caminho mostrado no topo, mesmo na raiz. Assim a
      // lista e o caminho concordam, também depois de um `/cd` na sessão.
      entradas = await $.fs.list(pasta)
    } catch (falha) {
      erro = String(falha)
    }
    entradas.sort((a, b) => {
      const pastaA = a.kind === 'dir' ? 0 : 1
      const pastaB = b.kind === 'dir' ? 0 : 1
      return pastaA - pastaB || a.name.localeCompare(b.name)
    })

    // Arquivos alterados: o conjunto marca a lista de arquivos, a fatia vira o cartão.
    const chavesAlteradas = new Set(todosAlterados.map(chave))
    const prefixosAlterados = todosAlterados.map(a => `${chave(a)}/`)
    const alteradosVisiveis = todosAlterados.slice(0, MAX_ALTERADOS)
    const alteradosOcultos = todosAlterados.length - alteradosVisiveis.length

    // Linhas livres para a lista de arquivos. Cada cartão gasta 2 linhas de
    // borda e 1 de título. Os demais itens entram na soma de linhas fixas.
    const fixasArquivos = 3 + 1 + (caminho.length > 0 ? 1 : 0) + 1
    const fixasAlterados =
      3 + Math.max(alteradosVisiveis.length, 1) + (alteradosOcultos > 0 ? 1 : 0)
    const fixasAtividade = 3 + Math.max(recentes.length, 1)
    const fixasSessao =
      3 + 1 + (nomeRepo !== null ? 1 : 0) + 1 + 1 + 1 + Math.max(limites.length, 1)
    const linhas = Math.max(
      3,
      (e.viewport?.rows ?? 24) -
        fixasSessao -
        fixasArquivos -
        fixasAlterados -
        fixasAtividade -
        1,
    )
    const visiveis = entradas.slice(0, linhas)
    const ocultos = entradas.length - visiveis.length

    // Título do cartão: ícone e nome à esquerda, resumo discreto à direita.
    const cabecalho = (
      icone: string,
      cor: string,
      titulo: string,
      resumo: string,
    ) => (
      <Box justifyContent="space-between">
        <Text bold color={cor}>
          {icone} {titulo}
        </Text>
        <Text dimColor>{resumo}</Text>
      </Box>
    )

    // Estado geral do cartão: o pior uso entre o contexto e os limites.
    const leituras = [
      contexto?.percent,
      ...limites.map(l => l.percentUsed),
    ].filter((p): p is number => p !== undefined)
    const pior = leituras.length === 0 ? undefined : Math.max(...leituras)
    const estado =
      pior === undefined
        ? null
        : pior >= 85
          ? { texto: 'crítico', cor: 'error' }
          : pior >= 70
            ? { texto: 'atenção', cor: 'warning' }
            : { texto: 'tudo certo', cor: 'success' }

    // Começo de toda linha do cartão: ícone, rótulo cinza e colunas fixas.
    const rotuloDaLinha = (icone: string, rotulo: string) => (
      <Box flexShrink={0}>
        <Box width={LARGURA_ICONE} flexShrink={0}>
          <Text>{icone}</Text>
        </Box>
        <Box width={LARGURA_ROTULO} flexShrink={0}>
          <Text dimColor>{rotulo}</Text>
        </Box>
      </Box>
    )

    // Linha de texto: o valor pode ter cor e negrito para dar destaque.
    const linhaTexto = (
      icone: string,
      rotulo: string,
      valor: string,
      cor?: string,
      negrito = false,
    ) => (
      <Box>
        {rotuloDaLinha(icone, rotulo)}
        <Box flexShrink={1}>
          <Text color={cor} bold={negrito} wrap="truncate-end">
            {valor}
          </Text>
        </Box>
      </Box>
    )

    // Linha com barra: a parte cheia tem a cor do nível de uso, a vazia fica
    // cinza. A porcentagem tem largura fixa para alinhar as linhas.
    const linhaBarra = (
      icone: string,
      rotulo: string,
      percentual: number | undefined,
      detalhe: string,
    ) => {
      if (percentual === undefined) {
        return (
          <Box>
            {rotuloDaLinha(icone, rotulo)}
            <Text dimColor italic>
              sem leitura ainda
            </Text>
          </Box>
        )
      }
      const cor = corDoUso(percentual)
      const [cheia, vazia] = partesBarra(percentual, LARGURA_BARRA)

      return (
        <Box>
          {rotuloDaLinha(icone, rotulo)}
          <Text color={cor}>{cheia}</Text>
          <Text dimColor>{vazia}</Text>
          <Text bold color={cor}>
            {` ${`${Math.round(percentual)}%`.padStart(4)}`}
          </Text>
          <Box flexShrink={1}>
            <Text dimColor wrap="truncate-end">
              {detalhe === '' ? '' : ` ${detalhe}`}
            </Text>
          </Box>
        </Box>
      )
    }

    return (
      <Box flexDirection="column">
        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={COR_SESSAO}
          borderDimColor
          paddingX={1}
        >
          <Box justifyContent="space-between">
            <Text bold color={COR_SESSAO}>
              ◈ Sessão
            </Text>
            {estado !== null && (
              <Text bold color={estado.cor}>
                ● {estado.texto}
              </Text>
            )}
          </Box>
          {linhaTexto('📂', 'Projeto', projeto, undefined, true)}
          {nomeRepo !== null && linhaTexto('🔀', 'Repositório', nomeRepo)}
          {linhaTexto(
            '🤖',
            'Modelo',
            modelo === '' ? '—' : modelo,
            COR_ARQUIVOS,
            true,
          )}
          <Text> </Text>
          {linhaBarra(
            '🧠',
            'Contexto',
            contexto?.percent,
            contexto?.tokens === undefined
              ? ''
              : `${abreviar(contexto.tokens)} / ${abreviar(contexto.window)}`,
          )}
          {limites.length === 0 && linhaBarra('📈', 'Limites', undefined, '')}
          {limites.map(l =>
            linhaBarra(
              iconeLimite(l.kind),
              rotuloLimite(l.kind),
              l.percentUsed,
              reinicio(l.resetsAt, agora),
            ),
          )}
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={COR_BORDA}
          paddingX={1}
        >
          {cabecalho(
            '■',
            COR_ARQUIVOS,
            'Arquivos',
            `${entradas.length} ${entradas.length === 1 ? 'item' : 'itens'}`,
          )}
          <Text dimColor wrap="truncate-middle">
            {pasta}
          </Text>
          {caminho.length > 0 && (
            <Button
              key="voltar"
              plain
              onPress={() => update($, trilha, t => t.slice(0, -1))}
            >
              <Text color="suggestion">‹ voltar</Text>
            </Button>
          )}
          {erro !== '' && (
            <Text color="error" wrap="truncate-end">
              Erro ao ler a pasta: {erro}
            </Text>
          )}
          {erro === '' && entradas.length === 0 && (
            <Text dimColor italic>
              Pasta vazia.
            </Text>
          )}
          {visiveis.map(f => {
            const dele = chave(`${pasta}/${f.name}`)
            if (f.kind === 'dir') {
              const temAlterado = prefixosAlterados.some(p =>
                p.startsWith(`${dele}/`),
              )

              return (
                <Button
                  key={`dir:${f.name}`}
                  plain
                  onPress={() => update($, trilha, t => [...t, f.name])}
                >
                  <Text>{ICONE_PASTA} </Text>
                  <Text bold color={COR_ARQUIVOS}>
                    {f.name}/
                  </Text>
                  {temAlterado && <Text color={COR_ALTERADOS}> ●</Text>}
                </Button>
              )
            }
            const mudou = chavesAlteradas.has(dele)

            return (
              <Box justifyContent="space-between">
                <Box flexShrink={1}>
                  <Text>
                    {f.kind === 'file' ? iconeArquivo(f.name) : ICONE_LINK}{' '}
                  </Text>
                  <Text
                    color={mudou ? COR_ALTERADOS : undefined}
                    bold={mudou}
                    wrap="truncate-end"
                  >
                    {f.name}
                  </Text>
                  {mudou && <Text color={COR_ALTERADOS}> ●</Text>}
                </Box>
                {f.kind === 'file' && (
                  <Box flexShrink={0} marginLeft={1}>
                    <Text dimColor tabular>
                      {tamanho(f.size)}
                    </Text>
                  </Box>
                )}
              </Box>
            )
          })}
          {ocultos > 0 && (
            <Text dimColor italic>
              + {ocultos} {ocultos === 1 ? 'item oculto' : 'itens ocultos'}
            </Text>
          )}
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={COR_BORDA}
          paddingX={1}
        >
          {cabecalho(
            '●',
            COR_ALTERADOS,
            'Alterados na sessão',
            String(todosAlterados.length),
          )}
          {todosAlterados.length === 0 && (
            <Text dimColor italic>
              Nenhum arquivo alterado ainda.
            </Text>
          )}
          {alteradosVisiveis.map(abs => {
            const rel = relativo(raiz, abs)
            if (rel === null) {
              return (
                <Box>
                  <Text>{iconeArquivo(barras(abs))} </Text>
                  <Box flexShrink={1}>
                    <Text dimColor wrap="truncate-start">
                      {barras(abs)}
                    </Text>
                  </Box>
                </Box>
              )
            }
            const corte = rel.lastIndexOf('/')
            const dir = corte >= 0 ? rel.slice(0, corte + 1) : ''
            const nome = rel.slice(corte + 1)

            return (
              <Button
                key={`alt:${chave(abs)}`}
                plain
                onPress={() =>
                  update($, trilha, () => rel.split('/').slice(0, -1))
                }
              >
                <Text>{iconeArquivo(nome)} </Text>
                <Text dimColor>{dir}</Text>
                <Text bold>{nome}</Text>
              </Button>
            )
          })}
          {alteradosOcultos > 0 && (
            <Text dimColor italic>
              + {alteradosOcultos}{' '}
              {alteradosOcultos === 1 ? 'arquivo' : 'arquivos'}
            </Text>
          )}
        </Box>

        <Box
          flexDirection="column"
          borderStyle="round"
          borderColor={COR_BORDA}
          paddingX={1}
        >
          <Box justifyContent="space-between">
            <Text bold color={COR_ATIVIDADE}>
              ◆ Atividade
            </Text>
            <Box>
              <Text dimColor>
                {lista.length} {lista.length === 1 ? 'chamada' : 'chamadas'}
              </Text>
              {emExecucao > 0 && (
                <Text color="warning" bold>
                  {' '}
                  · {emExecucao} em execução
                </Text>
              )}
            </Box>
          </Box>
          {lista.length === 0 && (
            <Text dimColor italic>
              Nenhuma chamada de ferramenta ainda.
            </Text>
          )}
          {recentes.map(c => (
            <Box>
              <Text color={c.isDone ? 'success' : 'warning'}>
                {c.isDone ? '✓ ' : '◌ '}
              </Text>
              <Text dimColor={c.isDone} bold={!c.isDone}>
                {c.tool}
              </Text>
            </Box>
          ))}
        </Box>
      </Box>
    )
  })
}
