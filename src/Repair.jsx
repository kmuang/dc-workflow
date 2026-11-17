import { repairPlan } from './sim.js'
import { Lamp } from './ui.jsx'

export function Repair({ snap, actions }) {
  const plan = repairPlan(snap, actions.work)
  const incDone = plan.inc.filter((t) => t.done).length
  const allDone = [plan.pick, plan.inc, plan.hw, plan.close].every((list) => list.every((task) => task.done))

  return (
    <div className="stack">
      <section className={`banner ${actions.work.closed ? 'ok' : 'warn'}`}>
        <div>
          <p className="eyebrow">INC-4418 · rack C14</p>
          <h2>{actions.work.closed ? 'Ticket closed' : 'Finish the repair'}</h2>
          <p>
            {actions.work.closed
              ? 'The transceiver is back at full weight, the watch window stayed clean, and the hardware rediag signed off with no failures.'
              : 'Pick the parts up from the spare cages before you install them. Then drain, confirm the probers cleared, mark the ToR as the bad end, swap, rediag, and undrain. The dead supply and the slow fan are still part of the close.'}
          </p>
        </div>
        <div className="banner-actions">
          <strong className="ticket-count">{incDone}/{plan.inc.length}</strong>
          <span>incident tasks</span>
        </div>
      </section>

      <TaskList title="Parts pickup" hint="Cage first, then the rack" tasks={plan.pick} onAction={actions.run} onFinish={actions.finishTask} />
      <TaskList title="Incident close-out" hint="Do these in order" tasks={plan.inc} onAction={actions.run} onFinish={actions.finishTask} />
      <TaskList title="Other hardware" hint="Found on the chassis, not on the loss probes" tasks={plan.hw} onAction={actions.run} onFinish={actions.finishTask} />
      <TaskList title="Sign-off" hint="Clean rediag after every part is in" tasks={plan.close} onAction={actions.run} onFinish={actions.finishTask} />

      <section className="panel">
        <header className="panel-h">
          <h2>Close INC-4418</h2>
          <span>{allDone ? 'Ready' : 'Still open'}</span>
        </header>
        <div className="actions">
          <button className="btn btn-primary" disabled={!allDone || actions.work.closed} onClick={actions.closeTicket}>
            {actions.work.closed ? 'Closed' : 'Close ticket'}
          </button>
          <button className="btn btn-ghost" onClick={actions.reset}>Reset scenario</button>
        </div>
        <p className="hint">
          {allDone
            ? 'Every task is confirmed. Closing the ticket is the last step.'
            : 'The ticket stays open until each finished task is confirmed.'}
        </p>
      </section>
    </div>
  )
}

function TaskList({ title, hint, tasks, onAction, onFinish }) {
  return (
    <section className="panel">
      <header className="panel-h">
        <h2>{title}</h2>
        <span>{hint}</span>
      </header>
      <ol className="tasks">
        {tasks.map((task, i) => (
          <li key={task.id} className={task.done ? 'done' : ''}>
            <span className="check" aria-hidden="true">{task.done ? '✓' : i + 1}</span>
            <div>
              <h3><Lamp health={task.done ? 'ok' : task.ready ? 'info' : 'warn'} />{task.title}</h3>
              <p>{task.detail}</p>
              {task.ready && !task.done && <p>Work is done. Finish confirms this task.</p>}
              {!task.ready && task.blocked && <p>{task.blocked}</p>}
            </div>
            {task.ready && !task.done && (
              <button className="btn btn-primary" onClick={() => onFinish(task.id)}>
                Finish
              </button>
            )}
            {task.action && !task.ready && (
              <button
                className="btn"
                disabled={Boolean(task.blocked)}
                title={task.blocked || undefined}
                onClick={() => onAction(task.action)}
              >
                {task.actionLabel}
              </button>
            )}
          </li>
        ))}
      </ol>
    </section>
  )
}
