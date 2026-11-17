# Mod atividade-sessao

Painel lateral para o Claude Code. O painel tem quatro cartões:

1. **Sessão**: projeto, repositório, modelo, barra de contexto e limites de uso de 5 horas e 7 dias.
2. **Arquivos**: os arquivos da pasta de trabalho, com ícones. Clique em uma pasta para entrar nela. Clique em um arquivo para inserir `@caminho` na caixa de prompt.
3. **Alterados na sessão**: os arquivos que o Claude editou nesta sessão. Clique em um arquivo para inserir `@caminho` na caixa de prompt.
4. **Atividade**: as chamadas de ferramenta mais recentes.

O mod só lê dados locais. Ele não faz chamadas de rede e não envia dados para fora da máquina.

## Requisitos

- Claude Code instalado, com o comando `claude` disponível no terminal.
- Windows com PowerShell. Em outros sistemas, use a instalação manual.

## Instalar

### Pelo GitHub

Este repositório é privado. Só instala quem você convidou no GitHub e cuja máquina tem uma credencial do GitHub. Se a máquina ainda não tem, rode estes dois comandos uma vez:

```
gh auth login
gh auth setup-git
```

Em uma sessão do Claude Code no terminal, digite:

```
/plugin install atividade-sessao --marketplace aguerreiropereira/claude-mod-atividade-sessao
```

Em um shell, rode:

```
claude plugin install atividade-sessao --marketplace aguerreiropereira/claude-mod-atividade-sessao
```

No aplicativo desktop, o comando `/plugin` não funciona. Clique em **+** ao lado da caixa de texto, depois em **Plugins**, depois em **Add marketplace**. Escreva `aguerreiropereira/claude-mod-atividade-sessao` e clique em **Add plugin**.

O Claude Code faz estas perguntas, nesta ordem:

1. `Add marketplace?`. Responda `y`.
2. O escopo da instalação. Escolha o escopo de usuário e tecle Enter.
3. A mensagem `Installed atividade-sessao. Plugin is now active.` confirma a instalação.

Nesse caso, o Claude Code guarda a própria cópia do mod. Você pode apagar a pasta baixada depois da instalação.

### Windows, pela pasta

1. Copie esta pasta inteira para a máquina nova.
2. Dê um duplo clique em `instalar.cmd`.
3. Abra uma nova sessão do Claude Code.

### Instalação manual

Rode este comando em um terminal. Troque `<pasta>` pelo caminho desta pasta.

```
claude plugin install atividade-sessao --marketplace "<pasta>" --scope user
```

O Claude Code adiciona esta pasta como marketplace local e instala o mod.

## Conferir

1. Rode `claude plugin list`. A lista deve mostrar `atividade-sessao`.
2. Abra uma nova sessão do Claude Code.
3. Se o terminal tem 110 colunas ou mais, o painel abre sozinho.
4. Em terminal mais estreito, digite `/atividade`.

## Atualizar

### Instalou pelo GitHub

1. Rode este comando em um shell:
   ```
   claude plugin update atividade-sessao
   ```
2. A mensagem `updated from 0.1.0 to 0.2.0` confirma a atualização. Os números mudam com a versão.
3. Reinicie o Claude Code. A versão nova só vale em uma sessão nova.

A máquina precisa da credencial do GitHub, como na instalação.

Se o comando diz `already at the latest version`, a máquina já tem a versão mais nova do repositório.

### Instalou pela pasta

1. Troque os arquivos desta pasta pela versão nova. Mantenha a pasta no mesmo lugar.
2. Em uma sessão aberta do Claude Code, digite `/reload-plugins`. Ou abra uma nova sessão.

### Quem mantém o repositório

O Claude Code guarda cada versão do mod em uma pasta própria, com o número de `version` no nome. O teste de atualização usou uma mudança de `version`. Por isso, mude esse número a cada versão nova. Eu não testei o `update` com um commit novo e o mesmo número.

1. Mude o número de `version` em `atividade-sessao/.claude-plugin/plugin.json`.
2. Faça o commit.
3. Rode `git push`.

## Remover

- Windows: rode `instalar.cmd remover`.
- Manual: rode `claude plugin uninstall atividade-sessao`.

## Avisos

- **Não mova nem apague esta pasta depois da instalação.** O Claude Code lê o mod direto dela.
- Os ícones são emojis. Alguns terminais desenham emoji fora de alinhamento. A tabela de ícones fica no começo do arquivo `atividade-sessao/hooks/register.tsx`.
- Os limites de uso só aparecem depois que a API devolve a primeira resposta com essa informação.
- A pasta `atividade-sessao/` guarda o mod. O arquivo `.claude-plugin/marketplace.json` desta pasta lista o mod para o Claude Code.

## Testes

O mod traz testes em `atividade-sessao/hooks/painel.test.ts`. Para rodar:

```
claude plugin test "<pasta>\atividade-sessao"
```
