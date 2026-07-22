import asyncio
import websockets
import json
import urllib.request
import urllib.error

async def test_bot_game():
    data = json.dumps({"username": "testuser2", "email": "test2@test.com", "password": "password"}).encode('utf-8')
    req = urllib.request.Request("http://localhost:8000/auth/register", data=data, headers={'Content-Type': 'application/json'})
    try:
        with urllib.request.urlopen(req) as f:
            resp = json.loads(f.read().decode('utf-8'))
            token = resp.get("access_token")
    except urllib.error.HTTPError as e:
        if e.code == 400:
            req_login = urllib.request.Request("http://localhost:8000/auth/login", data=json.dumps({"username": "testuser2", "password": "password"}).encode('utf-8'), headers={'Content-Type': 'application/json'})
            with urllib.request.urlopen(req_login) as f:
                resp = json.loads(f.read().decode('utf-8'))
                token = resp.get("access_token")
        else:
            raise

    print(f"Token: {token[:10]}...")

    uri = f"ws://localhost:8000/ws/lobby?token={token}"
    async with websockets.connect(uri) as ws_lobby:
        print("Connected to lobby")
        await ws_lobby.send(json.dumps({
            "type": "play_bot",
            "time_control": "10+0",
            "target_elo": 1500
        }))
        response = await ws_lobby.recv()
        print(f"Lobby response: {response}")
        msg = json.loads(response)
        
        if msg.get("type") == "game_ready":
            game_id = msg["game_id"]
            color = msg["color"]
            
            # Now close lobby
            await ws_lobby.close()
            
            # Connect to game socket
            game_uri = f"ws://localhost:8000/ws/{game_id}?token={token}"
            print(f"Connecting to {game_uri}")
            async with websockets.connect(game_uri) as ws_game:
                print("Connected to game")
                while True:
                    game_response = await ws_game.recv()
                    print(f"Game msg: {game_response}")
                    break

asyncio.run(test_bot_game())
