import { expect, test } from 'claude-code/testing'

const PAINEL = {
  plugin: 'atividade-sessao',
  component: 'Pane',
  requestId: 'atividade-sessao',
  props: {
    title: 'Arquivos e atividade',
    isFocused: false,
    bodyColumns: 48,
    placement: 'dock',
    scroll: { offset: 0, bodyRows: 40 },
    view: {},
  },
  // Um terminal de 50 linhas: cabem o cartão Sessão e vários arquivos.
  viewport: { columns: 48, rows: 50 },
} as const

const SUPERFICIES = ['terminal', 'desktop'] as const

const AGORA = 1_700_000_000_000
const em = (minutos: number) => new Date(AGORA + minutos * 60_000).toISOString()

const entrada = (
  name: string,
  kind: 'file' | 'dir',
  size = 0,
  mtimeMs = 0,
) => ({
  name,
  kind,
  size,
  mtimeMs,
  isLink: false,
})

type Responder = {
  on: (evento: string, hook: (...args: any[]) => unknown) => unknown
}

// Faz o papel do motor: responde as chamadas que o painel faz em `$`.
function responder(
  on: Responder['on'],
  usoComFalha = false,
  preenchidos: { text: string; mode?: string }[] = [],
  caixaAceita = true,
  // Itens da raiz no lugar da lista padrão: um nome vira arquivo de 10 bytes.
  itensDaRaiz?: (string | ReturnType<typeof entrada>)[],
  avisos: string[] = [],
) {
  on('command.register', () => ({ value: { command: 'atividade' } }))
  on('prompt.fill', (_: unknown, e: { text: string; mode?: string }) => {
    preenchidos.push({ text: e.text, mode: e.mode })
    return { isFilled: caixaAceita }
  })
  on('ui.toast', (_: unknown, e: { text: string }) => {
    avisos.push(e.text)
    return { value: undefined }
  })
  on('ui.open', () => ({ value: { isPlaced: true } }))
  on('session.start', (_: unknown, e: { cwd: string }) => ({ cwd: e.cwd }))
  on('tool.call', () => ({ result: {} }))
  on('session.cwd', () => ({ value: 'C:/proj' }))
  on('session.root', () => ({ value: 'C:/proj' }))
  on('session.model', () => ({ value: 'claude-sonnet-5-5' }))
  on('clock.now', () => ({ value: AGORA }))
  on('session.repo', () => ({
    value: {
      root: 'C:/proj',
      remote: 'https://segredo123@github.com/acme/app.git',
      internal: false,
      name: null,
    },
  }))
  on('session.usage', () => {
    if (usoComFalha) throw new Error('sem leitura')

    return {
      value: {
        startedAt: AGORA,
        context: { window: 200_000, tokens: 66_000, percent: 33 },
        rateLimits: [
          { kind: 'five_hour', percentUsed: 72, resetsAt: em(135) },
          { kind: 'seven_day', percentUsed: 7, resetsAt: em(3 * 1440 + 240) },
        ],
      },
    }
  })
  on('fs.list', (_: unknown, e: { path?: string }) => ({
    // O motor entrega o caminho no formato do sistema: barras invertidas no Windows.
    value: (e.path ?? '').replace(/\\/g, '/').endsWith('/src')
      ? [entrada('app.ts', 'file', 1500), entrada('util.ts', 'file', 300)]
      : itensDaRaiz !== undefined
        ? itensDaRaiz.map(i => (typeof i === 'string' ? entrada(i, 'file', 10) : i))
        : [
            entrada('src', 'dir'),
            entrada('README.md', 'file', 2048),
            entrada('dados.fdb', 'file', 5_000_000),
            entrada('notas.xyz', 'file', 10),
          ],
  }))
}

