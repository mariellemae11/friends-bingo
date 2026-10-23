
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
