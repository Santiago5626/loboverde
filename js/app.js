// ============================================================
// app.js — Controlador Principal (Dashboard Privado)
// ============================================================

document.addEventListener('DOMContentLoaded', () => {
    // ── Elementos DOM ────────────────────────────────────────
    const navBtns            = document.querySelectorAll('.nav-btn');
    const viewSections       = document.querySelectorAll('.view-section');
    const filterBtns         = document.querySelectorAll('.filter-btn');
    const matchListContainer = document.getElementById('match-list-container');
    const predictionPanel    = document.getElementById('prediction-panel');
    const parlayContainer    = document.getElementById('parlay-container');
    const refreshParlaysBtn  = document.getElementById('refresh-parlays');
    const dateDisplay        = document.getElementById('current-date-display');
    const mobileNavToggle    = document.getElementById('mobile-nav-toggle');
    const sidebarContent     = document.getElementById('sidebar-content');
    const searchInput        = document.getElementById('match-search');
    const leagueFilter       = document.getElementById('league-filter');

    // ── Estado ───────────────────────────────────────────────
    let currentDayOffset = 0;
    let loadedMatches    = [];

    // Mostrar fecha actual
    if (dateDisplay) {
        dateDisplay.textContent = new Date().toLocaleDateString('es-ES', {
            weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
        });
    }

    // ── Navegación ───────────────────────────────────────────
    if (mobileNavToggle) {
        mobileNavToggle.addEventListener('click', () => {
            sidebarContent.classList.toggle('show');
        });
    }

    navBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            navBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            viewSections.forEach(s => s.classList.remove('active'));
            document.getElementById(`${btn.dataset.tab}-section`).classList.add('active');
            if (window.innerWidth <= 900) sidebarContent.classList.remove('show');
            if (btn.dataset.tab === 'combinadas') renderCombinadas();
        });
    });

    // ── Calendario de navegación ───────────────────────────
    const calPrev    = document.getElementById('cal-prev');
    const calNext    = document.getElementById('cal-next');
    const calDisplay = document.getElementById('cal-current-date')?.querySelector('span');

    function updateCalLabel() {
        if (!calDisplay) return;
        const d = new Date();
        d.setDate(d.getDate() + currentDayOffset);
        if (currentDayOffset === 0)  { calDisplay.textContent = 'HOY'; return; }
        if (currentDayOffset === 1)  { calDisplay.textContent = 'MAÑANA'; return; }
        if (currentDayOffset === -1) { calDisplay.textContent = 'AYER'; return; }
        calDisplay.textContent = d.toLocaleDateString('es-ES', {
            weekday: 'short', day: '2-digit', month: '2-digit'
        }).toUpperCase();
    }

    if (calPrev) calPrev.addEventListener('click', () => {
        currentDayOffset--;
        updateCalLabel();
        loadMatches();
    });
    if (calNext) calNext.addEventListener('click', () => {
        currentDayOffset++;
        updateCalLabel();
        loadMatches();
    });

    if (refreshParlaysBtn) refreshParlaysBtn.addEventListener('click', renderCombinadas);

    // ── Búsqueda y filtro de liga en tiempo real ──────────────
    function applyFilters() {
        const query  = searchInput ? searchInput.value.toLowerCase().trim() : '';
        const league = leagueFilter ? leagueFilter.value : '';
        document.querySelectorAll('.match-item').forEach(li => {
            const text       = li.textContent.toLowerCase();
            const liLeague   = li.dataset.league || '';
            const matchSearch = !query  || text.includes(query);
            const matchLeague = !league || liLeague === league;
            li.style.display  = (matchSearch && matchLeague) ? '' : 'none';
        });
    }

    if (searchInput)  searchInput.addEventListener('input', applyFilters);
    if (leagueFilter) leagueFilter.addEventListener('change', applyFilters);

    // ── Flujo de Partidos ─────────────────────────────────────
    async function loadMatches() {
        matchListContainer.innerHTML = '<li class="loading">Buscando partidos...</li>';
        predictionPanel.innerHTML    = '<div class="placeholder-msg"><div class="icon-pulse"></div><p>Selecciona un partido de la lista para ver el análisis.</p></div>';

        loadedMatches = await MatchesModule.getMatches(currentDayOffset);

        if (loadedMatches.length === 0) {
            matchListContainer.innerHTML = '<li class="loading">No hay partidos para este día.</li>';
            return;
        }

        matchListContainer.innerHTML = '';

        // Poblar el filtro de ligas con las que hay en la lista
        if (leagueFilter) {
            const leagues = [...new Set(loadedMatches.map(m => m.league.name))].sort();
            leagueFilter.innerHTML = '<option value="">Todas las ligas</option>';
            leagues.forEach(lg => {
                const opt = document.createElement('option');
                opt.value = lg;
                opt.textContent = lg;
                leagueFilter.appendChild(opt);
            });
        }
        loadedMatches.forEach(match => {
            const isFinished = match.status === 'FT' || match.statusLong === 'finished';
            const scoreTag   = isFinished
                ? `<span class="score-tag">${match.goals.home ?? '?'} - ${match.goals.away ?? '?'} <small>FIN</small></span>`
                : `<span class="time-tag">${match.time}</span>`;

            const li = document.createElement('li');
            li.className = 'match-item';
            li.dataset.league = match.league.name;  // para el filtro de liga
            if (isFinished) li.classList.add('finished');

            li.innerHTML = `
                <div class="match-header-sm">
                    <span class="league-sm">${match.league.name}</span>
                    ${scoreTag}
                </div>
                <div class="match-teams">
                    <div class="team-row">
                        <img src="${match.home.logo}" class="team-logo-sm" alt="logo"
                             onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzIyMiIvPjwvc3ZnPg=='">
                        <span>${match.home.name}</span>
                    </div>
                    <div class="team-row">
                        <img src="${match.away.logo}" class="team-logo-sm" alt="logo"
                             onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzIyMiIvPjwvc3ZnPg=='">
                        <span>${match.away.name}</span>
                    </div>
                </div>
            `;

            li.addEventListener('click', async () => {
                document.querySelectorAll('.match-item').forEach(el => el.classList.remove('active'));
                li.classList.add('active');
                predictionPanel.innerHTML = '<div class="loading">Consultando datos en vivo...</div>';

                const [stats, odds] = await Promise.all([
                    MatchesModule.fetchMatchStats(match.id),
                    MatchesModule.fetchMatchOdds(match.id)
                ]);

                if (stats) {
                    if (stats.home?.xg?.actual != null) match.stats.xgHome = stats.home.xg.actual;
                    if (stats.away?.xg?.actual != null) match.stats.xgAway = stats.away.xg.actual;
                }
                if (odds?.home_win != null) {
                    match.odds.home   = odds.home_win;
                    match.odds.draw   = odds.draw;
                    match.odds.away   = odds.away_win;
                    match.odds.isReal = true;
                }

                renderPrediction(match, true); // true = clic manual → llama a Gemini
            });

            matchListContainer.appendChild(li);
        });

        // Auto-seleccionar el primer partido (sin Gemini)
        const firstLi = matchListContainer.querySelector('li.match-item');
        if (firstLi) {
            firstLi.classList.add('active');
            renderPrediction(loadedMatches[0], false);
        }
    }

    // ── Panel de Predicción ───────────────────────────────────
    function renderPrediction(match, callGemini = false) {
        const pred       = PredictorModule.predict(match);
        const conf       = PredictorModule.confidenceLabel(pred.confidence);
        const isFinished = match.status === 'FT' || match.statusLong === 'finished';

        // ── DEBUG — ver en consola (F12) qué datos usa el predictor ──
        console.group(`[Predictor] ${match.home.name} vs ${match.away.name}`);
        console.log('Cuotas reales:', match.odds.isReal, '| Local:', match.odds.home, '| Empate:', match.odds.draw, '| Visitante:', match.odds.away);
        console.log('Stats usadas — Goles Locales:', match.stats.homeGoalsFor, '| Goles Visitante:', match.stats.awayGoalsFor);
        console.log('xG API — Local:', match.stats.xgHome, '| Visitante:', match.stats.xgAway);
        console.log('Forma — Local:', match.form?.home, '| Visitante:', match.form?.away);
        console.log('Posición tabla — Local:', match.tablePos?.home, '| Visitante:', match.tablePos?.away);
        console.log('Scores internos — Local:', pred.scores.home, '| Visitante:', pred.scores.away);
        console.log('Probabilidades — Local:', (pred.probs.home*100).toFixed(1)+'%', '| Empate:', (pred.probs.draw*100).toFixed(1)+'%', '| Visitante:', (pred.probs.away*100).toFixed(1)+'%');
        console.log('PRONÓSTICO ELEGIDO:', pred.bestPick?.market, '| Confianza:', pred.confidence+'%');
        console.groupEnd();
        // ── FIN DEBUG ─────────────────────────────────────────────

        // Cuota del pronóstico recomendado
        const cuotaMap = { home: match.odds.home, draw: match.odds.draw, away: match.odds.away };
        const cuotaSugerida = cuotaMap[pred.bestPick?.label] || null;

        // Comparación de resultado si el partido finalizó
        let resultBlock = '';
        if (isFinished && match.goals.home != null) {
            const golesLocal    = match.goals.home;
            const golesVisitante = match.goals.away;
            const ganador       = golesLocal > golesVisitante ? 'home'
                                : golesLocal < golesVisitante ? 'away'
                                : 'draw';
            const acerto        = pred.bestPick?.label === ganador;

            resultBlock = `
                <div class="result-block ${acerto ? 'result-ok' : 'result-fail'}">
                    <div class="result-score">${golesLocal} - ${golesVisitante}</div>
                    <div class="result-label">Partido Finalizado</div>
                    <div class="result-verdict">
                        ${acerto
                            ? '<span class="verdict-ok">Pronóstico Acertado</span>'
                            : '<span class="verdict-fail">Pronóstico Fallado</span>'}
                    </div>
                </div>
            `;
        }

        // Traducción del mercado
        const mercado = (pred.bestPick?.market || '')
            .replace('Home Win', 'Gana Local')
            .replace('Away Win', 'Gana Visitante')
            .replace('Draw', 'Empate')
            .replace('Over 2.5 Goals', 'Más de 2.5 Goles')
            .replace('Under 2.5 Goals', 'Menos de 2.5 Goles')
            .replace('BTTS - Yes', 'Ambos Anotan: Sí')
            .replace('BTTS - No', 'Ambos Anotan: No')
            .replace('1 - Local', 'Gana Local')
            .replace('2 - Visitante', 'Gana Visitante')
            .replace('X - Empate', 'Empate');

        const html = `
            <div class="match-header-lg">
                <span class="league-badge">${match.league.name}</span>
                <div class="teams-lg">
                    <img src="${match.home.logo}" class="team-logo-lg"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzIyMiIvPjwvc3ZnPg=='">
                    <span>${match.home.name}</span>
                    <span class="vs">vs</span>
                    <span>${match.away.name}</span>
                    <img src="${match.away.logo}" class="team-logo-lg"
                         onerror="this.src='data:image/svg+xml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAxMDAgMTAwIj48Y2lyY2xlIGN4PSI1MCIgY3k9IjUwIiByPSI0MCIgZmlsbD0iIzIyMiIvPjwvc3ZnPg=='">
                </div>
                <p style="color:var(--silver-dim); margin-top:0.5rem">
                    ${isFinished ? 'Partido finalizado' : `Hora: ${match.time}`}
                </p>
            </div>

            ${resultBlock}

            <div class="prediction-box">
                <h3>Pronóstico Sugerido</h3>
                <div class="pick-text">${mercado}</div>
                <div style="color:${conf.color}; font-weight:600; font-size:1rem; letter-spacing:1px; margin-top:0.3rem;">
                    Confianza: ${pred.confidence}% — ${conf.text}
                </div>
                ${cuotaSugerida ? `<div class="cuota-tag">Cuota: ${cuotaSugerida}</div>` : ''}
                ${pred.bestPick?.val > 0 ? `<div class="ventaja-tag">Cuota con ventaja</div>` : ''}

                <div style="margin-top:1rem; padding-top:0.8rem; border-top:1px solid rgba(57,255,20,0.15);">
                    <div style="font-size:0.75rem; color:var(--silver-dim); text-transform:uppercase; letter-spacing:1px; margin-bottom:0.5rem;">Marcadores Probables</div>
                    <div style="display:flex; gap:0.5rem; flex-wrap:wrap; justify-content:center;">
                        ${pred.likelyScores.map((s, i) => `
                            <div style="
                                background:${i === 0 ? 'rgba(57,255,20,0.12)' : 'rgba(255,255,255,0.04)'};
                                border:1px solid ${i === 0 ? 'rgba(57,255,20,0.35)' : 'rgba(255,255,255,0.08)'};
                                border-radius:8px; padding:0.4rem 1rem; text-align:center;
                            ">
                                <div style="font-size:1.2rem; font-weight:800; color:${i === 0 ? 'var(--green-neon)' : '#fff'}; letter-spacing:2px;">
                                    ${s.home} - ${s.away}
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>

            <div class="grid-2">
                <div class="stat-box">
                    <h4>Resultado 1X2</h4>
                    <div class="row-between ${pred.bestPick?.label === 'home' ? 'val-green' : ''}">
                        <span>${match.home.name}</span>
                        <span>${(pred.probs.home * 100).toFixed(1)}%</span>
                    </div>
                    <div class="row-between ${pred.bestPick?.label === 'draw' ? 'val-green' : ''}">
                        <span>Empate</span>
                        <span>${(pred.probs.draw * 100).toFixed(1)}%</span>
                    </div>
                    <div class="row-between ${pred.bestPick?.label === 'away' ? 'val-green' : ''}">
                        <span>${match.away.name}</span>
                        <span>${(pred.probs.away * 100).toFixed(1)}%</span>
                    </div>
                </div>

                <div class="stat-box">
                    <h4>Otros Mercados</h4>
                    <div class="row-between">
                        <span>Ambos Anotan</span>
                        <span style="color:${pred.btts.yes > 0.6 ? 'var(--green-neon)' : 'inherit'}">
                            ${(pred.btts.yes * 100).toFixed(1)}%
                        </span>
                    </div>
                    <div class="row-between">
                        <span>Más de 2.5 Goles</span>
                        <span style="color:${pred.ou.over > 0.6 ? 'var(--green-neon)' : 'inherit'}">
                            ${(pred.ou.over * 100).toFixed(1)}%
                        </span>
                    </div>
                    <div class="row-between">
                        <span>Doble Oportunidad (1X)</span>
                        <span style="color:${pred.dc.homeDraw > 0.7 ? 'var(--green-neon)' : 'inherit'}">
                            ${(pred.dc.homeDraw * 100).toFixed(1)}%
                        </span>
                    </div>
                    ${match.stats.xgHome !== null ? `
                    <div class="row-between" style="font-size:0.85rem; color:var(--silver-dim); margin-top:0.5rem; border-top:1px solid var(--glass-border); padding-top:0.5rem;">
                        <span>Goles Esperados (API)</span>
                        <span>${match.stats.xgHome} - ${match.stats.xgAway}</span>
                    </div>` : ''}
                    <div class="row-between" style="font-size:0.85rem; color:var(--silver-dim); margin-top:0.3rem;">
                        <span>Cuotas</span>
                        <span>${match.odds.isReal ? 'Reales (API)' : 'Sin datos reales'}</span>
                    </div>
                </div>
            </div>
            <!-- Contenedor del análisis IA (se rellena async) -->
            <div id="ai-analysis-container">
                <div style="text-align:center; padding:1rem; color:var(--silver-dim); font-size:0.9rem;">
                    Consultando análisis adicional...
                </div>
            </div>
        `;

        predictionPanel.innerHTML = html;

        // Llamar a Gemini solo si el usuario hizo clic manualmente
        if (callGemini) _renderGeminiAnalysis(match, pred);
    }

    async function _renderGeminiAnalysis(match, pred) {
        const aiContainer = document.getElementById('ai-analysis-container');
        if (!aiContainer) return;

        try {
            const ai = await GeminiModule.analyzeMatch(match, pred);

            const confColor = ai.confianza === 'Alta'  ? 'var(--green-neon)'
                            : ai.confianza === 'Media' ? 'var(--gold)'
                            : 'var(--red)';

            const iconoAcuerdo = ai.acuerdo_modelo
                ? `<span style="color:var(--green-neon); font-size:0.85rem;">Coincide con el modelo matemático</span>`
                : `<span style="color:var(--gold); font-size:0.85rem;">El análisis difiere del modelo matemático</span>`;

            aiContainer.innerHTML = `
                <div class="stat-box" style="border-color:rgba(57,255,20,0.25); margin-top:0.5rem;">
                    <h4 style="color:var(--green-neon); margin-bottom:0.8rem; display:flex; align-items:center; gap:0.5rem;">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                            <circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/>
                        </svg>
                        Análisis El Lobo Verde
                    </h4>
                    <div style="font-size:1.2rem; font-weight:800; color:#fff; margin-bottom:0.4rem;">
                        ${ai.recomendacion}
                    </div>
                    <div style="color:${confColor}; font-size:0.85rem; font-weight:600; margin-bottom:0.8rem;">
                        Confianza: ${ai.confianza}
                    </div>
                    <p style="color:var(--silver); font-size:0.95rem; line-height:1.6; margin-bottom:0.8rem;">
                        ${ai.razon}
                    </p>
                    <div style="padding-top:0.6rem; border-top:1px solid var(--glass-border);">
                        ${iconoAcuerdo}
                    </div>
                </div>
            `;
        } catch(e) {
            console.warn('Gemini no disponible:', e.message);
            aiContainer.innerHTML = '';
        }
    }

    // ── Combinadas ────────────────────────────────────────────
    async function renderCombinadas() {
        parlayContainer.innerHTML = '<div class="loading">El Lobo está analizando los partidos del día...</div>';

        const allPredictions = loadedMatches.map(m => PredictorModule.predict(m));
        const variants       = CombinadaModule.generateVariants(allPredictions);

        parlayContainer.innerHTML = '';

        const renderVariant = (title, data) => {
            if (!data) return '';

            const riskLabel = { 'BAJO': 'Riesgo Bajo', 'MEDIO': 'Riesgo Medio', 'ALTO': 'Riesgo Alto' };

            return `
                <div class="parlay-card">
                    <div class="parlay-header">
                        <h3>${title}</h3>
                        <span class="risk-badge" style="background:${data.riskColor}; color:#000;">
                            ${riskLabel[data.riskLevel] || data.riskLevel}
                        </span>
                    </div>
                    <ul class="pick-list">
                        ${data.picks.map(p => {
                            const m = (p.pick.market || '')
                                .replace('Home Win','Gana Local')
                                .replace('Away Win','Gana Visitante')
                                .replace('1 - Local','Gana Local')
                                .replace('2 - Visitante','Gana Visitante')
                                .replace('X - Empate','Empate');
                            return `
                            <li class="pick-item">
                                <div class="pick-match">${p.prediction.match.home.name} vs ${p.prediction.match.away.name}</div>
                                <div class="pick-sel">${m} @ ${p.pick.odds || '1.80'}</div>
                            </li>`;
                        }).join('')}
                    </ul>
                    <div class="parlay-footer">
                        <div class="stake-text">Apuesta recomendada: ${data.stakeRecommendation}% del capital</div>
                        <div class="odds-text">Cuota total: ${data.totalOdds.toFixed(2)}</div>
                    </div>
                </div>
            `;
        };

        const html = [
            renderVariant('La Conservadora', variants.conservative),
            renderVariant('La Equilibrada',  variants.standard),
            renderVariant('La Arriesgada',   variants.risky)
        ].filter(Boolean).join('');

        if (!html) {
            // Fallback: construir una combinada directamente sin los filtros duros de variantes
            const fallback = CombinadaModule.buildCombinada(allPredictions);
            if (fallback) {
                parlayContainer.innerHTML = renderVariant('Combinada del Día', fallback);
            } else {
                parlayContainer.innerHTML = '<div class="loading">No hay suficientes partidos con confianza mínima para generar una combinada en este momento.</div>';
            }
        } else {
            parlayContainer.innerHTML = html;
        }
    }

    // Init
    loadMatches();
});
