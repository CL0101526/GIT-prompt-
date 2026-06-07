#!/usr/bin/env node

const fs        = require('fs')
const path      = require('path')
const os        = require('os')
const readline  = require('readline')
const { spawn } = require('child_process')
const simpleGit = require('simple-git')
const boxen     = require('boxen')

// ── colors ────────────────────────────────────────────────────
const c = {
  primary:  s => `\x1b[38;2;125;211;252m${s}\x1b[0m`,
  accent:   s => `\x1b[38;2;191;219;254m${s}\x1b[0m`,
  white:    s => `\x1b[38;2;249;250;251m${s}\x1b[0m`,
  gray:     s => `\x1b[38;2;229;231;235m${s}\x1b[0m`,
  muted:    s => `\x1b[38;2;75;85;99m${s}\x1b[0m`,
  green:    s => `\x1b[38;2;80;255;140m${s}\x1b[0m`,
  red:      s => `\x1b[38;2;255;80;80m${s}\x1b[0m`,
  amber:    s => `\x1b[38;2;255;190;60m${s}\x1b[0m`,
  bold:     s => `\x1b[1m${s}\x1b[0m`,
}

// ── utils ─────────────────────────────────────────────────────
const out   = s  => process.stdout.write(s)
const clr   = () => out('\x1b[2K\r')
const hide  = () => out('\x1b[?25l')
const show  = () => out('\x1b[?25h')
const sleep = ms => new Promise(r => setTimeout(r, ms))
const div   = (n = 46) => console.log(c.muted('  ' + '─'.repeat(n)))

// ── spinner ───────────────────────────────────────────────────
const FRAMES = ['⠋','⠙','⠹','⠸','⠼','⠴','⠦','⠧','⠇','⠏']
function spin(text) {
  let i = 0; hide()
  const id = setInterval(() => { clr(); out(`  ${c.primary(FRAMES[i++ % FRAMES.length])}  ${c.gray(text)}`) }, 80)
  return {
    ok:   msg => { clearInterval(id); clr(); console.log(`  ${c.green('+')}  ${c.white(msg)}`); show() },
    fail: msg => { clearInterval(id); clr(); console.log(`  ${c.red('x')}  ${c.white(msg)}`);   show() },
    stop: ()  => { clearInterval(id); clr(); show() },
  }
}

// ── progress bar ──────────────────────────────────────────────
async function bar(label, ms = 700) {
  const W = 22; hide()
  for (let i = 0; i <= W; i++) {
    clr()
    out(`  ${c.gray(label)}  ${c.accent('█'.repeat(i))}${c.muted('░'.repeat(W - i))}  ${c.gray(Math.round((i/W)*100) + '%')}`)
    await sleep(ms / W)
  }
  clr(); show()
}

// ── header ────────────────────────────────────────────────────
function header(subtitle) {
  console.log()
  console.log(c.primary('  ██████╗ ██╗████████╗') + '  ' + c.muted('<') + c.accent('prompt') + c.muted('>'))
  console.log(c.primary(' ██╔════╝ ██║╚══██╔══╝') + '  ' + c.gray('git-powered prompt vault'))
  console.log(c.primary(' ██║  ███╗██║   ██║   ') + '  ' + c.muted('v1.0'))
  console.log(c.primary(' ╚██████╔╝██║   ██║   '))
  console.log(c.primary('  ╚═════╝ ╚═╝   ╚═╝   '))
  console.log()
  console.log(`  ${c.muted('─')}  ${c.gray(subtitle)}`)
  div()
}

// ── vault ─────────────────────────────────────────────────────
const VAULT        = path.join(os.homedir(), '.promptvault')
const PROJECTS_DIR = path.join(VAULT, 'projects')
if (!fs.existsSync(VAULT))        fs.mkdirSync(VAULT,        { recursive: true })
if (!fs.existsSync(PROJECTS_DIR)) fs.mkdirSync(PROJECTS_DIR, { recursive: true })
const git = simpleGit(VAULT)

// ── readline ──────────────────────────────────────────────────
const rl    = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask   = q  => new Promise(res => rl.question(q, res))
const field = async label => {
  await sleep(80)
  return new Promise(res => rl.question(`  ${c.gray(label.padEnd(10))}${c.primary('›')} `, res))
}

