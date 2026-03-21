import React, { useState, useEffect, useRef } from 'react';
import { Chess, type Move } from 'chess.js';
import { ChevronLeft, RotateCcw, Bot, User } from '../icons/Icons';
import { Piece } from '../pieces/Piece';
import { PromotionModal } from '../modals/PromotionModal';
import { GameOverModal } from '../modals/GameOverModal';
import { ConfirmModal } from '../modals/ConfirmModal';
import { WaitingModal } from '../modals/WaitingModal';
import { playMoveSound } from '../../utils/sound';
import { getBestBotMove } from '../../engine/minimax';
import {
  db,
  APP_ID,
  doc,
  updateDoc,
  onSnapshot,
} from '../../config/firebase';
import type {
  GameMode,
  OnlineConfig,
  BotDifficulty,
  GameResult,
  DrawOffer,
  PromotionPending,
  MoveData,
  PieceColor,
  PieceType,
  SquareName,
} from '../../types';

interface GameProps {
  mode: GameMode;
  onlineConfig?: OnlineConfig;
  botDifficulty?: BotDifficulty;
  onExit: () => void;
}

export const Game: React.FC<GameProps> = ({ mode, onlineConfig, botDifficulty = 1, onExit }) => {
  const [game, setGame] = useState(new Chess());
  const gameRef = useRef(game);
  const [board, setBoard] = useState(game.board());
  const [turn, setTurn] = useState<PieceColor>('w');
  const [selectedSquare, setSelectedSquare] = useState<SquareName | null>(null);
  const [possibleMoves, setPossibleMoves] = useState<Move[]>([]);
  const [lastMove, setLastMove] = useState<MoveData | null>(null);
  const [checkSquare, setCheckSquare] = useState<SquareName | null>(null);
  const [promotionPending, setPromotionPending] = useState<PromotionPending | null>(null);
  const [result, setResult] = useState<GameResult | null>(null);
  const [showResultModal, setShowResultModal] = useState(false);
  const [confirmAction, setConfirmAction] = useState<'offer-draw' | 'accept-draw' | 'resign' | null>(
    null
  );
  const [drawOffer, setDrawOffer] = useState<DrawOffer | null>(null);
  const [isOnlineWaiting, setIsOnlineWaiting] = useState(
    mode === 'online' && onlineConfig?.playerColor === 'w'
  );

  const unsubscribeRef = useRef<(() => void) | null>(null);
  const resultTimeoutRef = useRef<number | null>(null);
  const drawOfferTimeoutRef = useRef<number | null>(null);
  const resultRef = useRef<GameResult | null>(null);

  const clearResultTimeout = () => {
    if (resultTimeoutRef.current) {
      window.clearTimeout(resultTimeoutRef.current);
      resultTimeoutRef.current = null;
    }
  };

  const clearDrawOfferTimeout = () => {
    if (drawOfferTimeoutRef.current) {
      window.clearTimeout(drawOfferTimeoutRef.current);
      drawOfferTimeoutRef.current = null;
    }
  };

  useEffect(() => {
    resultRef.current = result;
  }, [result]);

  useEffect(() => {
    return () => {
      clearResultTimeout();
      clearDrawOfferTimeout();
      if (unsubscribeRef.current) unsubscribeRef.current();
    };
  }, []);

  const isPlayerTurn = () => {
    if (mode === 'bot' && turn === 'b') return false;
    if (mode === 'online') {
      if (isOnlineWaiting) return false;
      if (turn !== onlineConfig?.playerColor) return false;
    }
    return true;
  };

  const findKing = (gameInst: Chess, color: PieceColor): SquareName | null => {
    const boardState = gameInst.board();
    for (let r = 0; r < 8; r++) {
      for (let c = 0; c < 8; c++) {
        const piece = boardState[r][c];
        if (piece?.type === 'k' && piece?.color === color) {
          return (String.fromCharCode(97 + c) + (8 - r)) as SquareName;
        }
      }
    }
    return null;
  };

  const syncResult = async (newGame: Chess, res: GameResult) => {
    if (mode === 'online' && onlineConfig?.gameId && db) {
      const gameRefDoc = doc(db, 'artifacts', APP_ID, 'public', 'data', 'games', onlineConfig.gameId);
      await updateDoc(gameRefDoc, {
        fen: newGame.fen(),
        turn: newGame.turn(),
        history: newGame.history(),
        status: 'finished',
        result: res,
        drawOffer: null,
        lastMove: lastMove ?? null,
      });
    }
  };

  const endGame = (res: GameResult, newGame: Chess = game, syncOnline = true) => {
    clearResultTimeout();
    setResult(res);
    setShowResultModal(false);
    resultTimeoutRef.current = window.setTimeout(() => setShowResultModal(true), 1000);
    if (syncOnline) {
      syncResult(newGame, res);
    }
  };

  const updateGameState = (newGame: Chess = game, syncOnline = true) => {
    setBoard(newGame.board());
    setTurn(newGame.turn());

    if (newGame.isGameOver()) {
      let res: GameResult = {};
      if (newGame.isCheckmate()) {
        res = {
          winner: newGame.turn() === 'w' ? 'b' : 'w',
          reason: `Checkmate by ${newGame.turn() === 'w' ? 'Black' : 'White'}`,
        };
      } else if (newGame.isStalemate()) {
        res = { draw: true, reason: 'Stalemate' };
      } else if (newGame.isThreefoldRepetition()) {
        res = { draw: true, reason: 'Repetition' };
      } else if (newGame.isInsufficientMaterial()) {
        res = { draw: true, reason: 'Insufficient Material' };
      } else {
        res = { draw: true, reason: 'Draw' };
      }

      endGame(res, newGame, syncOnline);
    } else {
      if (newGame.inCheck()) {
        const kingPos = findKing(newGame, newGame.turn());
        setCheckSquare(kingPos);
      } else {
        setCheckSquare(null);
      }
    }
  };

  // Online game sync
  useEffect(() => {
    if (mode === 'online' && onlineConfig?.gameId && db) {
      const gameDocRef = doc(
        db,
        'artifacts',
        APP_ID,
        'public',
        'data',
        'games',
        onlineConfig.gameId
      );

      unsubscribeRef.current = onSnapshot(
        gameDocRef,
        (docSnap) => {
          if (docSnap.exists()) {
            const data = docSnap.data();
            if (onlineConfig.playerColor === 'w' && data.black && data.status === 'active') {
              setIsOnlineWaiting(false);
            }
            if (data.status === 'finished' && data.result && !resultRef.current) {
              endGame(data.result, gameRef.current, false);
            }
            const offer = (data.drawOffer || null) as DrawOffer | null;
            setDrawOffer(offer);
            if (
              offer &&
              offer.from !== onlineConfig.playerColor &&
              !resultRef.current &&
              !promotionPending
            ) {
              setConfirmAction('accept-draw');
            }
            const remoteFen = data.fen;
            if (remoteFen && remoteFen !== gameRef.current.fen()) {
              const remoteGame = new Chess(remoteFen);
              gameRef.current = remoteGame;
              setGame(remoteGame);
              setLastMove(data.lastMove);
              playMoveSound();
              updateGameState(remoteGame, false);
            }
          }
        },
        (err) => console.error('Sync error', err)
      );
    }
    return () => {
      if (unsubscribeRef.current) {
        unsubscribeRef.current();
        unsubscribeRef.current = null;
      }
    };
  }, [mode, onlineConfig?.gameId]);

  const syncMove = async (newGame: Chess, moveData: MoveData) => {
    if (mode === 'online' && onlineConfig?.gameId && db) {
      const gameRef = doc(db, 'artifacts', APP_ID, 'public', 'data', 'games', onlineConfig.gameId);
      await updateDoc(gameRef, {
        fen: newGame.fen(),
        turn: newGame.turn(),
        lastMove: moveData,
        history: newGame.history(),
      });
    }
  };

  // Bot logic
  useEffect(() => {
    if (mode === 'bot' && turn === 'b' && !result && !promotionPending) {
      const timer = setTimeout(() => {
        const move = getBestBotMove(game, botDifficulty);
        if (move) {
          game.move(move);
          setLastMove({ from: move.from as SquareName, to: move.to as SquareName });
          playMoveSound();
          updateGameState();
        }
      }, 500);
      return () => clearTimeout(timer);
    }
  }, [turn, result, promotionPending, mode, botDifficulty]);

  const onSquareClick = (square: SquareName) => {
    if (result || promotionPending) return;
    if (!isPlayerTurn()) return;

    const moveAttempt = possibleMoves.find((m) => m.to === square);

    if (moveAttempt) {
      if (
        moveAttempt.piece === 'p' &&
        ((moveAttempt.color === 'w' && square[1] === '8') ||
          (moveAttempt.color === 'b' && square[1] === '1'))
      ) {
        setPromotionPending({ from: selectedSquare!, to: square });
        return;
      }
      game.move({ from: selectedSquare!, to: square });
      const moveData: MoveData = { from: selectedSquare!, to: square };
      setLastMove(moveData);
      playMoveSound();
      setSelectedSquare(null);
      setPossibleMoves([]);
      updateGameState();
      syncMove(game, moveData);
      return;
    }

    const piece = game.get(square);
    if (piece && piece.color === turn) {
      if (selectedSquare === square) {
        setSelectedSquare(null);
        setPossibleMoves([]);
      } else {
        setSelectedSquare(square);
        setPossibleMoves(game.moves({ square, verbose: true }));
      }
      return;
    }
    setSelectedSquare(null);
    setPossibleMoves([]);
  };

  const handlePromotion = (pieceType: PieceType) => {
    if (!promotionPending) return;
    game.move({
      from: promotionPending.from,
      to: promotionPending.to,
      promotion: pieceType,
    });
    const moveData: MoveData = {
      from: promotionPending.from,
      to: promotionPending.to,
      promotion: pieceType,
    };
    setLastMove(moveData);
    playMoveSound();
    setPromotionPending(null);
    setSelectedSquare(null);
    setPossibleMoves([]);
    updateGameState();
    syncMove(game, moveData);
  };

  const resetGame = async () => {
    if (mode === 'online') {
      onExit();
      return;
    }
    const newGame = new Chess();
    gameRef.current = newGame;
    setGame(newGame);
    setBoard(newGame.board());
    setTurn('w');
    clearResultTimeout();
    setResult(null);
    setShowResultModal(false);
    setLastMove(null);
    setCheckSquare(null);
    setSelectedSquare(null);
    setPossibleMoves([]);
    setDrawOffer(null);
    setConfirmAction(null);
  };

  const offerDraw = async () => {
    if (mode !== 'online' || !onlineConfig?.playerColor || !db || !onlineConfig.gameId) {
      drawGame();
      return;
    }
    if (drawOffer?.from === onlineConfig.playerColor) return;
    const gameDocRef = doc(
      db,
      'artifacts',
      APP_ID,
      'public',
      'data',
      'games',
      onlineConfig.gameId
    );
    await updateDoc(gameDocRef, {
      drawOffer: { from: onlineConfig.playerColor, createdAt: Date.now() },
    });
  };

  const clearDrawOffer = async () => {
    if (mode === 'online' && onlineConfig?.gameId && db) {
      const gameDocRef = doc(
        db,
        'artifacts',
        APP_ID,
        'public',
        'data',
        'games',
        onlineConfig.gameId
      );
      await updateDoc(gameDocRef, { drawOffer: null });
    }
    setDrawOffer(null);
  };

  const declineDraw = async () => {
    await clearDrawOffer();
  };

  const acceptDraw = async () => {
    endGame({ draw: true, reason: 'Draw by agreement' });
    setDrawOffer(null);
  };

  const resignGame = () => {
    const resigningColor =
      mode === 'online' ? onlineConfig?.playerColor : mode === 'bot' ? 'w' : turn;
    if (!resigningColor) return;
    const winner = resigningColor === 'w' ? 'b' : 'w';
    endGame({ winner, reason: 'Resignation' });
  };

  const drawGame = () => {
    endGame({ draw: true, reason: 'Draw by agreement' });
  };

  const getBoardSquareColor = (row: number, col: number) =>
    (row + col) % 2 === 0 ? 'bg-board-light' : 'bg-board-dark';

  // Calculate captured pieces
  const startCounts: Record<string, number> = { p: 8, n: 2, b: 2, r: 2, q: 1 };
  const currentCounts: Record<PieceColor, Record<string, number>> = {
    w: { p: 0, n: 0, b: 0, r: 0, q: 0 },
    b: { p: 0, n: 0, b: 0, r: 0, q: 0 },
  };
  board.forEach((row) =>
    row.forEach((p) => {
      if (p) currentCounts[p.color][p.type]++;
    })
  );
  const whiteLost: PieceType[] = [];
  const blackLost: PieceType[] = [];
  (['w', 'b'] as PieceColor[]).forEach((c) =>
    Object.keys(startCounts).forEach((type) => {
      for (let i = 0; i < startCounts[type] - currentCounts[c][type as PieceType]; i++) {
        (c === 'w' ? whiteLost : blackLost).push(type as PieceType);
      }
    })
  );

  const values: Record<string, number> = { p: 1, n: 3, b: 3, r: 5, q: 9 };
  let wScore = 0;
  let bScore = 0;
  whiteLost.forEach((p) => (bScore += values[p]));
  blackLost.forEach((p) => (wScore += values[p]));
  const score =
    wScore === bScore
      ? null
      : wScore > bScore
        ? { leader: 'w' as PieceColor, diff: wScore - bScore }
        : { leader: 'b' as PieceColor, diff: bScore - wScore };

  const isFlipped = mode === 'online' && onlineConfig?.playerColor === 'b';
  const moveHistory = game.history();
  const moveRows = [];
  for (let i = 0; i < moveHistory.length; i += 2) {
    moveRows.push({
      move: i / 2 + 1,
      white: moveHistory[i],
      black: moveHistory[i + 1],
    });
  }

  const hasOutgoingDrawOffer =
    mode === 'online' && drawOffer?.from === onlineConfig?.playerColor;
  const hasIncomingDrawOffer =
    mode === 'online' && drawOffer?.from && drawOffer?.from !== onlineConfig?.playerColor;

  useEffect(() => {
    clearDrawOfferTimeout();
    if (mode !== 'online' || !drawOffer) return;
    const ttlMs = 60000;
    const expiresAt = drawOffer.createdAt + ttlMs;
    const remaining = expiresAt - Date.now();
    if (remaining <= 0) {
      clearDrawOffer();
      return;
    }
    drawOfferTimeoutRef.current = window.setTimeout(() => {
      clearDrawOffer();
    }, remaining);
  }, [mode, drawOffer]);

  if (isOnlineWaiting && onlineConfig) {
    return <WaitingModal gameId={onlineConfig.gameId} onCancel={onExit} />;
  }

  const renderSquare = (r: number, c: number) => {
    const actualR = isFlipped ? 7 - r : r;
    const actualC = isFlipped ? 7 - c : c;

    const piece = board[actualR][actualC];
    const squareName = (String.fromCharCode(97 + actualC) + (8 - actualR)) as SquareName;
    const isSelected = selectedSquare === squareName;
    const isLastMoveFrom = lastMove?.from === squareName;
    const isLastMoveTo = lastMove?.to === squareName;
    const isMoveOption = possibleMoves.find((m) => m.to === squareName);
    const isCheck = checkSquare === squareName;
    const isCapture = isMoveOption && piece;
    const isDark = (actualR + actualC) % 2 !== 0;

    return (
      <div
        key={squareName}
        onClick={() => onSquareClick(squareName)}
        className={`relative flex items-center justify-center ${getBoardSquareColor(actualR, actualC)} ${isSelected ? '!bg-board-selected' : ''} ${(isLastMoveFrom || isLastMoveTo) && !isSelected ? 'highlight-last-move' : ''} cursor-pointer select-none`}
      >
        {actualC === (isFlipped ? 7 : 0) && (
          <span
            className={`absolute top-0.5 left-1 text-[0.65rem] font-bold leading-none ${isDark ? 'text-board-light/70' : 'text-board-dark/70'}`}
          >
            {8 - actualR}
          </span>
        )}
        {actualR === (isFlipped ? 0 : 7) && (
          <span
            className={`absolute bottom-0.5 right-1 text-[0.65rem] font-bold leading-none ${isDark ? 'text-board-light/70' : 'text-board-dark/70'}`}
          >
            {String.fromCharCode(97 + actualC)}
          </span>
        )}
        {isCheck && (
          <div className="absolute inset-0 rounded-full bg-red-500/50 shadow-[0_0_15px_red] z-0"></div>
        )}
        {piece && (
          <div className="w-[85%] h-[85%] z-10">
            <Piece type={piece.type} color={piece.color} />
          </div>
        )}
        {isMoveOption && !isCapture && (
          <div className="absolute w-[26%] h-[26%] bg-black/20 rounded-full z-20"></div>
        )}
        {isCapture && (
          <div className="absolute inset-[6%] border-[5px] border-black/20 rounded-full z-20"></div>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col h-screen max-w-lg mx-auto bg-zinc-900">
      <header className="flex items-center justify-between px-4 py-3 bg-zinc-900/95 border-b border-zinc-800/50">
        <button
          onClick={onExit}
          className="p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <ChevronLeft size={22} />
        </button>
        <div className="flex items-center gap-2.5">
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all ${turn === 'w' ? 'bg-white shadow-[0_0_8px_rgba(255,255,255,0.6)]' : 'bg-zinc-700'}`}
          ></div>
          <span className="font-bold text-sm text-zinc-300 tracking-wide">{turn === 'w' ? 'White' : 'Black'}'s Turn</span>
          <div
            className={`w-2.5 h-2.5 rounded-full transition-all ${turn === 'b' ? 'bg-zinc-300 shadow-[0_0_8px_rgba(200,200,200,0.4)]' : 'bg-zinc-700'}`}
          ></div>
        </div>
        <button
          onClick={resetGame}
          className="p-2 text-zinc-500 hover:text-white rounded-lg hover:bg-zinc-800 transition-colors"
        >
          <RotateCcw size={18} />
        </button>
      </header>

      <div className="flex items-center justify-between px-4 py-2.5">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700/50">
            {mode === 'bot' ? (
              <Bot size={18} className="text-zinc-500" />
            ) : (
              <User size={18} className="text-zinc-500" />
            )}
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-300">
              {mode === 'bot'
                ? botDifficulty === 1
                  ? 'Bot (Easy)'
                  : botDifficulty === 2
                    ? 'Bot (Medium)'
                    : 'Bot (Hard)'
                : mode === 'online'
                  ? 'Opponent'
                  : 'Black'}
            </div>
            <div className="flex h-4 items-center gap-0.5">
              {(isFlipped ? blackLost : whiteLost).map((p, i) => (
                <div key={i} className="w-4 h-4 opacity-70">
                  <Piece type={p} color="w" />
                </div>
              ))}
              {score && score.leader === (isFlipped ? 'w' : 'b') && (
                <span className="text-[11px] text-emerald-400 font-bold ml-1">+{score.diff}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="w-full px-2 sm:px-4 aspect-square">
        <div className="w-full h-full board-frame rounded-xl p-1.5 relative">
          <div className="grid grid-cols-8 grid-rows-8 w-full h-full rounded-sm overflow-hidden">
            {Array(8)
              .fill(null)
              .map((_, r) =>
                Array(8)
                  .fill(null)
                  .map((_, c) => renderSquare(r, c))
              )}
          </div>

        </div>
      </div>

      {result && !showResultModal && (
        <div className="mx-4 mt-2 bg-zinc-800 border border-zinc-700/60 rounded-xl p-3 flex items-center justify-between shadow-lg">
          <div className="text-sm font-bold text-white pl-2">
            {result.winner
              ? result.winner === 'w'
                ? 'White Wins'
                : 'Black Wins'
              : 'Game Drawn'}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowResultModal(true)}
              className="px-3 py-1.5 text-xs font-bold text-zinc-300 hover:text-white bg-zinc-700 hover:bg-zinc-600 rounded-lg transition-colors"
            >
              Results
            </button>
            <button
              onClick={resetGame}
              className="px-3 py-1.5 text-xs font-bold text-white bg-blue-600 hover:bg-blue-500 rounded-lg flex items-center gap-1 transition-colors"
            >
              <RotateCcw size={14} /> New Game
            </button>
          </div>
        </div>
      )}

      <div className="px-4 py-3">
        <div className="bg-zinc-800/80 border border-zinc-700/60 rounded-xl overflow-hidden">
          <div className="flex items-center justify-between px-4 py-2.5 bg-zinc-800">
            <span className="text-xs font-bold text-zinc-400 uppercase tracking-wider">
              Moves
            </span>
            <div className="flex items-center gap-2">
              <button
                onClick={() =>
                  setConfirmAction(hasIncomingDrawOffer ? 'accept-draw' : 'offer-draw')
                }
                disabled={
                  !!result ||
                  !!promotionPending ||
                  isOnlineWaiting ||
                  (mode === 'online' && hasOutgoingDrawOffer)
                }
                className="px-3 py-1 text-[11px] font-bold text-zinc-300 bg-zinc-700/80 hover:bg-zinc-600 rounded-lg disabled:opacity-30 transition-colors"
              >
                {hasOutgoingDrawOffer ? 'Draw Offered' : hasIncomingDrawOffer ? 'Respond to Draw' : 'Offer Draw'}
              </button>
              <button
                onClick={() => setConfirmAction('resign')}
                disabled={!!result || !!promotionPending || isOnlineWaiting}
                className="px-3 py-1 text-[11px] font-bold text-red-300 bg-red-900/30 hover:bg-red-900/50 rounded-lg disabled:opacity-30 transition-colors"
              >
                Resign
              </button>
            </div>
          </div>
          {(hasOutgoingDrawOffer || hasIncomingDrawOffer) && (
            <div className="px-4 py-2 text-xs font-semibold text-amber-300 bg-amber-500/10 border-t border-amber-500/20">
              {hasOutgoingDrawOffer
                ? 'Draw offer sent. Expires in 1 minute.'
                : 'Opponent offered a draw. Respond within 1 minute.'}
            </div>
          )}
          <div className="max-h-36 overflow-auto scrollbar-hide">
            {moveRows.length === 0 ? (
              <div className="px-4 py-4 text-xs text-zinc-500 text-center">No moves yet.</div>
            ) : (
              <table className="w-full text-xs">
                <tbody>
                  {moveRows.map((row, i) => (
                    <tr key={row.move} className={i % 2 === 0 ? 'bg-zinc-800/40' : 'bg-zinc-750/20'}>
                      <td className="w-10 px-3 py-1.5 text-zinc-500 font-mono text-[11px]">{row.move}.</td>
                      <td className="px-3 py-1.5 font-semibold text-zinc-200 font-mono">{row.white}</td>
                      <td className="px-3 py-1.5 text-zinc-400 font-mono">{row.black || ''}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between px-4 py-2.5 mt-auto">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full bg-zinc-800 flex items-center justify-center border border-zinc-700/50">
            <User size={18} className="text-zinc-500" />
          </div>
          <div>
            <div className="text-sm font-semibold text-zinc-300">You</div>
            <div className="flex h-4 items-center gap-0.5">
              {(isFlipped ? whiteLost : blackLost).map((p, i) => (
                <div key={i} className="w-4 h-4 opacity-70">
                  <Piece type={p} color="b" />
                </div>
              ))}
              {score && score.leader === (isFlipped ? 'b' : 'w') && (
                <span className="text-[11px] text-emerald-400 font-bold ml-1">+{score.diff}</span>
              )}
            </div>
          </div>
        </div>
      </div>

      <div className="bg-zinc-800/60 p-2 text-center text-[11px] text-zinc-500 h-8 flex items-center justify-center border-t border-zinc-800/80">
        {result
          ? result.winner
            ? `${result.winner === 'w' ? 'White' : 'Black'} wins`
            : result.reason || 'Draw'
          : <span>Modern Chess <span className="text-zinc-600">by Upcurious</span></span>}
      </div>

      {promotionPending && <PromotionModal color={turn} onPromote={handlePromotion} />}
      {confirmAction === 'offer-draw' && (
        <ConfirmModal
          title="Offer Draw?"
          message={mode === 'online' ? 'Send a draw offer to your opponent.' : 'End the game as a draw.'}
          confirmLabel={mode === 'online' ? 'Send Offer' : 'Accept Draw'}
          onConfirm={() => {
            setConfirmAction(null);
            offerDraw();
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {confirmAction === 'accept-draw' && (
        <ConfirmModal
          title="Accept Draw?"
          message="Your opponent offered a draw."
          confirmLabel="Accept Draw"
          cancelLabel="Decline"
          onConfirm={() => {
            setConfirmAction(null);
            acceptDraw();
          }}
          onCancel={() => {
            setConfirmAction(null);
            declineDraw();
          }}
        />
      )}
      {confirmAction === 'resign' && (
        <ConfirmModal
          title="Resign Game?"
          message="This will end the game immediately."
          confirmLabel="Resign"
          onConfirm={() => {
            setConfirmAction(null);
            resignGame();
          }}
          onCancel={() => setConfirmAction(null)}
        />
      )}
      {result && showResultModal && (
        <GameOverModal
          result={result}
          onRestart={resetGame}
          onExit={onExit}
          onViewBoard={() => setShowResultModal(false)}
        />
      )}
    </div>
  );
};
