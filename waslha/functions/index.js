const { onCall, HttpsError } = require('firebase-functions/v2/https');
const admin = require('firebase-admin');

admin.initializeApp();

const db = admin.firestore();

const { CHALLENGES } = require('./challenges-data.js');

// ---- Game constants (keep in sync with frontend constants) ----
const MAX_PLAYERS = 8;
const MIN_PLAYERS = 3;
const TOTAL_ROUNDS = 6;
const SCORING = { correctAnswer: 100, correctPrediction: 20 };

const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function assertAuth(context) {
  if (!context.auth) {
    throw new HttpsError('unauthenticated', 'لازم تسجل دخول الأول.');
  }
}

function assert(cond, message) {
  if (!cond) throw new HttpsError('failed-precondition', message);
}

function now() {
  return admin.firestore.FieldValue.serverTimestamp();
}

function randomCode() {
  let s = '';
  for (let i = 0; i < 5; i++) {
    s += CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)];
  }
  return s;
}

function sanitizeUsername(raw) {
  const v = String(raw || '').trim();
  if (v.length < 2 || v.length > 20) {
    throw new HttpsError('invalid-argument', 'الاسم لازم يبقى بين 2 و 20 حرف.');
  }
  if (!/^[\p{L}\p{N}_]+$/u.test(v)) {
    throw new HttpsError('invalid-argument', 'الاسم لازم حروف وأرقام بس.');
  }
  return v;
}

// Merge `data` into a players doc (used by chat for teams) — not needed now.

// ============================================================
// AUTH & PROFILE
// ============================================================

exports.registerUser = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const username = sanitizeUsername(request.data && request.data.username);
  const avatar = String((request.data && request.data.avatar) || '🦁').slice(0, 4);

  const lower = username.toLowerCase();
  const userRef = db.collection('users').doc(uid);
  const nameRef = db.collection('usernames').doc(lower);

  await db.runTransaction(async (t) => {
    const [nameSnap, userSnap] = await Promise.all([t.get(nameRef), t.get(userRef)]);
    if (nameSnap.exists) {
      throw new HttpsError('already-exists', 'الاسم ده متاخد. جرب اسم تاني.');
    }
    if (userSnap.exists) {
      throw new HttpsError('already-exists', 'حسابك اتسجل قبل كده.');
    }
    t.set(nameRef, { uid });
    t.set(userRef, {
      uid,
      username,
      avatar,
      email: request.auth.token.email || '',
      createdAt: now(),
      updatedAt: now(),
      stats: { gamesPlayed: 0, wins: 0 },
    });
  });
  return { ok: true };
});


exports.updateUsername = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const username = sanitizeUsername(request.data && request.data.username);
  const lower = username.toLowerCase();

  const userRef = db.collection('users').doc(uid);
  await db.runTransaction(async (t) => {
    const userSnap = await t.get(userRef);
    if (!userSnap.exists) throw new HttpsError('not-found', 'مفيش بروفايل ليك.');
    const old = userSnap.data().username;
    if (old && old.toLowerCase() !== lower) {
      const newNameRef = db.collection('usernames').doc(lower);
      const newSnap = await t.get(newNameRef);
      if (newSnap.exists && newSnap.data().uid !== uid) {
        throw new HttpsError('already-exists', 'الاسم ده متاخد.');
      }
      t.delete(db.collection('usernames').doc(old.toLowerCase()));
      t.set(newNameRef, { uid });
    }
    t.update(userRef, { username, updatedAt: now() });
  });
  return { ok: true };
});

exports.updateAvatar = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const avatar = String((request.data && request.data.avatar) || '').slice(0, 4);
  assert(avatar, 'اختار صورة.');
  await db.collection('users').doc(uid).update({ avatar, updatedAt: now() });
  return { ok: true };
});

// ============================================================
// ROOMS
// ============================================================