// ── clipboard ─────────────────────────────────────────────────
function copyToClipboard(text) {
  const proc = spawn('pbcopy')
  proc.stdin.write(text)
  proc.stdin.end()
}

// ── likes ─────────────────────────────────────────────────────
function getLikes(filename, dir = VAULT) {
  const raw = fs.readFileSync(path.join(dir, filename), 'utf8')
  return parseInt((raw.match(/^likes: (\d+)$/m) || [])[1] || '0')
}
function setLikes(filename, likes, dir = VAULT) {
  const file = path.join(dir, filename)
  let raw = fs.readFileSync(file, 'utf8')
  raw = /^likes: \d+$/m.test(raw)
    ? raw.replace(/^likes: \d+$/m, `likes: ${likes}`)
    : raw.replace(/^---$/m, `---\nlikes: ${likes}`)
  fs.writeFileSync(file, raw)
}

// ── models ────────────────────────────────────────────────────
const MODELS = [
  { name: 'claude-opus-4-8',     vendor: 'Anthropic' },
  { name: 'claude-sonnet-4-6',   vendor: 'Anthropic' },
  { name: 'claude-haiku-4-5',    vendor: 'Anthropic' },
  { name: 'gpt-5-5-instant',     vendor: 'OpenAI' },
  { name: 'gpt-5-5-thinking',    vendor: 'OpenAI' },
  { name: 'gpt-5-4-pro',         vendor: 'OpenAI' },
  { name: 'gpt-5-3-codex',       vendor: 'OpenAI' },
  { name: 'gemini-3-1-pro',      vendor: 'Google' },
  { name: 'gemini-3-1-flash',    vendor: 'Google' },
  { name: 'gemini-3-1-flash-lite', vendor: 'Google' },
  { name: 'llama-4-maverick',    vendor: 'Meta' },
  { name: 'llama-4-scout',       vendor: 'Meta' },
  { name: 'deepseek-v4-pro',     vendor: 'DeepSeek' },
  { name: 'deepseek-v4-flash',   vendor: 'DeepSeek' },
  { name: 'mistral-large-3',     vendor: 'Mistral' },
  { name: 'grok-4',              vendor: 'xAI' },
];
async function pickModel() {
  console.log()
  console.log(`  ${c.muted('    model' + ' '.repeat(24) + 'vendor')}`)
  div()
  MODELS.forEach((m, i) =>
    console.log(`  ${c.muted(String(i+1).padStart(2,'0'))}  ${c.white(m.name.padEnd(30))}${c.gray(m.vendor)}`)
  )
  div()
  while (true) {
    await sleep(80)
    const pick = await ask(`  ${c.primary('pick a number ›')} `)
    const idx  = parseInt(pick.trim()) - 1
    if (idx >= 0 && idx < MODELS.length) {
      console.log(`  ${c.green('+')}  ${c.white(MODELS[idx].name)}\n`)
      return MODELS[idx].name
    }
    console.log(`  ${c.red('x')}  ${c.gray('Invalid — try again')}`)
  }
}

// ── keywords ──────────────────────────────────────────────────
const KEYWORDS = [
  'coding',        'debugging',       'writing',        'creative',
  'analysis',      'summarization',   'research',       'translation',
  'productivity',  'system-prompt',   'few-shot',       'chain-of-thought',
  'roleplay',      'data-extraction', 'brainstorming',  'refactoring',
  'explanation',   'planning',        'review',         'other ✎',
]

