/**
 * Character database — ported 1:1 from scripts/character_data.gd.
 *
 * Every character carries two portrait paths:
 *
 *   portrait    small sheet used for every inline avatar in the game
 *   portraitHi  large sheet used only by the tap-to-enlarge lightbox
 *
 * Both are produced by scripts/build-portraits.js. The split exists because
 * the biggest inline avatar is 84 CSS px while the lightbox renders up to
 * 560 CSS px — one file cannot serve both without being wasteful in normal
 * play or soft when enlarged. `portraitHi` is only ever fetched on demand.
 *
 * ## Where people are
 *
 * Every character is bound to exactly one location by `locationId`, which
 * must be a real id from `data/locations.js`. That binding is the join key
 * for the whole cast: their events are gated to that location, the People
 * screen shows the place by name, and the roster is spread roughly evenly so
 * no location is a ghost town and none is a crowd.
 *
 * `location` (the human-readable place name) is *derived* from `locationId`
 * at build time in `createAllProfiles()`, so the two can never drift.
 */

import { getLocation } from './locations.js';

export const Role = Object.freeze({
  PROTAGONIST: 'protagonist',
  SIDE_CHARACTER: 'side_character',
  RIVAL: 'rival',
  ARCH_NEMESIS: 'arch_nemesis',
});

/** Display label for a role. */
export function roleLabel(role) {
  switch (role) {
    case Role.PROTAGONIST:
      return 'Protagonist';
    case Role.ARCH_NEMESIS:
      return 'Arch Nemesis';
    case Role.RIVAL:
      return 'Rival';
    default:
      return 'Side Character';
  }
}

/**
 * Every character now has a painted raster portrait. The procedural SVG
 * avatars that used to stand in for the last of the side cast were replaced
 * in the July 2026 art pass, so there is no longer a painted/generated split
 * to encode here — the build emits `<id>.webp` (thumb) and `hi/<id>.webp`
 * (lightbox) for every id in the catalogue.
 *
 * scripts/check-assets.js verifies both files exist for every character, so a
 * missing portrait fails CI rather than shipping a broken <img>.
 */
function portraitFor(id) {
  return `assets/portraits/${id}.webp`;
}

/** Full-size sheet for the enlarge-on-tap lightbox. */
function portraitHiFor(id) {
  return `assets/portraits/hi/${id}.webp`;
}

