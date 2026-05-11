// ============================================================
// landing.js — Lógica de la Landing Page Pública
// ============================================================

console.log('[Landing] script loaded');

function normalizeMarketKey(label) {
    if (!label) return null;
    const text = label.toLowerCase();
    if (text.includes('local') || text.includes('home') || text.includes('ganador local') || text.includes('gana local') || text.includes('victoria local')) return 'home';
    if (text.includes('visitante') || text.includes('away') || text.includes('gana visitante') || text.includes('victoria visitante')) return 'away';
    if (text.includes('empate') || text.includes('draw')) return 'draw';
    if (text.includes('over') || text.includes('más de') || text.includes('2.5') || text.includes('over 2.5')) return 'over25';
    if (text.includes('btts') || text.includes('ambos anotan') || text.includes('sí')) return 'bttsYes';
    return null;
}

function fallbackOdds(probability) {
    if (!probability || probability <= 0) return 1.8;
    const implied = 1 / Math.max(0.12, probability);
    return Math.min(4.5, Math.max(1.45, implied * 0.92));
}

console.log('[Landing] script loaded');

function getOddsForMarket(match, key, prediction) {
    if (!match || !key) return null;
    const odds = match.odds || {};
    switch (key) {
        case 'home': return odds.home || fallbackOdds(prediction?.probs?.home);
        case 'draw': return odds.draw || fallbackOdds(prediction?.probs?.draw);
        case 'away': return odds.away || fallbackOdds(prediction?.probs?.away);
        case 'over25': return odds.over25 || fallbackOdds(prediction?.ou?.over);
        case 'bttsYes': return odds.bttsYes || fallbackOdds(prediction?.btts?.yes);
        default: return null;
    }
}

function buildAIPick(match, prediction, ai) {
    const aiKey = normalizeMarketKey(ai.recomendacion);
    if (!aiKey) return null;

    const odds = getOddsForMarket(match, aiKey, prediction);
    if (!odds) return null;

    const modelKey = normalizeMarketKey(prediction.bestPick?.market);
    const agreement = modelKey && modelKey === aiKey;

    const aiStrength = ai.confianza === 'Alta' ? 1.0 : ai.confianza === 'Media' ? 0.85 : 0.7;
    const modelStrength = prediction.confidence / 100;
    const score = ((agreement ? 1.4 : 1.0) * (modelStrength * 0.55 + aiStrength * 0.45)) + Math.min(0.25, 1 / odds);

    return {
        match,
        prediction,
        ai,
        label: ai.recomendacion,
        marketKey: aiKey,
        odds,
        agreement,
        score,
    };
}

async function buildAIFallback(matches, predictions) {
    if (typeof GeminiModule === 'undefined') return null;

    const aiResults = await Promise.allSettled(predictions.map(p => GeminiModule.analyzeMatch(p.match, p)));
    const candidates = aiResults.map((result, index) => {
        if (result.status !== 'fulfilled' || !result.value) return null;
        return buildAIPick(matches[index], predictions[index], result.value);
    }).filter(Boolean);

    if (!candidates.length) return null;

    const selected = [];
    const usedIds = new Set();
    candidates.sort((a, b) => b.score - a.score).forEach(item => {
        if (selected.length >= 4) return;
        if (usedIds.has(item.match.id)) return;
        usedIds.add(item.match.id);
        selected.push(item);
    });

    if (selected.length === 0) return null;

    const totalOdds = selected.reduce((acc, item) => acc * item.odds, 1);
    return {
        picks: selected,
        totalOdds: +totalOdds.toFixed(2),
        method: 'IA',
    };
}

function normalizePickFromPrediction(pred) {
    if (!pred) return null;
    const probs = pred.probs || {};
    const picks = [
        { key: 'home', prob: probs.home, label: `Gana ${pred.match.home.name}` },
        { key: 'draw', prob: probs.draw, label: 'Empate' },
        { key: 'away', prob: probs.away, label: `Gana ${pred.match.away.name}` }
    ];

    if (pred.ou && pred.ou.over != null && pred.ou.over > 0.6) {
        picks.push({ key: 'over25', prob: pred.ou.over, label: 'Más de 2.5 Goles' });
    }
    if (pred.btts && pred.btts.yes != null && pred.btts.yes > 0.65) {
        picks.push({ key: 'bttsYes', prob: pred.btts.yes, label: 'Ambos Anotan: Sí' });
    }

    picks.sort((a, b) => (b.prob || 0) - (a.prob || 0));
    return picks[0] || null;
}