async function pickKeywords() {
  const selected = []
  console.log()
  console.log(`  ${c.muted('    keyword' + ' '.repeat(18) + 'selected')}`)
  div()
  KEYWORDS.forEach((k, i) =>
    console.log(`  ${c.muted(String(i+1).padStart(2,'0'))}  ${c.white(k.padEnd(26))}${c.muted('○')}`)
  )
  div()
  console.log(`  ${c.gray('Toggle by number.')} ${c.gray('press enter when finished.')}`)
  console.log()

  while (true) {
    await sleep(80)
    const input = await ask(`  ${c.primary('›')} `)
    const trimmed = input.trim()
    if (trimmed === '') break
    const idx = parseInt(trimmed) - 1
    if (idx < 0 || idx >= KEYWORDS.length) { console.log(`  ${c.red('x')}  ${c.gray('Invalid')}`); continue }
    const kw = KEYWORDS[idx]
    if (kw === 'other ✎') {
      await sleep(80)
      const custom = await ask(`  ${c.gray('custom keyword')} ${c.primary('›')} `)
      if (custom.trim()) { selected.push(custom.trim()); console.log(`  ${c.green('+')}  ${c.white(custom.trim())}`) }
      continue
    }
    if (selected.includes(kw)) {
      selected.splice(selected.indexOf(kw), 1)
      console.log(`  ${c.red('−')}  ${c.gray('removed: ' + kw)}`)
    } else {
      selected.push(kw)
      console.log(`  ${c.green('+')}  ${c.white(kw)}`)
    }
  }
  return selected
}

// ── open prompt ───────────────────────────────────────────────
async function openPrompt(filename, dir = VAULT) {
  const file     = path.join(dir, filename)
  const raw      = fs.readFileSync(file, 'utf8')
  const name     = filename.replace('.md', '')
  const body     = raw.replace(/^---[\s\S]*?---\n\n?/, '').trim()
  const model    = (raw.match(/^model: (.+)$/m)    || [])[1] || ''
  const date     = (raw.match(/^date: (.+)$/m)     || [])[1] || ''
  const keywords = (raw.match(/^keywords: (.+)$/m) || [])[1] || ''
  const notes    = (raw.match(/^notes: (.+)$/m)    || [])[1] || ''
  let   likes    = getLikes(filename, dir)

  console.log()
  console.log(boxen(c.white(body), {
    title: c.accent(name) + (model ? c.muted('  ' + model) : ''),
    titleAlignment: 'left',
    padding: 1,
    margin: { left: 2, right: 2, top: 0, bottom: 0 },
    borderStyle: 'round',
    borderColor: 'cyan',
  }))
  console.log(`  ${c.muted('likes')}  ${c.white(String(likes))}`)
  if (keywords && keywords.trim()) console.log(`  ${c.muted('keywords: ')}${c.accent(keywords)}`)
  if (notes    && notes.trim())    console.log(`  ${c.muted('notes:    ')}${c.gray(notes)}`)
  if (date)                        console.log(`  ${c.muted('saved:    ')}${c.gray(date)}`)
  console.log()
  div()
  console.log(`  ${c.primary('like')}  ${c.muted('·')}  ${c.primary('copy')}  ${c.muted('·')}  ${c.primary('edit')}  ${c.muted('·')}  ${c.primary('delete')}  ${c.muted('·')}  ${c.gray('b to go back')}`)
  div()

  while (true) {
    await sleep(80)
    const input = await ask(`  ${c.primary('›')} `)
    const cmd   = input.trim().toLowerCase()

    if (cmd === 'like') {
      likes++
      setLikes(filename, likes, dir)
      try { await git.add('.'); await git.commit(`like: ${name} (${likes})`) } catch {}
      console.log(`  ${c.muted('likes')}  ${c.white(String(likes))}`)

    } else if (cmd === 'copy') {
      copyToClipboard(body)
      console.log(`  ${c.green('+')}  ${c.white('Copied to clipboard')}`)

    } else if (cmd === 'edit') {
      console.log()
      console.log(`  ${c.gray('Leave blank to keep current value.')}`)
      console.log()
      await sleep(80)
      const newPrompt = await ask(`  ${c.gray('Prompt'.padEnd(10))}${c.primary('›')} `)
      await sleep(80)
      const newNotes  = await ask(`  ${c.gray('Notes'.padEnd(10))}${c.primary('›')} `)

      let updated = fs.readFileSync(file, 'utf8')
      if (newPrompt.trim()) {
        updated = updated.replace(/^---[\s\S]*?---\n\n?[\s\S]*$/, m => {
          const front = m.match(/^(---[\s\S]*?---\n\n?)/)[1]
          return front + newPrompt.trim()
        })
      }
      if (newNotes.trim()) {
        updated = updated.replace(/^notes: .+$/m, `notes: ${newNotes.trim()}`)
      }
      fs.writeFileSync(file, updated)
      try { await git.add('.'); await git.commit(`edit: ${name}`) } catch {}
      console.log(`  ${c.green('+')}  ${c.white('Saved')}`)
      break

    } else if (cmd === 'delete') {
      await sleep(80)
      const confirm = await ask(`  ${c.red('Type')} ${c.white('confirm')} ${c.red('to delete')} ${c.white(name)}  ${c.primary('›')} `)
      if (confirm.trim() === 'confirm') {
        fs.unlinkSync(file)
        try { await git.add('.'); await git.commit(`delete: ${name}`) } catch {}
        console.log(`  ${c.green('+')}  ${c.white('Deleted')}`)
        break
      } else {
        console.log(`  ${c.gray('Cancelled')}`)
      }

    } else if (cmd === 'b') {
      break
    }
  }
}

