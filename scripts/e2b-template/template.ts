import { Template } from 'e2b'

export const template = Template()
  .fromTemplate('claude')
  .aptInstall([
    'docker.io',
    'docker-compose-plugin',
    'postgresql-client',
    'curl',
  ])
  .runCommands([
    // Install Temporal CLI
    'curl -sSf https://temporal.download/cli.sh | sh -s -- --install-dir /usr/local/bin',
  ])
  .npmInstall(['playwright'], { g: true })
  .runCommands(['playwright install chromium --with-deps'])
