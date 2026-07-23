import { analyzeGame } from './src/lib/analyzer.js';

const pgn = '[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0\n';
analyzeGame(pgn, (p) => console.log('Progress:', p)).then(res => console.log(res)).catch(e => console.error(e));
