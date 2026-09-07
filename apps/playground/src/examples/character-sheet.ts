import { prop } from '@willowforms/core'
import { check, choices, date, form, node, number, required, text, when } from './builders.js'
import { folioStep, grid, notes, repeat, section, step, styled, wide } from './character-layout.js'
import { ABILITIES, playSheet } from './character-play.js'

export const characterSheet = form(
  'dnd-character-sheet',
  'D&D character sheet',
  'Keep the numbers you need during play together. Use the other pages for your detailed records.',
  [
    playSheet,
    folioStep('features', '2 · Classes and features', [
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

      section('training', 'Training and experience', [
        number('experiencePoints', 'Experience points'),
        notes('languagesKnown', 'Languages and communication'),
        notes('equipmentTraining', 'Armor, weapon, and tool proficiencies'),
      ]),
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
    folioStep('equipment', '3 · Equipment and treasure', [
      wide(
        section('coins', 'Coin purse', [
          grid(
            'coinAmounts',
            ['Copper', 'Silver', 'Electrum', 'Gold', 'Platinum'].map((coin) =>
              number(coin.toLowerCase(), coin + ' pieces'),
            ),
            5,
            160,
          ),
        ]),
      ),
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
    step('spellcasting', '4 · Spellcasting', [
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
                  number('slots' + String(level) + 'Total', 'L' + String(level) + ' total slots'),
                  number('slots' + String(level) + 'Available', 'L' + String(level) + ' available'),
                ])
              }),
              9,
              100,
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
    folioStep('story', '5 · Personality and backstory', [
      section('appearance', 'First impressions', [
        grid('campaignDetails', [text('campaign', 'Campaign'), text('gameMaster', 'Game master')]),
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
      wide(
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
      ),
    ]),
    folioStep('journal', '6 · Adventures and notes', [
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
      wide(notes('tableRules', 'Table rules and character-specific agreements')),
    ]),
    node('Text', 'srdAttribution', {
      variant: 'caption',
      text: 'This work includes material from the System Reference Document 5.2.1 (“SRD 5.2.1”) by Wizards of the Coast LLC, available at https://www.dndbeyond.com/srd. The SRD 5.2.1 is licensed under the Creative Commons Attribution 4.0 International License, available at https://creativecommons.org/licenses/by/4.0/legalcode. This example is an original record-sheet layout; it does not reproduce rule descriptions.',
    }),
  ],
)
characterSheet.root.props = { maxWidth: prop(1320), gap: prop(12), density: prop('compact') }
styled(
  characterSheet.root,
  '--sheet-line:color-mix(in srgb,currentColor 22%,transparent); --sheet-accent:#a47449; --sheet-panel:color-mix(in srgb,currentColor 3%,transparent); min-width:1120px; padding:24px; border-top:4px solid var(--sheet-accent); overflow-wrap:anywhere;',
)
styled(
  characterSheet.root.children![0]!,
  'font-family:Cambria,Georgia,serif;font-size:26px;font-weight:600;letter-spacing:-0.025em; padding-bottom:8px; border-bottom:1px solid var(--sheet-line);',
)
characterSheet.root.children = characterSheet.root.children!.filter(
  ({ key }) => key !== 'introduction',
)
