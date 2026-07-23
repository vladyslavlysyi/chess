import { Engine } from './stockfish';
import { Chess } from 'chess.js';

export type MoveClassification = 'best' | 'excellent' | 'good' | 'inaccuracy' | 'mistake' | 'blunder' | 'book';

export interface PlyAnalysis {
  evaluation: number; // in centipawns, always from White's perspective
  bestMove: string | null;
  classification?: MoveClassification;
}

export interface GameAnalysis {
  plies: PlyAnalysis[];
  whiteAccuracy: number;
  blackAccuracy: number;
}

function cpToWinProb(cp: number): number {
  // Lichess win probability formula
  return 0.5 + 0.5 * (2 / (1 + Math.exp(-0.00368208 * cp)) - 1);
}

export async function analyzeGame(pgn: string, onProgress: (progress: number) => void): Promise<GameAnalysis> {
  const game = new Chess();
  game.loadPgn(pgn);
  
  const history = game.history({ verbose: true });
  const fens: string[] = [new Chess().fen()]; // initial position
  
  const tempGame = new Chess();
  for (const move of history) {
    tempGame.move(move);
    fens.push(tempGame.fen());
  }

  const engine = new Engine();
  const plies: PlyAnalysis[] = [];
  
  for (let i = 0; i < fens.length; i++) {
    const fen = fens[i];
    
    // Evaluate position (depth 10 is fast enough for browser analysis ~0.1-0.2s per ply)
    let currentEval = 0;
    engine.setEvalCallback((val) => {
      currentEval = val;
    });
    
    const bestMove = await engine.evaluatePosition(fen, 10);
    
    plies.push({
      evaluation: currentEval, // already from White's perspective (stockfish.ts does it)
      bestMove,
    });
    
    onProgress(Math.round(((i + 1) / fens.length) * 100));
  }
  
  engine.stop();

  // Calculate classifications and accuracy
  let whiteAccuracySum = 0;
  let blackAccuracySum = 0;
  let whiteMoves = 0;
  let blackMoves = 0;

  for (let i = 1; i < plies.length; i++) {
    const prevEval = plies[i - 1].evaluation;
    const currEval = plies[i].evaluation;
    const isWhiteMove = i % 2 !== 0; // i=1 is white's first move

    const prevProb = cpToWinProb(isWhiteMove ? prevEval : -prevEval);
    const currProb = cpToWinProb(isWhiteMove ? currEval : -currEval);
    
    // Win probability drop
    const probDrop = Math.max(0, prevProb - currProb);
    const moveAccuracy = 100 - (probDrop * 100);
    
    if (isWhiteMove) {
      whiteAccuracySum += moveAccuracy;
      whiteMoves++;
    } else {
      blackAccuracySum += moveAccuracy;
      blackMoves++;
    }

    // CP loss for classification
    const cpLoss = isWhiteMove ? (prevEval - currEval) : (currEval - prevEval);
    
    let classification: MoveClassification = 'best';
    if (i <= 4) classification = 'book'; // very simple book
    else if (cpLoss < 20) classification = 'best';
    else if (cpLoss < 50) classification = 'excellent';
    else if (cpLoss < 100) classification = 'good';
    else if (cpLoss < 200) classification = 'inaccuracy';
    else if (cpLoss < 300) classification = 'mistake';
    else classification = 'blunder';

    plies[i].classification = classification;
  }

  return {
    plies,
    whiteAccuracy: whiteMoves > 0 ? Math.round(whiteAccuracySum / whiteMoves) : 100,
    blackAccuracy: blackMoves > 0 ? Math.round(blackAccuracySum / blackMoves) : 100,
  };
}
