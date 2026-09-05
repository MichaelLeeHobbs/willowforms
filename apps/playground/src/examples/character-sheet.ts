import type { ComponentNode } from '@formsmith/core'
import {
  check,
  choices,
  date,
  form,
  grid,
  node,
  notes,
  number,
  repeat,
  required,
  section,
  step,
  text,
  when,
} from './builders.js'

const ABILITIES = [
  ['Strength', ['Athletics']],
  ['Dexterity', ['Acrobatics', 'Sleight of Hand', 'Stealth']],
  ['Constitution', []],
  ['Intelligence', ['Arcana', 'History', 'Investigation', 'Nature', 'Religion']],
  ['Wisdom', ['Animal Handling', 'Insight', 'Medicine', 'Perception', 'Survival']],
  ['Charisma', ['Deception', 'Intimidation', 'Performance', 'Persuasion']],
] as const
const keyOf = (label: string): string => label.replaceAll(' ', '')

function ability(name: string, skills: readonly string[]): ComponentNode {
  const key = name.toLowerCase()
  return section(key + 'Card', name, [
    grid(key + 'Numbers', [
      number(key + 'Score', name + ' score', 1, 30),
      number(key + 'Modifier', name + ' modifier', -5, 10),
    ]),
    grid(key + 'Save', [
      number(key + 'SaveBonus', name + ' save bonus', -5),
      check(key + 'SaveProficiency', 'Proficient in ' + name.toLowerCase() + ' saves'),
    ]),
    ...skills.map((skill) =>
      grid(keyOf(skill) + 'Skill', [
        number(keyOf(skill) + 'Bonus', skill + ' bonus', -5),
        choices(keyOf(skill) + 'Training', skill + ' training', [
          'None',
          'Proficient',
          'Expertise',
          'Other',
        ]),
      ]),
    ),
  ])
}

