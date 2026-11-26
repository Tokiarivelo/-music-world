/** Objects that grow on the ground in patches (I40): the theme of each, from the sea floor to the enchanted realm. */

export type ReefTheme = 'kelp' | 'coral' | 'sand' | 'wreck' | 'keep' | 'village' | 'forest' | 'crystal';

export const BENTHIC_THEME: Readonly<Record<string, ReefTheme>> = {
  'recipe:kelp': 'kelp',
  'recipe:seagrass': 'kelp',
  'recipe:staghorn_coral': 'coral',
  'recipe:brain_coral': 'coral',
  'recipe:coral_fan': 'coral',
  'recipe:tube_sponge': 'coral',
  'recipe:sea_anemone': 'coral',
  'recipe:starfish': 'sand',
  'recipe:sea_urchin': 'sand',
  'recipe:crab': 'sand',
  'recipe:seashell': 'sand',
  'recipe:shipwreck': 'wreck',
  // Enchanted Realm (I40): a keep at the centre, villages, enchanted forests and crystal fields around it.
  'recipe:castle': 'keep',
  'recipe:dragon': 'keep',
  'recipe:wizard_tower': 'village',
  'recipe:mushroom_house': 'village',
  'recipe:giant_mushroom': 'forest',
  'recipe:magic_tree': 'forest',
  'recipe:glow_flower': 'forest',
  'recipe:crystal_cluster': 'crystal',
};