function buildModelFallback(predictions) {
    const candidates = predictions
        .map(pred => {
            const primary = pred.bestPick && (pred.bestPick.odds || pred.bestPick.odd != null)
                ? {
                    label: pred.bestPick.market || pred.bestPick.label,
                    odds: pred.bestPick.odds || pred.bestPick.odd,
                    prob: pred.bestPick.prob || 0,
                    value: pred.bestPick.value || 0
                }
                : null;
            const derived = normalizePickFromPrediction(pred);
            const marketKey = primary ? primary.label : derived?.key;
            const label = primary ? primary.label : derived?.label;
            const odds = primary?.odds || getOddsForMarket(pred.match, derived?.key, pred) || fallbackOdds(derived?.prob || pred.confidence / 100);
            const prob = primary?.prob || derived?.prob || 0;
            if (!label || !odds) return null;

            return {
                match: pred.match,
                pick: { market: label, odds, prob, value: (prob * odds - 1) },
                confidence: pred.confidence,
                score: (prob || 0) + (pred.confidence || 0) * 0.01,
            };
        })
        .filter(Boolean)
        .sort((a, b) => b.score - a.score);

    if (!candidates.length) return null;

    // Filtrar por confianza alta y cuotas conservadoras para viabilidad
    const viable = candidates.filter(c => c.confidence >= 50 && c.pick.odds >= 1.5 && c.pick.odds <= 3.5);
    // Si no hay suficientes viables, usar los de menor cuota
    const selected = viable.length >= 2 ? viable.slice(0, 2) : candidates.sort((a, b) => a.pick.odds - b.pick.odds).slice(0, 2);
    const totalOdds = selected.reduce((acc, item) => acc * item.pick.odds, 1);
    return {
        picks: selected,
        totalOdds: +totalOdds.toFixed(2),
        method: 'MODELO',
    };
}

function renderFallbackHtml(type, fallback) {
    const label = type === 'IA' ? 'CUOTA SUGERIDA IA' : 'CUOTA SUGERIDA MODELO';
    let html = `
        <div style="margin-bottom: 1rem; text-align: center;">
            <span style="display:inline-block; padding:0.3rem 0.8rem; background:var(--glass-bg); border:1px solid var(--gold); color:var(--gold); border-radius:4px; font-weight:bold; font-size:0.9rem;">
                ${label}: ${fallback.totalOdds.toFixed(2)}
            </span>
        </div>
        <div style="margin-bottom: 1rem; color: var(--silver-dim); text-align:center; font-size:0.95rem;">
            Pronóstico ${type === 'IA' ? 'de IA' : 'del modelo'} generado aunque no fue posible formar una combinada completa.
        </div>
        <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.5rem;">
    `;

    fallback.picks.forEach(item => {
        const marketLabel = item.label || item.pick?.market || 'Pick';
        const oddsValue = item.odds || item.pick?.odds;
        html += `
            <li style="background: rgba(0,0,0,0.3); padding: 0.8rem; border-radius: 8px; border: 1px solid var(--glass-border);">
                <div style="font-size: 0.85rem; color: var(--silver-dim); margin-bottom: 0.3rem;">
                    ${item.match.league.name}
                </div>
                <div style="font-weight:600; font-size:0.95rem;">
                    ${item.match.home.name} vs ${item.match.away.name}
                </div>
                <div style="margin-top:0.5rem; color:var(--green-neon); font-weight:bold;">
                    ▶ ${marketLabel} @ ${oddsValue ? oddsValue.toFixed(2) : '---'}
                </div>
            </li>
        `;
    });

    html += `</ul>`;
    return html;
}

function renderLandingError(container, message, error) {
    if (!container) return;
    console.error('[Landing] Error:', message, error);
    container.innerHTML = `
        <div style="padding:1rem; border:1px solid rgba(255,0,0,0.3); border-radius:12px; background:rgba(255,0,0,0.06); color:#ffdddd;">
            <strong>Error al generar el pronóstico:</strong>
            <div style="margin-top:0.5rem;">${message}</div>
            <div style="margin-top:0.75rem; font-size:0.85rem; opacity:0.8;">${error?.message || error || 'Sin más detalles'}</div>
        </div>
    `;
}