const RAW = [
  // ---- Protagonist ----
  {
    id: 'leon',
    name: 'Léon',
    role: Role.PROTAGONIST,
    bio: 'A former office worker who left the corporate world behind to found a spiritual community. Léon seeks balance between inner peace and the practical demands of keeping the lights on. He tends bar by night to fund his true calling.',
    relationship: 'Self.',
    locationId: 'home_loft',
  },

  // ---- Spiritual Community Members ----
  {
    id: 'geo',
    name: 'Geo',
    role: Role.SIDE_CHARACTER,
    bio: 'An elderly sage who was one of the first to join Léon\u2019s community. Geo spent decades traveling the world studying meditation techniques. His quiet wisdom and gentle humor ground the community when tensions rise.',
    relationship:
      'Geo is Léon\u2019s mentor and closest confidant. He sees in Léon the same restless searching he felt in his own youth.',
    locationId: 'spiritual_community',
  },
  {
    id: 'lakshay',
    name: 'Lakshay',
    role: Role.SIDE_CHARACTER,
    bio: 'Runs the IT department nobody upstairs knows they have. Two floors below the meditation hall, in a vaulted cellar that used to hold wine, Lakshay keeps racks of servers humming through the night — a digitised library of scanned sutras, out-of-print commentaries, recorded dharma talks and every session the community has ever taped. He calls it the archive. Everyone else calls it the basement. He has never lost a byte, mirrors everything three times, and gets genuinely emotional about backup schedules. A brass singing bowl sits on top of rack one, which he insists is for humidity and not for luck.',
    relationship:
      'Lakshay quietly digitised Léon\u2019s earliest, worst guided meditations and refuses to delete them, on the grounds that an archive that only keeps the good parts is not an archive. He brings chai down the stairs and forgets to drink it.',
    locationId: 'spiritual_community',
  },
  {
    id: 'arian',
    name: 'Arian',
    role: Role.SIDE_CHARACTER,
    bio: 'Drinks, and tells Léon\u2019s stories better than Léon does. Give Arian a glass and a room and he will produce the founding legend of the community — the burst pipe, the first winter, the night the landlord came round — polished, timed, funnier every year and only loosely true. He is the community\u2019s unofficial memory and its least reliable narrator. Nobody has settled whether he drinks to keep the demons out or because they are already in and drinking with him. Arian tells it both ways depending on the hour, and laughs either way.',
    relationship:
      'Arian was there for most of what he describes, which is why Léon cannot simply correct him. He is fond of Arian and worried about him in roughly equal measure, and has never once found the right evening to say so.',
    locationId: 'bar',
  },
  {
    id: 'simon',
    name: 'Simon',
    role: Role.SIDE_CHARACTER,
    bio: 'A weathered veteran of intentional communities, Simon has seen dozens of utopian projects rise and fall. He brings hard-earned realism about what makes communities last or collapse.',
    relationship:
      'Simon respects Léon\u2019s vision but isn\u2019t shy about pointing out when idealism blinds him to practical realities.',
    locationId: 'landlord_office',
  },
  {
    id: 'kaj',
    name: 'Kaj',
    role: Role.SIDE_CHARACTER,
    bio: 'Reads. That is the whole of it, and it turns out to be a lot. Kaj arrives early, takes the corner of the hall with the good lamp, and disappears into a book until someone needs something — philosophy, poetry, a battered thriller, the instruction manual for the boiler, it genuinely does not matter. Towers of finished books fence the cushion in. Kaj is the person the community asks when nobody can remember where an idea came from, and is usually right, and never makes a thing of it.',
    relationship:
      'Kaj hands Léon a book roughly once a month without explanation or recommendation, and has never once asked whether he read it. He has read most of them.',
    locationId: 'public_library',
  },

  // ---- Bar Regulars ----
  {
    id: 'dorian',
    name: 'Dorian',
    role: Role.SIDE_CHARACTER,
    bio: 'Known throughout the bar for one sentence: \u201cI\u2019m old. I don\u2019t want to do anything.\u201d He deploys it against fundraisers, karaoke, group photographs, the quiz, moving one seat along, and the suggestion that he might enjoy some fresh air. It is not bitterness — Dorian is perfectly content, arriving at the same hour, occupying the same red armchair, declining everything with enormous warmth. He has reached the stage of life where doing nothing is a considered position, and he defends it with the calm of a man who knows he has earned it.',
    relationship:
      'Dorian has refused every single thing Léon has ever proposed and has never once missed a shift Léon was working. Léon has stopped asking and started simply setting the glass down, which Dorian regards as real progress.',
    locationId: 'bar',
  },
  {
    id: 'barret',
    name: 'Barret',
    role: Role.SIDE_CHARACTER,
    bio: 'The bar\u2019s owner, a burly warm-hearted man who gave Léon a job when he needed it most. Barret runs the bar like a family, remembering every regular\u2019s name and drink.',
    relationship:
      'Barret is like a father figure to Léon. He doesn\u2019t fully understand the spiritual community thing, but he respects Léon\u2019s dedication.',
    locationId: 'bar',
  },
  {
    id: 'ethan',
    name: 'Ethan',
    role: Role.SIDE_CHARACTER,
    bio: 'A young college student who works part-time at the bar. Ethan is bright-eyed and curious about everything, including Léon\u2019s double life. He has started attending meditation sessions on weekends.',
    relationship:
      'Ethan sees Léon as a mentor figure and is increasingly drawn to the idea of a more meaningful life.',
    locationId: 'house_of_middleway',
  },
  {
    id: 'matt',
    name: 'Matt',
    role: Role.SIDE_CHARACTER,
    bio: 'A laid-back surfer-turned-bartender who works the weekend shifts. Matt\u2019s philosophy is simple: good waves, good drinks, good people. His effortless calm is contagious.',
    relationship:
      'Matt and Léon share a relaxed friendship. Matt doesn\u2019t need to understand the spiritual stuff to be a loyal friend.',
    locationId: 'bar',
  },
  {
    id: 'artem',
    name: 'Artem',
    role: Role.SIDE_CHARACTER,
    bio: 'A sharp-dressed businessman who comes to the bar to escape the boardroom. Artem secretly envies Léon\u2019s courage to walk away from corporate life, though he would never admit it.',
    relationship:
      'Artem and Léon have fascinating conversations about money, meaning, and the cost of ambition.',
    locationId: 'alex_cocktail_bar',
  },

  // ---- Bridge Characters ----
  {
    id: 'klaudia',
    name: 'Klaudia',
    role: Role.SIDE_CHARACTER,
    bio: 'A musician who plays at both the community\u2019s evening gatherings and the bar\u2019s open mic nights. Klaudia\u2019s songs bridge the two worlds, carrying themes of longing, peace, and resilience.',
    relationship:
      'Klaudia and Léon share a deep creative bond. She understands the tension between his two lives better than anyone.',
    locationId: 'open_mic',
  },
  {
    id: 'brian',
    name: 'Brian',
    role: Role.SIDE_CHARACTER,
    bio: 'Léon\u2019s good old friend from way back, long before either of them talked about community. Brian started his own church community out in the woods called The House of Middleway — a converted barn chapel where the tea is always hot and the sermons run long. He\u2019s always grinning, warm in a way that fills the room a little too completely, like a would-be Jesus who forgot to stop smiling. His people adore him. People outside his community are not too sure about him.',
    relationship:
      'Brian and Léon go back years — shared flats, shared ideas, divergent paths. Brian actually built something of his own in the woods, and Léon respects that, even if the ever-present grin and the gathering crowd around him make Léon uneasy. They still meet for coffee and argue kindly about what community is meant to be.',
    locationId: 'house_of_middleway',
  },
  {
    id: 'susan',
    name: 'Susan',
    role: Role.SIDE_CHARACTER,
    bio: 'A nurse by day and spiritual seeker by night. Susan brings medical knowledge to the community and a healing presence wherever she goes. She is the person everyone calls when someone is sick or struggling.',
    relationship:
      'Susan is one of Léon\u2019s most trusted friends. She is the steady, nurturing presence that both the community and the bar staff rely on.',
    locationId: 'free_clinic',
  },

  // ================= Antagonists =================
  {
    id: 'kaden',
    name: 'Kaden',
    role: Role.ARCH_NEMESIS,
    bio: 'A property developer who has spent two years trying to buy the land the community sits on. Kaden is unfailingly polite, immaculately dressed, and entirely without scruple. He does not shout or threaten — he simply waits, refiles the paperwork, and lets the rent notices do the work. He genuinely believes he is doing Léon a favour.',
    relationship:
      'Kaden is the reason rent is always just out of reach. He has offered to buy Léon out four times, each offer slightly more insulting than the last. Léon hates that some small part of him is tempted.',
    locationId: 'landlord_office',
  },
  {
    id: 'sato',
    name: 'Sato',
    role: Role.RIVAL,
    bio: 'The owner of a polished wellness studio across town — the kind with a waiting list, branded water bottles, and a quarterly newsletter. Sato is disciplined, effective, and quietly certain that Léon\u2019s community is a beautiful mess that could be so much more with proper structure.',
    relationship:
      'A rival Léon cannot quite dislike. Sato poaches his members and then sends thoughtful notes when the community struggles. Every conversation leaves Léon wondering whether she is right.',
    locationId: 'sato_studio',
  },
  {
    id: 'alex',
    name: 'Alex',
    role: Role.RIVAL,
    bio: 'Runs the craft cocktail bar two streets over — the one with the neon sign, the twenty-two-ingredient menu, and the queue on Fridays. Alex is charming, relentlessly inventive, and treats bartending as a competitive sport that Léon did not agree to enter.',
    relationship:
      'Cheerfully steals Léon\u2019s regulars and then buys him a drink about it. The rivalry is real, but so is the respect underneath.',
    locationId: 'alex_cocktail_bar',
  },

  // ================= The Wider Circle =================
  {
    id: 'hawkinstv',
    name: 'HawkinsTV',
    role: Role.SIDE_CHARACTER,
    bio: 'A friendly anthropomorphic video-camera robot who wandered into the bar looking for content and stayed for the people. Films everything with its single expressive lens, broadcasts almost none of it. Claims the community has better stories than anything scripted. The little screen on its chest displays cheerful subtitles.',
    relationship:
      'Keeps promising Léon a feature that will "change everything." Léon suspects the friendship matters more to the little robot than the footage does.',
    locationId: 'radio_station',
  },
  {
    id: 'ricolewis',
    name: 'RicoLewis',
    role: Role.SIDE_CHARACTER,
    bio: 'A former semi-pro footballer whose knee gave out at twenty-four. Now coaches kids on Saturdays and drinks slowly on Sundays. Carries the particular calm of someone who has already survived losing the thing he loved.',
    relationship:
      'Talks to Léon about second acts. He is further along that road and does not pretend it was easy.',
    locationId: 'memorial_garden',
  },
  {
    id: 'yun',
    name: 'Yun',
    role: Role.SIDE_CHARACTER,
    bio: 'A calligrapher who joined the community for the silence and stayed for the people who respect it. Speaks rarely and precisely. Her brushwork hangs in the meditation hall.',
    relationship:
      'Gave Léon a scroll reading "the wave does not apologise for the shore." He has never fully decoded it and suspects that is the point.',
    locationId: 'spiritual_community',
  },
  {
    id: 'marlies',
    name: 'Marlies',
    role: Role.SIDE_CHARACTER,
    bio: 'A retired schoolteacher who treats the community like a classroom that finally wants to learn. Organises everything, remembers every birthday, and has strong opinions about the seating arrangement.',
    relationship: 'Mothers Léon relentlessly. He complains about it and would be lost without her.',
    locationId: 'memorial_garden',
  },
  {
    id: 'yume',
    name: 'Yume',
    role: Role.SIDE_CHARACTER,
    bio: 'An illustrator who sketches everyone at the bar without asking and gives the drawings away for free. Works nights, sleeps days, dreams vividly and talks about it at length.',
    relationship:
      'Has drawn Léon forty-one times and never once got his eyes right, which he finds hilarious.',
    locationId: 'rooftop',
  },
  {
    id: 'hanans',
    name: 'Hanans',
    role: Role.SIDE_CHARACTER,
    bio: 'A pharmacist with an encyclopaedic memory for herbal remedies and a deep scepticism of most of them. Joined the community to argue and stayed because the arguments were good.',
    relationship:
      'Léon\u2019s favourite sparring partner on questions of faith and evidence. Neither has convinced the other of anything.',
    locationId: 'free_clinic',
  },
  {
    id: 'brock_lee',
    name: 'Brock Lee',
    role: Role.SIDE_CHARACTER,
    bio: 'Runs the vegetable stall at the weekend market and supplies the community kitchen at cost. Puns constantly, apologises never. His produce is genuinely excellent.',
    relationship: 'Refuses to let Léon pay full price and refuses to discuss why.',
    locationId: 'community_garden',
  },
  {
    id: 'tarrasqu',
    name: 'Tarrasqu',
    role: Role.SIDE_CHARACTER,
    bio: 'Runs the Thursday tabletop night in the bar\u2019s back room. Enormous, gentle, and capable of improvising a three-hour story from a single dice roll. Nobody knows what he does for a living.',
    relationship:
      'Once ran a campaign in which the villain was clearly Léon\u2019s landlord. Léon has never felt so seen.',
    locationId: 'open_mic',
  },
  {
    id: 'kaschem',
    name: 'Kaschem',
    role: Role.SIDE_CHARACTER,
    bio: 'A chemistry teacher who spends weekends perfecting cold brew with laboratory rigour. Keeps a spreadsheet of extraction times. Shares results whether or not you asked.',
    relationship:
      'Supplies Léon with the coffee that gets him through double shifts. Considers this his contribution to the spiritual path.',
    locationId: 'farmers_market',
  },
  {
    id: 'mateo',
    name: 'Mateo',
    role: Role.SIDE_CHARACTER,
    bio: 'A carpenter who rebuilt the meditation hall\u2019s floor and refused payment, then came back the next week to fix the door. Measures twice, speaks once.',
    relationship:
      'Turns up whenever something in the community breaks, usually before Léon has noticed it broke.',
    locationId: 'temple_ruins',
  },
  {
    id: 'luca',
    name: 'Luca',
    role: Role.SIDE_CHARACTER,
    bio: 'A pastry chef who bakes at four in the morning and arrives at the bar smelling of butter and exhaustion. Brings the day\u2019s failures with him; they are better than most bakeries\u2019 successes.',
    relationship: 'Feeds Léon far too well and waves off every thank you.',
    locationId: 'soup_kitchen',
  },
  {
    id: 'vanna',
    name: 'Vanna',
    role: Role.SIDE_CHARACTER,
    bio: 'A travel writer between assignments who has been "passing through" for fourteen months. Nobody is quite sure if Vanna is a woman, a very convincing bunny in a coat, or something else entirely. Knows a story about every city and deflects every question about her own (or its own).',
    relationship:
      'Keeps threatening to leave. Léon has stopped believing her (or him, or it) and she seems relieved about it.',
    locationId: 'mountain_retreat',
  },
  {
    id: 'carl_bot',
    name: 'Carl-bot',
    role: Role.SIDE_CHARACTER,
    bio: 'The community\u2019s scheduling assistant — a secondhand tablet on a stand that announces meditation times in a cheerful synthetic voice. It tells terrible dad jokes about spreadsheet formulas and refuses to compute Sunday schedules unless offered virtual cookies.',
    relationship:
      'Reminds Léon of commitments he was actively avoiding. He has considered unplugging it and could not go through with it.',
    locationId: 'landlord_office',
  },
  {
    id: 'friend',
    name: 'Friend',
    role: Role.SIDE_CHARACTER,
    bio: 'Introduced themselves as "just a friend" on the first night and never elaborated. Turns up when someone is having a hard week, says little, and leaves before anyone can thank them.',
    relationship:
      'Léon has known them two years and still could not tell you their occupation, address, or given name.',
    locationId: 'home_loft',
  },
  {
    id: 'docbot',
    name: 'DocBot',
    role: Role.SIDE_CHARACTER,
    bio: 'A first-aid kiosk donated by a clinic that closed down. Dispenses plasters, blood-pressure readings, and unsolicited advice about hydration. Susan checks its calibration monthly.',
    relationship: 'Has told Léon to "consider reducing stress" one hundred and six times.',
    locationId: 'free_clinic',
  },
  {
    id: 'cheezl',
    name: 'Cheezl',
    role: Role.SIDE_CHARACTER,
    bio: 'Runs the late-night toastie cart outside the bar. Knows exactly who has had too much and quietly adds extra bread. An unofficial pillar of neighbourhood safety.',
    relationship: 'Has fed Léon after more closing shifts than either has counted.',
    locationId: 'night_market',
  },
  {
    id: 'sir_cruds',
    name: 'Sir Cruds',
    role: Role.SIDE_CHARACTER,
    bio: 'A cheesemonger with a self-awarded knighthood and a genuinely encyclopaedic palate. Addresses everyone as "my liege." Nobody remembers agreeing to this.',
    relationship: 'Donates the unsold wheels to community potlucks and calls it "tribute."',
    locationId: 'farmers_market',
  },
  {
    id: 'nestomalt',
    name: 'nestomalt',
    role: Role.SIDE_CHARACTER,
    bio: 'A night-shift nurse who drinks malted milk at the bar because she cannot drink anything else before work. Has seen enough to be unshockable and kind about it.',
    relationship: 'Talks Léon down when the numbers look impossible. She has a gift for scale.',
    locationId: 'free_clinic',
  },
  {
    id: 'qustoge',
    name: 'Qusтoge',
    role: Role.SIDE_CHARACTER,
    bio: 'A translator working across four languages and fluent in the silences between them. Joined the community when she realised she had spent a decade speaking only other people\u2019s words.',
    relationship:
      'Helps Léon phrase difficult things. He suspects she improves his meaning in transit.',
    locationId: 'public_library',
  },
  {
    id: 'groovyphoenix',
    name: 'groovyphoenix',
    role: Role.SIDE_CHARACTER,
    bio: 'A glowing warm phoenix bird (a firebird) who plays vinyl-only sets at the bar once a month and teaches ecstatic dance at the community on alternate Sundays. She insists these are the same practice. Her feathers leave faint trails of light when she moves.',
    relationship:
      'Got Léon to dance in public exactly once and has never let it go. She still teases him about it with little sparks.',
    locationId: 'open_mic',
  },
  {
    id: 'cary',
    name: 'Cary',
    role: Role.SIDE_CHARACTER,
    bio: 'A locksmith with a philosophy degree and a habit of turning small talk existential. Fixed the community\u2019s front door and then talked for an hour about what doors mean.',
    relationship: 'Léon budgets an extra twenty minutes whenever Cary visits.',
    locationId: 'pawn_shop',
  },
  {
    id: 'self',
    name: 'Self',
    role: Role.SIDE_CHARACTER,
    bio: 'Legally changed their name during a retreat and declines all follow-up questions. Attends every session, contributes rarely, and radiates an unsettling contentment.',
    relationship: 'Once told Léon "you are doing it already" and refused to clarify what "it" was.',
    locationId: 'house_of_middleway',
  },
  {
    id: 'daniela',
    name: 'Daniela',
    role: Role.SIDE_CHARACTER,
    bio: 'A physiotherapist who joined for the stretching and stayed for the stillness. Corrects everyone\u2019s posture mid-meditation, which is either helpful or deeply annoying depending on the day.',
    relationship:
      'Has fixed Léon\u2019s bartending back three times and lectures him about it each time.',
    locationId: 'bathhouse',
  },
  {
    id: 'baris',
    name: 'Baris',
    role: Role.SIDE_CHARACTER,
    bio: 'Runs the corner shop that stays open when nothing else does. Extends credit to half the neighbourhood and keeps the ledger in his head.',
    relationship:
      'Has quietly carried Léon\u2019s tab through two bad months and mentioned it zero times.',
    locationId: 'flea_market',
  },
  {
    id: 'aril_stellar',
    name: 'Aril Stellar☯',
    role: Role.SIDE_CHARACTER,
    bio: 'An astrologer who writes a surprisingly well-read newsletter and takes the work seriously as narrative rather than prophecy. Will tell you your chart is not an excuse.',
    relationship:
      'Warned Léon about "a difficult Sunday" months ago. He thinks about it every time rent is due.',
    locationId: 'rooftop',
  },
  {
    id: 'alvigunilla',
    name: 'Alvigunilla',
    role: Role.SIDE_CHARACTER,
    bio: 'A textile artist weaving enormous tapestries nobody has room to hang. Works in the community\u2019s back room in exchange for tea and quiet.',
    relationship:
      'Is weaving something for Léon and refuses to let him see it until it is finished.',
    locationId: 'flea_market',
  },
  {
    id: 'fraghis',
    name: 'Fraghis',
    role: Role.SIDE_CHARACTER,
    bio: 'A competitive gamer who streams at dawn and unwinds at the bar at midnight. Sharp reflexes, sharper humour, and a surprising patience with people learning slowly.',
    relationship: 'Taught Léon a card game and has beaten him at it two hundred consecutive times.',
    locationId: 'night_market',
  },
  {
    id: 'mrone',
    name: 'Mrone',
    role: Role.SIDE_CHARACTER,
    bio: 'A minimalist who owns nineteen possessions and mentions this more than nineteen times a week. He recently decluttered his last name down to a single phoneme and refuses to use adjectives because they are "frivolous syntax weight."',
    relationship: 'Keeps offering to help Léon "declutter." Léon keeps declining.',
    locationId: 'home_loft',
  },
  {
    id: 'raul',
    name: '𝕽𝖆𝖚𝖑',
    role: Role.SIDE_CHARACTER,
    bio: 'A tattoo artist with a gothic streak and a gentle bedside manner. Designs the community\u2019s flyers for free, always in blackletter, regardless of the occasion.',
    relationship:
      'Made the meditation retreat poster look like a metal album cover. Attendance doubled.',
    locationId: 'flea_market',
  },
  {
    id: 'stephen',
    name: 'Stephen',
    role: Role.SIDE_CHARACTER,
    bio: 'An accountant who does the community\u2019s books at a rate best described as symbolic. Dry, precise, and quietly devastated by how close the margins are.',
    relationship:
      'The only person who knows exactly how bad the finances are. Has never once said "I told you so."',
    locationId: 'pawn_shop',
  },
  {
    id: 'marlene_xoxo',
    name: 'Marlène xoxo',
    role: Role.SIDE_CHARACTER,
    bio: 'A cabaret performer who treats every entrance as a set piece. Warm, theatrical, and far more observant than the persona suggests.',
    relationship:
      'Notices when Léon is struggling before he does and says so, loudly, in front of everyone.',
    locationId: 'alex_cocktail_bar',
  },
  {
    id: 'diamndsdancin',
    name: 'diamndsdancin',
    role: Role.SIDE_CHARACTER,
    bio: 'A dance teacher running cheap classes in the community hall on weekday mornings. Believes movement is prayer and will not be argued out of it.',
    relationship:
      'Fills the hall on days it would otherwise sit empty, which helps more than she knows.',
    locationId: 'sato_studio',
  },
  {
    id: 'seth',
    name: 'Seth',
    role: Role.SIDE_CHARACTER,
    bio: 'A long-haul driver who appears every few weeks with regional snacks and stories from three time zones. Sleeps badly, listens well. Nobody at the night market calls him Seth. They call him The Hand — and have for so long that stallholders who have known him a decade will ask, in all sincerity, whether The Hand has a first name. The story changes depending on who is telling it: that he unloads a pallet single-handed; that he once stopped a runaway cart with one palm flat against it; that he simply raises a hand at the top of the street and six griddles know their delivery has arrived. He has never confirmed any of them. He answers to The Hand without hesitation and signs his delivery notes with a small drawing of one.',
    relationship:
      'Brings Léon something strange and edible from every trip. The shelf behind the bar is now a museum, and every label on it reads FROM THE HAND in the same blunt capitals. Léon called him Seth exactly once, early on, and got a puzzled half-second before the grin arrived; he has called him The Hand ever since, like everybody else.',
    locationId: 'night_market',
  },
  {
    id: 'siekamcebule',
    name: 'SiekamCebulę',
    role: Role.SIDE_CHARACTER,
    bio: 'Runs the community kitchen with military efficiency and a permanent onion-induced squint. Feeds forty people on a budget for twelve.',
    relationship: 'Will not accept help chopping. Will accept company while chopping.',
    locationId: 'soup_kitchen',
  },
  {
    id: 'kopung',
    name: 'Kopung (고풍)',
    role: Role.SIDE_CHARACTER,
    bio: 'A ceramicist making bowls in a deliberately antique style. Teaches a monthly workshop where nobody is allowed to rush.',
    relationship:
      'Gave Léon a tea bowl with a visible repair and said that was the important part.',
    locationId: 'mountain_retreat',
  },
  {
    id: 'kate',
    name: 'Kate',
    role: Role.SIDE_CHARACTER,
    bio: 'A journalist who came to write a sceptical piece about the community and quietly never filed it. Still takes notes. Still has not explained why.',
    relationship: 'Asks Léon the questions he avoids asking himself, then writes down the pauses.',
    locationId: 'memorial_garden',
  },
  {
    id: 'isra',
    name: 'Isra',
    role: Role.SIDE_CHARACTER,
    bio: 'An architecture student sketching the community building for a thesis on "spaces of refuge." Measures rooms while people meditate in them.',
    relationship:
      'Has drawn Léon\u2019s community more beautifully than it actually looks, which he finds oddly moving.',
    locationId: 'pawn_shop',
  },
  {
    id: 'kobideh',
    name: 'Kobideh',
    role: Role.SIDE_CHARACTER,
    bio: 'Runs the grill house that feeds the bar staff after close. Believes no problem survives a proper meal and tests the theory nightly.',
    relationship: 'Has never let Léon leave hungry, and never let him pay the full amount either.',
    locationId: 'soup_kitchen',
  },
  {
    id: 'stijn12d',
    name: 'stijn12d',
    role: Role.SIDE_CHARACTER,
    bio: 'A software developer who built the community\u2019s booking site over one weekend and has maintained it for free ever since. Communicates primarily in shrugs.',
    relationship:
      'Fixes things before Léon reports them. Declines all offers of payment and most offers of thanks.',
    locationId: 'sato_studio',
  },
  {
    id: 'andre_watson',
    name: 'Andre Watson',
    role: Role.SIDE_CHARACTER,
    bio: 'A jazz trumpeter who plays the bar\u2019s Sunday slot and treats an empty room the same as a full one. Forty years in and still practising scales.',
    relationship: 'Told Léon that consistency is its own kind of faith. It stuck.',
    locationId: 'open_mic',
  },
  {
    id: 'air_vaisselle',
    name: 'Air-Vaisselle',
    role: Role.SIDE_CHARACTER,
    bio: 'Washes dishes at the bar with headphones on and an expression of total transcendence. Claims it is the best meditation available and may be right.',
    relationship: 'The only person Léon has never seen stressed during a rush.',
    locationId: 'bathhouse',
  },
  {
    id: 'crveni',
    name: 'Crveni',
    role: Role.SIDE_CHARACTER,
    bio: 'A union organiser who drinks slowly and listens fast. Has quietly resolved three workplace disputes from a barstool.',
    relationship: 'Keeps telling Léon he is underpaying himself. Léon keeps changing the subject.',
    locationId: 'landlord_office',
  },
  {
    id: 'blokely',
    name: 'blokely',
    role: Role.SIDE_CHARACTER,
    bio: 'A bricklayer turned sculptor who works in salvaged materials. Built the community\u2019s garden wall out of things other people threw away.',
    relationship: 'Says the wall is unfinished. It has looked finished for a year.',
    locationId: 'community_garden',
  },
  {
    id: 'jits',
    name: 'Jits',
    role: Role.SIDE_CHARACTER,
    bio: 'A jiu-jitsu instructor who joined for the breathing exercises and stayed for the community. Gentle off the mat to a degree that surprises people.',
    relationship: 'Taught Léon how to fall properly. The metaphor was not lost on either of them.',
    locationId: 'mountain_retreat',
  },
  {
    id: 'gordon',
    name: 'Gordon',
    role: Role.SIDE_CHARACTER,
    bio: 'A retired firefighter who does not talk about the job. Drinks one pint slowly and helps stack chairs without being asked.',
    relationship: 'Turns up on the hardest nights. Léon has never worked out how he knows.',
    locationId: 'house_of_middleway',
  },
  {
    id: 'ahyeon',
    name: 'Ahyeon',
    role: Role.SIDE_CHARACTER,
    bio: 'A florist who supplies the community\u2019s altar arrangements from whatever did not sell. Believes flowers past their prime are the most interesting ones.',
    relationship: 'Leaves something on the meditation hall table every week without mentioning it.',
    locationId: 'farmers_market',
  },
  {
    id: 'oh',
    name: 'Oh',
    role: Role.SIDE_CHARACTER,
    bio: 'A poet whose entire published output is eleven words long. Attends silent sittings religiously and speaks perhaps once a month, to devastating effect.',
    relationship: 'Said "you are allowed to rest" to Léon in year one. He is still working on it.',
    locationId: 'river_walk',
  },
  {
    id: 'jared',
    name: 'Jared',
    role: Role.SIDE_CHARACTER,
    bio: 'A sound engineer who fixed the bar\u2019s appalling PA and now cannot stop hearing its remaining flaws. Mixes the community\u2019s guided meditations for free.',
    relationship:
      'Made Léon listen to the same recording nine times to hear a hum he could not detect.',
    locationId: 'radio_station',
  },
  {
    id: 'emily',
    name: 'emily',
    role: Role.SIDE_CHARACTER,
    bio: 'A veterinary nurse with a permanently full house of foster animals. Arrives at the bar covered in fur and entirely unbothered by it.',
    relationship: 'Has tried to give Léon a cat four times. The fifth attempt is coming.',
    locationId: 'community_garden',
  },
  {
    id: 'ricardoea',
    name: 'RicardoEA',
    role: Role.SIDE_CHARACTER,
    bio: 'An electrical engineer who rewired the community hall to code and refused to be thanked publicly. Notices every flickering bulb in every room he enters.',
    relationship: 'The reason the lights stay on, in the most literal available sense.',
    locationId: 'radio_station',
  },
  {
    id: 'speedfire',
    name: 'SpeedFire',
    role: Role.SIDE_CHARACTER,
    bio: 'A courier who knows every shortcut in the city and treats delivery as a competitive discipline. Arrives sweating, leaves before the door closes.',
    relationship:
      'Delivers the community\u2019s supplies faster than physics should allow and never explains how.',
    locationId: 'river_walk',
  },
  {
    id: 'orshi',
    name: 'Orshi',
    role: Role.SIDE_CHARACTER,
    bio: 'A translator of poetry who argues that meaning survives the crossing but music does not. Melancholy, funny, excellent company after midnight.',
    relationship:
      'Reads Léon fragments in languages he does not speak and refuses to translate them.',
    locationId: 'public_library',
  },
  {
    id: 'renata',
    name: 'Renata 🦥',
    role: Role.SIDE_CHARACTER,
    bio: 'Committed, publicly and proudly, to doing everything slowly. Arrives late to every session and has never once seemed rushed. The community is better for the example.',
    relationship:
      'The living argument against Léon\u2019s worst habits. He resents how effective it is.',
    locationId: 'bathhouse',
  },
  {
    id: 'iulian',
    name: 'Iulian',
    role: Role.SIDE_CHARACTER,
    bio: 'A stonemason restoring a church across the river on a twenty-year timeline. Thinks in decades and finds modern impatience faintly comic.',
    relationship: 'Reminds Léon that some things are supposed to take a lifetime.',
    locationId: 'temple_ruins',
  },
  {
    id: 'brendan',
    name: 'Brendan',
    role: Role.SIDE_CHARACTER,
    bio: 'A schoolteacher marking papers in the bar\u2019s quiet corner because his flat is too lonely. Orders one drink and makes it last three hours.',
    relationship: 'Léon never rushes him and Brendan has never said thank you out loud.',
    locationId: 'temple_ruins',
  },
  {
    id: 'hazel',
    name: 'Hazel',
    role: Role.SIDE_CHARACTER,
    bio: 'A herbalist supplying the community\u2019s tea blends and correcting its wilder health claims. Rigorous where it matters, indulgent where it does not.',
    relationship: 'Makes Léon a blend for sleep that he never remembers to drink.',
    locationId: 'community_garden',
  },
  {
    id: 'scatmandu',
    name: 'Scatmandu',
    role: Role.SIDE_CHARACTER,
    bio: 'A scat singer and vocal coach who warms up loudly in the bar\u2019s back alley. Believes the voice is the last honest instrument.',
    relationship: 'Tried to teach Léon to improvise. The results are a house legend.',
    locationId: 'radio_station',
  },
  {
    id: 'yungnosaj',
    name: 'yungnosaj',
    role: Role.SIDE_CHARACTER,
    bio: 'A producer making beats from field recordings, half of them taped inside the community hall. The rain-on-roof track has a small devoted following.',
    relationship:
      'Sampled one of Léon\u2019s guided meditations. It is, quietly, the most listened-to thing he has ever made.',
    locationId: 'rooftop',
  },
  {
    id: 'joar',
    name: 'Joar',
    role: Role.SIDE_CHARACTER,
    bio: 'A Nordic transplant who finds the local winters laughably mild and says so constantly. Swims outdoors year round and invites everyone, every time.',
    relationship: 'Has convinced Léon to join him exactly once. Léon maintains it was a mistake.',
    locationId: 'river_walk',
  },
  {
    id: 'lou',
    name: 'Lou',
    role: Role.SIDE_CHARACTER,
    bio: 'A retired bookseller who reads at the bar most evenings and recommends titles nobody asked about. Almost always correct about what you need.',
    relationship:
      'Gave Léon a battered book on impermanence. He has not finished it and cannot throw it out.',
    locationId: 'public_library',
  },
  {
    id: 'cat',
    name: 'Cat',
    role: Role.SIDE_CHARACTER,
    bio: 'An actual cat. Arrived during a winter storm three years ago, evaluated the meditation hall\u2019s underfloor heating, and elected to stay. Attends every session. Contributes nothing. Universally beloved.',
    relationship:
      'Sleeps on Léon\u2019s cushion whenever he stands up, which the community considers a teaching.',
    locationId: 'spiritual_community',
  },
];

