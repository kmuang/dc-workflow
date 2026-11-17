import { useEffect, useRef, useState } from 'react'
import { complete, execute } from './cli.js'

const WELCOME = [
  'dca1 network ops  ·  practice lab',
  'Modeled on public Google datacenter practice: Jupiter Clos, mesh probers, drain before you pull fiber.',
  'This is not an internal Google binary.',
  '',
  'Page: serving jobs in rack C14 are losing some RPCs. Nothing has been drained.',
  'Start with probers, then sdn, then path. Type help.',
]

export function Terminal({ snap, actions }) {
  const [scrollback, setScrollback] = useState(() => WELCOME.map((text) => ({ kind: 'out', text })))
  const [draft, setDraft] = useState('')
  const [history, setHistory] = useState([])
  const [cursor, setCursor] = useState(-1)
  const saved = useRef('')
  const view = useRef(null)
  const input = useRef(null)
  const gate = useRef(0)
  const snapRef = useRef(snap)
  const actionsRef = useRef(actions)
  snapRef.current = snap
  actionsRef.current = actions

  useEffect(() => {
    const node = view.current
    if (node) node.scrollTop = node.scrollHeight
  }, [scrollback])

  useEffect(() => {
    input.current?.focus()
  }, [])

  function push(entries) {
    setScrollback((prev) => [...prev, ...entries].slice(-500))
  }

  function run(command) {
    const text = command.trim()
    if (!text) return
    const result = execute(text, { snap: snapRef.current, actions: actionsRef.current })
    if (result.clear) {
      setScrollback([])
      return
    }
    const output = result.lines.flatMap((line) => String(line).split('\n')).map((line) => ({ kind: 'out', text: line }))
    push([{ kind: 'cmd', text }, ...output])
    setHistory((prev) => [...prev, text].slice(-80))
    setCursor(-1)
    saved.current = ''
  }

  function submit(command) {
    const text = command ?? ''
    const now = Date.now()
    if (now - gate.current < 80) return
    gate.current = now
    run(text)
    setDraft('')
  }

  function onSubmit(event) {
    event.preventDefault()
    submit(input.current?.value ?? draft)
  }

  function onKeyDown(event) {
    if (event.key === 'Enter') {
      event.preventDefault()
      submit(event.currentTarget.value)
      return
    }
    if (event.key === 'ArrowUp') {
      event.preventDefault()
      if (!history.length) return
      const next = cursor < 0 ? history.length - 1 : Math.max(0, cursor - 1)
      if (cursor < 0) saved.current = draft
      setCursor(next)
      setDraft(history[next])
      return
    }
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      if (cursor < 0) return
      const next = cursor + 1
      if (next >= history.length) {
        setCursor(-1)
        setDraft(saved.current)
        return
      }
      setCursor(next)
      setDraft(history[next])
      return
    }
    if (event.key === 'Tab') {
      event.preventDefault()
      const suggestion = complete(draft, snapRef.current)
      if (suggestion.line != null) {
        setDraft(suggestion.line)
        return
      }
      if (suggestion.options) {
        push([{ kind: 'out', text: suggestion.options.join('  ') }])
      }
      return
    }
    if (event.key === 'l' && event.ctrlKey) {
      event.preventDefault()
      setScrollback([])
    }
  }

  return (
    <section className="term" onMouseDown={() => input.current?.focus()}>
      <div className="term-scroll" ref={view}>
        {scrollback.map((line, index) => (
          <div key={index} className={line.kind === 'cmd' ? 'term-line cmd' : 'term-line'}>
            {line.kind === 'cmd' ? `lab@dca1> ${line.text}` : line.text || ' '}
          </div>
        ))}
      </div>
      <form className="term-form" onSubmit={onSubmit}>
        <label className="term-prompt" htmlFor="lab-cli">lab@dca1&gt;</label>
        <input
          id="lab-cli"
          ref={input}
          value={draft}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label="Lab command"
          onChange={(event) => {
            setDraft(event.target.value)
            setCursor(-1)
          }}
          onKeyDown={onKeyDown}
        />
      </form>
    </section>
  )
}
