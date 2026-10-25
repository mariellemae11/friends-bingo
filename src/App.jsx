
import React, { useEffect, useRef, useState } from 'react';
import {
  supabase,
  supabaseConfigured,
  ensureAnonymousSession
} from './supabase';

const ranges = [
  [1, 15],
  [16, 30],
  [31, 45],
  [46, 60],
  [61, 75]
];

const letters = ['B', 'I', 'N', 'G', 'O'];

function makeCard() {
  const columns = ranges.map(([low, high]) => {
    const values = Array.from(
      { length: high - low + 1 },
      (_, index) => low + index
    );

    for (let i = values.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [values[i], values[j]] = [values[j], values[i]];
    }

    return values.slice(0, 5);
  });

  return Array.from({ length: 25 }, (_, index) => {
    const row = Math.floor(index / 5);
    const column = index % 5;

    if (row === 2 && column === 2) return 'FREE';

    return columns[column][row];
  });
}

function makeCode() {
  const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

  return Array.from(
    { length: 4 },
    () => characters[Math.floor(Math.random() * characters.length)]
  ).join('');
}

function getBallLabel(number) {
  if (number === undefined || number === null) return '—';

  return `${letters[Math.floor((number - 1) / 15)]} ${number}`;
}

function getSavedCards() {
  try {
    return JSON.parse(
      sessionStorage.getItem('friendsBingoCards') || '[]'
    );
  } catch {
    return [];
  }
}

export default function App() {
  const [name, setName] = useState('');
  const [roomCode, setRoomCode] = useState('');
  const [room, setRoom] = useState(null);
  const [player, setPlayer] = useState(null);
  const [cards, setCards] = useState(getSavedCards);
  const [called, setCalled] = useState([]);
  const [players, setPlayers] = useState([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [playersLoading, setPlayersLoading] = useState(false);
  const [winnerHistory, setWinnerHistory] = useState([]);
  const [winnerName, setWinnerName] = useState('');
const [bingoClaims, setBingoClaims] = useState([]);
const [selectedBingoCards, setSelectedBingoCards] = useState([]);
  const [keptCardIds, setKeptCardIds] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('friendsBingoKeptCards') || '[]'); } catch { return []; }
  });
  const [verificationModal, setVerificationModal] = useState(null);
  const [musicPlaying, setMusicPlaying] = useState(true);
  const roomChannelRef = useRef(null);