// ── save prompt helper ────────────────────────────────────────
async function savePrompt(title, model, promptText, keywords, notes, dir = VAULT) {
  const date    = new Date().toISOString().split('T')[0]
  const file    = path.join(dir, `${title}.md`)
  const content = [
    '---',
    `title: ${title}`,
    `model: ${model}`,
    `date: ${date}`,
    `keywords: ${keywords.join(', ')}`,
    `notes: ${notes}`,
    `likes: 0`,
    '---',
    '',
    promptText,
  ].join('\n')
  fs.writeFileSync(file, content)
  const s = spin('Committing to git...')
  try {
    await git.init(); await git.add('.'); await git.commit(`add: ${title}`)
    s.ok(`Saved  ${c.accent(title)}`)
  } catch { s.fail('Git commit failed') }
  await sleep(900)
}

// ─────────────────────────────────────────────────────────────
//  TOP PROMPTS PAGE
// ─────────────────────────────────────────────────────────────
async function topPromptsPage() {
  console.clear()
  header('top prompts')

  const files = fs.readdirSync(VAULT).filter(f => f.endsWith('.md'))

  if (files.length === 0) {
    console.log(`  ${c.gray('Your vault is empty — add your first prompt!')}`)
    console.log()
  } else {
    const sorted = files
      .map(f => ({ f, likes: getLikes(f) }))
      .sort((a, b) => b.likes - a.likes)
      .slice(0, 5)

    console.log(`  ${c.muted('    title' + ' '.repeat(22) + 'likes')}`)
    div()
    sorted.forEach(({ f, likes }, i) => {
      const name = f.replace('.md', '')
      console.log(`  ${c.muted(String(i+1).padStart(2,'0'))}  ${c.white(name.padEnd(28))}${c.muted(String(likes) + ' likes')}`)
    })
    div()
    console.log(`  ${c.muted(files.length + ' prompt' + (files.length !== 1 ? 's' : '') + ' in vault')}`)
    console.log()

    const pick = await ask(`  ${c.gray('type a number to open, or')} ${c.primary('m')} ${c.gray('for menu  ')}${c.primary('›')} `)
    const n    = parseInt(pick.trim()) - 1
    if (n >= 0 && n < sorted.length) {
      await openPrompt(sorted[n].f)
      return topPromptsPage()
    }
  }
  mainMenu()
}

