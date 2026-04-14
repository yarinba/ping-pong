import { describe, it, expect } from 'vitest'
import { parseArgs, buildPrompt, parseResult } from './e2b-validate.mjs'

describe('parseArgs', () => {
  it('parses required --prompt', () => {
    const result = parseArgs(['--prompt', 'check the API'])
    expect(result.prompt).toBe('check the API')
  })

  it('uses default retries of 2', () => {
    const result = parseArgs(['--prompt', 'check'])
    expect(result.retries).toBe(2)
  })

  it('parses custom --retries', () => {
    const result = parseArgs(['--prompt', 'check', '--retries', '3'])
    expect(result.retries).toBe(3)
  })

  it('parses --branch and --repo', () => {
    const result = parseArgs(['--prompt', 'x', '--branch', 'feat/foo', '--repo', 'https://github.com/org/repo.git'])
    expect(result.branch).toBe('feat/foo')
    expect(result.repo).toBe('https://github.com/org/repo.git')
  })

  it('throws if --prompt is missing', () => {
    expect(() => parseArgs([])).toThrow('--prompt is required')
  })
})

describe('buildPrompt', () => {
  it('includes the checks in the output', () => {
    const prompt = buildPrompt('1. GET /healthz → 200')
    expect(prompt).toContain('1. GET /healthz → 200')
  })

  it('includes all service URLs', () => {
    const prompt = buildPrompt('check')
    expect(prompt).toContain('localhost:3000')
    expect(prompt).toContain('localhost:5173')
    expect(prompt).toContain('localhost:5432')
  })

  it('instructs validator to output a JSON code block', () => {
    const prompt = buildPrompt('check')
    expect(prompt).toContain('```json')
    expect(prompt).toContain('"passed"')
  })
})

describe('parseResult', () => {
  it('returns passed=true when claude output-format json succeeds and report is valid', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: '```json\n{"passed":true,"checks":[{"name":"healthz","passed":true,"detail":"200 ok"}],"summary":"all good"}\n```',
    })
    const result = parseResult(stdout)
    expect(result.passed).toBe(true)
    expect(result.checks).toHaveLength(1)
    expect(result.summary).toBe('all good')
  })

  it('returns passed=false when a check fails', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: '```json\n{"passed":false,"checks":[{"name":"UI","passed":false,"detail":"button not found"}],"summary":"UI check failed"}\n```',
    })
    const result = parseResult(stdout)
    expect(result.passed).toBe(false)
    expect(result.summary).toContain('failed')
  })

  it('returns passed=false when claude exits with error', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'error_max_turns',
    })
    const result = parseResult(stdout)
    expect(result.passed).toBe(false)
    expect(result.error).toContain('error_max_turns')
  })

  it('returns passed=false when stdout is not JSON', () => {
    const result = parseResult('not json')
    expect(result.passed).toBe(false)
    expect(result.error).toContain('invalid JSON')
  })

  it('returns passed=false when no JSON report block found', () => {
    const stdout = JSON.stringify({
      type: 'result',
      subtype: 'success',
      result: 'All looks good but no JSON block here.',
    })
    const result = parseResult(stdout)
    expect(result.passed).toBe(false)
    expect(result.error).toContain('JSON report')
  })
})
