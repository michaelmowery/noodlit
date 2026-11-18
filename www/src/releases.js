// Release notes, newest first. Shown in About → What's new, and the newest unseen items appear
// on the "New version released" note.
//
// Entries are dated, not numbered: version numbers are stamped at deploy (see about.js), so a PR
// can't know its own. To add notes, put your lines in the entry for the day it ships (add a new
// entry at the top if there isn't one). Each item is [headline, detail] or a plain string. Keep
// them short and written for the person using the app, not for developers.

export const RELEASES = [
  {
    date: '2026-11-18',
    items: [
      ['Noodlit Plus', 'Plus scenes and Rainbow ink now come with Noodlit Plus, available in the iPhone and iPad app. Free scenes stay free, and Show me still plays on every scene. Open About and tap Noodlit Plus.'],
    ],
  },
  {
    date: '2026-11-17',
    items: [
      ['A proper welcome', 'Noodlit is out of preview. The first-visit note now simply says welcome, and About has a Say hello section for ideas and bugs.'],
    ],
  },
  {
    date: '2026-11-16',
    items: [
      ['Just Free and Plus', 'Simpler plans: every scene is now either Free or Plus. The scenes that were Premium are part of Plus.'],
    ],
  },
  {
    date: '2026-11-15',
    items: [
      ['What\'s new', 'See what changed in each update, right here. Open About and tap What\'s new.'],
      ['Rainbow ink', 'A new Plus ink whose colour shifts as you draw. Find it in the brush picker.'],
      ['Scratch art', 'Scrape through the black to find one of seven painted pictures, different each time.'],
    ],
  },
  {
    date: '2026-11-12',
    title: 'A big day: three new modes',
    items: [
      ['Reveal, Stir and Echo', 'Uncover something, swirl it away, or hear it played back. Try Scratch card, Bubble wrap, Latte art, Flush, Galaxy, Canyon echo, Neon sign, Music box and more.'],
      ['Become', 'Pause, and your lines turn into Fireflies, Constellations, Blooms or Thaw.'],
      ['More Fade scenes', 'Breath on glass, Ink in water, Fireworks and Starfield.'],
      ['A tidier scene menu', 'Featured scenes on top, one A to Z list or grouped by type, and tiles tinted by mode.'],
      ['Show me', 'Every scene can demo itself, and Show me everything gives the full tour.'],
      ['Preferences', 'Choose your start scene, fade speed, brush, sound and more. Open it from About.'],
      ['Brushes and tips', 'Every scene has brushes from fine to bold, with a round or flat tip.'],
      ['Undo', 'Take back the last stroke on Release scenes with the tray button, a two-finger tap, or Ctrl/Cmd+Z.'],
      ['Typing', 'Tap where your words should go, and drag them to move.'],
      ['Prompts', 'Over 70 question prompts in a bubble, with back and next arrows.'],
      ['Little things', 'A brush-sized cursor for mouse and pen, Canyon echo answers three times, sounds hush when you pause, and Starfield fades a bit quicker.'],
      ['Updates and privacy', 'Check for updates in About, and anonymous usage counts you can turn off in Preferences.'],
    ],
  },
  {
    date: '2026-11-11',
    title: 'Noodlit goes live',
    items: [
      ['noodlit.app', 'Open it in any browser and add it to your home screen.'],
      ['Release mode', 'Write it down, then send it off: Stream, Message in a bottle, Mailbox, Burning page, Paper boat and more.'],
      ['Scene menu', 'Over two dozen scenes in one place, from Shower door to Campfire.'],
      ['Type it out', 'Write with the keyboard on any surface.'],
      ['Sounds, inks and speed', 'Scene sounds, ink colours, and a fade speed slider from Drift to Rush.'],
    ],
  },
  {
    date: '2026-11-08',
    title: 'Where it started',
    items: [
      'A foggy shower door. Write in the steam, and the fog quietly takes it back.',
    ],
  },
];
