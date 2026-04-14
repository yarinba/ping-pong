import { Template, defaultBuildLogger } from 'e2b'
import { template } from './template.js'

await Template.build(template, 'ping-pong-validator', {
  cpuCount: 4,
  memoryMB: 8192,
  onBuildLogs: defaultBuildLogger(),
})
