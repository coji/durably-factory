import { appendFileSync } from 'node:fs'
import { createInterface } from 'node:readline'

if (process.argv.includes('--version')) {
  console.log('codex-cli 0.163.0')
} else if (process.argv.includes('login')) {
  console.log('Logged in using ChatGPT')
} else {
  const send = (value) => console.log(JSON.stringify(value))
  createInterface({ input: process.stdin }).on('line', (line) => {
    const message = JSON.parse(line)
    appendFileSync(new URL('./requests.jsonl', import.meta.url), line + '\n')
    if (message.id === undefined) return
    const result =
      message.method === 'initialize'
        ? { userAgent: 'codex-cli/0.163.0' }
        : message.method.startsWith('thread/')
          ? { thread: { id: 'thread-test' } }
          : { turn: { id: 'turn-test', status: 'inProgress', items: [] } }
    send({ id: message.id, result })
    if (message.method === 'turn/start') {
      setTimeout(() => {
        send({
          method: 'item/agentMessage/delta',
          params: {
            threadId: 'thread-test',
            turnId: 'turn-test',
            itemId: 'reply',
            delta: 'OK',
          },
        })
        send({
          method: 'turn/completed',
          params: {
            threadId: 'thread-test',
            turn: { id: 'turn-test', status: 'completed', items: [] },
          },
        })
      }, 10)
    }
  })
}
