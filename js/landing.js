// ============================================================
// landing.js — Lógica de la Landing Page Pública
// ============================================================

document.addEventListener('DOMContentLoaded', async () => {
    // Cargar Pick Gratuito (A las 2AM / Día Actual)
    const pickContainer = document.getElementById('landing-pick-content');

    try {
        // Cargar los partidos de HOY (0)
        const matches = await MatchesModule.getMatches(0);

        if (matches.length < 3) {
            pickContainer.innerHTML = '<p style="text-align:center; color:var(--silver-dim);">Hoy no hay suficientes partidos para un pronóstico seguro.</p>';
            return;
        }

        // Predecir todos usando la heurística determinista
        const predictions = matches.map(m => PredictorModule.predict(m));

        // Generar combinadas
        const variants = CombinadaModule.generateVariants(predictions);

        // Queremos mostrar la de riesgo alto (Cuota ~5.0) como pronóstico destacado
        let jackpot = variants.risky;

        // Fallback: Si no hay combinada arriesgada, probamos las más simples
        if (!jackpot || jackpot.picks.length < 2) jackpot = variants.standard;
        if (!jackpot || jackpot.picks.length < 2) jackpot = variants.conservative;

        // Fallback final: construir con todos los partidos disponibles sin filtros duros
        if (!jackpot || jackpot.picks.length === 0) {
            jackpot = CombinadaModule.buildCombinada(predictions);
        }

        if (!jackpot || jackpot.picks.length === 0) {
            pickContainer.innerHTML = '<p style="text-align:center; color:var(--silver-dim);">No hay suficientes partidos con confianza mínima para generar un pronóstico combinado ahora mismo. Vuelve más tarde.</p>';
            return;
        }

        // Renderizar
        let html = `
            <div style="margin-bottom: 1rem; text-align: center;">
                <span style="display:inline-block; padding:0.3rem 0.8rem; background:var(--glass-bg); border:1px solid var(--gold); color:var(--gold); border-radius:4px; font-weight:bold; font-size:0.9rem;">
                    CUOTA TOTAL: ${(jackpot.totalOdds).toFixed(2)}
                </span>
            </div>
            <ul style="list-style:none; padding:0; margin:0; display:flex; flex-direction:column; gap:0.5rem;">
        `;

        jackpot.picks.forEach(p => {
            // Traducir mercados del inglés al español
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
});
