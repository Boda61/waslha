import { useEffect, useState, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';
import LoadingScreen from '../components/LoadingScreen.jsx';
import Lobby from './room/Lobby.jsx';
import GameScreen from './room/GameScreen.jsx';
import {
  subscribeRoom,
  subscribePlayers,
  subscribeRound,
  subscribeChallenge,
  setTeam,
  setReady,
  setTeamLeader,
  transferHost,
  leaveRoom,
  setOnline,
} from '../services/roomService.js';
import {
  startGame,
  submitClue,
  submitAnswer,
  submitPrediction,
  nextRound,
  expireRound,
  subscribePredictions,
} from '../services/gameService.js';
import { ROOM_STATUS } from '../utils/constants.js';

export default function RoomPage() {
  const { roomId } = useParams();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { push } = useToast();

  const [room, setRoom] = useState(null);
  const [players, setPlayers] = useState([]);
  const [round, setRound] = useState(null);
  const [challenge, setChallenge] = useState(null);
  const [predictions, setPredictions] = useState([]);
  const [notFound, setNotFound] = useState(false);
  const [leaving, setLeaving] = useState(false);

  // Listeners
  useEffect(() => {
    if (!roomId) {
      setNotFound(true);
      return undefined;
    }
    const unsubRoom = subscribeRoom(
      roomId,
      (r) => {
        if (!r) {
          setNotFound(true);
          return;
        }
        setRoom(r);
        setNotFound(false);
      },
      () => setNotFound(true),
    );
    const unsubPlayers = subscribePlayers(roomId, setPlayers);
    return () => {
      unsubRoom();
      unsubPlayers();
    };
  }, [roomId]);

  // Presence
  useEffect(() => {
    if (!user) return undefined;
    setOnline(roomId, user.id, true).catch(() => {});
    const onUnload = () => {
      setOnline(roomId, user.id, false).catch(() => {});
    };
    window.addEventListener('beforeunload', onUnload);
    return () => {
      window.removeEventListener('beforeunload', onUnload);
    };
  }, [roomId, user]);

  // Current round + challenge + predictions (only while playing or ended)
  const playingOrEnded = room && room.status !== ROOM_STATUS.lobby;
  useEffect(() => {
    if (!playingOrEnded || !room.roundId) {
      setRound(null);
      setChallenge(null);
      setPredictions([]);
      return undefined;
    }
    const unsubRound = subscribeRound(roomId, room.roundId, setRound);
    const unsubPred = subscribePredictions(roomId, room.roundId, setPredictions);
    return () => {
      unsubRound();
      unsubPred();
    };
  }, [roomId, playingOrEnded, room?.roundId]);

  useEffect(() => {
    if (!round?.challengeId) {
      setChallenge(null);
      return undefined;
    }
    return subscribeChallenge(round.challengeId, setChallenge);
  }, [round?.challengeId]);

  const myPlayer = user ? players.find((p) => p.userId === user.id) : null;
  const isHost = !!room && room.hostId === user?.id;

  const handleLeave = useCallback(async () => {
    if (leaving) return;
    setLeaving(true);
    try {
      await leaveRoom(roomId);
      navigate('/');
    } catch (err) {
      push(err.message, 'error');
      setLeaving(false);
    }
  }, [roomId, navigate, push, leaving]);

  const handleSetTeam = (team) => setTeam(roomId, team);
  const handleSetReady = (ready) => setReady(roomId, ready);
  const handleSetLeader = async (targetUserId) => {
    try {
      await setTeamLeader(roomId, targetUserId);
    } catch (err) {
      push(err.message, 'error');
    }
  };
  const handleTransferHost = async (newHostId) => {
    try {
      await transferHost(roomId, newHostId);
    } catch (err) {
      push(err.message, 'error');
    }
  };
  const handleStart = async () => {
    try {
      await startGame(roomId);
    } catch (err) {
      push(err.message, 'error');
    }
  };

  const handleSubmitClue = async (clue) => {
    try {
      await submitClue(roomId, room.roundId, clue);
    } catch (err) {
      console.error('submit_clue error:', err);
      push(err.message, 'error');
    }
  };

  const handleSubmitAnswer = async (choiceIndex) => {
    try {
      await submitAnswer(roomId, room.roundId, choiceIndex);
    } catch (err) {
      console.error('submit_answer error:', err);
      push(err.message, 'error');
      throw err;
    }
  };

  const handleSubmitPrediction = async (choiceIndex) => {
    try {
      await submitPrediction(roomId, room.roundId, choiceIndex);
    } catch (err) {
      console.error('submit_prediction error:', err);
      push(err.message, 'error');
    }
  };
  const handleNextRound = async () => {
    try {
      await nextRound(roomId, room.roundId);
    } catch (err) {
      push(err.message, 'error');
    }
  };

  const handleExpireRound = async () => {
    try {
      await expireRound(roomId, room.roundId);
    } catch (err) {
      push(err.message, 'error');
    }
  };

  if (notFound) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="text-6xl">🚪</span>
        <h1 className="mt-4 text-2xl font-black text-white">الغرفة دي مش موجودة</h1>
        <p className="mt-2 text-slate-400">يمكن الغرفة خلصت أو اتلغت.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-6 rounded-xl bg-brand-500 px-6 py-3 font-bold text-night-950 hover:bg-brand-400"
        >
          ارجع للرئيسية
        </button>
      </div>
    );
  }

  // Invalid or missing room ID
  if (!roomId) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="text-6xl">❌</span>
        <h1 className="mt-4 text-2xl font-black text-white">معرّف الغرفة غير صحيح</h1>
        <p className="mt-2 text-slate-400">الكود ده مش متاح. تأكد من رابط الغرفة.</p>
        <button
          onClick={() => navigate('/')}
          className="mt-6 rounded-xl bg-brand-500 px-6 py-3 font-bold text-night-950 hover:bg-brand-400"
        >
          ارجع للرئيسية
        </button>
      </div>
    );
  }

  if (!room) return <LoadingScreen label="بنفتح الغرفة..." />;

  // Not a member of this room
  if (!myPlayer) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center">
        <span className="text-6xl">🔒</span>
        <h1 className="mt-4 text-2xl font-black text-white">أنت مش في الغرفة دي</h1>
        <p className="mt-2 text-slate-400">الغرفة دي خاصة بأعضائها بس.</p>
        <button
          onClick={() => navigate('/join')}
          className="mt-6 rounded-xl bg-brand-500 px-6 py-3 font-bold text-night-950 hover:bg-brand-400"
        >
          ادخل بكود
        </button>
      </div>
    );
  }

  if (room.status === ROOM_STATUS.lobby) {
    return (
      <Lobby
        room={room}
        players={players}
        myPlayer={myPlayer}
        isHost={isHost}
        onSetTeam={handleSetTeam}
        onSetReady={handleSetReady}
        onSetLeader={handleSetLeader}
        onTransferHost={handleTransferHost}
        onStartGame={handleStart}
        onLeave={handleLeave}
      />
    );
  }

  return (
    <GameScreen
      room={room}
      players={players}
      round={round}
      challenge={challenge}
      predictions={predictions}
      myPlayer={myPlayer}
      onSubmitClue={handleSubmitClue}
      onSubmitAnswer={handleSubmitAnswer}
      onSubmitPrediction={handleSubmitPrediction}
      onNextRound={handleNextRound}
      onExpireRound={handleExpireRound}
      onLeave={handleLeave}
      leaving={leaving}
    />
  );
}
