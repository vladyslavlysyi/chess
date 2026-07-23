type EngineMessage = string;

export class Engine {
  private worker: Worker;
  private resolveBestMove: ((move: string) => void) | null = null;
  private onEvalUpdate: ((evaluation: number) => void) | null = null;
  private isBlackToMove: boolean = false;
  
  constructor() {
    this.worker = new Worker('/stockfish.js');
    this.worker.onmessage = this.handleMessage.bind(this);
    this.worker.postMessage('uci');
  }

  private handleMessage(event: MessageEvent) {
    const msg: EngineMessage = event.data;
    
    // Parse evaluation
    if (msg.startsWith('info depth')) {
      const scoreMatch = msg.match(/score cp (-?\d+)/);
      const mateMatch = msg.match(/score mate (-?\d+)/);
      
      if (this.onEvalUpdate) {
        if (mateMatch) {
          const mate = parseInt(mateMatch[1], 10);
          const score = mate > 0 ? 10000 : -10000;
          this.onEvalUpdate(this.isBlackToMove ? -score : score);
        } else if (scoreMatch) {
          const cp = parseInt(scoreMatch[1], 10);
          this.onEvalUpdate(this.isBlackToMove ? -cp : cp);
        }
      }
    }

    // Parse best move
    if (msg.startsWith('bestmove')) {
      const match = msg.match(/bestmove\s+([a-h][1-8][a-h][1-8][qrbn]?|\(none\))/);
      if (match && this.resolveBestMove) {
        this.resolveBestMove(match[1] === '(none)' ? '' : match[1]);
        this.resolveBestMove = null;
      }
    }
  }

  setEvalCallback(cb: (evaluation: number) => void) {
    this.onEvalUpdate = cb;
  }

  async evaluatePosition(fen: string, depth: number = 15): Promise<string> {
    return new Promise((resolve) => {
      this.isBlackToMove = fen.includes(' b ');
      this.resolveBestMove = resolve;
      this.worker.postMessage(`position fen ${fen}`);
      this.worker.postMessage(`go depth ${depth}`);
    });
  }

  stop() {
    this.worker.postMessage('stop');
  }

  quit() {
    this.worker.postMessage('quit');
  }
}
