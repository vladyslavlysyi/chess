import asyncio
import uuid
from app.services.game_service import GameSession, PlayerInfo
from app.ws import manager

async def test_timeout():
    p1 = PlayerInfo(user_id=uuid.uuid4(), display_name="P1", elo=1200, ws=object())
    p2 = PlayerInfo(user_id=None, display_name="Stockfish", elo=600, ws=object(), is_bot=True)
    session = GameSession(game_id=str(uuid.uuid4()), white=p1, black=p2, time_control="1+0")
    
    # artificially reduce time
    session.white_time = 0.6
    
    await session.start()
    print("Started. Waiting for timeout...")
    
    # Wait for the clock task to fire
    await asyncio.sleep(2)
    print("Is over?", session.is_over)

asyncio.run(test_timeout())