test('o cartão Sessão mostra projeto, repositório, modelo e uso', async ($, on) => {
  responder(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface })

    expect(await ui.find({ type: 'Text', text: /Sessão/ })).toBeDefined()
    expect((await ui.find({ type: 'Text', text: /^proj$/ }))?.text).toBe('proj')
    expect(await ui.find({ type: 'Text', text: /github\.com\/acme\/app/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /claude-sonnet-5-5/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /33%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /66k \/ 200k/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /5 horas/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /reinicia em 2h15/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /7 dias/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /reinicia em 3d 4h/ })).toBeDefined()
    // O pior uso é 72%: o estado geral é "atenção".
    expect(await ui.find({ type: 'Text', text: /atenção/ })).toBeDefined()
    // A credencial do remote não pode aparecer em nenhum texto.
    expect(await ui.find({ type: 'Text', text: /segredo123/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a lista de arquivos mostra ícones e ordena pastas primeiro', async ($, on) => {
  responder(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  for (const surface of SUPERFICIES) {
    const ui = await $.ui.mount({ ...PAINEL, surface })

    expect(await ui.find({ key: 'dir:src' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /README\.md/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /📝/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /💾/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /📄/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /2\.0 KB/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /4\.8 MB/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /4 itens/ })).toBeDefined()
    expect(await ui.find({ key: 'voltar' })).toBeUndefined()
    await ui.unmount()
  }
})

test('clicar em uma pasta entra nela e voltar sai', async ($, on) => {
  responder(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })

  await ui.press({ key: 'dir:src' })
  expect(await ui.find({ key: 'voltar' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /proj\/src$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /util\.ts/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /README\.md/ })).toBeUndefined()

  await ui.press({ key: 'voltar' })
  expect(await ui.find({ key: 'voltar' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /README\.md/ })).toBeDefined()
  await ui.unmount()
})

test('um arquivo editado entra em Alterados e marca a pasta', async ($, on) => {
  responder(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Nenhum arquivo alterado/ })).toBeDefined()
  await ui.unmount()

  await $.tool.call({
    tool: 'Edit',
    file_path: 'C:\\proj\\src\\app.ts',
    old_string: 'a',
    new_string: 'b',
  })

  const remontado = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect(await remontado.find({ key: 'alt:c:/proj/src/app.ts' })).toBeDefined()
  expect(await remontado.find({ type: 'Text', text: /Alterados na sessão/ })).toBeDefined()
  expect(await remontado.find({ type: 'Text', text: /Nenhum arquivo alterado/ })).toBeUndefined()

  await remontado.unmount()
})

test('clicar em um arquivo insere a menção na caixa de prompt', async ($, on) => {
  const preenchidos: { text: string; mode?: string }[] = []
  responder(on, false, preenchidos)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })

  // Arquivo na raiz.
  await ui.press({ key: 'arq:c:/proj/readme.md' })
  expect(preenchidos).toEqual([{ text: '@README.md ', mode: 'insert' }])

  // Arquivo em uma subpasta: o caminho é relativo à raiz do projeto.
  await ui.press({ key: 'dir:src' })
  await ui.press({ key: 'arq:c:/proj/src/util.ts' })
  expect(preenchidos[1]).toEqual({ text: '@src/util.ts ', mode: 'insert' })

  // Clicar em uma pasta só navega: não menciona nada.
  expect(preenchidos.length).toBe(2)
  await ui.unmount()
})

test('um arquivo alterado também vira menção ao clicar', async ($, on) => {
  const preenchidos: { text: string; mode?: string }[] = []
  responder(on, false, preenchidos)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  await $.tool.call({
    tool: 'Edit',
    file_path: 'C:\\proj\\src\\app.ts',
    old_string: 'a',
    new_string: 'b',
  })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  await ui.press({ key: 'alt:c:/proj/src/app.ts' })
  expect(preenchidos).toEqual([{ text: '@src/app.ts ', mode: 'insert' }])
  await ui.unmount()
})

test('um arquivo alterado fora da raiz vira menção com o caminho completo', async ($, on) => {
  const preenchidos: { text: string; mode?: string }[] = []
  responder(on, false, preenchidos)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  await $.tool.call({
    tool: 'Write',
    file_path: 'C:\\outra pasta\\notas.txt',
    content: 'x',
  })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  await ui.press({ key: 'alt:c:/outra pasta/notas.txt' })
  // Barras normais, e aspas porque o caminho tem espaço.
  expect(preenchidos).toEqual([
    { text: '@"C:/outra pasta/notas.txt" ', mode: 'insert' },
  ])
  await ui.unmount()
})

