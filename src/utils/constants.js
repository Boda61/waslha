export const TEAMS = {
  red: { id: 'red', name: 'الفريق الأحمر', color: 'rose', emoji: '🔴' },
  blue: { id: 'blue', name: 'الفريق الأزرق', color: 'sky', emoji: '🔵' },
};

export const ROOM_STATUS = {
  lobby: 'lobby',
  playing: 'playing',
  ended: 'ended',
};

export const GAME_MODES = {
  teams: {
    id: 'teams',
    name: 'وضع الفريقين',
    shortName: 'فريقين',
    emoji: '⚔️',
    desc: 'القائد بيشوف الصورتين ويكتب التلميح، والفريقين يتسابقوا مين يجاوب الأول.',
  },
  solo: {
    id: 'solo',
    name: 'الكل لوحده',
    shortName: 'سولو',
    emoji: '⚡',
    desc: 'مفيش فرق — الكل بيلعب لوحده، وأول واحد يجاوب صح ياخد النقاط.',
  },
};

export const ROUND_STATUS = {
  leader: 'leader',
  clue_submitted: 'clue_submitted',
  revealed: 'revealed',
};

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 3;
export const MIN_PLAYERS_TEAMS = 3;
export const MIN_PLAYERS_SOLO = 2;
export const TOTAL_ROUNDS = 10;

// Minimum players required to start a game, per game mode.
export function minPlayersFor(mode) {
  return mode === 'solo' ? MIN_PLAYERS_SOLO : MIN_PLAYERS_TEAMS;
}

export const SCORING = {
  correctAnswer: 100,
  incorrectAnswer: 0,
  winningBonus: 500,
  correctPrediction: 20,
};

export const TIMERS = {
  answerSeconds: 30,
  resultSeconds: 8,
};

export const CHAT_LIMITS = {
  maxLength: 200,
};

export const AVATARS = ['🦁', '🐯', '🦊', '🐼', '🐸', '🐙', '🦄', '🐵', '🦉', '🐺'];
