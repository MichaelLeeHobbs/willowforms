import { expect, it } from 'vitest'
import { contextValues, flatten, validateForm } from '@formsmith/core'
import { characterSheet } from './character-sheet.js'

it('keeps the play sheet together with five supporting pages', () => {
  expect(contextValues(characterSheet.root, 'step')).toEqual([
    '1 · Character and combat',
    '2 · Classes and features',
    '3 · Equipment and treasure',
    '4 · Spellcasting',
    '5 · Personality and backstory',
    '6 · Adventures and notes',
  ])
})

it('includes six abilities, eighteen distinct skills, and all nine spell-slot levels', () => {
  const keys = new Set(flatten(characterSheet.root).map(({ node }) => node.key))
  for (const name of [
    'strength',
    'dexterity',
    'constitution',
    'intelligence',
    'wisdom',
    'charisma',
  ]) {
    expect(keys.has(name + 'Score')).toBe(true)
    expect(keys.has(name + 'SaveBonus')).toBe(true)
  }
  const skills = [
    'Acrobatics',
    'AnimalHandling',
    'Arcana',
    'Athletics',
    'Deception',
    'History',
    'Insight',
    'Intimidation',
    'Investigation',
    'Medicine',
    'Nature',
    'Perception',
    'Performance',
    'Persuasion',
    'Religion',
    'SleightofHand',
    'Stealth',
    'Survival',
  ]
  for (const skill of skills) {
    expect(keys.has(skill + 'Bonus')).toBe(true)
    expect(keys.has(skill + 'Training')).toBe(true)
  }
  for (let level = 1; level <= 9; level++) {
    expect(keys.has('slots' + String(level) + 'Total')).toBe(true)
    expect(keys.has('slots' + String(level) + 'Available')).toBe(true)
  }
})

it('validates each spell only when the character uses magic', () => {
  const context = { step: '4 · Spellcasting' }
  expect(
    validateForm(characterSheet.root, { usesMagic: false, spells: [{}] }, { context }),
  ).toEqual({})
  expect(
    validateForm(characterSheet.root, { usesMagic: true, spells: [{}] }, { context }),
  ).toHaveProperty('spells[0].spellName')
  expect(
    validateForm(
      characterSheet.root,
      { usesMagic: true, spells: [{ spellName: 'A remembered cantrip', spellLevel: 0 }] },
      { context },
    ),
  ).toEqual({})
})