async function initLanding() {
    const pickContainer = document.getElementById('landing-pick-content');
    if (pickContainer) pickContainer.innerHTML = 'Script ejecutado correctamente';
    pickContainer.innerHTML = 'Iniciando carga de pronóstico...';
    console.log('[Landing] container found, starting load');

    try {
        console.log('[Landing] calling getMatches');
        const matches = await MatchesModule.getMatches(0);
        console.log('[Landing] getMatches result:', matches?.length);
        console.log('[Landing] getMatches result:', matches?.length);

        const oddsPromises = matches.map(match => MatchesModule.fetchMatchOdds(match.id));
        const predictionPromises = matches.map(match => MatchesModule.fetchMatchPrediction(match.id));
        const [oddsResults, predResults] = await Promise.all([
            Promise.allSettled(oddsPromises),
            Promise.allSettled(predictionPromises)
        ]);

        oddsResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                matches[index].odds = result.value;
            }
        });

        predResults.forEach((result, index) => {
            if (result.status === 'fulfilled' && result.value) {
                matches[index].mlPrediction = result.value;
                if (result.value.xgHome != null) {
                    matches[index].stats.xgHome = +result.value.xgHome;
                    matches[index].stats.xgAway = +result.value.xgAway;
                }
            }
        });

        if (matches.length < 3) {
            pickContainer.innerHTML = '<p style="text-align:center; color:var(--silver-dim);">Hoy no hay suficientes partidos para un pronóstico seguro.</p>';
            return;
        }

        console.log('[Landing] partidos cargados:', matches.length);
        console.log('[Landing] odds cargadas:', oddsResults.filter(r => r.status === 'fulfilled' && r.value).length);
        console.log('[Landing] predicciones ML cargadas:', predResults.filter(r => r.status === 'fulfilled' && r.value).length);

        const predictions = [];
        for (const m of matches) {
            try {
                const p = PredictorModule.predict(m);
                predictions.push(p);
            } catch (e) {
                console.error('Error predicting for match', m.id, e);
            }
        }

        if (predictions.length < 3) {
            pickContainer.innerHTML = '<p style="text-align:center; color:var(--silver-dim);">No hay suficientes partidos válidos para generar un pronóstico.</p>';
            return;
        }

        console.log('[Landing] predictions:', predictions.map(p => ({ id: p.match.id, confidence: p.confidence, bestPick: p.bestPick?.market || p.bestPick?.label, odds: p.bestPick?.odd || p.bestPick?.odds, hasRealData: p.match.odds?.isReal || p.scores.home != null })));
        console.log('predictions with high confidence:', predictions.filter(p => p.confidence >= 50 && (p.match.odds?.isReal || p.scores.home != null)).length);
        const variants = CombinadaModule.generateVariants(predictions);

        let jackpot = variants.standard;
        if (!jackpot || jackpot.picks.length < 2 || jackpot.totalOdds > 10) jackpot = variants.conservative;
        if (!jackpot || jackpot.picks.length < 2) jackpot = variants.risky;
        if (!jackpot || jackpot.picks.length === 0 || jackpot.totalOdds > 12) jackpot = CombinadaModule.buildCombinada(predictions);

        if (!jackpot || jackpot.picks.length === 0) {
            const aiFallback = await buildAIFallback(matches, predictions);
            if (aiFallback && aiFallback.picks.length > 0) {
                pickContainer.innerHTML = renderFallbackHtml('IA', aiFallback);
                return;
            }

            const modelFallback = buildModelFallback(predictions);
            if (modelFallback && modelFallback.picks.length > 0) {
                pickContainer.innerHTML = renderFallbackHtml('MODELO', modelFallback);
                return;
            }

            pickContainer.innerHTML = '<p style="text-align:center; color:var(--silver-dim);">No hay suficientes partidos con confianza mínima para generar un pronóstico combinado ahora mismo. Vuelve más tarde.</p>';
            return;
        }

        let html = `
            <div style="margin-bottom: 1rem; text-align: center;">
                <span style="display:inline-block; padding:0.3rem 0.8rem; background:var(--glass-bg); border:1px solid var(--gold); color:var(--gold); border-radius:4px; font-weight:bold; font-size:0.9rem;">
                    CUOTA TOTAL: ${(jackpot.totalOdds).toFixed(2)}
                </span>
            </div>
            <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.5rem;">
        `;

        jackpot.picks.forEach(p => {
            let mercado = p.pick.market
                .replace('Home Win', 'Gana Local')
                .replace('Away Win', 'Gana Visitante')
                .replace('Draw', 'Empate')
                .replace('Over 2.5 Goals', 'Más de 2.5 Goles')
                .replace('Under 2.5 Goals', 'Menos de 2.5 Goles')
                .replace('BTTS - Yes', 'Ambos Anotan: Sí')
                .replace('BTTS - No', 'Ambos Anotan: No');

            html += `
                <li style="background: rgba(0,0,0,0.3); padding: 0.8rem; border-radius: 8px; border: 1px solid var(--glass-border);">
                    <div style="font-size: 0.85rem; color: var(--silver-dim); margin-bottom: 0.3rem;">
                        ${p.prediction.match.league.name}
                    </div>
                    <div style="display:flex; justify-content:space-between; align-items:center;">
                        <span style="font-weight:600; font-size:0.95rem;">
                            ${p.prediction.match.home.name} vs ${p.prediction.match.away.name}
                        </span>
                    </div>
                    <div style="margin-top:0.5rem; color:var(--green-neon); font-weight:bold;">
                        ▶ ${mercado}
                    </div>
                </li>
            `;
        });

        html += `</ul>`;
        pickContainer.innerHTML = html;

    } catch (e) {
        console.error('Error al cargar el pronóstico del día:', e);
        pickContainer.innerHTML = '<p style="text-align:center; color:var(--silver-dim);">No se pudo cargar el pronóstico en este momento. Por favor, recarga la página.</p>';
    }
}

initLanding();

window.addEventListener('error', event => {
    console.error('[Landing] runtime error', event.error || event.message, event.filename, event.lineno, event.colno);
});

window.addEventListener('unhandledrejection', event => {
    console.error('[Landing] unhandled rejection', event.reason);
});