exports.createRoom = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const team = ['red', 'blue'].includes(request.data && request.data.team)
    ? request.data.team
    : 'red';

  const profileSnap = await db.collection('users').doc(uid).get();
  const profile = profileSnap.data();
  assert(profile, 'سجّل البروفايل الأول.');

  // Generate a unique code using a roomCodes lock doc.
  let roomId;
  let code;
  for (let i = 0; i < 10; i++) {
    code = randomCode();
    const lockRef = db.collection('roomCodes').doc(code);
    try {
      await lockRef.set({ roomId: '__pending__' }, { merge: false });
      break;
    } catch (e) {
      if (e.code === 6) continue; // already-exists conflict
      throw e;
    }
  }
  assert(code, 'مقدرناش نعمل كود دلوقتي، جرب تاني.');

  roomId = db.collection('rooms').doc().id;
  const roomRef = db.collection('rooms').doc(roomId);
  const playerRef = roomRef.collection('players').doc(uid);

  await db.runTransaction(async (t) => {
    t.set(roomRef, {
      code,
      hostId: uid,
      status: 'lobby',
      maxPlayers: MAX_PLAYERS,
      currentRound: 0,
      currentTurnTeam: null,
      roundId: null,
      redScore: 0,
      blueScore: 0,
      winner: null,
      winnerName: null,
      createdAt: now(),
      updatedAt: now(),
    });
    t.set(playerRef, {
      uid,
      username: profile.username,
      avatar: profile.avatar,
      team,
      isLeader: true,
      isReady: false,
      joinedAt: now(),
      online: true,
      score: 0,
    });
    t.set(db.collection('roomCodes').doc(code), { roomId });
  });

  return { roomId, code };
});


exports.joinRoom = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const code = String((request.data && request.data.code) || '').toUpperCase().trim();
  assert(code.length >= 4, 'الكود مش صحيح.');

  const codeSnap = await db.collection('roomCodes').doc(code).get();
  if (!codeSnap.exists) {
    throw new HttpsError('not-found', 'مفيش غرفة بالكود ده.');
  }
  const roomId = codeSnap.data().roomId;
  const roomRef = db.collection('rooms').doc(roomId);
  const roomSnap = await roomRef.get();
  if (!roomSnap.exists) {
    throw new HttpsError('not-found', 'الغرفة دي مش موجودة.');
  }
  const room = roomSnap.data();
  assert(room.status === 'lobby', 'الغرفة دي بدأت أو خلصت — متقدرش تدخل دلوقتي.');

  const profileSnap = await db.collection('users').doc(uid).get();
  assert(profileSnap.exists, 'سجّل البروفايل الأول.');

  const playersSnap = await roomRef.collection('players').get();
  const players = playersSnap.docs.map((d) => d.data());
  assert(players.length < room.maxPlayers, 'الغرفة مليانة.');

  const existing = players.find((p) => p.uid === uid);
  if (existing) {
    return { roomId };
  }

  // Balance teams; first member of a team becomes its leader.
  const counts = { red: 0, blue: 0 };
  players.forEach((p) => { if (p.team) counts[p.team] += 1; });
  const team = counts.red <= counts.blue ? 'red' : 'blue';
  const isLeader = counts[team] === 0;

  const profile = profileSnap.data();
  await roomRef.collection('players').doc(uid).set({
    uid,
    username: profile.username,
    avatar: profile.avatar,
    team,
    isLeader,
    isReady: false,
    joinedAt: now(),
    online: true,
    score: 0,
  });

  return { roomId };
});

exports.setTeam = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const { roomId, team } = request.data || {};
  assert(['red', 'blue'].includes(team), 'فريق غير صحيح.');
  const roomRef = db.collection('rooms').doc(roomId);
  const playerRef = roomRef.collection('players').doc(uid);

  await db.runTransaction(async (t) => {
    const roomSnap = await t.get(roomRef);
    assert(roomSnap.exists, 'مفيش غرفة.');
    assert(roomSnap.data().status === 'lobby', 'مفيش تغيير فريق بعد ما اللعبة بدأت.');

    const mySnap = await t.get(playerRef);
    assert(mySnap.exists, 'أنت مش في الغرفة.');
    const me = mySnap.data();
    if (me.team === team) return;

    const teamSnap = await t.get(roomRef.collection('players').where('team', '==', team));
    const joiningEmpty = teamSnap.size === 0;

    if (me.team && me.isLeader) {
      const oldTeamSnap = await t.get(
        roomRef.collection('players').where('team', '==', me.team).limit(10),
      );
      const others = oldTeamSnap.docs.map((d) => d.data()).filter((p) => p.uid !== uid);
      if (others.length > 0) {
        t.update(roomRef.collection('players').doc(others[0].uid), { isLeader: true });
      }
    }
    t.update(playerRef, { team, isLeader: false, isReady: false });

    if (joiningEmpty) {
      t.update(playerRef, { isLeader: true });
    }
  });
  return { ok: true };
});

exports.setReady = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const { roomId, ready } = request.data || {};
  const roomRef = db.collection('rooms').doc(roomId);
  const roomSnap = await roomRef.get();
  assert(roomSnap.exists && roomSnap.data().status === 'lobby', 'الغرفة مش في مرحلة التحضير.');
  const playerRef = roomRef.collection('players').doc(uid);
  await playerRef.set({ isReady: !!ready }, { merge: true });
  return { ok: true };
});


