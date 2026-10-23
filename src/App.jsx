
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
  const [musicPlaying, setMusicPlaying] = useState(true);

  const roomChannelRef = useRef(null);

  useEffect(() => {
    const code = new URLSearchParams(window.location.search).get('room');

    if (code) setRoomCode(code.toUpperCase());
  }, []);

  useEffect(() => {
    try {
      sessionStorage.setItem('friendsBingoCards', JSON.stringify(cards));
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

  useEffect(() => {
    if (!room?.id || !player?.id || !supabase) return;

    let cancelled = false;

    async function loadPlayers() {
      try {
        const { data, error } = await supabase.rpc('get_room_players', {
          p_room_id: room.id
        });

        if (error) throw error;

        if (!cancelled) {
          setPlayers(data || []);
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(`Could not load players: ${error.message}`);
        }
      } finally {
        if (!cancelled) {
          setPlayersLoading(false);
        }
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

  useEffect(() => {
    if (!room?.id || !player?.id || !supabase) return;

    const channel = supabase
      .channel(`bingo-room-${room.id}`)
      .on('broadcast', { event: 'bingo-called' }, ({ payload }) => {
        if (payload?.player_name) {
          setMessage(
            `🍀 ${payload.player_name} called BINGO! The host can verify the card.`
          );
        }
      })
      .subscribe();

    roomChannelRef.current = channel;

    return () => {
      roomChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [room?.id, player?.id]);

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
            Array.isArray(data.called_numbers) ? data.called_numbers : []
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
      setPlayers([
        {
          id: result.player.id,
          player_name: result.player.player_name
        }
      ]);

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

      const { data, error } = await supabase.rpc('join_bingo_room', {
        p_room_code: roomCode.trim().toUpperCase(),
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
      setPlayers([
        {
          id: data.player.id,
          player_name: data.player.player_name
        }
      ]);

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

  async function announceBingo() {
    if (!room || !player) return;

    setMessage(
      '🍀 You called BINGO! Waiting for the host to verify your card.'
    );

    try {
      const channel = roomChannelRef.current;

      if (channel) {
        const { error } = await channel.send({
          type: 'broadcast',
          event: 'bingo-called',
          payload: {
            player_name: player.player_name || name || 'A player'
          }
        });

        if (error) throw error;
      } else {
        setMessage(
          'Your BINGO was called, but the room announcement is not connected yet.'
        );
      }
    } catch (error) {
      setMessage(
        `BINGO! Your announcement may not have reached everyone: ${error.message}`
      );
    }
  }

  function toggleMark(cardId, index) {
    setCards(currentCards =>
      currentCards.map(card => {
        if (card.id !== cardId) return card;

        const numbers = Array.isArray(card.numbers) ? card.numbers : [];
        const number = numbers[index];

        if (number === 'FREE') return card;
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

  async function copyInviteLink() {
    if (!room) return;

    const link = `${window.location.origin}${window.location.pathname}?room=${room.room_code}`;

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
    <main className="shell">
      <style>{`
        .shell .bingo-call-panel,
        .shell section.bingo-call-panel {
          display: block !important;
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          outline: none !important;
          padding: 12px 0 !important;
          margin: 12px 0 16px !important;
          text-align: center !important;
        }
        .shell button.bingo-clover-button,
        .shell button.bingo-clover-button:hover,
        .shell button.bingo-clover-button:focus,
        .shell button.bingo-clover-button:active {
          all: unset !important;
          display: inline-flex !important;
          flex-direction: column !important;
          align-items: center !important;
          justify-content: center !important;
          gap: 8px !important;
          margin: 12px auto !important;
          padding: 8px !important;
          cursor: pointer !important;
          background: transparent !important;
          background-color: transparent !important;
          background-image: none !important;
          border: 0 !important;
          border-radius: 0 !important;
          box-shadow: none !important;
          outline: none !important;
          appearance: none !important;
          -webkit-appearance: none !important;
          -webkit-tap-highlight-color: transparent !important;
        }
        .shell button.bingo-clover-button::before,
        .shell button.bingo-clover-button::after {
          content: none !important;
          display: none !important;
        }
        .shell button.bingo-clover-button svg {
          display: block !important;
          width: 100px !important;
          height: 100px !important;
          background: transparent !important;
          background-color: transparent !important;
        }
        .shell button.bingo-clover-button span {
          color: #f4d68a !important;
          background: transparent !important;
          background-color: transparent !important;
          border: 0 !important;
          box-shadow: none !important;
          font-size: 1.25rem !important;
          font-weight: 800 !important;
          letter-spacing: 2px !important;
        }
      `}</style>
      <header>
        <div className="logo">🎱</div>

        <div>
          <h1>Finger Family BINGO</h1>
          <p>Play together. Win together. · 75-ball bingo</p>
        </div>
      </header>

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
            type="button"
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
            type="button"
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
          <section className="panel roombar">
            <div>
              <span className="eyebrow">ROOM CODE</span>
              <strong className="roomcode">{room.room_code}</strong>
            </div>

            <button
              type="button"
              className="secondary"
              onClick={copyInviteLink}
            >
              Copy invite link
            </button>
          </section>

          <section className="panel music-panel">
            <h2>🎵 Room Music</h2>

            <p className="hint">
              Music controls affect only your device, not the other players.
            </p>

            <div className="music-controls">
              <button
                type="button"
                className="secondary"
                onClick={() => setMusicPlaying(current => !current)}
                aria-pressed={musicPlaying}
              >
                {musicPlaying ? '⏸ Pause Music' : '▶ Play Music'}
              </button>
            </div>

            {musicPlaying && (
              <div className="music-player">
                <iframe
                  key="finger-family-music"
                  width="100%"
                  height="80"
                  src="https://www.youtube.com/embed/WHwndCEnOec?autoplay=1&controls=1&playsinline=1&rel=0"
                  title="Finger Family BINGO background music"
                  allow="autoplay; encrypted-media; picture-in-picture"
                  referrerPolicy="strict-origin-when-cross-origin"
                  allowFullScreen
                />
              </div>
            )}
          </section>

          <section className="panel caller">
            <span className="eyebrow">LAST NUMBER CALLED</span>

            <div className="ball">
              {called.length
                ? getBallLabel(called[called.length - 1])
                : '—'}
            </div>

            <p>{called.length} of 75 numbers called</p>

            {player?.id === room?.host_player_id && (
              <button
                type="button"
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

            <div className="history">
              {[...called].reverse().map(number => (
                <span key={number}>
                  {getBallLabel(number).replace(' ', '')}
                </span>
              ))}
            </div>
          </section>

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

          <h2>Your four cards</h2>

          <p className="hint">
            When a number is called, tap that number on your card to highlight
            it. Your marks are private to you.
          </p>

          {/* BINGO button */}
          <section className="bingo-call-panel">
            <p className="hint">You think you won?</p>
            <button
              type="button"
              className="bingo-clover-button"
              onClick={announceBingo}
              aria-label="Call BINGO"
            >
              <svg viewBox="0 0 100 100" aria-hidden="true">
                <g fill="#238636" stroke="#d7b65e" strokeWidth="2">
                  <ellipse cx="50" cy="25" rx="13" ry="19" />
                  <ellipse cx="72" cy="41" rx="13" ry="19" transform="rotate(72 72 41)" />
                  <ellipse cx="64" cy="66" rx="13" ry="19" transform="rotate(144 64 66)" />
                  <ellipse cx="36" cy="66" rx="13" ry="19" transform="rotate(216 36 66)" />
                  <ellipse cx="28" cy="41" rx="13" ry="19" transform="rotate(288 28 41)" />
                </g>
                <path
                  d="M50 58 Q53 78 39 94"
                  fill="none"
                  stroke="#d7b65e"
                  strokeWidth="5"
                  strokeLinecap="round"
                />
              </svg>
              <span>BINGO!</span>
            </button>
          </section>

          <div className="cards">
            {cards.map(card => (
              <article className="bcard" key={card.id}>
                <h3>Card {card.card_number}</h3>

                <div className="grid">
                  {letters.map(letter => (
                    <b key={letter}>{letter}</b>
                  ))}

                  {(Array.isArray(card.numbers) ? card.numbers : []).map(
                    (number, index) => {
                      const isFree = number === 'FREE';
                      const isCalled = !isFree && called.includes(number);

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
                          ]
                            .filter(Boolean)
                            .join(' ')}
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

          <p className="hint">
            Card marks are saved in this browser tab's session. They are not
            shared with other players. Secure Bingo win verification still
            needs to be added.
          </p>

          {message && <p className="message">{message}</p>}
        </>
      )}

      <footer>Made for game night with Finger Family 💚</footer>
    </main>
  );
}
