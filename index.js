#!/usr/bin/env node
const { program } = require('commander')
const fs = require('fs')
const path = require('path')
const os = require('os')
const simpleGit = require('simple-git')

const VAULT = path.join(os.homedir(), '.promptvault')
if (!fs.existsSync(VAULT)) fs.mkdirSync(VAULT, { recursive: true })
const git = simpleGit(VAULT)

program
  .command('add <text>')
  .description('Save a prompt')
  .option('-t, --title <title>', 'Title', 'untitled')
  .action(async (text, opts) => {
    const file = path.join(VAULT, `${opts.title}.md`)
    console.log('saving to:', file)
    fs.writeFileSync(file, `# ${opts.title}\n\n${text}`)
    await git.init()
    await git.add('.')
    await git.commit(`add: ${opts.title}`)
    console.log(`✓ Saved "${opts.title}"`)
  })
  
program
  .command('list')
  .description('List all prompts')
  .action(() => {
    const files = fs.readdirSync(VAULT).filter(f => f.endsWith('.md'))
    if (files.length === 0) return console.log('No prompts saved yet')
    files.forEach(f => console.log(f.replace('.md', '')))
  })

program
  .command('search <query>')
  .description('Search prompts (search filenames and contents)')
  .option('--no-content', 'Do not search file contents')
  .option('--no-ignore-case', 'Disable case-insensitive matching')
  .option('--regex', 'Treat query as a regular expression')
  .action((query, opts) => {
    try {
      const files = fs.readdirSync(VAULT).filter(f => f.endsWith('.md'))
      if (files.length === 0) return console.log('No prompts saved yet')
      const matches = []
      let re = null
      if (opts.regex) {
        const flags = opts.ignoreCase ? 'i' : ''
        try {
          re = new RegExp(query, flags)
        } catch (err) {
          console.error('Invalid regular expression:', err.message)
          process.exit(1)
        }
      }
      const norm = (s) => (opts.ignoreCase ? s.toLowerCase() : s)
      files.forEach(f => {
        const name = f.replace('.md', '')
        let matched = false
        if (opts.regex) {
          if (re.test(name)) matched = true
        } else {
          if (norm(name).includes(norm(query))) matched = true
        }
        if (!matched && opts.content) {
          const content = fs.readFileSync(path.join(VAULT, f), 'utf8')
          if (opts.regex) {
            if (re.test(content)) matched = true
          } else {
            if (norm(content).includes(norm(query))) matched = true
          }
        }
        if (matched) matches.push(f)
      })
      if (matches.length === 0) return console.log('No matches')
      matches.forEach(f => console.log(f.replace('.md', '')))
    } catch (err) {
      console.error('Search failed:', err.message)
      process.exit(1)
    }
  })

program.parse(process.argv)