exports.leaveRoom = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const { roomId } = request.data || {};
  const roomRef = db.collection('rooms').doc(roomId);
  const playerRef = roomRef.collection('players').doc(uid);

  await db.runTransaction(async (t) => {
    const roomSnap = await t.get(roomRef);
    if (!roomSnap.exists) return;
    const room = roomSnap.data();
    const meSnap = await t.get(playerRef);
    if (
      meSnap.exists &&
      meSnap.data().isLeader &&
      room.status === 'lobby'
    ) {
      const teamSnap = await t.get(
        roomRef.collection('players').where('team', '==', meSnap.data().team).limit(10),
      );
      const others = teamSnap.docs.map((d) => d.data()).filter((p) => p.uid !== uid);
      if (others.length > 0) {
        t.update(roomRef.collection('players').doc(others[0].uid), { isLeader: true });
      }
    }
    t.delete(playerRef);
    const remaining = await t.get(roomRef.collection('players'));
    if (remaining.size === 0) {
      t.delete(roomRef);
      try { t.delete(db.collection('roomCodes').doc(room.code)); } catch { /* noop */ }
    } else if (room.hostId === uid) {
      t.update(roomRef, { hostId: remaining.docs[0].id, updatedAt: now() });
    }
  });
  return { ok: true };
});

// ============================================================
// GAME
// ============================================================

// If the challenges collection is empty, seed it server-side (idempotent:
// uses deterministic IDs so re-running never creates duplicates).
async function ensureChallenges(t) {
  const snap = await t.get(db.collection('challenges').limit(1));
  if (snap.size > 0) return;
  for (const c of CHALLENGES) {
    const { correctIndex, ...publicData } = c;
    t.set(db.collection('challenges').doc(c.id), { ...publicData, active: true });
    t.set(db.collection('challengeSecrets').doc(c.id), { correctIndex });
  }
}

async function pickChallenge(t) {
  const snap = await t.get(db.collection('challenges').where('active', '==', true));
  const docs = snap.docs;
  if (docs.length === 0) {
    throw new HttpsError('unavailable', 'مفيش تحديات جاهزة لسه.');
  }
  return docs[Math.floor(Math.random() * docs.length)];
}

async function createRound(t, roomRef, room, roundNumber, team) {
  const teamSnap = await t.get(roomRef.collection('players').where('team', '==', team));
  const teamPlayers = teamSnap.docs.map((d) => d.data());
  const leader = teamPlayers.find((p) => p.isLeader) || teamPlayers[0];
  assert(leader, 'الفريق ده مفيش فيه لاعيبة.');

  const challengeSnap = await pickChallenge(t);
  const roundRef = roomRef.collection('rounds').doc();
  t.set(roundRef, {
    roundNumber,
    activeTeam: team,
    leaderId: leader.uid,
    challengeId: challengeSnap.id,
    clue: null,
    status: 'leader',
    selectedChoiceIndex: null,
    selectedAnswer: null,
    submittedBy: null,
    correctIndex: null,
    correctAnswer: null,
    result: null,
    scoreDelta: 0,
    startedAt: now(),
    clueSubmittedAt: null,
    answeredAt: null,
    endedAt: null,
  });
  t.update(roomRef, {
    currentRound: roundNumber,
    currentTurnTeam: team,
    roundId: roundRef.id,
    updatedAt: now(),
  });
  return roundRef.id;
}

exports.startGame = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const { roomId } = request.data || {};
  const roomRef = db.collection('rooms').doc(roomId);
  const roomSnap = await roomRef.get();
  assert(roomSnap.exists, 'مفيش غرفة.');
  const room = roomSnap.data();
  assert(room.hostId === uid, 'انت مش صاحب الغرفة.');
  assert(room.status === 'lobby', 'اللعبة بدأت بالفعل.');

  const playersSnap = await roomRef.collection('players').get();
  const players = playersSnap.docs.map((d) => d.data());
  assert(players.length >= MIN_PLAYERS, `لازم ${MIN_PLAYERS} لاعب على الأقل.`);
  assert(players.every((p) => p.isReady), 'مش كل اللاعيبة جاهزين.');
  const hasRed = players.some((p) => p.team === 'red');
  const hasBlue = players.some((p) => p.team === 'blue');
  assert(hasRed && hasBlue, 'لازم في لاعب واحد على الأقل في كل فريق.');

  await db.runTransaction(async (t) => {
    await ensureChallenges(t);
    t.update(roomRef, {
      status: 'playing',
      redScore: 0,
      blueScore: 0,
      winner: null,
      winnerName: null,
      updatedAt: now(),
    });
    await createRound(t, roomRef, room, 1, 'red');
  });
  return { ok: true };
});


