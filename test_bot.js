const WebSocket = require("ws");
const token = process.argv[2];
const ws = new WebSocket(`ws://localhost/ws/lobby?token=${token}`);
ws.on("open", () => {
    console.log("Connected to lobby");
    ws.send(JSON.stringify({ type: "play_bot", time_control: "10+0", target_elo: 600 }));
});
ws.on("message", (data) => {
    const msg = JSON.parse(data);
    console.log("Lobby MSG:", msg.type);
    if (msg.type === "game_ready") {
        ws.close();
        const gameWs = new WebSocket(`ws://localhost/ws/${msg.game_id}?token=${token}`);
        gameWs.on("open", () => {
            console.log("Connected to game");
        });
        gameWs.on("message", (gameData) => {
            const gMsg = JSON.parse(gameData);
            console.log("Game MSG:", gMsg.type);
            if (gMsg.type === "game_start") {
                console.log("Game started, sending e2e4");
                gameWs.send(JSON.stringify({ type: "move", uci: "e2e4" }));
            } else if (gMsg.type === "game_update") {
                console.log("Game update:", gMsg.last_move_uci);
                if (gMsg.turn === "white" && gMsg.last_move_uci !== "e2e4" && gMsg.last_move_uci !== "") {
                    console.log("Bot played! My turn again. Sending d2d4");
                    gameWs.send(JSON.stringify({ type: "move", uci: "d2d4" }));
                } else if (gMsg.last_move_uci === "d2d4") {
                    console.log("My move d2d4 was accepted! SUCCESS.");
                    process.exit(0);
                }
            } else if (gMsg.type === "error") {
                console.log("ERROR:", JSON.stringify(gMsg));
            }
        });
    }
});
