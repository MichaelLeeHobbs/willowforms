import type { ComponentNode } from '@willowforms/core'
import { prop } from '@willowforms/core'
import { check, choices, node, number, required, text } from './builders.js'
import { grid, notes, repeat, section, step, styled } from './character-layout.js'

export const ABILITIES = [
  ['Strength', ['Athletics']],
  ['Dexterity', ['Acrobatics', 'Sleight of Hand', 'Stealth']],
  ['Constitution', []],
  ['Intelligence', ['Arcana', 'History', 'Investigation', 'Nature', 'Religion']],
  ['Wisdom', ['Animal Handling', 'Insight', 'Medicine', 'Perception', 'Survival']],
  ['Charisma', ['Deception', 'Intimidation', 'Performance', 'Persuasion']],
] as const

const inline = (field: ComponentNode, width = 56): ComponentNode => {
  field.props['inlineLabel'] = prop(true)
  field.props['inputWidth'] = prop(width)
  return field
}

const columns = (key: string, tracks: string, children: ComponentNode[]): ComponentNode =>
  styled(
    node('Box', key, { padding: 0 }, children),
    `display:grid;grid-template-columns:${tracks};gap:16px;align-items:start;min-width:0;`,
  )

export const playSheet = step('play', '1 · Character and combat', [
  columns('identityStrip', '2fr 1.25fr 1.25fr 1fr 90px', [
    text('characterName', 'Character name', required),
    text('species', 'Species / ancestry'),
    text('background', 'Background'),
    text('playerName', 'Player name'),
    number('level', 'Total level', 1, 20),
  ]),
  columns('playColumns', '220px minmax(360px, 1fr) minmax(440px, 1.15fr)', [
    section('abilities', 'Abilities & saves', [
      node(
        'Stack',
        'abilityCards',
        { gap: 12 },
        ABILITIES.map(([name]) => {
          const key = name.toLowerCase()
          const short = name.slice(0, 3).toUpperCase()
          return styled(
            node('Stack', key + 'Card', { gap: 8 }, [
              styled(
                node('Heading', key + 'Title', { text: name, level: 'h4' }),
                'font-family:Cambria,Georgia,serif;font-size:17px;font-weight:600;',
              ),
              grid(
                key + 'Numbers',
                [
                  number(key + 'Score', short + ' score', 1, 30),
                  number(key + 'Modifier', short + ' mod.', -5, 10),
                ],
                2,
                64,
              ),
              inline(number(key + 'SaveBonus', short + ' save bonus', -5)),
              check(key + 'SaveProficiency', short + ' proficient'),
            ]),
            'padding:10px 8px 4px;border:1px solid var(--sheet-line);border-left:3px solid var(--sheet-accent);border-radius:6px;background:var(--sheet-panel);',
          )
        }),
      ),
    ]),
    section('skills', 'Skills & awareness', [
      node(
        'Stack',
        'skillRows',
        { gap: 4 },
        ABILITIES.flatMap(([, skills]) => skills)
          .sort()
          .map((skill) => {
            const key = skill.replaceAll(' ', '')
            const training = inline(
              choices(key + 'Training', skill + ' training', [
                'None',
                'Proficient',
                'Expertise',
                'Other',
              ]),
              92,
            )
            training.props['placeholder'] = prop('—')
            training.props['options'] = prop([
              { label: 'None', value: 'None' },
              { label: 'Prof.', value: 'Proficient' },
              { label: 'Expert', value: 'Expertise' },
              { label: 'Other', value: 'Other' },
            ])
            return styled(
              columns(key + 'Skill', '1fr 1fr', [
                inline(number(key + 'Bonus', skill + ' bonus', -5), 52),
                training,
              ]),
              'gap:12px;padding-bottom:4px;border-bottom:1px solid var(--sheet-line);',
            )
          }),
      ),
      node('Text', 'abilityInstructions', {
        text: 'Enter final bonuses manually. Prof. = proficient; Expert = expertise.',
        variant: 'small',
      }),
      section('awareness', 'Passive awareness', [
        inline(number('passivePerception', 'Passive Perception')),
        inline(number('passiveInsight', 'Passive Insight')),
        inline(number('passiveInvestigation', 'Passive Investigation')),
        notes('senses', 'Special senses and situational bonuses'),
      ]),
    ]),
    node('Stack', 'combatColumn', { gap: 18 }, [
      section('defenses', 'Combat', [
        grid(
          'combatStats',
          [
            number('armorClass', 'Armor Class'),
            number('initiative', 'Initiative bonus', -5),
            number('speed', 'Speed (feet)'),
          ],
          3,
          110,
        ),
        grid(
          'readiness',
          [
            inline(number('proficiencyBonus', 'Proficiency bonus', 2, 6)),
            check('heroicInspiration', 'Heroic Inspiration available'),
          ],
          2,
          190,
        ),
      ]),
      styled(
        section('vitality', 'Hit points', [
          inline(number('currentHp', 'Current hit points'), 110),
          grid(
            'health',
            [
              inline(number('maxHp', 'Maximum hit points'), 64),
              inline(number('temporaryHp', 'Temporary hit points'), 64),
            ],
            2,
            140,
          ),
          grid(
            'deathSaves',
            [
              inline(number('deathSaveSuccesses', 'Death save successes', 0, 3)),
              inline(number('deathSaveFailures', 'Death save failures', 0, 3)),
            ],
            2,
            150,
          ),
        ]),
        'padding:14px;border:2px solid var(--sheet-accent);border-radius:8px;background:var(--sheet-panel);',
      ),
      section('conditions', 'Conditions & effects', [
        grid(
          'conditionFlags',
          [
            'Blinded',
            'Charmed',
            'Deafened',
            'Frightened',
            'Grappled',
            'Incapacitated',
            'Invisible',
            'Paralyzed',
            'Petrified',
            'Poisoned',
            'Prone',
            'Restrained',
            'Stunned',
            'Unconscious',
          ].map((name) => check('condition' + name, name)),
          3,
          125,
        ),
        inline(number('exhaustion', 'Exhaustion level', 0, 6)),
        notes('ongoingEffects', 'Ongoing effects, durations, and reminders'),
        notes('damageDefenses', 'Resistances, immunities, and vulnerabilities'),
      ]),
      section('movement', 'Other movement', [
        inline(number('flySpeed', 'Flying speed (feet)')),
        inline(number('swimSpeed', 'Swimming speed (feet)')),
        inline(number('climbSpeed', 'Climbing speed (feet)')),
      ]),
    ]),
  ]),
  repeat(
    'attacks',
    'Attack',
    [
      columns('attackLine', '2fr 100px 1.2fr 1fr 1fr 1.5fr', [
        text('attackName', 'Weapon / attack name', required),
        number('attackBonus', 'Attack bonus', -5),
        text('damageDice', 'Damage dice / formula'),
        text('damageType', 'Damage type'),
        text('reachRange', 'Reach / range'),
        text('attackMastery', 'Mastery / properties'),
      ]),
      notes('attackNotes', 'Ammunition, effects, and other notes'),
    ],
    'Add weapons, attacks, and commonly used actions.',
  ),
])
