// ============================================================
// predictor.js — Motor de pronóstico inteligente
// ============================================================

const PredictorModule = (() => {

  // ── Pesos del algoritmo ──────────────────────────────────
  const WEIGHTS = {
    form:         0.30,
    h2h:          0.22,
    goalsFor:     0.16,
    goalsAgainst: 0.10,
    tablePos:     0.12,
    homeAdvantage: 0.10,
  };

  // ── Convertir forma "WWDLW" a score 0-1 ─────────────────
  function formScore(formStr = '') {
    const map = { W: 1, D: 0.4, L: 0 };
    const results = formStr.toUpperCase().split('').slice(0, 5);
    if (!results.length) return 0.5;
    // Más peso a los partidos más recientes
    const weights = [0.35, 0.25, 0.20, 0.12, 0.08];
    let score = 0, totalW = 0;
    results.forEach((r, i) => {
      score += (map[r] ?? 0.4) * (weights[i] || 0.05);
      totalW += weights[i] || 0.05;
    });
    return score / totalW;
  }

  // ── Score H2H desde array [{home, away}] ─────────────────
  function h2hScore(h2hArr = [], isHome = true) {
    if (!h2hArr.length) return 0.5;
    let pts = 0;
    h2hArr.slice(0, 5).forEach(g => {
      if (isHome) {
        if (g.home > g.away) pts += 1;
        else if (g.home === g.away) pts += 0.4;
      } else {
        if (g.away > g.home) pts += 1;
        else if (g.home === g.away) pts += 0.4;
      }
    });
    return pts / Math.min(h2hArr.length, 5);
  }

  // ── Normalizar posición de tabla (1-20 → 1-0) ────────────
  function tablePosScore(pos, maxPos = 20) {
    return Math.max(0, 1 - (pos - 1) / (maxPos - 1));
  }

  // ── Score de goles a favor (normalizado) ─────────────────
  function goalsForScore(avg) {
    // 3+ goles = perfecto, 0 = cero
    return Math.min(avg / 3.0, 1);
  }

  // ── Score de goles en contra (invertido) ─────────────────
  function goalsAgainstScore(avg) {
    return Math.max(0, 1 - avg / 3.0);
  }

  // ── Cálculo principal ────────────────────────────────────
  function calculateScores(match) {
    // PRIORIDAD 1: xG de la API — la fuente de verdad más precisa
    if (match.stats?.xgHome !== null && match.stats?.xgAway !== null) {
      return {
        homeScore: match.stats.xgHome + 0.2,
        awayScore: match.stats.xgAway,
        source: 'xg'
      };
    }

    // PRIORIDAD 2: Cuotas reales del mercado
    // Usamos el promedio de goles de la liga como base y escalamos según las probabilidades implícitas.
    // Esto evita lambdas demasiado bajas que inflan el empate.
    if (match.odds?.isReal && match.odds.home > 1 && match.odds.draw > 1 && match.odds.away > 1) {
      const rawHome = 1 / match.odds.home;
      const rawDraw = 1 / match.odds.draw;
      const rawAway = 1 / match.odds.away;
      const margin  = rawHome + rawDraw + rawAway;

      // Probabilidades reales (sin margen del bookmaker)
      const probHome = rawHome / margin;
      const probAway = rawAway / margin;

      // Promedios de goles típicos en fútbol europeo:
      // local ~1.50 goles, visitante ~1.10 goles
      // Escalamos proporcionalmente a cuán favorito es cada equipo
      // Base neutral: 45% home-win prob → lambda 1.50 | 30% away-win prob → lambda 1.10
      const lambdaHome = Math.max(0.8, (probHome / 0.45) * 1.50);
      const lambdaAway = Math.max(0.5, (probAway / 0.30) * 1.10);

      return { homeScore: lambdaHome, awayScore: lambdaAway, source: 'odds' };
    }

    // PRIORIDAD 3: Heurística de respaldo (cuando no hay ni xG ni cuotas reales)
    const { form = {}, h2h = [], stats = {}, tablePos = {} } = match;

    const homeScore =
      formScore(form.home) * WEIGHTS.form +
      h2hScore(h2h, true)  * WEIGHTS.h2h +
      goalsForScore(stats.homeGoalsFor || 1.3)  * WEIGHTS.goalsFor +
      goalsAgainstScore(stats.homeGoalsAgainst || 1.1) * WEIGHTS.goalsAgainst +
      tablePosScore(tablePos.home || 10)  * WEIGHTS.tablePos +
      1.0 * WEIGHTS.homeAdvantage + 0.08;

    const awayScore =
      formScore(form.away) * WEIGHTS.form +
      h2hScore(h2h, false) * WEIGHTS.h2h +
      goalsForScore(stats.awayGoalsFor || 1.0)  * WEIGHTS.goalsFor +
      goalsAgainstScore(stats.awayGoalsAgainst || 1.4) * WEIGHTS.goalsAgainst +
      tablePosScore(tablePos.away || 12) * WEIGHTS.tablePos +
      0.0 * WEIGHTS.homeAdvantage;

    // Los scores heurísticos son valores 0.0–1.0, pero calc1X2 necesita lambdas
    // de Poisson realistas (media goles en fútbol: local ~1.5, visitante ~1.1).
    // Escalar: min=0.9 goles, max=2.5 goles según el score relativo.
    const totalScore = homeScore + awayScore || 1;
    const LAMBDA_MIN = 0.9, LAMBDA_MAX = 2.5;
    const scale = (s) => LAMBDA_MIN + (s / totalScore) * (LAMBDA_MAX - LAMBDA_MIN) * 1.2;

    return { homeScore: Math.max(0.9, scale(homeScore)), awayScore: Math.max(0.7, scale(awayScore)), source: 'heuristic' };
  }

  // ── Helpers Poisson ──────────────────────────────────────
  function poisson(k, lambda) {
    if (k < 0 || lambda <= 0) return 0;
    let p = Math.exp(-lambda);
    for (let i = 1; i <= k; i++) p *= (lambda / i);
    return p;
  }

  // ── Probabilidades 1X2 (Dixon-Coles / Bivariate) ─────────
  function calc1X2(homeLambda, awayLambda) {
    let homeWin = 0, draw = 0, awayWin = 0;
    const rho = -0.08; // Ajuste Dixon-Coles reducido para no inflar el empate
    
    for (let x = 0; x <= 7; x++) {
      for (let y = 0; y <= 7; y++) {
        let p = poisson(x, homeLambda) * poisson(y, awayLambda);
        
        // Corrección Bivariada
        if (x === 0 && y === 0) p *= Math.max(0, 1 - homeLambda * awayLambda * rho);
        else if (x === 0 && y === 1) p *= Math.max(0, 1 + homeLambda * rho);
        else if (x === 1 && y === 0) p *= Math.max(0, 1 + awayLambda * rho);
        else if (x === 1 && y === 1) p *= Math.max(0, 1 - rho);

        if (x > y) homeWin += p;
        else if (x === y) draw += p;
        else awayWin += p;
      }
    }
    
    const total = homeWin + draw + awayWin;
    return {
      home: +(homeWin / total).toFixed(3),
      draw: +(draw / total).toFixed(3),
      away: +(awayWin / total).toFixed(3),
    };
  }

  // ── Doble Oportunidad ────────────────────────────────────
  function calcDoubleChance(probs) {
    return {
      homeDraw: Math.min(0.98, probs.home + probs.draw),
      homeAway: Math.min(0.98, probs.home + probs.away),
      drawAway: Math.min(0.98, probs.draw + probs.away),
    };
  }

  // ── Over/Under 2.5 ───────────────────────────────────────
  function calcOverUnder(stats = {}) {
    const avgGoals = (stats.homeGoalsFor || 1.2) + (stats.awayGoalsFor || 1.0);
    // Modelo Poisson simplificado
    const lambda = avgGoals;
    // P(X <= 2) con Poisson
    const p0 = Math.exp(-lambda);
    const p1 = lambda * Math.exp(-lambda);
    const p2 = (lambda ** 2 / 2) * Math.exp(-lambda);
    const under = p0 + p1 + p2;
    return {
      over: Math.min(0.95, Math.max(0.05, 1 - under)),
      under: Math.min(0.95, Math.max(0.05, under)),
      expectedGoals: +avgGoals.toFixed(2),
    };
  }

  // ── BTTS ─────────────────────────────────────────────────
  function calcBTTS(stats = {}) {
    // P(home scores) × P(away scores), modelo simplificado
    const pHomeScores = 1 - Math.exp(-(stats.homeGoalsFor || 1.2));
    const pAwayScores = 1 - Math.exp(-(stats.awayGoalsFor || 1.0));
    const btts = pHomeScores * pAwayScores;
    return {
      yes: Math.min(0.90, Math.max(0.10, btts)),
      no:  Math.min(0.90, Math.max(0.10, 1 - btts)),
    };
  }

  // ── Marcadores más probables ─────────────────────────────
  // predictedOutcome: 'home' | 'draw' | 'away' | null
  function calcMostLikelyScores(homeLambda, awayLambda, predictedOutcome, top = 3) {
    const all = [];
    for (let h = 0; h <= 5; h++) {
      for (let a = 0; a <= 5; a++) {
        const p = poisson(h, homeLambda) * poisson(a, awayLambda);
        all.push({ home: h, away: a, prob: p });
      }
    }
    all.sort((a, b) => b.prob - a.prob);

    // Función que verifica si un marcador es coherente con el pronóstico
    const matches = s => {
      if (predictedOutcome === 'home') return s.home > s.away;
      if (predictedOutcome === 'away') return s.away > s.home;
      if (predictedOutcome === 'draw') return s.home === s.away;
      return true;
    };

    // 1er marcador: el más probable CONSISTENTE con el pronóstico
    const consistent = all.filter(matches);
    const result = [];
    if (consistent.length > 0) result.push(consistent[0]);

    // Marcadores 2 y 3: los siguientes más probables globalmente (sin repetir)
    for (const s of all) {
      if (result.length >= top) break;
      if (!result.find(r => r.home === s.home && r.away === s.away)) {
        result.push(s);
      }
    }

    return result.map(s => ({ ...s, prob: +(s.prob * 100).toFixed(1) }));
  }

  // ── Córners (estimado) ────────────────────────────────────
  function calcCorners(stats = {}) {
    const base = 10;
    const homeAttackFactor = (stats.homeGoalsFor || 1.2) / 1.5;
    const awayAttackFactor = (stats.awayGoalsFor || 1.0) / 1.5;
    const expected = base * ((homeAttackFactor + awayAttackFactor) / 2);
    return {
      expected: +expected.toFixed(1),
      over9: expected > 9 ? 0.65 : 0.45,
      over11: expected > 11 ? 0.55 : 0.35,
    };
  }

  // ── Value de cuota ───────────────────────────────────────
  function calcValue(probability, bookmakerOdds) {
    if (!bookmakerOdds || bookmakerOdds <= 1) return null;
    const impliedProb = 1 / bookmakerOdds;
    const value = (probability * bookmakerOdds) - 1;
    return {
      value: +value.toFixed(3),
      hasValue: value > 0.05,
      impliedProb: +impliedProb.toFixed(3),
      realProb: +probability.toFixed(3),
    };
  }

  // ── Confianza global ─────────────────────────────────────
  function calcConfidence(probs, homeScore, awayScore) {
    const maxProb = Math.max(probs.home, probs.away, probs.draw);
    const diff = Math.abs(homeScore - awayScore);
    // Combinar dominancia de scores + probabilidad máxima
    const confidence = (maxProb * 0.6 + Math.min(diff * 1.5, 1) * 0.4) * 100;
    return Math.min(95, Math.max(30, +confidence.toFixed(1)));
  }

  // ── Determinar mejor pick ────────────────────────────────
  function getBestPick(probs, odds, homeScore, awayScore) {
    const candidates = [
      { market: '1 (Local)', prob: probs.home, odd: odds?.home, label: 'home' },
      { market: 'X (Empate)', prob: probs.draw, odd: odds?.draw, label: 'draw' },
      { market: '2 (Visitante)', prob: probs.away, odd: odds?.away, label: 'away' },
    ];

    // Primero intentar encontrar value real (con cuotas de API)
    const withValue = candidates
      .map(c => ({ ...c, val: c.odd ? c.prob * c.odd - 1 : -1 }))
      .filter(c => c.val > 0.04); // umbral mínimo de valor para evitar falsos positivos

    // Si hay valor real y la cuota es real (no simulada), usar ese pick
    // pero nunca recomendar empate si su probabilidad es la más baja
    const validValue = withValue.filter(c => !(c.label === 'draw' && c.prob < probs.home && c.prob < probs.away));

    if (validValue.length > 0) {
      return validValue.sort((a, b) => b.val - a.val)[0];
    }

    // Sin value claro: recomendar el de mayor probabilidad,
    // pero solo recomendar empate si es genuinamente el resultado más probable
    const sorted = candidates.sort((a, b) => b.prob - a.prob);
    if (sorted[0].label === 'draw' && sorted[0].prob < 0.38) {
      // El empate no supera el 38%: preferir el siguiente candidato
      return sorted[1] || sorted[0];
    }
    // Si el empate "gana" pero todos están muy apretados (sin datos reales),
    // preferir siempre el local — estadísticamente gana el 46% de las veces
    if (sorted[0].label === 'draw' &&
        Math.abs(sorted[0].prob - sorted[1].prob) < 0.06) {
      const homeCandidate = candidates.find(c => c.label === 'home');
      if (homeCandidate) return homeCandidate;
    }
    return sorted[0];
  }

  // ── H2H resumen ──────────────────────────────────────────
  function summarizeH2H(h2hArr = [], homeName = 'Local', awayName = 'Visitante') {
    if (!h2hArr.length) return null;
    let homeWins = 0, draws = 0, awayWins = 0, totalGoals = 0;
    h2hArr.slice(0, 5).forEach(g => {
      totalGoals += (g.home || 0) + (g.away || 0);
      if (g.home > g.away) homeWins++;
      else if (g.home === g.away) draws++;
      else awayWins++;
    });
    const played = Math.min(h2hArr.length, 5);
    return {
      played, homeWins, draws, awayWins,
      avgGoals: +(totalGoals / played).toFixed(1),
      lastResults: h2hArr.slice(0, 5),
    };
  }

  // ── Función principal ────────────────────────────────────
  function predict(match) {
    const { homeScore, awayScore } = calculateScores(match);
    const probs        = calc1X2(homeScore, awayScore);
    const ou           = calcOverUnder(match.stats);
    const btts         = calcBTTS(match.stats);
    const dc           = calcDoubleChance(probs);
    const corners      = calcCorners(match.stats);
    const confidence   = calcConfidence(probs, homeScore, awayScore);
    const bestPick     = getBestPick(probs, match.odds, homeScore, awayScore);
    const h2hSummary   = summarizeH2H(match.h2h, match.home?.name, match.away?.name);

    // Marcadores coherentes con el pronóstico elegido
    const predictedOutcome = bestPick?.label || null; // 'home' | 'draw' | 'away'
    const likelyScores     = calcMostLikelyScores(homeScore, awayScore, predictedOutcome);

    // Valores de cuota
    const homeValue = calcValue(probs.home, match.odds?.home);
    const drawValue = calcValue(probs.draw, match.odds?.draw);
    const awayValue = calcValue(probs.away, match.odds?.away);
    const overValue  = calcValue(ou.over, 1.85); // cuota típica Over 2.5

    return {
      match,
      scores: { home: +homeScore.toFixed(3), away: +awayScore.toFixed(3) },
      probs,
      dc,
      ou,
      btts,
      corners,
      likelyScores,
      confidence,
      bestPick,
      h2hSummary,
      values: { home: homeValue, draw: drawValue, away: awayValue, over: overValue },
      formAnalysis: {
        home: analyzeForm(match.form?.home || ''),
        away: analyzeForm(match.form?.away || ''),
      },
    };
  }

  function analyzeForm(formStr) {
    const chars = formStr.toUpperCase().split('').slice(0, 5);
    const wins = chars.filter(c => c === 'W').length;
    const draws = chars.filter(c => c === 'D').length;
    const losses = chars.filter(c => c === 'L').length;
    return { chars, wins, draws, losses, pts: wins * 3 + draws };
  }

  // ── Confianza en texto ───────────────────────────────────
  function confidenceLabel(conf) {
    if (conf >= 80) return { text: 'MUY ALTA', color: '#39ff14' };
    if (conf >= 65) return { text: 'ALTA', color: '#22c55e' };
    if (conf >= 50) return { text: 'MEDIA', color: '#fbbf24' };
    return { text: 'BAJA', color: '#ef4444' };
  }

  return { predict, confidenceLabel, analyzeForm };
})();
