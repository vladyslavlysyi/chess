const WebSocket = require('ws');

async function main() {
  const url1 = 'ws://127.0.0.1/ws/lobby';
  const url2 = 'ws://127.0.0.1/ws/lobby';
  
  const ws1 = new WebSocket(url1);
  const ws2 = new WebSocket(url2);

  let p1Ready = new Promise(resolve => ws1.on('open', resolve));
  let p2Ready = new Promise(resolve => ws2.on('open', resolve));

  await Promise.all([p1Ready, p2Ready]);
  console.log("Both connected to lobby");

  ws1.send(JSON.stringify({ type: 'find_match', timeControl: '10+0', mode: 'casual' }));
  ws2.send(JSON.stringify({ type: 'find_match', timeControl: '10+0', mode: 'casual' }));

  let p1Matched = new Promise(resolve => {
    ws1.on('message', data => {
      let msg = JSON.parse(data);
      if (msg.type === 'game_ready') {
        resolve(msg);
      }
    });
  });

  let p2Matched = new Promise(resolve => {
    ws2.on('message', data => {
      let msg = JSON.parse(data);
      if (msg.type === 'game_ready') {
        resolve(msg);
      }
    });
  });

  const [match1, match2] = await Promise.all([p1Matched, p2Matched]);
  console.log("Matched!", match1.game_id);

  ws1.close();
  ws2.close();

  // Connect to game socket
  const g1 = new WebSocket(`ws://127.0.0.1/ws/${match1.game_id}?seat_token=${match1.seat_token}`);
  
  // Connect P1 first
  g1.on('message', data => console.log('P1 Game Msg:', data.toString()));
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Then connect P2
  const g2 = new WebSocket(`ws://127.0.0.1/ws/${match2.game_id}?seat_token=${match2.seat_token}`);
  g2.on('message', data => console.log('P2 Game Msg:', data.toString()));

  await new Promise(resolve => setTimeout(resolve, 3000));
  g1.close();
  g2.close();
  console.log("Done");
}

main().catch(console.error);
