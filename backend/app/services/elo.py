"""
Glicko-2 Rating System Implementation.

Glicko-2 is used by FIDE and lichess.org. It improves on classic ELO by:
  - Tracking rating deviation (RD): uncertainty in a player's rating.
  - Higher RD → bigger rating changes (new players adjust faster).
  - Lower RD → smaller changes (established players are more stable).

Reference: http://www.glicko.net/glicko/glicko2.pdf
"""
import math
from dataclasses import dataclass


# Glicko-2 constants
_q = math.log(10) / 400  # = ln(10) / 400
_PI2 = math.pi ** 2


@dataclass
class GlickoPlayer:
    rating: float   # e.g. 1500
    rd: float       # Rating Deviation, e.g. 200
    vol: float = 0.06  # Volatility (σ), typically 0.06


def _g(rd: float) -> float:
    """Reduction factor based on opponent's RD."""
    return 1.0 / math.sqrt(1 + (3 * _q**2 * rd**2) / _PI2)


def _E(r: float, r_j: float, rd_j: float) -> float:
    """Expected score (win probability) against opponent."""
    return 1.0 / (1 + 10 ** (-_g(rd_j) * (r - r_j) / 400))


def calculate_glicko2(
    player: GlickoPlayer,
    opponents: list[GlickoPlayer],
    scores: list[float],      # 1.0 = win, 0.5 = draw, 0.0 = loss
) -> GlickoPlayer:
    """
    Calculate new Glicko-2 rating after a rating period.
    Returns a new GlickoPlayer with updated rating, rd, and vol.
    """
    if not opponents:
        # No games played — RD increases (certainty decreases)
        new_rd = min(math.sqrt(player.rd**2 + player.vol**2), 350.0)
        return GlickoPlayer(player.rating, new_rd, player.vol)

    # Convert to Glicko-2 scale (μ, φ)
    mu = (player.rating - 1500) / 173.7178
    phi = player.rd / 173.7178
    sigma = player.vol

    mu_j = [(opp.rating - 1500) / 173.7178 for opp in opponents]
    phi_j = [opp.rd / 173.7178 for opp in opponents]
    g_j = [_g(p * 173.7178) for p in phi_j]
    E_j = [1 / (1 + math.exp(-g * (mu - m))) for g, m in zip(g_j, mu_j)]

    # Step 3: Compute v (variance)
    v = 1.0 / sum(g**2 * E * (1 - E) for g, E in zip(g_j, E_j))

    # Step 4: Compute delta (improvement estimate)
    delta = v * sum(g * (s - E) for g, E, s in zip(g_j, E_j, scores))

    # Step 5: Update volatility (Illinois algorithm)
    tau = 0.5  # system constant (controls volatility change rate)
    a = math.log(sigma**2)

    def f(x):
        ex = math.exp(x)
        return (
            (ex * (delta**2 - phi**2 - v - ex)) /
            (2 * (phi**2 + v + ex)**2)
            - (x - a) / tau**2
        )

    A = a
    B = math.log(delta**2 - phi**2 - v) if delta**2 > phi**2 + v else a - tau
    fA, fB = f(A), f(B)

    for _ in range(100):  # max iterations
        C = A + (A - B) * fA / (fB - fA)
        fC = f(C)
        if fC * fB <= 0:
            A, fA = B, fB
        else:
            fA /= 2
        B, fB = C, fC
        if abs(B - A) < 1e-6:
            break

    new_sigma = math.exp(A / 2)

    # Step 6: Update phi and mu
    phi_star = math.sqrt(phi**2 + new_sigma**2)
    new_phi = 1 / math.sqrt(1 / phi_star**2 + 1 / v)
    new_mu = mu + new_phi**2 * sum(g * (s - E) for g, E, s in zip(g_j, E_j, scores))

    # Convert back to Glicko-1 scale
    new_rating = 173.7178 * new_mu + 1500
    new_rd = 173.7178 * new_phi

    return GlickoPlayer(
        rating=round(new_rating),
        rd=min(round(new_rd, 1), 350.0),
        vol=round(new_sigma, 6),
    )


def single_game_update(
    player: GlickoPlayer,
    opponent: GlickoPlayer,
    score: float,  # 1.0=win, 0.5=draw, 0.0=loss
) -> tuple[GlickoPlayer, int]:
    """
    Update rating after a single game.
    Returns (new_player, rating_delta).
    """
    new_player = calculate_glicko2(player, [opponent], [score])
    delta = int(new_player.rating) - int(player.rating)
    return new_player, delta
