# Modern Chess

A sleek, mobile-first chess app with local multiplayer, AI opponents, and real-time online play with shareable game codes.

## Features

- Pass & play on a single device
- Play vs bot with three difficulty levels, using minimax with alpha-beta pruning
- Online games with shareable 6-character codes via Firebase
- Draw offers, resignation, pawn promotion, and game-over modals
- Move history, captured pieces, and material advantage display
- Sound feedback on moves

## Stack

- React 19, TypeScript, Vite
- Tailwind CSS v4
- chess.js
- Firebase Auth + Firestore, optional for online play

## Getting Started

```bash
npm install
npm run dev
```

For online play, add Firebase credentials to your environment:

```bash
VITE_FIREBASE_API_KEY=...
VITE_FIREBASE_AUTH_DOMAIN=...
VITE_FIREBASE_PROJECT_ID=...
VITE_FIREBASE_STORAGE_BUCKET=...
VITE_FIREBASE_MESSAGING_SENDER_ID=...
VITE_FIREBASE_APP_ID=...
VITE_APP_ID=modern-chess
```

Online mode is disabled automatically if the Firebase variables are missing. The Firestore rules in `firestore.rules` are scoped to authenticated players and should still be reviewed for production use.
