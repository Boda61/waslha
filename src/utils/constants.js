export const TEAMS = {
  red: { id: 'red', name: 'الفريق الأحمر', color: 'rose', emoji: '🔴' },
  blue: { id: 'blue', name: 'الفريق الأزرق', color: 'sky', emoji: '🔵' },
};

export const ROOM_STATUS = {
  lobby: 'lobby',
  playing: 'playing',
  ended: 'ended',
};

export const ROUND_STATUS = {
  leader: 'leader',
  clue_submitted: 'clue_submitted',
  revealed: 'revealed',
};

export const MAX_PLAYERS = 8;
export const MIN_PLAYERS = 3;
export const TOTAL_ROUNDS = 6;

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
