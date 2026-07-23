const { Chess } = require('chess.js');
const c = new Chess();
try {
  c.loadPgn('[Event "Test"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 1-0');
  console.log('success', c.history());
} catch (e) {
  console.log('error', e.message);
}