exports.submitClue = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const { roomId, roundId, clue } = request.data || {};
  const clueText = String(clue || '').trim();
  assert(clueText.length >= 1 && clueText.length <= 40, 'التلميح لازم يبقى بين 1 و 40 حرف.');

  const roomRef = db.collection('rooms').doc(roomId);
  const roundRef = roomRef.collection('rounds').doc(roundId);

  await db.runTransaction(async (t) => {
    const roomSnap = await t.get(roomRef);
    assert(roomSnap.exists, 'مفيش غرفة.');
    const room = roomSnap.data();
    assert(room.status === 'playing', 'اللعبة مش شغالة.');
    assert(room.roundId === roundId, 'دي مش الجولة الحالية.');

    const roundSnap = await t.get(roundRef);
    assert(roundSnap.exists, 'مفيش جولة.');
    const round = roundSnap.data();
    assert(round.status === 'leader', 'التلميح اتسلم من قبل كده.');
    assert(round.leaderId === uid, 'انت مش قائد الجولة.');

    t.update(roundRef, {
      clue: clueText,
      status: 'clue_submitted',
      clueSubmittedAt: now(),
    });
  });
  return { ok: true };
});

exports.submitAnswer = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const { roomId, roundId, choiceIndex } = request.data || {};
  assert(Number.isInteger(choiceIndex) && choiceIndex >= 0 && choiceIndex <= 3, 'اختيار غير صحيح.');

  const roomRef = db.collection('rooms').doc(roomId);
  const roundRef = roomRef.collection('rounds').doc(roundId);

  const result = await db.runTransaction(async (t) => {
    const roomSnap = await t.get(roomRef);
    assert(roomSnap.exists, 'مفيش غرفة.');
    const room = roomSnap.data();
    assert(room.status === 'playing', 'اللعبة مش شغالة.');
    assert(room.roundId === roundId, 'دي مش الجولة الحالية.');

    const roundSnap = await t.get(roundRef);
    assert(roundSnap.exists, 'مفيش جولة.');
    const round = roundSnap.data();
    assert(round.status !== 'leader', 'القائد لسه مبعتش التلميح.');
    assert(round.selectedChoiceIndex === null, 'الإجابة اتسجلت قبل كده — ممنوع تكرر.');
    assert(round.activeTeam === 'red' || round.activeTeam === 'blue', 'فريق غير صحيح.');
    assert(round.activeTeam === room.currentTurnTeam, 'الجولة دي خلصت.');

    // Only active team members may answer.
    const meSnap = await t.get(roomRef.collection('players').doc(uid));
    assert(meSnap.exists, 'أنت مش في الغرفة.');
    const me = meSnap.data();
    assert(me.team === round.activeTeam, 'الفريق التاني مش بيجاوب.');

    // Leader cannot answer on behalf of the team, unless he's alone on it.
    const teamSnap = await t.get(roomRef.collection('players').where('team', '==', round.activeTeam));
    const activeTeamSize = teamSnap.size;
    if (uid === round.leaderId && activeTeamSize > 1) {
      throw new HttpsError('permission-denied', 'انت القائد — متختارش نيابة عن الفريق.');
    }

    // Read the protected correct answer index.
    const secretSnap = await t.get(db.collection('challengeSecrets').doc(round.challengeId));
    assert(secretSnap.exists, 'الإجابة السرية مش موجودة — اتصل بالأدمن.');
    const correctIndex = secretSnap.data().correctIndex;

    const challengeSnap = await t.get(db.collection('challenges').doc(round.challengeId));
    const challenge = challengeSnap.data();
    const correct = choiceIndex === correctIndex;
    const scoreDelta = correct ? SCORING.correctAnswer : 0;

    t.update(roundRef, {
      status: 'revealed',
      selectedChoiceIndex: choiceIndex,
      selectedAnswer: challenge.choices[choiceIndex],
      submittedBy: uid,
      correctIndex,
      correctAnswer: challenge.choices[correctIndex],
      result: correct ? 'correct' : 'incorrect',
      scoreDelta,
      answeredAt: now(),
      endedAt: now(),
    });

    // Update team score + submitter individual score.
    const scoreField = round.activeTeam === 'red' ? 'redScore' : 'blueScore';
    t.update(roomRef, {
      [scoreField]: (room[scoreField] || 0) + scoreDelta,
      updatedAt: now(),
    });
    t.update(roomRef.collection('players').doc(uid), {
      score: (me.score || 0) + scoreDelta,
      online: true,
    });

    // Reward correct predictions for the OPPOSITE team.
    const playersSnap = await t.get(roomRef.collection('players'));
    const predSnap = await t.get(roundRef.collection('predictions'));
    for (const predDoc of predSnap.docs) {
      const pred = predDoc.data();
      if (pred.choiceIndex === correctIndex && pred.uid) {
        const p = playersSnap.docs.find((d) => d.id === pred.uid);
        if (p) {
          t.update(roomRef.collection('players').doc(pred.uid), {
            score: (p.data().score || 0) + SCORING.correctPrediction,
          });
        }
      }
    }

    return { correct, correctIndex, scoreDelta };
  });

  return result;
});


