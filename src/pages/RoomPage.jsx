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
  leaveRoom,
  setOnline,
} from '../services/roomService.js';
import {
  startGame,
  submitClue,
  submitAnswer,
  submitPrediction,
  nextRound,
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

  // Listeners
  useEffect(() => {
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
    setOnline(roomId, user.uid, true).catch(() => {});
    const onUnload = () => {
      setOnline(roomId, user.uid, false).catch(() => {});
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

  const myPlayer = user ? players.find((p) => p.id === user.uid) : null;
  const isHost = !!room && room.hostId === user?.uid;

  const handleLeave = useCallback(async () => {
    try {
      await leaveRoom(roomId);
    } catch (err) {
      push(err.message, 'error');
    } finally {
      navigate('/');
    }
  }, [roomId, navigate, push]);

  const handleSetTeam = (team) => setTeam(roomId, team);
  const handleSetReady = (ready) => setReady(roomId, ready);
  const handleStart = async () => {
    try {
      await startGame(roomId);
    } catch (err) {
      push(err.message, 'error');
    }
  };

  const handleSubmitClue = (clue) => submitClue(roomId, room.roundId, clue);
  const handleSubmitAnswer = (choiceIndex) => submitAnswer(roomId, room.roundId, choiceIndex);
  const handleSubmitPrediction = (choiceIndex) => submitPrediction(roomId, room.roundId, choiceIndex);
  const handleNextRound = async () => {
    try {
      await nextRound(roomId, room.roundId);
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
    />
  );
}
