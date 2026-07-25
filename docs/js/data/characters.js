/**
 * Character database — ported 1:1 from scripts/character_data.gd.
 *
 * `portrait` is resolved at load time by trying .webp then .svg, mirroring the
 * original's ResourceLoader.exists() probe over .png then .svg.
 */

export const Role = Object.freeze({
  PROTAGONIST: 'protagonist',
  SIDE_CHARACTER: 'side_character',
});

/** Characters whose portrait is a raster image (AI-generated, now WebP). */
const WEBP_PORTRAITS = new Set([
  'leon', 'geo', 'lakshay', 'arian', 'simon', 'kaj', 'dorian', 'barret',
]);

function portraitFor(id) {
  const ext = WEBP_PORTRAITS.has(id) ? 'webp' : 'svg';
  return `assets/portraits/${id}.${ext}`;
}

const RAW = [
  // ---- Protagonist ----
  {
    id: 'leon',
    name: 'Léon',
    role: Role.PROTAGONIST,
    bio: 'A former office worker who left the corporate world behind to found a spiritual community. Léon seeks balance between inner peace and the practical demands of keeping the lights on. He tends bar by night to fund his true calling.',
    relationship: 'Self.',
    location: 'Spiritual Community & The Bar',
  },

  // ---- Spiritual Community Members ----
  {
    id: 'geo',
    name: 'Geo',
    role: Role.SIDE_CHARACTER,
    bio: 'An elderly sage who was one of the first to join Léon\u2019s community. Geo spent decades traveling the world studying meditation techniques. His quiet wisdom and gentle humor ground the community when tensions rise.',
    relationship: 'Geo is Léon\u2019s mentor and closest confidant. He sees in Léon the same restless searching he felt in his own youth.',
    location: 'Spiritual Community',
  },
  {
    id: 'lakshay',
    name: 'Lakshay',
    role: Role.SIDE_CHARACTER,
    bio: 'A warm-hearted community member who manages the daily logistics: cooking, supplies, and schedules. Lakshay\u2019s practical skills keep the community running smoothly while his infectious optimism lifts everyone\u2019s spirits.',
    relationship: 'Lakshay looks up to Léon as a leader and often brings him chai during long meditation sessions.',
    location: 'Spiritual Community',
  },
  {
    id: 'arian',
    name: 'Arian',
    role: Role.SIDE_CHARACTER,
    bio: 'A charismatic and sometimes skeptical member who pushes the community to evolve. Arian believes spirituality should engage with the modern world, not retreat from it. His debates keep the community intellectually honest.',
    relationship: 'Arian and Léon have a productive but occasionally tense relationship. Arian challenges Léon\u2019s decisions, but always with the community\u2019s best interests at heart.',
    location: 'Spiritual Community',
  },
  {
    id: 'simon',
    name: 'Simon',
    role: Role.SIDE_CHARACTER,
    bio: 'A weathered veteran of intentional communities, Simon has seen dozens of utopian projects rise and fall. He brings hard-earned realism about what makes communities last or collapse.',
    relationship: 'Simon respects Léon\u2019s vision but isn\u2019t shy about pointing out when idealism blinds him to practical realities.',
    location: 'Spiritual Community',
  },
  {
    id: 'kaj',
    name: 'Kaj',
    role: Role.SIDE_CHARACTER,
    bio: 'A quiet artist who found in the community a canvas for spiritual expression. Kaj paints mandalas and leads visual meditation workshops. Their art adorns the community hall walls.',
    relationship: 'Kaj is deeply grateful to Léon for creating a space where creativity and spirituality intertwine.',
    location: 'Spiritual Community',
  },

  // ---- Bar Regulars ----
  {
    id: 'dorian',
    name: 'Dorian',
    role: Role.SIDE_CHARACTER,
    bio: 'A silver-tongued regular at the bar who claims to have been everything from a jazz pianist to a diamond smuggler. Nobody knows which stories are true, but they are always worth hearing.',
    relationship: 'Dorian treats Léon as a kindred spirit, another soul navigating the space between who they were and who they want to be.',
    location: 'The Bar',
  },
  {
    id: 'barret',
    name: 'Barret',
    role: Role.SIDE_CHARACTER,
    bio: 'The bar\u2019s owner, a burly warm-hearted man who gave Léon a job when he needed it most. Barret runs the bar like a family, remembering every regular\u2019s name and drink.',
    relationship: 'Barret is like a father figure to Léon. He doesn\u2019t fully understand the spiritual community thing, but he respects Léon\u2019s dedication.',
    location: 'The Bar',
  },
  {
    id: 'ethan',
    name: 'Ethan',
    role: Role.SIDE_CHARACTER,
    bio: 'A young college student who works part-time at the bar. Ethan is bright-eyed and curious about everything, including Léon\u2019s double life. He has started attending meditation sessions on weekends.',
    relationship: 'Ethan sees Léon as a mentor figure and is increasingly drawn to the idea of a more meaningful life.',
    location: 'The Bar & Spiritual Community',
  },
  {
    id: 'matt',
    name: 'Matt',
    role: Role.SIDE_CHARACTER,
    bio: 'A laid-back surfer-turned-bartender who works the weekend shifts. Matt\u2019s philosophy is simple: good waves, good drinks, good people. His effortless calm is contagious.',
    relationship: 'Matt and Léon share a relaxed friendship. Matt doesn\u2019t need to understand the spiritual stuff to be a loyal friend.',
    location: 'The Bar',
  },
  {
    id: 'artem',
    name: 'Artem',
    role: Role.SIDE_CHARACTER,
    bio: 'A sharp-dressed businessman who comes to the bar to escape the boardroom. Artem secretly envies Léon\u2019s courage to walk away from corporate life, though he would never admit it.',
    relationship: 'Artem and Léon have fascinating conversations about money, meaning, and the cost of ambition.',
    location: 'The Bar',
  },

  // ---- Bridge Characters ----
  {
    id: 'klaudia',
    name: 'Klaudia',
    role: Role.SIDE_CHARACTER,
    bio: 'A musician who plays at both the community\u2019s evening gatherings and the bar\u2019s open mic nights. Klaudia\u2019s songs bridge the two worlds, carrying themes of longing, peace, and resilience.',
    relationship: 'Klaudia and Léon share a deep creative bond. She understands the tension between his two lives better than anyone.',
    location: 'Spiritual Community & The Bar',
  },
  {
    id: 'brian',
    name: 'Brian',
    role: Role.SIDE_CHARACTER,
    bio: 'A former finance guy who burned out and found his way to Léon\u2019s community. Brian now helps manage the community\u2019s modest finances and occasionally bartends. He is proof that transformation is possible.',
    relationship: 'Brian sees his own past in Léon\u2019s current struggle and offers financial advice born of hard experience.',
    location: 'Spiritual Community & The Bar',
  },
  {
    id: 'susan',
    name: 'Susan',
    role: Role.SIDE_CHARACTER,
    bio: 'A nurse by day and spiritual seeker by night. Susan brings medical knowledge to the community and a healing presence wherever she goes. She is the person everyone calls when someone is sick or struggling.',
    relationship: 'Susan is one of Léon\u2019s most trusted friends. She is the steady, nurturing presence that both the community and the bar staff rely on.',
    location: 'Spiritual Community & The Bar',
  },
];

/** Build the full character list, with portrait paths resolved. */
export function createAllProfiles() {
  return RAW.map((c) => ({ ...c, portrait: portraitFor(c.id) }));
}

/** Two-letter-ish initials, used as the portrait fallback. */
export function getInitials(displayName) {
  if (!displayName) return '?';
  return displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase();
}
