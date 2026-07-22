import React, { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import type { Config } from 'chessground/config';
import type { Key } from 'chessground/types';
import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';
import { Chess } from 'chess.js';
import type { Square } from 'chess.js';

interface ChessgroundBoardProps {
  fen: string;
  lastMoveUci?: string;
  onPieceDrop: (sourceSquare: string, targetSquare: string, piece: string) => boolean;
  boardOrientation: 'white' | 'black';
  boardWidth?: number;
}

export function ChessgroundBoard({ fen, lastMoveUci, onPieceDrop, boardOrientation, boardWidth }: ChessgroundBoardProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [cg, setCg] = useState<any>(null);

  // Function to calculate valid moves using chess.js
  const calcDests = (fen: string) => {
    const game = new Chess(fen);
    const dests = new Map<Key, Key[]>();
    const moves = game.moves({ verbose: true });
    
    for (const move of moves) {
      if (!dests.has(move.from as Key)) {
        dests.set(move.from as Key, []);
      }
      dests.get(move.from as Key)!.push(move.to as Key);
    }
    return dests;
  };

  useEffect(() => {
    if (ref.current && !cg) {
      const config: Config = {
        fen,
        orientation: boardOrientation,
        movable: {
          color: fen.split(' ')[1] === 'w' ? 'white' : 'black',
          free: false,
          dests: calcDests(fen),
          events: {
            after: (orig: Key, dest: Key, metadata: any) => {
              const game = new Chess(fen);
              let promotion = '';
              // Simple check for pawn promotion
              if (
                game.get(orig as Square)?.type === 'p' &&
                (dest[1] === '8' || dest[1] === '1')
              ) {
                // Default to queen promotion for simplicity
                // A complete implementation would show a promotion dialog
                promotion = 'q';
              }
              
              const success = onPieceDrop(orig, dest, promotion);
              if (!success) {
                // If invalid, the board will be re-rendered with the current fen
                // which will snap the piece back
              }
            }
          }
        },
        animation: { enabled: true, duration: 200 }
      };
      
      const newCg = Chessground(ref.current, config);
      setCg(newCg);
    }
  }, [ref.current]); // Intentionally not including cg to prevent infinite loops

  // Sync state when props change
  useEffect(() => {
    if (cg) {
      let lastMove: Key[] | undefined;
      if (lastMoveUci && lastMoveUci.length >= 4) {
        lastMove = [lastMoveUci.slice(0, 2) as Key, lastMoveUci.slice(2, 4) as Key];
      }
      
      cg.set({
        fen,
        lastMove,
        orientation: boardOrientation,
        movable: {
          color: fen.split(' ')[1] === 'w' ? 'white' : 'black',
          free: false,
          dests: calcDests(fen),
          events: {
            after: (orig: Key, dest: Key, metadata: any) => {
              const game = new Chess(fen);
              let promotion = '';
              if (
                game.get(orig as Square)?.type === 'p' &&
                (dest[1] === '8' || dest[1] === '1')
              ) {
                promotion = 'q';
              }
              
              const success = onPieceDrop(orig, dest, promotion);
              if (!success) {
                // Snap piece back if invalid
                cg.set({ fen });
              }
            }
          }
        }
      });
    }
  }, [fen, boardOrientation, cg, lastMoveUci, onPieceDrop]);

  return (
    <div
      ref={ref}
      style={{
        width: '100%',
        height: '100%',
        aspectRatio: '1 / 1',
      }}
    />
  );
}