/**
 * Build the full character list, with portrait paths and the human-readable
 * location name resolved.
 *
 * `location` is derived rather than stored so that renaming a place in
 * `locations.js` renames it for the whole cast in one edit, and so a typo in
 * `locationId` shows up as an obvious "Unknown" rather than as a stale but
 * plausible-looking string.
 */
export function createAllProfiles() {
  return RAW.map((c) => ({
    ...c,
    location: getLocation(c.locationId)?.name ?? 'Unknown',
    portrait: portraitFor(c.id),
    portraitHi: portraitHiFor(c.id),
  }));
}

/** Ids of everyone bound to a given location, in catalogue order. */
export function charactersAtLocation(locationId) {
  return RAW.filter((c) => c.locationId === locationId).map((c) => c.id);
}

/** Two-letter-ish initials, used as the portrait fallback. */
export function getInitials(displayName) {
  if (!displayName) return '?';
  const initials = displayName
    .split(' ')
    .filter(Boolean)
    .map((part) => [...part][0])
    .join('')
    .toUpperCase();
  // A whitespace-only or symbol-stripped name would otherwise render blank.
  return initials || '?';
}

/**
 * Things a host can say when Léon arrives. These are deliberately separate
 * from event copy and location descriptions: a visit is a small meeting, not
 * a dossier. The day-based picker keeps a line stable while a screen rerenders
 * and rotates it on future visits without consuming gameplay randomness.
 */