// ─────────────────────────────────────────────────────────────
//  ADD PAGE
// ─────────────────────────────────────────────────────────────
async function addPage(projectName = null) {
  console.clear()
  header(projectName ? `add to ${projectName}` : 'add prompt')
  console.log(`  ${c.gray('Fill each field. Type')} ${c.primary('back')} ${c.gray('to cancel.')}`)
  console.log()

  const title = await field('Title   ')
  if (title.trim() === 'back') return projectName ? viewProjectPage(projectName) : mainMenu()

  console.log(`\n  ${c.gray('Select a model:')}`)
  const model = await pickModel()

  const promptText = await field('Prompt  ')
  if (promptText.trim() === 'back') return projectName ? viewProjectPage(projectName) : mainMenu()

  console.log(`\n  ${c.gray('Select keywords:')}`)
  const keywords = await pickKeywords()

  const notes = await field('Notes   ')
  if (notes.trim() === 'back') return projectName ? viewProjectPage(projectName) : mainMenu()

  console.log()
  div()
  console.log(`  ${c.muted('title')}    ${c.white(title)}`)
  console.log(`  ${c.muted('model')}    ${c.accent(model)}`)
  console.log(`  ${c.muted('prompt')}   ${c.white(promptText.slice(0, 58) + (promptText.length > 58 ? '…' : ''))}`)
  if (keywords.length) console.log(`  ${c.muted('keywords')} ${c.accent(keywords.join(', '))}`)
  if (notes.trim())    console.log(`  ${c.muted('notes')}    ${c.gray(notes)}`)
  if (projectName)     console.log(`  ${c.muted('project')}  ${c.primary(projectName)}`)
  div()
  console.log()

  const confirm = await ask(`  ${c.gray('type')} ${c.primary('commit')} ${c.gray('to save, or')} ${c.muted('back')} ${c.gray('to cancel')}  ${c.primary('›')} `)

  if (confirm.trim() === 'commit') {
    const dir = projectName ? path.join(PROJECTS_DIR, projectName) : VAULT
    await savePrompt(title, model, promptText, keywords, notes, dir)
  }

  return projectName ? viewProjectPage(projectName) : mainMenu()
}

// ─────────────────────────────────────────────────────────────
//  PROJECTS PAGE
// ─────────────────────────────────────────────────────────────
async function projectsPage() {
  console.clear()
  header('projects')

  const projects = fs.readdirSync(PROJECTS_DIR).filter(f =>
    fs.statSync(path.join(PROJECTS_DIR, f)).isDirectory()
  )

  if (projects.length === 0) {
    console.log(`  ${c.gray('No projects yet.')}`)
    console.log()
  } else {
    console.log(`  ${c.muted('    name' + ' '.repeat(25) + 'prompts')}`)
    div()
    projects.forEach((p, i) => {
      const count = fs.readdirSync(path.join(PROJECTS_DIR, p)).filter(f => f.endsWith('.md')).length
      console.log(`  ${c.muted(String(i+1).padStart(2,'0'))}  ${c.white(p.padEnd(30))}${c.muted(String(count))}`)
    })
    div()
    console.log(`  ${c.muted(projects.length + ' project' + (projects.length !== 1 ? 's' : ''))}`)
    console.log()
  }

  console.log(`  ${c.primary('new')} ${c.gray('to create a project')}`)
  console.log()

  const input = await ask(`  ${c.gray('type a number to open, or')} ${c.primary('new')}  ${c.primary('›')} `)
  const trimmed = input.trim()

  if (trimmed === 'new') return newProjectPage()

  const idx = parseInt(trimmed) - 1
  if (idx >= 0 && idx < projects.length) return viewProjectPage(projects[idx])

  mainMenu()
}

// ─────────────────────────────────────────────────────────────
//  NEW PROJECT PAGE
// ─────────────────────────────────────────────────────────────
async function newProjectPage() {
  console.clear()
  header('new project')

  const name = await field('Name    ')
  if (name.trim() === 'back') return projectsPage()
  if (!name.trim()) return projectsPage()

  const projectPath = path.join(PROJECTS_DIR, name.trim())
  if (fs.existsSync(projectPath)) {
    console.log(`  ${c.red('x')}  ${c.gray('Project already exists')}`)
    await sleep(800)
    return projectsPage()
  }

  fs.mkdirSync(projectPath, { recursive: true })
  const s = spin('Creating project...')
  await sleep(400)
  s.ok(`Created project  ${c.accent(name.trim())}`)
  await sleep(600)

  return viewProjectPage(name.trim())
}

