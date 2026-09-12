import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { supabase } from '../lib/Supabase.js';

// ┌─────────────────────────────────────────────────────────────────────────┐
// │  useVoiceCall — WebRTC live audio between the two Hebd players.         │
// │                                                                         │
// │  * Peer-to-peer via RTCPeerConnection (never stored / recorded).        │
// │  * Supabase Realtime broadcast is used ONLY as the signaling channel.   │
// │  * Mic is opt-in: the user presses the 🎙️ button (no auto-enable).      │
// │  * Mute toggles `track.enabled` — never recreates the connection.       │
// │  * All resources are torn down on cleanup (unmount / leave / end).      │
// └─────────────────────────────────────────────────────────────────────────┘

const VOICE_SIGNAL_EVENT = 'signal';

// Map RTCPeerConnection states to our simple UI states.
function mapConnectionState(state) {
  switch (state) {
    case 'connected':
      return 'connected';
    case 'connecting':
    case 'new':
      return 'connecting';
    case 'closed':
    case 'disconnected':
      return 'idle';
    default:
      return 'error';
  }
}

export default function useVoiceCall({ enabled, roomId, myUserId, peerUserId, onError }) {
  const [status, setStatus] = useState('idle'); // idle | requesting | connecting | connected | error
  const [micOn, setMicOn] = useState(false);
  const [remoteSpeaking, setRemoteSpeaking] = useState(false);
  const [error, setError] = useState('');

  // Refs — keep the live WebRTC state out of React re-renders.
  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const channelRef = useRef(null);
  const remoteAudioRef = useRef(null);
  const audioCtxRef = useRef(null);
  const sourceNodeRef = useRef(null);
  const rafIdRef = useRef(null);
  const pendingCandidatesRef = useRef([]);
  const remoteDescriptionSetRef = useRef(false);

  // Both players compute the same answer: the higher user_id is the offerer.
  const amOfferer = useMemo(
    () => !!myUserId && !!peerUserId && myUserId > peerUserId,
    [myUserId, peerUserId],
  );

  const isSupported = typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia;

  const sendSignal = useCallback(
    async (type, payload = {}) => {
      if (!channelRef.current) return;
      await channelRef.current.send({
        type: 'broadcast',
        event: VOICE_SIGNAL_EVENT,
        payload: { from: myUserId, roomId, type, ...payload },
      });
    },
    [myUserId, roomId],
  );

  // ── Signaling message handling ────────────────────────────────────────────
  const handleSignal = useCallback(
    async (payload) => {
      const pc = pcRef.current;
      // Security: only accept messages from THIS room and from the real peer.
      if (!pc || payload.roomId !== roomId || payload.from !== peerUserId) return;

      const { type } = payload;

      try {
        if (type === 'offer' && !amOfferer) {
          await pc.setRemoteDescription(payload.description);
          remoteDescriptionSetRef.current = true;
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await sendSignal('answer', { description: pc.localDescription });
        } else if (type === 'answer' && amOfferer) {
          await pc.setRemoteDescription(payload.description);
          remoteDescriptionSetRef.current = true;
          // Flush candidates that arrived before the remote description.
          for (const candidate of pendingCandidatesRef.current.splice(0)) {
            await pc.addIceCandidate(candidate).catch(() => {});
          }
        } else if (type === 'ready' && amOfferer && !remoteDescriptionSetRef.current) {
          // The peer started later and missed our first offer — resend it.
          const offer = await pc.createOffer();
          await pc.setLocalDescription(offer);
          await sendSignal('offer', { description: pc.localDescription });
        } else if (type === 'ice-candidate' && payload.candidate) {
          if (!remoteDescriptionSetRef.current) {
            pendingCandidatesRef.current.push(payload.candidate);
          } else {
            await pc.addIceCandidate(payload.candidate).catch(() => {});
          }
        }
      } catch (err) {
        console.error('voice signal error:', err);
      }
    },
    [amOfferer, peerUserId, roomId, sendSignal],
  );
// ── Remote speaking indicator (optional, via WebAudio analyser) ──────────
  const stopAnalyser = useCallback(() => {
    if (rafIdRef.current) cancelAnimationFrame(rafIdRef.current);
    rafIdRef.current = null;
    if (sourceNodeRef.current) {
      sourceNodeRef.current.disconnect();
      sourceNodeRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    setRemoteSpeaking(false);
  }, []);

  const startAnalyser = useCallback(
    (remoteStream) => {
      stopAnalyser();
      try {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioCtx();
        const source = ctx.createMediaStreamSource(remoteStream);
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 256;
        source.connect(analyser);
        audioCtxRef.current = ctx;
        sourceNodeRef.current = source;

        const data = new Uint8Array(analyser.frequencyBinCount);
        const loop = () => {
          analyser.getByteFrequencyData(data);
          let sum = 0;
          for (let i = 0; i < data.length; i += 1) sum += data[i];
          // A low threshold indicates speech; silence stays near zero.
          setRemoteSpeaking(sum / data.length > 18);
          rafIdRef.current = requestAnimationFrame(loop);
        };
        rafIdRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error('voice analyser not available:', err);
        setRemoteSpeaking(false);
      }
    },
    [stopAnalyser],
  );

  // ── Full cleanup ──────────────────────────────────────────────────────────
  const closeCall = useCallback(() => {
    if (pcRef.current) {
      pcRef.current.onicecandidate = null;
      pcRef.current.ontrack = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    if (remoteAudioRef.current) {
      remoteAudioRef.current.pause();
      remoteAudioRef.current.srcObject = null;
      remoteAudioRef.current.remove();
      remoteAudioRef.current = null;
    }
    stopAnalyser();
    pendingCandidatesRef.current = [];
    remoteDescriptionSetRef.current = false;
    setStatus('idle');
    setMicOn(false);
    setError('');
  }, [stopAnalyser]);

  // ── Start call (user-initiated from the 🎙️ button) ───────────────────────
  const startCall = useCallback(async () => {
    if (!enabled || !roomId || !myUserId || !peerUserId) {
      setError('محتاجين لاعبين في اللعبة عشان تتكلموا.');
      setStatus('error');
      return;
    }
    if (!isSupported) {
      setStatus('error');
      setError('المتصفح الحالي لا يدعم المحادثة الصوتية.');
      return;
    }
    if (pcRef.current) return; // already connecting

    setError('');
    setStatus('requesting');
    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
    } catch (err) {
      console.error('getUserMedia error:', err);
      setStatus('error');
      setError('محتاجين صلاحية المايك عشان تقدر تتكلم مع اللاعب الآخر.');
      return;
    }
    streamRef.current = stream;
    setMicOn(true);
    setStatus('connecting');

    const pc = new RTCPeerConnection();
    pcRef.current = pc;

    pc.onicecandidate = (event) => {
      if (event.candidate) {
        sendSignal('ice-candidate', { candidate: event.candidate }).catch(() => {});
      }
    };
    pc.ontrack = (event) => {
      const [remoteStream] = event.streams;
      if (!remoteStream) return;
      // Attach the remote audio to a hidden audio element.
      if (!remoteAudioRef.current) {
        const audioEl = document.createElement('audio');
        audioEl.autoplay = true;
        audioEl.setAttribute('playsinline', '');
        audioEl.className = 'hidden';
        document.body.appendChild(audioEl);
        remoteAudioRef.current = audioEl;
      }
      remoteAudioRef.current.srcObject = remoteStream;
      remoteAudioRef.current.play().catch(() => {});
      startAnalyser(remoteStream);
    };
    pc.onconnectionstatechange = () => {
      setStatus(mapConnectionState(pc.connectionState));
    };

    streamRef.current.getTracks().forEach((track) => pc.addTrack(track, streamRef.current));

    // Join the room-wide signaling channel.
    const channel = supabase
      .channel(`hebd-voice-${roomId}`)
      .on('broadcast', { event: VOICE_SIGNAL_EVENT }, ({ payload }) => {
        handleSignal(payload);
      })
      .subscribe();
    channelRef.current = channel;

    // The higher user_id creates the offer; the other answers.
    if (amOfferer) {
      try {
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        await sendSignal('offer', { description: pc.localDescription });
      } catch (err) {
        console.error('createOffer error:', err);
        closeCall();
        setStatus('error');
        setError('حصلت مشكلة في بداية الاتصال الصوتي.');
      }
    } else {
      // Tell the offerer we are online so they (re)send their offer.
      sendSignal('ready').catch(() => {});
    }
  }, [
    amOfferer,
    closeCall,
    enabled,
    handleSignal,
    isSupported,
    myUserId,
    peerUserId,
    roomId,
    sendSignal,
    startAnalyser,
  ]);

  // ── Mute / unmute (toggle track.enabled only, never recreate the PC) ─────
  const toggleMute = useCallback(() => {
    const track = streamRef.current?.getAudioTracks()[0];
    if (!track) return;
    track.enabled = !track.enabled;
    setMicOn(track.enabled);
  }, []);

  // Tear everything down when the game no longer wants voice (left / ended /
  // mounted away) — or when this hook unmounts.
  useEffect(() => {
    if (!enabled) closeCall();
  }, [enabled, closeCall]);

  useEffect(() => () => closeCall(), [closeCall]);

  // Surface application-level errors (e.g. permission) to the parent.
  useEffect(() => {
    if (onError && error) onError(error);
  }, [error, onError]);

  return {
    status,
    micOn,
    remoteSpeaking,
    error,
    isSupported,
    startCall,
    toggleMute,
  };
}