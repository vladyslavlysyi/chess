import { useEffect, useRef } from 'react';
import { Chessground } from 'chessground';
import type { Api } from 'chessground/api';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import { Chess } from 'chess.js';

interface ChessgroundBoardProps {
  fen: string;
  lastMoveUci?: string;
  /** Called after a legal drag; returns true if accepted. */
  onPieceDrop: (from: string, to: string, promotion: string) => boolean;
  boardOrientation: 'white' | 'black';
  /** The local player's color. Only this side may move (never the opponent's). */
  movableColor: 'white' | 'black' | null;
  /** When true the board is read-only (game over or reviewing a past ply). */
  viewOnly?: boolean;
  /** Highlight the king in check. */
  check?: boolean;
}

function turnColorOf(fen: string): 'white' | 'black' {
  return fen.split(' ')[1] === 'w' ? 'white' : 'black';
}

function calcDests(fen: string): Map<Key, Key[]> {
  const game = new Chess(fen);
  const dests = new Map<Key, Key[]>();
  for (const move of game.moves({ verbose: true })) {
    const from = move.from as Key;
    if (!dests.has(from)) dests.set(from, []);
    dests.get(from)!.push(move.to as Key);
  }
  return dests;
}

export function ChessgroundBoard({
  fen, lastMoveUci, onPieceDrop, boardOrientation, movableColor, viewOnly = false, check = false,
}: ChessgroundBoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const apiRef = useRef<Api | null>(null);
  // Keep the latest onPieceDrop without forcing the sync effect to re-run.
  const dropRef = useRef(onPieceDrop);
  dropRef.current = onPieceDrop;

  // Create the instance once, and destroy it on unmount (prevents leaks).
  useEffect(() => {
    if (!ref.current) return;
    apiRef.current = Chessground(ref.current, {
      fen,
      orientation: boardOrientation,
      animation: { enabled: true, duration: 200 },
    });
    return () => {
      apiRef.current?.destroy();
      apiRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Sync board to props whenever the position / permissions change.
  useEffect(() => {
    const cg = apiRef.current;
    if (!cg) return;

    const turnColor = turnColorOf(fen);
    const canMove = !viewOnly && movableColor !== null;
    const myTurn = canMove && turnColor === movableColor;

    let lastMove: Key[] | undefined;
    if (lastMoveUci && lastMoveUci.length >= 4) {
      lastMove = [lastMoveUci.slice(0, 2) as Key, lastMoveUci.slice(2, 4) as Key];
    }

    const config: Config = {
      fen,
      orientation: boardOrientation,
      turnColor,
      lastMove,
      check: check ? turnColor : undefined,
      viewOnly,
      premovable: {
        enabled: canMove,
        showDests: true,
        castle: true,
      },
      movable: {
        free: false,
        color: canMove ? movableColor! : undefined,
        dests: myTurn ? calcDests(fen) : new Map(),
        events: {
          after: (orig: Key, dest: Key) => {
            // Detect pawn promotion (default to queen — see GameBoard for the UI).
            const g = new Chess(fen);
            const piece = g.get(orig as any);
            let promotion = '';
            if (piece?.type === 'p' && (dest[1] === '8' || dest[1] === '1')) {
              promotion = 'q';
            }
            const ok = dropRef.current(orig, dest, promotion);
            if (!ok) cg.set({ fen }); // snap back
          },
        },
      },
    };
    cg.set(config);

    if (myTurn) {
      setTimeout(() => {
        // playPremove uses setTimeout so we don't dispatch during render
        apiRef.current?.playPremove();
      }, 0);
    }
  }, [fen, lastMoveUci, boardOrientation, movableColor, viewOnly, check]);

  return (
    <div ref={ref} style={{ width: '100%', height: '100%', aspectRatio: '1 / 1' }} />
  );
}
