import { describe, expect, it } from 'vitest'
import { formatArea, formatLength, parseLength } from './units'

describe('formatLength', () => {
  it('keeps metric as whole cm', () => {
    expect(formatLength(380.4, 'metric')).toBe('380')
    expect(formatLength(12, 'metric', true)).toBe('12 cm')
  })
  it('writes feet-inches to the nearest half inch', () => {
    expect(formatLength(381, 'imperial')).toBe(`12' 6"`)
    expect(formatLength(12 * 30.48, 'imperial')).toBe(`12' 0"`)
    expect(formatLength(6.5 * 2.54, 'imperial')).toBe(`6½"`)
    expect(formatLength(11.9 * 2.54, 'imperial')).toBe(`1' 0"`)
    expect(formatLength(-30.48, 'imperial')).toBe(`-1' 0"`)
    expect(formatLength(0, 'imperial')).toBe(`0"`)
  })
})

describe('formatArea', () => {
  it('formats m² or ft²', () => {
    expect(formatArea(12, 'metric')).toBe('12.00 m²')
    expect(formatArea(12, 'metric', 1)).toBe('12.0 m²')
    expect(formatArea(12, 'imperial')).toBe('129.2 ft²')
    expect(formatArea(12, 'imperial', 1)).toBe('129 ft²')
  })
})

describe('parseLength', () => {
  it('parses metric cm', () => {
    expect(parseLength(' 120 ', 'metric')).toBe(120)
    expect(parseLength('-5.5', 'metric')).toBe(-5.5)
    expect(parseLength('abc', 'metric')).toBeNull()
    expect(parseLength('', 'metric')).toBeNull()
  })
  it.each([
    ['150', 150],
    ['150"', 150],
    ['150 in', 150],
    [`12'`, 144],
    ['12.5ft', 150],
    [`12.5'`, 150],
    [`12'6"`, 150],
    [`12' 6"`, 150],
    [`12' 6½"`, 150.5],
    ['12ft 6in', 150],
    [`12'6`, 150],
    [`-1' 0"`, -12],
    [`6''`, 6],
  ])('parses imperial %s', (s, inches) => {
    expect(parseLength(s, 'imperial')).toBeCloseTo(inches * 2.54, 6)
  })
  it('rejects junk', () => {
    for (const s of ['', 'abc', `'`, '"', `1'2'`, '1.2.3']) expect(parseLength(s, 'imperial')).toBeNull()
  })
  it('round-trips formatted lengths to the nearest half inch', () => {
    for (const cm of [0, 15, 99, 381, 1234]) expect(parseLength(formatLength(cm, 'imperial'), 'imperial')).toBeCloseTo(Math.round((cm / 2.54) * 2) * 1.27, 6)
  })
})