// ─────────────────────────────────────────────────────────────
//  VIEW PROJECT PAGE
// ─────────────────────────────────────────────────────────────
async function viewProjectPage(projectName) {
  console.clear()
  header(`project  ${projectName}`)

  const projectPath = path.join(PROJECTS_DIR, projectName)
  const files = fs.readdirSync(projectPath).filter(f => f.endsWith('.md'))

  if (files.length === 0) {
    console.log(`  ${c.gray('No prompts in this project yet.')}`)
    console.log()
  } else {
    console.log(`  ${c.muted('    title' + ' '.repeat(22) + 'model')}`)
    div()
    files.forEach((f, i) => {
      const raw   = fs.readFileSync(path.join(projectPath, f), 'utf8')
      const name  = f.replace('.md', '')
      const model = (raw.match(/^model: (.+)$/m) || [])[1] || '—'
      console.log(`  ${c.muted(String(i+1).padStart(2,'0'))}  ${c.white(name.padEnd(28))}${c.gray(model)}`)
    })
    div()
    console.log(`  ${c.muted(files.length + ' prompt' + (files.length !== 1 ? 's' : ''))}`)
    console.log()
  }

  console.log(`  ${c.primary('add')} ${c.gray('to add a prompt to this project')}`)
  console.log()

  const input = await ask(`  ${c.gray('number to open,')} ${c.primary('add')}${c.gray(', or b to go back  ')}${c.primary('›')} `)
  const trimmed = input.trim()

  if (trimmed === 'add') return addPage(projectName)

  const idx = parseInt(trimmed) - 1
  if (idx >= 0 && idx < files.length) {
    await openPrompt(files[idx], projectPath)
    return viewProjectPage(projectName)
  }

  projectsPage()
}

// ─────────────────────────────────────────────────────────────
//  LIST PAGE
// ─────────────────────────────────────────────────────────────
async function listPage() {
  console.clear()
  header('all prompts')

  const files = fs.readdirSync(VAULT).filter(f => f.endsWith('.md'))

  if (files.length === 0) {
    console.log(`  ${c.gray('No prompts yet')}`)
    console.log()
    while ((await ask(`  ${c.primary('›')} `)).trim() !== 'b') {}
    return mainMenu()
  }

  console.log(`  ${c.muted('    title' + ' '.repeat(20) + 'model' + ' '.repeat(14) + 'likes')}`)
  div()
  files.forEach((f, i) => {
    const raw   = fs.readFileSync(path.join(VAULT, f), 'utf8')
    const name  = f.replace('.md', '')
    const model = (raw.match(/^model: (.+)$/m) || [])[1] || '—'
    const likes = getLikes(f)
    console.log(`  ${c.muted(String(i+1).padStart(2,'0'))}  ${c.white(name.padEnd(26))}${c.gray(model.padEnd(20))}${c.muted(String(likes) + ' likes')}`)
  })
  div()
  console.log(`  ${c.muted(files.length + ' prompt' + (files.length !== 1 ? 's' : ''))}`)
  console.log()

  const pick = await ask(`  ${c.gray('type a number to open, or b to go back  ')}${c.primary('›')} `)
  const idx  = parseInt(pick.trim()) - 1
  if (idx >= 0 && idx < files.length) {
    await openPrompt(files[idx])
    return listPage()
  }
  mainMenu()
}

// ─────────────────────────────────────────────────────────────
//  SEARCH PAGE
// ─────────────────────────────────────────────────────────────
async function searchPage() {
  console.clear()
  header('search')

  const query   = await field('Query   ')
  const results = []

  // search vault
  fs.readdirSync(VAULT).filter(f => f.endsWith('.md')).forEach(f => {
    const raw = fs.readFileSync(path.join(VAULT, f), 'utf8')
    if (f.toLowerCase().includes(query.toLowerCase()) || raw.toLowerCase().includes(query.toLowerCase()))
      results.push({ f, dir: VAULT, label: 'prompt' })
  })

  // search projects
  if (fs.existsSync(PROJECTS_DIR)) {
    fs.readdirSync(PROJECTS_DIR).forEach(p => {
      const projectPath = path.join(PROJECTS_DIR, p)
      if (!fs.statSync(projectPath).isDirectory()) return
      fs.readdirSync(projectPath).filter(f => f.endsWith('.md')).forEach(f => {
        const raw = fs.readFileSync(path.join(projectPath, f), 'utf8')
        if (f.toLowerCase().includes(query.toLowerCase()) || raw.toLowerCase().includes(query.toLowerCase()))
          results.push({ f, dir: projectPath, label: p })
      })
    })
  }

  console.log()
  if (results.length === 0) {
    console.log(`  ${c.gray('No matches for "' + query + '"')}`)
    console.log()
    while ((await ask(`  ${c.primary('›')} `)).trim() !== 'b') {}
    return mainMenu()
  }

  div()
  results.forEach((r, i) => {
    const name = r.f.replace('.md', '')
    const hi   = name.replace(new RegExp(query, 'gi'), m => c.primary(m))
    const tag  = r.label === 'prompt' ? c.muted('[vault]') : c.accent('[' + r.label + ']')
    console.log(`  ${c.muted(String(i+1).padStart(2,'0'))}  ${hi}  ${tag}`)
  })
  div()
  console.log(`  ${c.muted(results.length + ' result' + (results.length !== 1 ? 's' : ''))}`)
  console.log()

  const pick = await ask(`  ${c.gray('type a number to open, or b to go back  ')}${c.primary('›')} `)
  const idx  = parseInt(pick.trim()) - 1
  if (idx >= 0 && idx < results.length) {
    await openPrompt(results[idx].f, results[idx].dir)
    return searchPage()
  }
  mainMenu()
}