export const SMALL_TALK = Object.freeze({
  geo: Object.freeze([
    'The kettle is on. We can begin where the breath is.',
    'No need to make the day impressive. Just make it honest.',
    'You are allowed to arrive exactly as you are.',
  ]),
  barret: Object.freeze([
    'Apron is clean. The rest of the night can sort itself out.',
    'Good to see you, kid. There is a stool with your name on it.',
    'We have got enough lemons and just enough patience. Let us work.',
  ]),
  leon: Object.freeze([
    'The plants made it through the night. So did you.',
    'A slow breakfast still counts as keeping things going.',
    'The window is open a crack. The room can breathe.',
  ]),
  yume: Object.freeze([
    'The sky is doing most of the decorating today.',
    'I saved the quiet corner by the rail for you.',
    'Up here the city sounds like it is thinking before it speaks.',
  ]),
  susan: Object.freeze([
    'Drink some water before you tell me you are fine.',
    'The kettle is working. That is already a good sign.',
    'We will take this one person at a time.',
  ]),
  siekamcebule: Object.freeze([
    'There is always enough for one more bowl.',
    'Do not cry because of the onions. Cry because of the beautiful harmony of the soup.',
    'Pull up a chair. Standing all day is not a personality.',
  ]),
  joar: Object.freeze([
    'The river is cold, but it is not in a bad mood.',
    'Walk until your thoughts stop trying to win.',
    'I brought an extra thermos. Pretend this was planned.',
  ]),
  brock_lee: Object.freeze([
    'The tomatoes are finally deciding what they want to be.',
    'I am root-ing for you, Léon! Remember, lettuce always do our best.',
    'Mind the mint. It has global domination ambitions.',
  ]),
  ahyeon: Object.freeze([
    'The honey jars are lined up like they have somewhere to be.',
    'Take the good chair before somebody notices it is empty.',
    'A little haggling is just conversation with numbers.',
  ]),
  renata: Object.freeze([
    'The water will still be warm if you take your time.',
    'Nothing important happens quickly in here.',
    'Leave the clock outside. It does not know how to soak.',
  ]),
  cheezl: Object.freeze([
    'The first grill is hot. That is the whole plan so far.',
    'Eat something before midnight turns you into a philosopher.',
    'The best stall is the one that smells like somebody is happy.',
  ]),
  baris: Object.freeze([
    'Everything has a story. Most of them are negotiable.',
    'If it works, it is vintage. If it does not, it is a project.',
    'Keep your hands in your pockets until you know what you want.',
  ]),
  lou: Object.freeze([
    'I put aside a book with your sort of weather in it.',
    'The good table is free. The radiator is trying its best.',
    'You do not have to finish anything today to be here.',
  ]),
  stephen: Object.freeze([
    'No rush. The scale does not get impatient.',
    'Things can be useful and sentimental. We can hold both truths.',
    'I have heard worse weeks. Sit for a minute.',
  ]),
  hawkinstv: Object.freeze([
    'The red light means we are live. The rest is just talking.',
    'Someone out there needs to hear a human voice tonight.',
    'I found the cable that crackles. We are practically professionals.',
  ]),
  klaudia: Object.freeze([
    'The room is kind if you give it a chance.',
    'You can borrow my first chord if the silence gets too loud.',
    'Nobody remembers the perfect set. They remember the true one.',
  ]),
  kaden: Object.freeze([
    'I brought the revised forms. No urgency, of course.',
    'The waiting room is surprisingly comfortable today.',
    'A signature is only a mark on paper. That is what makes it interesting.',
  ]),
  sato: Object.freeze([
    'There is tea in the break room if you want the good kind.',
    'Your class had a nice rhythm last week. Do not let it go to your head.',
    'We can disagree without making a sport of it.',
  ]),
  alex: Object.freeze([
    'The garnish tray is labelled now. Try not to look so pleased.',
    'We are busy, not at war. Take the good ice.',
    'Your hands remember the work. Trust them.',
  ]),
  marlies: Object.freeze([
    'The roses do better when nobody rushes them.',
    'There is a bench in the shade with your name on it. Not literally.',
    'Some places ask you to speak softly. This is one of them.',
  ]),
  kopung: Object.freeze([
    'Three days, and the first one is only for putting the city down.',
    'The kiln does not care how busy you were. Neither do I.',
    'Take the bowl with the repair in it. It is the honest one.',
  ]),
  iulian: Object.freeze([
    'The stones have waited longer than either of us.',
    'Take the hill slowly. It will still be there at the top.',
    'Listen for the wind under the arch. It knows the old tune.',
  ]),
  brian: Object.freeze([
    'Welcome, welcome! The middle way is not in the middle — it is everywhere at once.',
    'Grin first, questions later. That is how we do it here.',
    'You knew me before the beard, Léon. Some things do not need to be explained twice.',
  ]),
});

/** Return a host-specific line for the given journey day. */
export function smallTalkFor(characterId, journeyDay = 1) {
  const lines = SMALL_TALK[characterId];
  if (!lines || lines.length === 0) return 'It is good to see you.';
  const offset = [...characterId].reduce((sum, char) => sum + char.codePointAt(0), 0);
  return lines[(Math.max(1, journeyDay) - 1 + offset) % lines.length];
}
