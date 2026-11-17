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

const entrada = (name: string, kind: 'file' | 'dir', size = 0) => ({
  name,
  kind,
  size,
  mtimeMs: 0,
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
  nomesDaRaiz?: string[],
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
      : nomesDaRaiz !== undefined
        ? nomesDaRaiz.map(n => entrada(n, 'file', 10))
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

test('em um painel baixo, avisa dos itens que não cabem', async ($, on) => {
  responder(on)
  await $.session.start({ cwd: 'C:/proj', surface: 'desktop', isInteractive: true })

  // 24 linhas: o cartão Sessão e os outros cartões deixam 3 linhas para a lista.
  const ui = await $.ui.mount({
    ...PAINEL,
    surface: 'desktop',
    viewport: { columns: 48, rows: 24 },
  })

  expect(await ui.find({ type: 'Text', text: /4 itens/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /\+ 1 item oculto/ })).toBeDefined()
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