// ─────────────────────────────────────────────────────────────
//  MODELS PAGE
// ─────────────────────────────────────────────────────────────
async function modelsPage() {
  console.clear()
  header('supported models')
  console.log()
  console.log(`  ${c.muted('    model' + ' '.repeat(24) + 'vendor')}`)
  div()
  MODELS.forEach((m, i) =>
    console.log(`  ${c.muted(String(i+1).padStart(2,'0'))}  ${c.white(m.name.padEnd(30))}${c.gray(m.vendor)}`)
  )
  div()
  console.log()
  while ((await ask(`  ${c.primary('›')} `)).trim() !== 'b') {}
  mainMenu()
}

// ─────────────────────────────────────────────────────────────
//  MAIN MENU
// ─────────────────────────────────────────────────────────────
const MENU = [
  { label: 'top prompts', desc: 'most liked prompts',    fn: topPromptsPage },
  { label: 'add',         desc: 'save a new prompt',     fn: () => addPage() },
  { label: 'projects',    desc: 'manage your projects',  fn: projectsPage   },
  { label: 'list',        desc: 'browse your vault',     fn: listPage       },
  { label: 'search',      desc: 'find a prompt',         fn: searchPage     },
  { label: 'models',      desc: 'browse models',         fn: modelsPage     },
]

async function mainMenu() {
  console.clear()
  header('home')

  MENU.forEach((item, i) =>
    console.log(`  ${c.muted(String(i+1).padStart(2,'0'))}  ${c.white(item.label.padEnd(14))}${c.gray(item.desc)}`)
  )
  div()
  console.log(`  ${c.muted('00')}  ${c.gray('exit')}`)
  console.log()

  const input = await ask(`  ${c.primary('›')} `)
  const n     = parseInt(input.trim())

  if (n === 0) { rl.close(); process.exit(0) }
  if (n >= 1 && n <= MENU.length) return MENU[n - 1].fn()

  console.log(`  ${c.red('x')}  ${c.gray('Type a number from the menu')}`)
  await sleep(600)
  mainMenu()
}

// ─────────────────────────────────────────────────────────────
//  BOOT
// ─────────────────────────────────────────────────────────────
async function boot() {
  console.clear()
  console.log()
  console.log(c.primary('  ██████╗ ██╗████████╗') + '  ' + c.muted('<') + c.accent('prompt') + c.muted('>'))
  console.log(c.primary(' ██╔════╝ ██║╚══██╔══╝') + '  ' + c.gray('git-powered prompt vault'))
  console.log(c.primary(' ██║  ███╗██║   ██║   ') + '  ' + c.muted('v1.0'))
  console.log(c.primary(' ╚██████╔╝██║   ██║   '))
  console.log(c.primary('  ╚═════╝ ╚═╝   ╚═╝   '))
  console.log()

  for (const [msg, ms] of [
    ['Checking environment',     50],
    ['Locating vault',           40],
    ['Loading git index',        60],
    ['Scanning prompt registry', 50],
  ]) {
    const s = spin(msg)
    await sleep(ms + Math.random() * 100)
    s.ok(msg)
  }

  console.log()
  await bar('Initializing context', 500)
  console.log()
  await bar('Loading prompt index', 400)
  console.log()

  mainMenu()
}

boot()
