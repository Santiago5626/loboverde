// ============================================================
// combinada.js — Motor de combinada inteligente
// ============================================================

const CombinadaModule = (() => {

  const MIN_CONFIDENCE = 50;   // % mínimo de confianza
  const MIN_VALUE = 0.03; // value mínimo aceptable
  const MAX_PICKS = 5;    // máximo picks en combinada
  const MIN_PICKS = 3;    // mínimo para recomendar

  function oddsQuality(odds) {
    if (!odds || odds <= 1) return 0.4;
    if (odds < 1.35) return 0.4;
    if (odds < 1.55) return 0.8;
    if (odds <= 2.40) return 1.0;
    if (odds <= 3.20) return 0.85;
    return 0.6;
  }

  function stabilityScore(prediction) {
    const diff = Math.abs((prediction.probs.home || 0) - (prediction.probs.away || 0));
    if (diff > 0.35) return 1;
    if (diff > 0.20) return 0.8;
    return 0.5;
  }

  function volatilityPenalty(match) {
    const league = (match.league?.name || '').toLowerCase();
    const riskyLeagues = ['youth', 'u21', 'women', 'friendly', 'reserve', 'cup', 'copa'];
    if (riskyLeagues.some(r => league.includes(r))) {
      return 0.55;
    }
    return 1;
  }

  function marketAgreement(modelProb, odds) {
    if (!odds || odds <= 1 || !modelProb) return 0.6;
    const implied = 1 / odds;
    const diff = Math.abs(modelProb - implied);
    if (diff < 0.05) return 1;
    if (diff < 0.10) return 0.85;
    return 0.6;
  }

  function valueScore(value) {
    if (!value || value <= 0) return 0.2;
    return Math.min(1, value / 0.2 + 0.2);
  }

  function probabilityScore(prob) {
    if (!prob) return 0.2;
    return Math.min(1, Math.max(0, (prob - 0.4) / 0.3));
  }

  function formScore(match) {
    const parseForm = form => {
      if (!form) return 0.5;
      const chars = form.toUpperCase().split('').filter(c => ['W', 'D', 'L'].includes(c));
      if (!chars.length) return 0.5;
      const wins = chars.filter(c => c === 'W').length;
      const draws = chars.filter(c => c === 'D').length;
      return Math.min(1, (wins + draws * 0.5) / chars.length);
    };
    return (parseForm(match.form?.home) + parseForm(match.form?.away)) / 2;
  }

  function riskIndex(item) {
    const odds = item.pick.odds || 0;
    const volatility = 1 - volatilityPenalty(item.prediction.match);
    const lowConfidenceRisk = item.prediction.confidence < 60 ? (0.7 - (item.prediction.confidence - 45) / 50) : 0;
    const lowValueRisk = item.pick.value < 0.05 ? 0.4 : 0;
    const oddsRisk = odds > 3.5 ? 1 : odds > 2.4 ? 0.7 : 0.35;
    return Math.min(1, (oddsRisk + volatility + lowConfidenceRisk + lowValueRisk) / 4);
  }

  function smartScore(item) {
    const confidence = item.prediction.confidence / 100;
    const value = valueScore(item.pick.value);
    const probability = probabilityScore(item.pick.prob);
    const oddsStable = oddsQuality(item.pick.odds);
    const marketTrust = marketAgreement(item.pick.prob, item.pick.odds);
    const form = formScore(item.prediction.match);
    return (
      confidence * 0.30 +
      value * 0.25 +
      probability * 0.20 +
      oddsStable * 0.10 +
      marketTrust * 0.10 +
      form * 0.05
    );
  }

  // ── Criterio de Kelly simplificado ───────────────────────
  // f = (p*b - q) / b  donde b = cuota-1, p=prob real, q=1-p
  function kelly(prob, odds) {
    if (!odds || odds <= 1) return 0;
    const b = odds - 1;
    const q = 1 - prob;
    const f = (prob * b - q) / b;
    // Fracción de Kelly (usamos 1/4 para ser conservadores)
    return Math.max(0, f * 0.25);
  }

  // ── Seleccionar el mejor mercado de un partido ────────────
  function selectBestMarket(prediction) {
    const { probs, ou, btts, values, match, confidence } = prediction;

    const candidates = [];

    // 1X2 candidates
    if (values.home && values.home.hasValue) {
      candidates.push({
        market: '1 - Local',
        pick: match.home?.name,
        prob: probs.home,
        odds: match.odds?.home,
        value: values.home.value,
        type: '1x2',
      });
    }
    if (values.away && values.away.hasValue) {
      candidates.push({
        market: '2 - Visitante',
        pick: match.away?.name,
        prob: probs.away,
        odds: match.odds?.away,
        value: values.away.value,
        type: '1x2',
      });
    }
    if (values.draw && values.draw.hasValue) {
      candidates.push({
        market: 'X - Empate',
        pick: 'Empate',
        prob: probs.draw,
        odds: match.odds?.draw,
        value: values.draw.value,
        type: '1x2',
      });
    }

    // Over 2.5 candidate
    if (ou.over > 0.62 && values.over && values.over.hasValue) {
      candidates.push({
        market: 'Over 2.5 Goles',
        pick: 'Más de 2.5 goles',
        prob: ou.over,
        odds: 1.85,
        value: values.over.value,
        type: 'ou',
      });
    }

    // BTTS candidate (si alta probabilidad)
    if (btts.yes > 0.68) {
      const bttsValue = btts.yes * 1.80 - 1;
      if (bttsValue > MIN_VALUE) {
        candidates.push({
          market: 'Ambos Anotan (Sí)',
          pick: 'BTTS - Sí',
          prob: btts.yes,
          odds: 1.80,
          value: bttsValue,
          type: 'btts',
        });
      }
    }

    // Si no hay value, tomar el de mayor probabilidad con cuota mínima razonable
    if (!candidates.length) {
      const bestProb = Math.max(probs.home, probs.away);
      if (bestProb > 0.58) {
        const isHome = probs.home >= probs.away;
        candidates.push({
          market: isHome ? '1 - Local' : '2 - Visitante',
          pick: isHome ? match.home?.name : match.away?.name,
          prob: bestProb,
          odds: isHome ? match.odds?.home : match.odds?.away,
          value: bestProb * (isHome ? (match.odds?.home || 2) : (match.odds?.away || 2)) - 1,
          type: '1x2',
          noValue: true,
        });
      }
    }

    if (!candidates.length) return null;

    // Ordenar por smart score y tomar el mejor
    return candidates
      .map(item => ({ ...item, smart: smartScore({ prediction, pick: item }) }))
      .sort((a, b) => b.smart - a.smart)[0];
  }

  // ── Diversidad de mercados ────────────────────────────────
  // Evitar poner el mismo tipo de mercado >3 veces en combinada
  function diversityPenalty(selectedTypes, newType) {
    const count = selectedTypes.filter(t => t === newType).length;
    return count >= 3 ? 0.5 : 1.0; // penaliza si hay demasiados del mismo tipo
  }

  // ── Construir combinada ───────────────────────────────────
  function buildCombinada(predictions) {
    // Filtrar partidos con confianza mínima
    const eligible = predictions
      .filter(p => {
        // Solo incluir si tiene datos reales (ML o cuotas reales)
        const hasRealData = p.match.mlPrediction != null || p.match.odds?.isReal;
        return hasRealData && p.confidence >= MIN_CONFIDENCE;
      })
      .map(p => {
        const bestMarket = selectBestMarket(p);
        return bestMarket ? { prediction: p, pick: bestMarket } : null;
      })
      .filter(Boolean);

    if (!eligible.length) return null;

    const filtered = eligible.filter(e => {
      const odds = e.pick.odds || 0;
      const leaguePenalty = volatilityPenalty(e.prediction.match);
      if (leaguePenalty < 0.7) return false;
      if (odds > 4.0 && e.prediction.confidence < 70) return false;
      if (odds > 3.5 && e.prediction.confidence < 62) return false;
      if (odds > 5.0) return false;
      if (e.pick.market.includes('Empate') && odds > 4.0) return false;
      return true;
    });
    if (!filtered.length) return null;

    // Ordenar por smart score: score profesional multi-factor
    const scored = filtered.map(e => ({
      ...e,
      smart: smartScore(e),
      risk: riskIndex(e),
    })).filter(e => e.risk <= 0.7)
      .sort((a, b) => b.smart - a.smart);

    if (!scored.length) return null;

    // Seleccionar sin repetir mismo partido
    const selected = [];
    const usedIds = new Set();
    const usedTypes = [];

    for (const item of scored) {
      if (selected.length >= MAX_PICKS) break;
      const matchId = item.prediction.match.id;
      if (usedIds.has(matchId)) continue;

      const penalty = diversityPenalty(usedTypes, item.pick.type);
      if (penalty < 0.8 && selected.length >= MIN_PICKS) continue;

      usedIds.add(matchId);
      usedTypes.push(item.pick.type);
      selected.push(item);
    }

    if (selected.length < MIN_PICKS) return null;

    // Calcular cuota y probabilidad total
    const totalOdds = selected.reduce((acc, s) => acc * (s.pick.odds || 1), 1);
    if (totalOdds > 15) return null;
    const totalProb = selected.reduce((acc, s) => acc * s.pick.prob, 1);
    const impliedProb = 1 / totalOdds;
    const totalValue = totalProb - impliedProb;

    // Nivel de riesgo
    const avgConf = selected.reduce((a, s) => a + s.prediction.confidence, 0) / selected.length;
    let riskLevel, riskColor;
    if (avgConf >= 72 && selected.length <= 4) {
      riskLevel = 'BAJO'; riskColor = '#22c55e';
    } else if (avgConf >= 60 || selected.length <= 5) {
      riskLevel = 'MEDIO'; riskColor = '#fbbf24';
    } else {
      riskLevel = 'ALTO'; riskColor = '#ef4444';
    }

    // Kelly para combinada
    const kellyFraction = kelly(totalProb, totalOdds);
    const stakeRecommendation = Math.min(kellyFraction * 100, 5); // máx 5% del bankroll

    return {
      picks: selected,
      totalOdds: +totalOdds.toFixed(2),
      totalProb: +(totalProb * 100).toFixed(1),
      impliedProb: +(impliedProb * 100).toFixed(1),
      totalValue: +totalValue.toFixed(3),
      hasValue: totalValue > 0,
      avgConfidence: +avgConf.toFixed(1),
      riskLevel, riskColor,
      stakeRecommendation: +stakeRecommendation.toFixed(2),
      pickCount: selected.length,
    };
  }

  // ── Generar variantes de combinada ────────────────────────
  function generateVariants(predictions) {
    // Variante 1: Conservadora (solo alta confianza, menos picks)
    const conservative = predictions
      .filter(p => p.confidence >= 72)
      .slice(0, 3);

    // Variante 2: Estándar (balance riesgo/cuota)
    const standard = predictions
      .filter(p => p.confidence >= 62)
      .slice(0, 4);

    // Variante 3: Arriesgada (más picks, pero aún controlada)
    const risky = predictions
      .filter(p => p.confidence >= 55)
      .slice(0, 5);

    return {
      conservative: conservative.length >= 2 ? buildCombinada(conservative) : null,
      standard: standard.length >= 3 ? buildCombinada(standard) : null,
      risky: risky.length >= 4 ? buildCombinada(risky) : null,
    };
  }

  return { buildCombinada, generateVariants, kelly };
})();
