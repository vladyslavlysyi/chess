import { Chess } from 'chess.js';
const c = new Chess();
try {
  c.loadPgn('[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6\n');
  console.log('moves:', c.history({ verbose: true }));
} catch(e) {
  console.error('error:', e.message);
}