test('um caminho longo fica em uma linha só, cortado no começo', async ($, on) => {
  responder(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const longo = 'C:\\pasta muito longa\\com muitas subpastas\\e mais uma\\arquivo-com-nome-grande.txt'
  const dentro = 'C:\\proj\\a\\b\\c\\d\\e\\f\\g\\h\\i\\j\\k\\arquivo-com-nome-grande.txt'
  await $.tool.call({ tool: 'Write', file_path: longo, content: 'x' })
  await $.tool.call({ tool: 'Write', file_path: dentro, content: 'x' })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })

  // bodyColumns 48: sobram 40 colunas para o caminho. Nenhum texto passa disso.
  const fora = await ui.find({ type: 'Text', text: /^….*arquivo-com-nome-grande\.txt$/ })
  expect(fora).toBeDefined()
  expect(Array.from(fora?.text ?? '').length).toBeLessThanOrEqual(40)

  // Dentro da raiz: o início é cortado, e o nome do arquivo fica inteiro.
  expect(await ui.find({ type: 'Text', text: /^arquivo-com-nome-grande\.txt$/ })).toBeDefined()
  await ui.unmount()
})

test('caminho com espaço vai entre aspas na menção', async ($, on) => {
  const preenchidos: { text: string; mode?: string }[] = []
  responder(on, false, preenchidos, true, ['meu arquivo.md'])
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  await ui.press({ key: 'arq:c:/proj/meu arquivo.md' })
  expect(preenchidos).toEqual([{ text: '@"meu arquivo.md" ', mode: 'insert' }])
  await ui.unmount()
})

test('se a caixa de prompt recusar, o painel não quebra', async ($, on) => {
  const avisos: string[] = []
  responder(on, false, [], false, undefined, avisos)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  await ui.press({ key: 'arq:c:/proj/readme.md' })
  expect(avisos).toEqual(['A caixa de prompt não aceitou a menção.'])
  expect(await ui.find({ key: 'dir:src' })).toBeDefined()
  await ui.unmount()
})

const BAIXO = {
  ...PAINEL,
  surface: 'desktop',
  // 24 linhas: o cartão Sessão e os outros cartões deixam 3 linhas para a lista.
  viewport: { columns: 48, rows: 24 },
} as const

const muitos = (n: number) =>
  Array.from({ length: n }, (_, i) => `arq${String(i + 1).padStart(2, '0')}.txt`)

// O que a roda do mouse (ou uma tecla) manda para o painel.
const rolar = ($: any, by: number, comPonteiro = true) =>
  $.ui.scroll({
    component: 'Pane',
    requestId: 'atividade-sessao',
    offset: 0,
    by,
    bodyRows: 40,
    contentRows: 60,
    origin: { kind: 'person' },
    ...(comPonteiro ? { pointer: { column: 5, row: 10 } } : {}),
  })