exports.submitPrediction = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const { roomId, roundId, choiceIndex } = request.data || {};
  assert(Number.isInteger(choiceIndex) && choiceIndex >= 0 && choiceIndex <= 3, 'اختيار غير صحيح.');

  const roomRef = db.collection('rooms').doc(roomId);
  const roundRef = roomRef.collection('rounds').doc(roundId);
  const predRef = roundRef.collection('predictions').doc(uid);

  await db.runTransaction(async (t) => {
    const roomSnap = await t.get(roomRef);
    assert(roomSnap.exists, 'مفيش غرفة.');
    const room = roomSnap.data();
    assert(room.status === 'playing', 'اللعبة مش شغالة.');
    assert(room.roundId === roundId, 'دي مش الجولة الحالية.');

    const meSnap = await t.get(roomRef.collection('players').doc(uid));
    assert(meSnap.exists, 'أنت مش في الغرفة.');
    const me = meSnap.data();

    const roundSnap = await t.get(roundRef);
    assert(roundSnap.exists, 'مفيش جولة.');
    const round = roundSnap.data();
    assert(round.status === 'clue_submitted', 'التوقع متاح بس في وقت الإجابة.');

    // Only the OPPOSITE team predicts (never the active team).
    assert(me.team !== round.activeTeam, 'الفريق اللي عليه الدور مش بيعمل توقعات.');

    const predSnap = await t.get(predRef);
    assert(!predSnap.exists, 'لما تعمل توقع تقدرش تغيره خالص.');

    t.set(predRef, { uid, choiceIndex, createdAt: now() });
  });
  return { ok: true };
});

exports.nextRound = onCall(async (request) => {
  assertAuth(request);
  const uid = request.auth.uid;
  const { roomId, roundId } = request.data || {};
  const roomRef = db.collection('rooms').doc(roomId);

  await db.runTransaction(async (t) => {
    const roomSnap = await t.get(roomRef);
    assert(roomSnap.exists, 'مفيش غرفة.');
    const room = roomSnap.data();
    assert(room.hostId === uid, 'انت مش صاحب الغرفة.');
    assert(room.status === 'playing', 'اللعبة مش شغالة.');
    assert(room.roundId === roundId, 'في جولة أحدث من كده.');

    if (room.currentRound >= TOTAL_ROUNDS) {
      // ---- Finish the game ----
      const red = room.redScore || 0;
      const blue = room.blueScore || 0;
      let winner = null;
      let winnerName = null;
      if (red > blue) {
        winner = 'red';
        winnerName = 'الفريق الأحمر';
      } else if (blue > red) {
        winner = 'blue';
        winnerName = 'الفريق الأزرق';
      } else {
        winner = 'tie';
        winnerName = 'تعادل';
      }
      t.update(roomRef, {
        status: 'ended',
        winner,
        winnerName,
        updatedAt: now(),
      });

      // Update user stats (games played + wins).
      const playersSnap = await t.get(roomRef.collection('players'));
      for (const pDoc of playersSnap.docs) {
        const uid_ = pDoc.id;
        const userRef = db.collection('users').doc(uid_);
        const userSnap = await t.get(userRef);
        if (!userSnap.exists) continue;
        const stats = userSnap.data().stats || {};
        const patch = {
          'stats.gamesPlayed': (stats.gamesPlayed || 0) + 1,
        };
        if (winner !== 'tie' && pDoc.data().team === winner) {
          patch['stats.wins'] = (stats.wins || 0) + 1;
        }
        t.update(userRef, { ...patch, updatedAt: now() });
      }
      return;
    }

    // ---- Start the next round and switch teams ----
    const nextTeam = room.currentTurnTeam === 'red' ? 'blue' : 'red';
    await createRound(t, roomRef, room, room.currentRound + 1, nextTeam);
  });
  return { ok: true };
});

