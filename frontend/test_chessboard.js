import React from 'react';
import { renderToString } from 'react-dom/server';
import { Chessboard } from 'react-chessboard';

try {
  const html = renderToString(React.createElement(Chessboard, {
    position: "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"
  }));
  console.log("Render successful. HTML:", html);
} catch (e) {
  console.error("CAUGHT ERROR:", e);
}