test('em um painel baixo, a lista mostra uma faixa e a barra de rolagem', async ($, on) => {
  responder(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount(BAIXO)

  // Cabem 3 dos 4 itens: o resumo mostra a faixa, e a barra aparece.
  expect(await ui.find({ type: 'Text', text: /1–3 de 4/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /^█$/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /item oculto|itens ocultos/ })).toBeUndefined()
  await ui.unmount()
})

test('a roda do mouse rola a lista de arquivos e a barra acompanha', async ($, on) => {
  responder(on, false, [], true, muitos(40))
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount(BAIXO)
  expect(await ui.find({ type: 'Text', text: /1–3 de 40/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /arq01\.txt/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /arq04\.txt/ })).toBeUndefined()

  // Um tique de roda vale 3 linhas.
  await rolar($, 1)
  expect(await ui.find({ type: 'Text', text: /4–6 de 40/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /arq04\.txt/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /arq01\.txt/ })).toBeUndefined()

  // Passar do fim para no último grupo.
  await rolar($, 500)
  expect(await ui.find({ type: 'Text', text: /38–40 de 40/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /arq40\.txt/ })).toBeDefined()

  // Passar do começo para no primeiro.
  await rolar($, -500)
  expect(await ui.find({ type: 'Text', text: /1–3 de 40/ })).toBeDefined()
  await ui.unmount()
})

test('as teclas rolam pelo valor que o motor manda', async ($, on) => {
  responder(on, false, [], true, muitos(40))
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount(BAIXO)
  // Uma seta vale 1 linha: sem ponteiro, o valor passa como veio.
  await rolar($, 1, false)
  expect(await ui.find({ type: 'Text', text: /2–4 de 40/ })).toBeDefined()
  await ui.unmount()
})

test('a pesquisa filtra os itens da pasta pelo nome', async ($, on) => {
  responder(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect(await ui.find({ key: 'busca' })).toBeDefined()
  expect(await ui.find({ key: 'limpar-busca' })).toBeUndefined()

  // Sem diferenciar maiúsculas de minúsculas.
  await ui.input({ key: 'busca', text: 'READ', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /README\.md/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /dados\.fdb/ })).toBeUndefined()
  expect(await ui.find({ key: 'dir:src' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /1 de 4/ })).toBeDefined()

  // O botão ✕ limpa a pesquisa.
  await ui.press({ key: 'limpar-busca' })
  expect(await ui.find({ type: 'Text', text: /dados\.fdb/ })).toBeDefined()
  expect(await ui.find({ key: 'dir:src' })).toBeDefined()
  expect(await ui.find({ key: 'limpar-busca' })).toBeUndefined()
  await ui.unmount()
})

test('a pesquisa sem resultado avisa, e entrar em uma pasta limpa a pesquisa', async ($, on) => {
  responder(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  await ui.input({ key: 'busca', text: 'zzz', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /Nenhum item com “zzz”/ })).toBeDefined()

  // Com a pesquisa "sr", só a pasta src aparece. Entrar nela limpa o campo.
  await ui.input({ key: 'busca', text: 'sr', kind: 'change' })
  await ui.press({ key: 'dir:src' })
  expect((await ui.find({ key: 'busca' }))?.text ?? '').toBe('')
  expect(await ui.find({ type: 'Text', text: /util\.ts/ })).toBeDefined()
  await ui.unmount()
})

// Nomes dos arquivos .txt da lista, na ordem em que o painel os desenha.
const ordemDosTxt = async (ui: { findAll: (q: object) => Promise<{ text?: string }[]> }) =>
  (await ui.findAll({ type: 'Text', text: /\.txt$/ })).map(x => x.text)

test('o botão de ordem alterna entre nome, tamanho e data', async ($, on) => {
  responder(on, false, [], true, [
    entrada('src', 'dir'),
    entrada('a.txt', 'file', 10, 100),
    entrada('b.txt', 'file', 5000, 50),
    entrada('c.txt', 'file', 300, 900),
  ])
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })

  // Começa por nome.
  expect(await ui.find({ type: 'Text', text: /↕ nome/ })).toBeDefined()
  expect(await ordemDosTxt(ui)).toEqual(['a.txt', 'b.txt', 'c.txt'])

  // Tamanho: o maior primeiro.
  await ui.press({ key: 'ordem' })
  expect(await ui.find({ type: 'Text', text: /↕ tamanho/ })).toBeDefined()
  expect(await ordemDosTxt(ui)).toEqual(['b.txt', 'c.txt', 'a.txt'])

  // Data: o mais novo primeiro.
  await ui.press({ key: 'ordem' })
  expect(await ui.find({ type: 'Text', text: /↕ data/ })).toBeDefined()
  expect(await ordemDosTxt(ui)).toEqual(['c.txt', 'a.txt', 'b.txt'])

  // Volta para nome. A pasta fica sempre acima dos arquivos.
  await ui.press({ key: 'ordem' })
  expect(await ordemDosTxt(ui)).toEqual(['a.txt', 'b.txt', 'c.txt'])
  expect(await ui.find({ key: 'dir:src' })).toBeDefined()
  await ui.unmount()
})