const hasLeftRoomRef = useRef(false);
  const isHost = Boolean(player?.id && room?.host_player_id && player.id === room.host_player_id);
  useEffect(() => {
    try { sessionStorage.setItem('friendsBingoKeptCards', JSON.stringify(keptCardIds)); } catch (error) { console.error('Could not save kept cards:', error); }
  }, [keptCardIds]);

  // Remember the last room code in this browser.
  useEffect(() => {
    if (roomCode) {
      try {
        localStorage.setItem('friendsBingoRoomCode', roomCode);
      } catch (error) {
        console.error('Could not save room code:', error);
      }
    }
  }, [roomCode]);
    // Load a room code from an invite link or the last saved room.
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const inviteCode = params.get('room');
      const savedCode = localStorage.getItem('friendsBingoRoomCode');
      const code = inviteCode || savedCode;

      if (code) {
        setRoomCode(code.toUpperCase());
      }
    } catch (error) {
      console.error('Could not load saved room code:', error);
    }
  }, []);

  // Save this browser session's cards and personal marks.
  useEffect(() => {
    try {
      sessionStorage.setItem(
        'friendsBingoCards',
        JSON.stringify(cards)
      );
    } catch (error) {
      console.error('Could not save card marks:', error);
    }
  }, [cards]);

  async function getCurrentUser() {
    if (!supabase) {
      throw new Error('Supabase is not configured.');
    }

    await ensureAnonymousSession();

    const {
      data: { user },
      error
    } = await supabase.auth.getUser();

    if (error) throw error;
    if (!user) {
      throw new Error('Could not start your anonymous session.');
    }

    return user;
  }
  // Automatically recover the last room after a page refresh.
  useEffect(() => {
    let cancelled = false;

    async function recoverLastRoom() {
      if (!supabaseConfigured || !supabase) return;

      let savedCode = '';

      try {
        const params = new URLSearchParams(window.location.search);
        savedCode =
          params.get('room') ||
          localStorage.getItem('friendsBingoRoomCode') ||
          '';
      } catch (error) {
        console.error('Could not read saved room code:', error);
        return;
      }

      if (!savedCode || hasLeftRoomRef.current) return;

      try {
        await ensureAnonymousSession();

        const { data, error } = await supabase.rpc(
          'recover_bingo_player',
          { p_room_code: savedCode.trim().toUpperCase() }
        );

        if (error) throw error;
        if (cancelled || hasLeftRoomRef.current || !data?.room || !data?.player) return;

        const recoveredCards = (data.cards || []).map(card => ({
          ...card,
          localMarks: {}
        }));

        setRoom(data.room);
        setPlayer(data.player);
        setCards(recoveredCards);
        setCalled(data.room.called_numbers || []);
        setRoomCode(data.room.room_code);
        setName(data.player.player_name || '');
        setPlayers([{
          id: data.player.id,
          player_name: data.player.player_name
        }]);
        setMessage(
          `Welcome back to room ${data.room.room_code}! Your room has been restored.`
        );
      } catch (error) {
        if (!cancelled) {
          console.error('Could not recover the previous room:', error.message);
        }
      }
    }

    recoverLastRoom();

    return () => {
      cancelled = true;
    };
  }, []);
  // Refresh the shared player list.
  useEffect(() => {
    if (!room?.id || !player?.id || !supabase) return;

    let cancelled = false;

    async function loadPlayers() {
      try {
        const { data, error } = await supabase.rpc('get_room_players', {
          p_room_id: room.id
        });

        if (error) throw error;

        if (!cancelled) setPlayers(data || []);
      } catch (error) {
        if (!cancelled) {
          setMessage(`Could not load players: ${error.message}`);
        }
      } finally {
        if (!cancelled) setPlayersLoading(false);
      }
    }

    setPlayersLoading(true);
    loadPlayers();

    const timer = window.setInterval(loadPlayers, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [room?.id, player?.id]);

  // Load this room's confirmed winners. The history is intentionally not cleared on restart.
  useEffect(() => {
    if (!room?.id || !player?.id || !supabase) return;
    let cancelled = false;

    async function loadWinnerHistory() {
      try {
        const { data, error } = await supabase.rpc('get_bingo_winner_history', {
          p_room_id: room.id
        });
        if (error) throw error;
        if (!cancelled) setWinnerHistory(Array.isArray(data) ? data : []);
      } catch (error) {
        if (!cancelled) console.error('Could not load winner history:', error.message);
      }
    }

    loadWinnerHistory();
    const timer = window.setInterval(loadWinnerHistory, 5000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [room?.id, player?.id]);

  // Room-wide BINGO announcements. Each player's music remains local.
  useEffect(() => {
    if (!room?.id || !player?.id || !supabase) return;

    const channel = supabase
      .channel(`bingo-room-${room.id}`)
      
.on('broadcast', { event: 'bingo-called' }, ({ payload }) => {
  if (
    !payload?.claim_id ||
    !payload?.player_id ||
    !Array.isArray(payload.cards)
  ) {
    return;
  }

  const claim = {
    claim_id: payload.claim_id,
    player_id: payload.player_id,
    player_name: payload.player_name || 'A player',
    cards: payload.cards.map(card => ({
      ...card,
      status: 'pending'
    }))
  };

  setBingoClaims(current => {
    if (current.some(item => item.claim_id === claim.claim_id)) {
      return current;
    }

    return [...current, claim];
  });

  setMessage(
    `🍀 ${claim.player_name} called BINGO on ${claim.cards.length} card(s)!`
  );
})
.on('broadcast', { event: 'bingo-verify-start' }, ({ payload }) => {
  if (!payload?.claim_id || !Array.isArray(payload.cards)) return;
  setVerificationModal({
    claim_id: payload.claim_id,
    player_name: payload.player_name || 'A player',
    cards: payload.cards,
    called_numbers: Array.isArray(payload.called_numbers) ? payload.called_numbers : []
  });
  setMessage(`🔎 The host is verifying ${payload.player_name || 'a player'}'s BINGO!`);
})

      .subscribe();

    roomChannelRef.current = channel;

    return () => {
      roomChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [room?.id, player?.id]);

  
  async function startVerification(claim) {
    if (!isHost || !room || !claim) return;
    const modalData = {
      claim_id: claim.claim_id,
      player_name: claim.player_name,
      cards: claim.cards,
      called_numbers: called
    };
    setVerificationModal(modalData);
    if (roomChannelRef.current) {
      const { error } = await roomChannelRef.current.send({
        type: 'broadcast',
        event: 'bingo-verify-start',
        payload: modalData
      });
      if (error) setMessage(`Opened verification, but could not notify everyone: ${error.message}`);
    }
  }

  async function announceBingo() {
    if (!room || !player || !cards.length) return;

    if (selectedBingoCards.length === 0) {
      setMessage('Please select at least one card before calling BINGO.');
      return;
    }

    const claimId = `${player.id}-${Date.now()}`;

    const declaredCards = cards
      .filter(card => selectedBingoCards.includes(card.id))
      .map(card => ({
        card_id: card.id,
        card_number: card.card_number,
        numbers: Array.isArray(card.numbers) ? card.numbers : [],
        marked: Object.keys(card.localMarks || {})
          .filter(index => card.localMarks[index])
          .map(Number)
      }));

    if (!roomChannelRef.current) {
      setMessage('Room connection is not ready. Please try again.');
      return;
    }

    try {
      const { error } = await roomChannelRef.current.send({
        type: 'broadcast',
        event: 'bingo-called',
        payload: {
          claim_id: claimId,
          player_id: player.id,
          player_name: player.player_name || name || 'A player',
          cards: declaredCards
        }
      });

      if (error) throw error;

      setSelectedBingoCards([]);
      setMessage(
        `🍀 You called BINGO with ${declaredCards.length} card(s)! Waiting for the host to verify.`
      );
    } catch (error) {
      setMessage(`Could not announce BINGO: ${error.message}`);
    }
  }


  // Refresh called numbers and game state for everyone in the room.
  useEffect(() => {
    if (!room?.id || !player?.id || !supabase) return;

    let cancelled = false;

    async function refreshGameState() {
      try {
        const { data, error } = await supabase.rpc(
          'get_bingo_room_state',
          { p_room_id: room.id }
        );

        if (error) throw error;

        if (!cancelled && data) {
          setCalled(
            Array.isArray(data.called_numbers)
              ? data.called_numbers
              : []
          );

          setRoom(current =>
            current
              ? {
                  ...current,
                  status: data.status,
                  host_player_id: data.host_player_id
                }
              : current
          );
        }
      } catch (error) {
        if (!cancelled) {
          console.error('Could not refresh game state:', error.message);
        }
      }
    }

    refreshGameState();

    const timer = window.setInterval(refreshGameState, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [room?.id, player?.id]);

  async function createRoom() {
    if (!name.trim()) {
      setMessage('Enter your name first.');
      return;
    }

    if (!supabaseConfigured) {
      setMessage('Check your Supabase settings in the .env file.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      await getCurrentUser();

      let result = null;

      for (let attempt = 0; attempt < 5; attempt++) {
        const { data, error } = await supabase.rpc('create_bingo_room', {
          p_room_code: makeCode(),
          p_player_name: name.trim(),
          p_cards: Array.from({ length: 4 }, () => makeCard())
        });

        if (!error) {
          result = data;
          break;
        }

        if (error.code !== '23505') throw error;
      }

      if (!result?.room || !result?.player) {
        throw new Error('Could not create a room. Please try again.');
      }

      const newCards = (result.cards || []).map(card => ({
        ...card,
        localMarks: {}
      }));

      setRoom(result.room);
      setPlayer(result.player);
      setCards(newCards);
      setCalled(result.room.called_numbers || []);
      setRoomCode(result.room.room_code);
      setPlayers([{
        id: result.player.id,
        player_name: result.player.player_name
      }]);

      setMessage(
        `Room created! Share code ${result.room.room_code} with your friends.`
      );
    } catch (error) {
      setMessage(`Could not create room: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }
async function joinRoom() {
    if (!name.trim() || !roomCode.trim()) {
      setMessage('Enter your name and room code.');
      return;
    }

    if (!supabaseConfigured) {
      setMessage('Check your Supabase settings in the .env file.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      await getCurrentUser();

      const normalizedRoomCode = roomCode.trim().toUpperCase();

      // First, try to recover this guest's existing room and cards.
      const {
        data: recovered,
        error: recoveryError
      } = await supabase.rpc('recover_bingo_player', {
        p_room_code: normalizedRoomCode
      });

      if (recoveryError) throw recoveryError;

      if (recovered?.room && recovered?.player) {
        const recoveredCards = (recovered.cards || []).map(card => ({
          ...card,
          localMarks: {}
        }));

        setRoom(recovered.room);
        setPlayer(recovered.player);
        setCards(recoveredCards);
        setCalled(recovered.room.called_numbers || []);
        setRoomCode(recovered.room.room_code);
        setPlayers([{
          id: recovered.player.id,
          player_name: recovered.player.player_name
        }]);

        setMessage(
          `Welcome back to room ${recovered.room.room_code}! Your saved cards have been restored.`
        );
        return;
      }

      // If this account has never joined this room, join as a new player.
      const { data, error } = await supabase.rpc('join_bingo_room', {
        p_room_code: normalizedRoomCode,
        p_player_name: name.trim(),
        p_cards: Array.from({ length: 4 }, () => makeCard())
      });

      if (error) throw error;

      if (!data?.room || !data?.player) {
        throw new Error('The server returned incomplete room information.');
      }

      const newCards = (data.cards || []).map(card => ({
        ...card,
        localMarks: {}
      }));

      setRoom(data.room);
      setPlayer(data.player);
      setCards(newCards);
      setCalled(data.room.called_numbers || []);
      setRoomCode(data.room.room_code);
      setPlayers([{
        id: data.player.id,
        player_name: data.player.player_name
      }]);

      setMessage(`You joined room ${data.room.room_code}.`);
    } catch (error) {
      setMessage(`Could not join room: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }


  async function callNumber() {
    if (!room || !player || busy) return;

    if (player.id !== room.host_player_id) {
      setMessage('Only the host can call numbers.');
      return;
    }

    setBusy(true);
    setMessage('');

    try {
      const { data, error } = await supabase.rpc('call_bingo_number', {
        p_room_id: room.id
      });

      if (error) throw error;

      if (!data || !Array.isArray(data.called_numbers)) {
        throw new Error('The server returned an invalid game state.');
      }

      setCalled(data.called_numbers);
      setMessage(`Number called: ${getBallLabel(data.number)}`);
    } catch (error) {
      setMessage(`Could not call number: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function restartGame() {
    if (!room || !player || busy) return;
    if (player.id !== room.host_player_id) {
      setMessage('Only the host can restart the game.');
      return;
    }
    if (!window.confirm('Restart this game in the same room? Winner history will be kept.')) return;

    setBusy(true);
    setMessage('');
    try {
      const { data, error } = await supabase.rpc('restart_bingo_game', {
        p_room_id: room.id
      });
      if (error) throw error;
      const nextCalled = Array.isArray(data?.called_numbers) ? data.called_numbers : [];
      setCalled(nextCalled);
      setCards(current => current.map(card => ({ ...card, localMarks: {} })));
      setMessage('Game restarted! Same room, fresh round. Winner history was kept.');
    } catch (error) {
      setMessage(`Could not restart the game: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function confirmWinner() {
    if (!room || !player || busy) return;
    if (player.id !== room.host_player_id) {
      setMessage('Only the host can confirm a winner.');
      return;
    }
    if (!winnerName.trim()) {
      setMessage('Enter the winning player name first.');
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.rpc('confirm_bingo_winner', {
        p_room_id: room.id,
        p_winner_name: winnerName.trim()
      });
      if (error) throw error;
      setWinnerName('');
      const { data, error: historyError } = await supabase.rpc('get_bingo_winner_history', {
        p_room_id: room.id
      });
      if (historyError) throw historyError;
      setWinnerHistory(Array.isArray(data) ? data : []);
      setMessage(`🏆 ${winnerName.trim()} added to winner history!`);
    } catch (error) {
      setMessage(`Could not confirm winner: ${error.message}`);
    } finally {
      setBusy(false);
    }
  }

  function returnToMainScreen() {
  if (busy) return;

  hasLeftRoomRef.current = true;

    setRoom(null);
    setPlayer(null);
    setCards([]);
    setCalled([]);
    setPlayers([]);
    setWinnerHistory([]);
    setWinnerName('');
    setBingoClaims([]);
    setSelectedBingoCards([]);
    setKeptCardIds([]);
    setVerificationModal(null);
    setRoomCode('');
    setMessage('You have left the game. You can create or join another room.');

    try {
      localStorage.removeItem('friendsBingoRoomCode');
    } catch (error) {
      console.error('Could not clear saved room code:', error);
    }

    try {
      sessionStorage.removeItem('friendsBingoCards');
      sessionStorage.removeItem('friendsBingoKeptCards');
    } catch (error) {
      console.error('Could not clear saved cards:', error);
    }
  }

    // Players can mark or unmark only numbers already called.
  function toggleMark(cardId, index) {
    setCards(currentCards =>
      currentCards.map(card => {
        if (card.id !== cardId) return card;

        const numbers = Array.isArray(card.numbers)
          ? card.numbers
          : [];

        const number = numbers[index];

        // The FREE space is always marked.
        if (number === 'FREE') return card;

        // Do not allow marking numbers that have not been called.
        if (!called.includes(number)) return card;

        const marks = card.localMarks || {};

        return {
          ...card,
          localMarks: {
            ...marks,
            [index]: !marks[index]
          }
        };
      })
    );
  }

function checkBingoCard(numbers, calledNumbers, markedIndices = []) {
  if (!Array.isArray(numbers) || numbers.length !== 25) {
    return { valid: false, pattern: [], patternName: '' };
  }

  const isCalled = index => numbers[index] === 'FREE' || calledNumbers.includes(numbers[index]);
  const markedSet = new Set(markedIndices.map(Number));
  const isMarked = index => numbers[index] === 'FREE' || markedSet.has(index);
  const patterns = [];

  for (let row = 0; row < 5; row++) {
    patterns.push({ name: `Row ${row + 1}`, indexes: Array.from({ length: 5 }, (_, col) => row * 5 + col), covered: isCalled });
  }
  for (let col = 0; col < 5; col++) {
    patterns.push({ name: `Column ${col + 1}`, indexes: Array.from({ length: 5 }, (_, row) => row * 5 + col), covered: isCalled });
  }
  patterns.push({ name: 'Diagonal', indexes: [0, 6, 12, 18, 24], covered: isCalled });
  patterns.push({ name: 'Diagonal', indexes: [4, 8, 12, 16, 20], covered: isCalled });
  patterns.push({ name: 'Blackout', indexes: Array.from({ length: 25 }, (_, index) => index), covered: isMarked });

  const winningPattern = patterns.find(pattern => pattern.indexes.every(pattern.covered));
  return {
    valid: Boolean(winningPattern),
    pattern: winningPattern?.indexes || [],
    patternName: winningPattern?.name || ''
  };
}


async function reviewBingoCard(claimId, cardId, decision) {
  if (!room || !player || busy) return;

  if (player.id !== room.host_player_id) {
    setMessage('Only the host can review BINGO claims.');
    return;
  }

  const claim = bingoClaims.find(item => item.claim_id === claimId);
  const card = claim?.cards.find(item => item.card_id === cardId);

  if (!claim || !card || card.status !== 'pending') return;

  if (decision === 'approved') {
    const result = checkBingoCard(card.numbers, called, card.marked || []);

    if (!result.valid) {
      setMessage(
        `Card ${card.card_number} does not have a valid winning pattern.`
      );
      return;
    }
  }

  setBusy(true);

  try {
    if (decision === 'approved') {
      const { error } = await supabase.rpc('confirm_bingo_winner', {
        p_room_id: room.id,
        p_winner_name: claim.player_name
      });

      if (error) throw error;

      const { data, error: historyError } = await supabase.rpc(
        'get_bingo_winner_history',
        { p_room_id: room.id }
      );

      if (historyError) throw historyError;

      setWinnerHistory(Array.isArray(data) ? data : []);
    }

    setBingoClaims(current =>
      current.map(item =>
        item.claim_id !== claimId
          ? item
          : {
              ...item,
              cards: item.cards.map(currentCard =>
                currentCard.card_id !== cardId
                  ? currentCard
                  : { ...currentCard, status: decision }
              )
            }
      )
    );

    setMessage(
      decision === 'approved'
        ? `🏆 Card ${card.card_number} approved for ${claim.player_name}.`
        : `Card ${card.card_number} denied for ${claim.player_name}.`
    );
  } catch (error) {
    setMessage(`Could not review this card: ${error.message}`);
  } finally {
    setBusy(false);
  }
}


  async function copyInviteLink() {
    if (!room) return;

    const link =
      `${window.location.origin}${window.location.pathname}?room=${room.room_code}`;

    try {
      await navigator.clipboard.writeText(link);
      setMessage('Invite link copied!');
    } catch {
      setMessage(
        `Share this room code with your friends: ${room.room_code}`
      );
    }
  }

  return (
    <main className={`shell ${room && !isHost ? 'guest-view' : ''}`}>
      <header>
        <img className="logo" src="/finger-family-logo.jpg" alt="Finger Family emblem logo" />
        <div>
          <h1>Finger Family BINGO</h1>
          <p>Play together. Win together. · 75-ball bingo</p>
        </div>
      </header>

      <style>{`
        /* Guest-only styling: host layout remains unchanged. */
        .guest-view { display: flex; flex-direction: column; gap: 10px; }
        .guest-view > header { order: 1; margin-bottom: 0; padding-bottom: 10px; }
        .guest-view > .roombar { display: none; }
        .guest-view > .music-panel {
          position: fixed !important; right: 16px !important; bottom: 16px !important;
          left: auto !important; top: auto !important; transform: none !important;
          z-index: 1002; order: 2; padding: 0; margin: 0; width: auto; min-width: 0;
          display: flex; align-items: center; justify-content: flex-end;
          background: transparent !important; border: 0 !important; box-shadow: none !important;
        }
        .guest-view > .music-panel h2,
        .guest-view > .music-panel > p,
        .guest-view > .music-panel .music-player { position: fixed; width: 1px; height: 1px; overflow: hidden; opacity: 0; pointer-events: none; }
        .guest-view > .music-panel .music-controls { margin: 0; }
        .guest-view > .music-panel button { padding: 9px 13px; border-radius: 999px; box-shadow: 0 4px 14px rgba(0,0,0,.28); }
        .guest-view > .caller { order: 7; padding: 12px; }
        .guest-view .caller-topline { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
        .guest-view .caller-topline .ball { margin: 8px 0; }
        .guest-view .caller-bingo-button { flex: 0 0 auto; background: transparent; border: 0; box-shadow: none; padding: 0; display: inline-flex; flex-direction: column; align-items: center; color: #f5d47a; }
        .guest-view .caller-bingo-button svg { width: 42px; height: 42px; }
        .guest-view .caller-bingo-button span { font-weight: 800; letter-spacing: .08em; }
        .bingo-verification-backdrop { position: fixed; inset: 0; z-index: 2147483600; background: rgba(0,0,0,.78); display: flex; align-items: center; justify-content: center; padding: 16px; }
        .bingo-verification-modal { width: min(760px, 100%); max-height: 90vh; overflow: auto; background: #063225; color: #f7f2d8; border: 1px solid #d7b65e; border-radius: 16px; padding: 18px; box-shadow: 0 20px 70px rgba(0,0,0,.55); }
        .bingo-verification-cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
        .bingo-verification-card { border: 1px solid rgba(215,182,94,.5); border-radius: 10px; padding: 10px; }
        .bingo-verification-grid { display: grid; grid-template-columns: repeat(5, minmax(0,1fr)); gap: 3px; margin-top: 8px; }
        .bingo-verification-grid span { display: flex; align-items: center; justify-content: center; min-height: 34px; background: #e9ebdc; color: #15372c; border-radius: 4px; font-size: .85rem; }
        .bingo-verification-grid span.pattern-hit { background: #f5d47a; color: #17372b; font-weight: 800; outline: 2px solid #d7b65e; }
        .bingo-verification-grid span.free-space { background: #b9efd2; }
        .bingo-verification-grid .letter { background: #14543e; color: #f5d47a; font-weight: 800; }
        .guest-view > .room-exit-controls { order: 9; padding: 8px; }
        .guest-view > .room-exit-controls button { width: 100%; }
        .guest-view > .panel:not(.music-panel):not(.caller):not(.room-exit-controls):not(.bingo-call-panel) { display: none; }
        .guest-view > h2 { order: 3; margin: 2px 0 0; font-size: 1rem; display: flex; align-items: center; justify-content: space-between; }
        .guest-view .guest-card-count { font-size: 0.7rem; font-weight: 600; padding: 2px 6px; border-radius: 999px; background: rgba(255,255,255,.12); }
        .guest-view > p.hint:not(.message) { order: 4; margin: 0; }
        .guest-view > .cards { order: 5; display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
        .guest-view .bcard { min-width: 0; padding: 7px; }
        .guest-view .bcard h3 { margin: 2px 0 6px; text-align: center; }
        .guest-view .bingo-card-options { display: flex; flex-direction: column; gap: 3px; }
        .guest-view .bingo-card-select { display: flex; align-items: center; gap: 5px; margin: 4px 0 6px; font-size: .68rem; line-height: 1.2; }
        .guest-view .bingo-card-select input { width: 14px; height: 14px; margin: 0; accent-color: #d7b65e; flex: 0 0 auto; }
        .guest-view .grid { gap: 3px; }
        .guest-view .grid button { min-width: 0; padding: 4px 0; font-size: 0.78rem; }
        /* The guest BINGO control is portaled to document.body so centered shell styles
           cannot pull the fixed button into the middle of the screen. */
        .guest-floating-bingo {
          position: fixed !important; right: 16px !important; bottom: 76px !important;
          left: auto !important; top: auto !important; transform: none !important;
          z-index: 2147483000; padding: 0; margin: 0; width: auto;
          text-align: center; display: block; background: transparent !important;
          border: 0 !important; box-shadow: none !important;
        }
        .guest-floating-bingo .hint { display: none !important; }
        .guest-floating-bingo .bingo-clover-button {
          position: static !important; left: auto !important; top: auto !important; transform: none !important;
          z-index: 2147483000; display: inline-flex; align-items: center; justify-content: center; gap: 8px;
          padding: 11px 16px; border-radius: 999px; box-shadow: 0 5px 18px rgba(0,0,0,.35);
        }
        .guest-floating-bingo .bingo-clover-button svg { width: 25px; height: 25px; }
        .guest-floating-bingo .bingo-clover-button span { white-space: nowrap; }
        .guest-view > .caller .eyebrow { display: block; }
        .guest-view > .caller .ball { margin: 8px 0; }
        .guest-view > .caller .history { display: flex; flex-wrap: wrap; gap: 5px; }
        .guest-view > .caller .history span { padding: 5px 7px; border-radius: 5px; }
        .guest-view > .caller > button,
        .guest-view .host-game-controls { display: none !important; }
        .guest-view > p.hint:last-of-type { order: 10; font-size: 0.7rem; }
        .guest-view > .message { order: 11; }
        @media (max-width: 420px) {
          .guest-view > .music-panel { right: 12px !important; bottom: 12px !important; }
          .guest-floating-bingo { right: 12px !important; bottom: 68px !important; }
          .guest-view > .cards { gap: 5px; }
          .guest-view .bcard { padding: 5px; }
          .guest-view .grid { gap: 2px; }
          .guest-view .grid button { font-size: 0.68rem; }
        }
      `}</style>

      {!room ? (
        <section className="panel">
          <h2>Play with your friends</h2>

          <label>
            Your name
            <input
              value={name}
              maxLength={24}
              onChange={event => setName(event.target.value)}
              placeholder="Enter your name"
            />
          </label>

          <button
            className="primary"
            disabled={busy}
            onClick={createRoom}
          >
            {busy ? 'Please wait…' : 'Create a room'}
          </button>

          <div className="separator">
            <span>or join a friend</span>
          </div>

          <label>
            Room code
            <input
              value={roomCode}
              maxLength={4}
              onChange={event =>
                setRoomCode(event.target.value.toUpperCase())
              }
              placeholder="e.g. A4BC"
            />
          </label>

          <button
            className="secondary"
            disabled={busy}
            onClick={joinRoom}
          >
            {busy ? 'Please wait…' : 'Join room'}
          </button>

          {message && <p className="message">{message}</p>}

          {!supabaseConfigured && (
            <p className="hint">
              Add your Supabase URL and publishable key to your .env file,
              then restart the app.
            </p>
          )}
        </section>
      ) : (
        <>
{isHost && (
          <section className="panel roombar">
            <div>
              <span className="eyebrow">ROOM CODE</span>
              <strong className="roomcode">{room.room_code}</strong>
            </div>

            <button className="secondary" onClick={copyInviteLink}>
              Copy invite link
            </button>
          </section>
)}

          <section className="panel music-panel">
            <h2>🎵 Room Music</h2>
            <p className="hint">Music controls affect only your device, not the other players.</p>
            <div className="music-controls">
              <button
                className="secondary"
                type="button"
                onClick={() => setMusicPlaying(current => !current)}
                aria-pressed={musicPlaying}
              >
                {musicPlaying ? '⏸ Pause Music' : '▶ Play Music'}
              </button>
            </div>
            <div className="music-player">
                <iframe
                  key={musicPlaying ? "finger-family-music-playing" : "finger-family-music-paused"}
                  width="100%"
                  height="80"
                  src={musicPlaying ? "https://www.youtube.com/embed/WHwndCEnOec?autoplay=1&controls=0&playsinline=1&rel=0" : "about:blank"}
                  title="Finger Family BINGO background music"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
            </div>
          </section>

          <section className="panel caller">
            <div className="caller-topline">
              <div>
                <span className="eyebrow">LAST NUMBER CALLED</span>
                <div className="ball">
                  {called.length ? getBallLabel(called[called.length - 1]) : '—'}
                </div>
              </div>
              {!isHost && (
                <button className="caller-bingo-button" type="button" onClick={announceBingo} aria-label="Call BINGO">
                  <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
                    <g fill="currentColor" stroke="#d7b65e" strokeWidth="2">
                      <ellipse cx="50" cy="25" rx="13" ry="19" />
                      <ellipse cx="72" cy="41" rx="13" ry="19" transform="rotate(72 72 41)" />
                      <ellipse cx="64" cy="66" rx="13" ry="19" transform="rotate(144 64 66)" />
                      <ellipse cx="36" cy="66" rx="13" ry="19" transform="rotate(216 36 66)" />
                      <ellipse cx="28" cy="41" rx="13" ry="19" transform="rotate(288 28 41)" />
                    </g>
                    <path d="M50 58 Q53 78 39 94" fill="none" stroke="#d7b65e" strokeWidth="5" strokeLinecap="round" />
                  </svg>
                  <span>BINGO!</span>
                </button>
              )}
            </div>

            <p>{called.length} of 75 numbers called</p>

            {player?.id === room?.host_player_id && (
              <button
                className="primary"
                disabled={busy || called.length >= 75}
                onClick={callNumber}
              >
                {busy
                  ? 'Please wait…'
                  : called.length >= 75
                    ? 'All numbers called'
                    : 'Call next number'}
              </button>
            )}

            {player?.id === room?.host_player_id && (
              <div className="host-game-controls">
                <button className="secondary" type="button" disabled={busy} onClick={restartGame}>
                  ↻ Restart Game
                </button>
                <div className="confirm-winner-controls">
                  <label>
                    Confirm winner
                    <input
                      value={winnerName}
                      maxLength={24}
                      onChange={event => setWinnerName(event.target.value)}
                      placeholder="Winning player's name"
                    />
                  </label>
                  <button className="primary" type="button" disabled={busy || !winnerName.trim()} onClick={confirmWinner}>
                    🏆 Confirm Winner
                  </button>
                </div>
              </div>
            )}

            <div className="history">
              {[...called].reverse().map(number => (
                <span key={number}>
                  {getBallLabel(number).replace(' ', '')}
                </span>
              ))}
            </div>
          
          </section>

          <section className="panel room-exit-controls">
            <button
              className="secondary"
              type="button"
              disabled={busy}
              onClick={returnToMainScreen}
            >
              🏠 Back to Main Screen
            </button>

                    </section>

{isHost && (
          <section className="panel">
            <h2>Players in this room ({players.length})</h2>


            {players.length === 0 ? (
              <p className="hint">
                No players were returned for this room yet.
              </p>
            ) : (
              players.map(currentPlayer => (
                <span className="player" key={currentPlayer.id}>
                  {currentPlayer.player_name}
                  {currentPlayer.id === room.host_player_id
                    ? ' (Host)'
                    : ''}
                </span>
              ))
            )}

            <p className="hint">
              {playersLoading
                ? 'Refreshing player list…'
                : 'Player list refreshes automatically every 5 seconds.'}
            </p>
          </section>
)}

{isHost && (
          <section className="panel bingo-claims-panel">
            <h2>🍀 BINGO Claims</h2>
            <p className="hint">
              Players who call BINGO will appear here while waiting for the host to review their cards.
            </p>

            {bingoClaims.length === 0 ? (
              <p className="hint">No BINGO claims yet.</p>
            ) : (
              bingoClaims.map(claim => (
                <article className="bingo-claim" key={claim.claim_id}>
                  <h3>{claim.player_name}</h3>

                  {claim.cards.map(card => {
                    const result = checkBingoCard(card.numbers, called, card.marked || []);
                    const status = card.status || 'pending';

                    return (
                      <div className="bingo-claim-card" key={card.card_id}>
                        <p>
                          Card {card.card_number} —{' '}
                          <strong>
                            {status === 'approved'
                              ? '✅ Approved'
                              : status === 'denied'
                                ? '❌ Denied'
                                : result.valid
                                  ? '⏳ Valid pattern found — awaiting host'
                                  : '⚠️ No valid winning pattern'}
                          </strong>
                        </p>

                        {result.valid && (
                          <p className="hint">
                            Pattern found: {result.patternName} · {result.pattern.map(index => card.numbers[index]).join(', ')}
                          </p>
                        )}

                        {isHost && status === 'pending' && (
                          <button className="secondary" type="button" onClick={() => startVerification(claim)}>
                            🔎 Let's verify
                          </button>
                        )}

                        {player?.id === room?.host_player_id && status === 'pending' && (
                          <div className="bingo-review-buttons">
                            <button
                              className="primary"
                              type="button"
                              disabled={busy || !result.valid || status !== 'pending'}
                              onClick={() =>
                                reviewBingoCard(claim.claim_id, card.card_id, 'approved')
                              }
                            >
                              ✅ Approve Card {card.card_number}
                            </button>

                            <button
                              className="secondary"
                              type="button"
                              disabled={busy}
                              onClick={() =>
                                reviewBingoCard(claim.claim_id, card.card_id, 'denied')
                              }
                            >
                              ❌ Deny Card {card.card_number}
                            </button>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </article>
              ))
            )}
          </section>
)}


{isHost && (
          <section className="panel winner-history-panel">
            <h2>🏆 Winner History</h2>
            <p className="hint">Confirmed winners for this room. This list stays when the host restarts the game.</p>
            {winnerHistory.length === 0 ? (
              <p className="hint">No winners recorded yet. The host can confirm a winner above.</p>
            ) : (
              <ol className="winner-list">
                {winnerHistory.map((winner, index) => (
                  <li key={winner.id || `${winner.winner_name}-${winner.created_at}-${index}`}>
                    <span className="winner-name">{winner.winner_name}</span>
                    <time dateTime={winner.created_at}>{winner.created_at ? new Date(winner.created_at).toLocaleString() : ''}</time>
                  </li>
                ))}
              </ol>
            )}
          </section>
)}

          <h2 className={isHost ? '' : 'guest-cards-heading'}>
            {isHost ? 'Your four cards' : 'Your Bingo Cards'}
            {!isHost && <span className="guest-card-count">{cards.length} Cards</span>}
          </h2>

          <p className="hint">
            When a number is called, tap that number on your card to highlight
            it. Your marks are private to you.
          </p>

          {isHost && (
          <section className="panel bingo-call-panel">
            <p className="hint">Got five in a row? Tap the clover to call BINGO!</p>
            <button className="bingo-clover-button" type="button" onClick={announceBingo} aria-label="Call BINGO">
              <svg viewBox="0 0 100 100" role="img" aria-hidden="true">
                <g fill="currentColor" stroke="#d7b65e" strokeWidth="2">
                  <ellipse cx="50" cy="25" rx="13" ry="19" />
                  <ellipse cx="72" cy="41" rx="13" ry="19" transform="rotate(72 72 41)" />
                  <ellipse cx="64" cy="66" rx="13" ry="19" transform="rotate(144 64 66)" />
                  <ellipse cx="36" cy="66" rx="13" ry="19" transform="rotate(216 36 66)" />
                  <ellipse cx="28" cy="41" rx="13" ry="19" transform="rotate(288 28 41)" />
                </g>
                <path d="M50 58 Q53 78 39 94" fill="none" stroke="#d7b65e" strokeWidth="5" strokeLinecap="round" />
              </svg>
              <span>BINGO!</span>
            </button>
          </section>
          )}

          <div className="cards">
            {cards.map(card => (
              <article className="bcard" key={card.id}>
                <h3>Card {card.card_number}</h3>

<div className="bingo-card-options">
  <label className="bingo-card-select">
    <input
      type="checkbox"
      checked={selectedBingoCards.includes(card.id)}
      onChange={event => {
        setSelectedBingoCards(current =>
          event.target.checked
            ? [...current, card.id]
            : current.filter(id => id !== card.id)
        );
      }}
    />
    Select for BINGO
  </label>
  <label className="bingo-card-select keep-card-option">
    <input
      type="checkbox"
      checked={keptCardIds.includes(card.id)}
      onChange={event => setKeptCardIds(current => event.target.checked ? [...new Set([...current, card.id])] : current.filter(id => id !== card.id))}
    />
    Keep this card
  </label>
</div>

                <div className="grid">
                  {letters.map(letter => (
                    <b key={letter}>{letter}</b>
                  ))}

                  {(Array.isArray(card.numbers) ? card.numbers : []).map(
                    (number, index) => {
                      const isFree = number === 'FREE';
                      const isCalled =
                        !isFree && called.includes(number);
                      const isMarked =
                        isFree ||
                        (isCalled && Boolean(card.localMarks?.[index]));

                      return (
                        <button
                          key={index}
                          type="button"
                          className={[
                            isFree ? 'free' : '',
                            isMarked ? 'marked' : ''
                          ].filter(Boolean).join(' ')}
                          disabled={!isFree && !isCalled}
                          onClick={() => toggleMark(card.id, index)}
                          title={
                            isFree
                              ? 'Free space'
                              : isCalled
                                ? 'Click to mark or unmark'
                                : 'Waiting for this number to be called'
                          }
                        >
                          {number}
                        </button>
                      );
                    }
                  )}
                </div>
              </article>
            ))}
          </div>

          {isHost && (
            <p className="hint">
              Card marks are saved in this browser tab's session. They are not
              shared with other players. Secure Bingo win verification still
              needs to be added.
            </p>
          )}

          {message && <p className="message">{message}</p>}
        </>
      )}




      {verificationModal && (
        <div className="bingo-verification-backdrop" role="dialog" aria-modal="true" aria-label="BINGO card verification">
          <section className="bingo-verification-modal">
            <h2>🍀 Let's verify BINGO!</h2>
            <p><strong>{verificationModal.player_name}</strong> called BINGO. Everyone can review the submitted card pattern below.</p>
            <div className="bingo-verification-cards">
              {verificationModal.cards.map(card => {
                const result = checkBingoCard(card.numbers, verificationModal.called_numbers || [], card.marked || []);
                return (
                  <article className="bingo-verification-card" key={card.card_id}>
                    <h3>Card {card.card_number} · {result.valid ? result.patternName : 'Pattern not confirmed'}</h3>
                    <div className="bingo-verification-grid">
                      {letters.map(letter => <span className="letter" key={letter}>{letter}</span>)}
                      {(card.numbers || []).map((number, index) => (
                        <span key={index} className={`${result.pattern.includes(index) ? 'pattern-hit' : ''} ${number === 'FREE' ? 'free-space' : ''}`}>
                          {number}
                        </span>
                      ))}
                    </div>
                    <p className="hint">{result.valid ? `Highlighted pattern: ${result.patternName}` : 'No completed row, column, diagonal, or blackout detected.'}</p>
                  </article>
                );
              })}
            </div>
            <button className="primary" type="button" onClick={() => setVerificationModal(null)}>Close verification</button>
          </section>
        </div>
      )}

      <footer>Made for game night with Finger Family 💚</footer>
    </main>
  );
}