export const characterSheet = form(
  'dnd-character-sheet',
  'D&D character sheet',
  'Your adventurer, from first impression to the last spell slot. Use the pages to record your character and keep your own totals up to date; bonuses and rules are not calculated automatically.',
  [
    step('identity', '1 · Identity and origins', [
      section('identityCard', 'The adventurer', [
        grid('characterNames', [
          text('characterName', 'Character name', required),
          text('playerName', 'Player name'),
        ]),
        grid('campaignDetails', [text('campaign', 'Campaign'), text('gameMaster', 'Game master')]),
        grid('origins', [text('species', 'Species / ancestry'), text('background', 'Background')]),
        grid(
          'characterProgress',
          [
            number('level', 'Total level', 1, 20),
            number('experiencePoints', 'Experience points'),
            number('proficiencyBonus', 'Proficiency bonus', 2, 6),
          ],
          3,
        ),
        check('heroicInspiration', 'Heroic Inspiration available'),
      ]),
      repeat(
        'classes',
        'Class',
        [
          grid('classDetails', [
            choices(
              'className',
              'Class',
              [
                'Barbarian',
                'Bard',
                'Cleric',
                'Druid',
                'Fighter',
                'Monk',
                'Paladin',
                'Ranger',
                'Rogue',
                'Sorcerer',
                'Warlock',
                'Wizard',
                'Other / homebrew',
              ],
              true,
            ),
            text('subclass', 'Subclass'),
          ]),
          grid(
            'classResources',
            [
              number('classLevel', 'Levels in this class', 1, 20),
              choices('hitDie', 'Hit Die', ['d6', 'd8', 'd10', 'd12']),
              number('hitDiceRemaining', 'Hit Dice remaining', 0, 20),
            ],
            3,
          ),
          notes('classNotes', 'Class notes / homebrew name'),
        ],
        'Add one entry for each class, including multiclass levels and Hit Dice.',
      ),
    ]),
    step('abilities', '2 · Abilities, saves, and skills', [
      node('Text', 'abilityInstructions', {
        text: 'Record final bonuses, including proficiency, expertise, and other adjustments. A training selection records proficiency without recalculating the bonus.',
      }),
      grid(
        'abilityCards',
        ABILITIES.map(([name, skills]) => ability(name, skills)),
      ),
      section('awareness', 'Awareness and proficiencies', [
        grid(
          'passiveScores',
          [
            number('passivePerception', 'Passive Perception'),
            number('passiveInsight', 'Passive Insight'),
            number('passiveInvestigation', 'Passive Investigation'),
          ],
          3,
        ),
        notes('languagesKnown', 'Languages and communication'),
        notes('equipmentTraining', 'Armor, weapon, and tool proficiencies'),
        notes('senses', 'Special senses and situational bonuses'),
      ]),
    ]),
    step('combat', '3 · Combat and conditions', [
      section('defenses', 'Ready for the encounter', [
        grid(
          'combatStats',
          [
            number('armorClass', 'Armor Class'),
            number('initiative', 'Initiative bonus', -5),
            number('speed', 'Speed (feet)'),
          ],
          3,
        ),
        grid(
          'health',
          [
            number('maxHp', 'Maximum hit points'),
            number('currentHp', 'Current hit points'),
            number('temporaryHp', 'Temporary hit points'),
          ],
          3,
        ),
        grid(
          'movement',
          [
            number('flySpeed', 'Flying speed (feet)'),
            number('swimSpeed', 'Swimming speed (feet)'),
            number('climbSpeed', 'Climbing speed (feet)'),
          ],
          3,
        ),
        grid('deathSaves', [
          number('deathSaveSuccesses', 'Death save successes', 0, 3),
          number('deathSaveFailures', 'Death save failures', 0, 3),
        ]),
        notes('damageDefenses', 'Resistances, immunities, and vulnerabilities'),
      ]),
      repeat(
        'attacks',
        'Attack',
        [
          grid('attackIdentity', [
            text('attackName', 'Weapon / attack name', required),
            number('attackBonus', 'Attack bonus', -5),
          ]),
          grid('attackDamage', [
            text('damageDice', 'Damage dice / formula'),
            text('damageType', 'Damage type'),
          ]),
          grid('attackReach', [
            text('reachRange', 'Reach / range'),
            text('attackMastery', 'Mastery / properties'),
          ]),
          notes('attackNotes', 'Ammunition, effects, and other notes'),
        ],
        'Keep a separate entry for each weapon, attack, or commonly used action.',
      ),
      section('conditions', 'Current conditions', [
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
        ),
        number('exhaustion', 'Exhaustion level', 0, 6),
        notes('ongoingEffects', 'Ongoing effects, durations, and reminders'),
      ]),
    ]),
    step('features', '4 · Features and resources', [
      repeat(
        'features',
        'Feature',
        [
          grid('featureIdentity', [
            text('featureName', 'Feature / feat name', required),
            choices('featureSource', 'Source', [
              'Class',
              'Subclass',
              'Species',
              'Background',
              'Feat',
              'Item',
              'Other',
            ]),
          ]),
          choices('actionCost', 'Action cost', [
            'Passive',
            'Action',
            'Bonus action',
            'Reaction',
            'Other',
          ]),
          notes(
            'featureDescription',
            'What it does',
            'Use your own summary and note a rulebook or page reference when useful.',
          ),
        ],
        'Record class features, species traits, feats, and other abilities.',
      ),
      repeat(
        'resources',
        'Resource',
        [
          text('resourceName', 'Resource name', required),
          grid('resourceCounts', [
            number('resourceMaximum', 'Maximum uses'),
            number('resourceRemaining', 'Remaining uses'),
          ]),
          choices('resourceRecovery', 'Recovery', ['Short rest', 'Long rest', 'Dawn', 'Other']),
          notes('resourceNotes', 'Recovery details / special conditions'),
        ],
        'Track limited-use abilities and consumable resources separately.',
      ),
    ]),
    step('equipment', '5 · Equipment and treasure', [
      section('coins', 'Coin purse', [
        grid(
          'coinAmounts',
          ['Copper', 'Silver', 'Electrum', 'Gold', 'Platinum'].map((coin) =>
            number(coin.toLowerCase(), coin + ' pieces'),
          ),
          3,
        ),
      ]),
      repeat(
        'inventory',
        'Item',
        [
          grid('itemIdentity', [
            text('itemName', 'Item name', required),
            number('itemQuantity', 'Quantity'),
          ]),
          grid('itemStorage', [
            number('itemWeight', 'Weight per item (lb)'),
            text('itemLocation', 'Carried / stored where?'),
          ]),
          grid('itemFlags', [check('itemEquipped', 'Equipped'), check('itemAttuned', 'Attuned')]),
          notes('itemNotes', 'Properties, charges, and notes'),
        ],
        'Track equipment, treasure, consumables, and magic items. Quantities and weight are recorded manually.',
      ),
      section('travel', 'Travel and carrying', [
        grid('carrying', [
          number('carriedWeight', 'Total carried weight (lb)'),
          number('carryingCapacity', 'Carrying capacity (lb)'),
        ]),
        notes('mounts', 'Mounts, vehicles, and companions'),
        notes('storedTreasure', 'Treasure stored elsewhere'),
      ]),
    ]),
    step('spellcasting', '6 · Spellcasting', [
      check('usesMagic', 'This character uses spells'),
      when(
        section('magic', 'Spellcasting record', [
          grid(
            'castingStats',
            [
              choices(
                'castingAbility',
                'Spellcasting ability',
                ABILITIES.map(([name]) => name),
              ),
              number('spellSaveDc', 'Spell save DC'),
              number('spellAttackBonus', 'Spell attack bonus', -5),
            ],
            3,
          ),
          grid('preparation', [
            text('spellFocus', 'Spellcasting focus'),
            number('preparedLimit', 'Prepared spell limit'),
          ]),
          text('concentratingOn', 'Currently concentrating on'),
          section('spellSlots', 'Spell slots', [
            grid(
              'slotLevels',
              Array.from({ length: 9 }, (_, index) => {
                const level = index + 1
                return section('slotLevel' + String(level), 'Level ' + String(level), [
                  number(
                    'slots' + String(level) + 'Total',
                    'Level ' + String(level) + ' total slots',
                  ),
                  number(
                    'slots' + String(level) + 'Available',
                    'Level ' + String(level) + ' available slots',
                  ),
                ])
              }),
              3,
              280,
            ),
          ]),
          section('pactMagic', 'Pact Magic / other spell resources', [
            grid(
              'pactCounts',
              [
                number('pactSlotLevel', 'Pact slot level', 1, 5),
                number('pactSlotsTotal', 'Pact slots total'),
                number('pactSlotsAvailable', 'Pact slots available'),
              ],
              3,
            ),
            notes('otherSpellResources', 'Other spell resources and recovery'),
          ]),
          repeat(
            'spells',
            'Spell',
            [
              grid('spellIdentity', [
                text('spellName', 'Spell name', required),
                number('spellLevel', 'Spell level (0 = cantrip)', 0, 9),
              ]),
              grid('spellClassification', [
                choices('spellSchool', 'School', [
                  'Abjuration',
                  'Conjuration',
                  'Divination',
                  'Enchantment',
                  'Evocation',
                  'Illusion',
                  'Necromancy',
                  'Transmutation',
                ]),
                check('spellPrepared', 'Prepared / always available'),
              ]),
              grid('spellTiming', [
                text('castingTime', 'Casting time'),
                text('spellRange', 'Range / area'),
              ]),
              grid('spellDurationDetails', [
                text('spellDuration', 'Duration'),
                check('spellConcentration', 'Requires concentration'),
              ]),
              grid(
                'spellComponents',
                [check('verbal', 'Verbal'), check('somatic', 'Somatic'), check('ritual', 'Ritual')],
                3,
              ),
              text('material', 'Material components / cost'),
              notes(
                'spellEffect',
                'Effect and higher-level casting',
                'Write a short personal reference, including attack or saving throw details.',
              ),
              text('spellSource', 'Source / page'),
            ],
            'Add cantrips and spells. Keep preparation, components, and casting details together.',
          ),
        ]),
        'usesMagic',
        true,
      ),
    ]),
    step('story', '7 · Personality and backstory', [
      section('appearance', 'First impressions', [
        grid(
          'appearanceDetails',
          [text('age', 'Age'), text('height', 'Height'), text('build', 'Build')],
          3,
        ),
        notes('appearanceNotes', 'Appearance and distinguishing details'),
        text('alignment', 'Alignment / outlook'),
        text('faith', 'Faith, philosophy, or patron'),
      ]),
      section('personality', 'Who they are', [
        notes('personalityTraits', 'Personality traits'),
        notes('ideals', 'Ideals'),
        notes('bonds', 'Bonds'),
        notes('flaws', 'Flaws'),
        notes('backstory', 'Backstory'),
        notes('goals', 'Goals and unresolved questions'),
      ]),
      repeat(
        'connections',
        'Connection',
        [
          grid('connectionDetails', [
            text('connectionName', 'Person / faction', required),
            text('relationship', 'Relationship'),
          ]),
          notes('connectionNotes', 'History, promises, and complications'),
        ],
        'Keep allies, rivals, organizations, and important contacts close at hand.',
      ),
    ]),
    step('journal', '8 · Adventures and notes', [
      repeat(
        'quests',
        'Quest',
        [
          text('questName', 'Quest / objective', required),
          choices('questStatus', 'Status', ['Active', 'Completed', 'On hold', 'Abandoned']),
          notes('questLeads', 'Leads and next steps'),
          notes('questRewards', 'Rewards, promises, and consequences'),
        ],
        'Follow the threads your character cares about.',
      ),
      repeat(
        'sessions',
        'Session',
        [
          grid('sessionDetails', [
            number('sessionNumber', 'Session number', 1),
            date('sessionDate', 'Played on'),
          ]),
          text('sessionLocation', 'Where the adventure took place'),
          notes('sessionSummary', 'What happened?'),
          notes('sessionDiscoveries', 'People, discoveries, and treasure'),
          notes('nextSession', 'Remember for next time'),
        ],
        'Add a short journal entry after each session.',
      ),
      notes('tableRules', 'Table rules and character-specific agreements'),
    ]),
    node('Text', 'srdAttribution', {
      variant: 'caption',
      text: 'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. This example is an original record-sheet layout; it does not reproduce rule descriptions.',
    }),
  ],
)
characterSheet.root.children![0]!.css = {
  any:
    characterSheet.root.children![0]!.css!.any +
    ' font-family: Georgia, serif; letter-spacing: -0.03em;',
}