test('o botão de ocultar esconde itens com ponto e pastas de dependências', async ($, on) => {
  responder(on, false, [], true, [
    entrada('.git', 'dir'),
    entrada('node_modules', 'dir'),
    entrada('src', 'dir'),
    entrada('.env', 'file', 10),
    entrada('a.txt', 'file', 10),
  ])
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })

  // Começa escondendo: 3 itens saem da lista e do resumo.
  expect(await ui.find({ type: 'Text', text: /3 ocultos/ })).toBeDefined()
  expect(await ui.find({ key: 'dir:src' })).toBeDefined()
  expect(await ui.find({ key: 'dir:.git' })).toBeUndefined()
  expect(await ui.find({ key: 'dir:node_modules' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /\.env/ })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: /2 itens/ })).toBeDefined()

  // Desligado: tudo aparece.
  await ui.press({ key: 'ocultar' })
  expect(await ui.find({ type: 'Text', text: /tudo à mostra/ })).toBeDefined()
  expect(await ui.find({ key: 'dir:.git' })).toBeDefined()
  expect(await ui.find({ key: 'dir:node_modules' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\.env/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /5 itens/ })).toBeDefined()

  // Ligado de novo, a pesquisa ainda acha o que está escondido.
  await ui.press({ key: 'ocultar' })
  expect(await ui.find({ key: 'dir:.git' })).toBeUndefined()
  await ui.input({ key: 'busca', text: 'git', kind: 'change' })
  expect(await ui.find({ key: 'dir:.git' })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /busca em tudo/ })).toBeDefined()
  await ui.unmount()
})

test('uma pasta só com itens ocultos avisa', async ($, on) => {
  responder(on, false, [], true, [entrada('.env', 'file', 10)])
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })
  expect(await ui.find({ type: 'Text', text: /Só itens ocultos aqui/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Pasta vazia/ })).toBeUndefined()
  await ui.unmount()
})

test('Enter na pesquisa menciona o primeiro resultado', async ($, on) => {
  const preenchidos: { text: string; mode?: string }[] = []
  const avisos: string[] = []
  responder(on, false, preenchidos, true, undefined, avisos)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })

  // Um arquivo.
  await ui.input({ key: 'busca', text: 'read', kind: 'change' })
  expect(await ui.find({ type: 'Text', text: /^1 de \d+$/ })).toBeDefined()
  await ui.input({ key: 'busca', text: 'read', kind: 'submit' })
  expect(preenchidos).toEqual([{ text: '@README.md ', mode: 'insert' }])
  // Depois do Enter a pesquisa se esvazia: a lista volta inteira.
  expect(await ui.find({ type: 'Text', text: /^1 de \d+$/ })).toBeUndefined()

  // Uma pasta leva `/` no fim.
  await ui.input({ key: 'busca', text: 'sr', kind: 'change' })
  await ui.input({ key: 'busca', text: 'sr', kind: 'submit' })
  expect(preenchidos[1]).toEqual({ text: '@src/ ', mode: 'insert' })

  // Sem resultado: avisa e não insere nada.
  await ui.input({ key: 'busca', text: 'zzz', kind: 'change' })
  await ui.input({ key: 'busca', text: 'zzz', kind: 'submit' })
  expect(preenchidos.length).toBe(2)
  expect(avisos).toEqual(['Nada para mencionar.'])
  await ui.unmount()
})

test('a pesquisa volta a rolagem ao começo', async ($, on) => {
  responder(on, false, [], true, muitos(40))
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount(BAIXO)
  // Só `by: 1` com ponteiro vale 3 linhas. Outro valor passa como veio.
  await rolar($, 5)
  expect(await ui.find({ type: 'Text', text: /6–8 de 40/ })).toBeDefined()

  await ui.input({ key: 'busca', text: 'arq2', kind: 'change' })
  // arq20 a arq29: 10 itens, a janela volta ao começo.
  expect(await ui.find({ type: 'Text', text: /1–3 de 10/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /arq20\.txt/ })).toBeDefined()
  await ui.unmount()
})

test('uma leitura de uso que falha não derruba o painel', async ($, on) => {
  responder(on, true)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  const ui = await $.ui.mount({ ...PAINEL, surface: 'desktop' })

  expect(await ui.find({ type: 'Text', text: /sem leitura ainda/ })).toBeDefined()
  // O resto do painel continua desenhado.
  expect(await ui.find({ type: 'Text', text: /Sessão/ })).toBeDefined()
  expect(await ui.find({ key: 'dir:src' })).toBeDefined()
  await ui.unmount()
})
