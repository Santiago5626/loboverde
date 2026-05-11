// ============================================================
// matches.js — Carga de partidos (bzzoiro API + Demo)
// ============================================================

const MatchesModule = (() => {
  const API_KEY  = '3c1279924982ecbb3300a374fe78e6674110f964';
  const API_HOST  = 'sports.bzzoiro.com/api/v2';
  const CACHE     = {};
  const leagueMap = {}; // id -> nombre

  // ── Utilidad de fecha (zona horaria Colombia UTC-5) ─────
  const COL_OFFSET_MS = -5 * 60 * 60 * 1000;

  function getColombiaNow() {
    // Devuelve un Date ajustado a Colombia (UTC-5) usando la fecha actual del sistema
    return new Date(Date.now() + COL_OFFSET_MS);
  }

  function getDateStr(offsetDays = 0) {
    // Fecha en hora Colombia (UTC-5)
    const d = getColombiaNow();
    d.setUTCDate(d.getUTCDate() + offsetDays);
    const year  = d.getUTCFullYear();
    const month = String(d.getUTCMonth() + 1).padStart(2, '0');
    const day   = String(d.getUTCDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  // Devuelve [inicio, fin] en ms UTC del día Colombia
  function getColombiaDayBounds(dateStr) {
    // El día Colombia empieza a las 00:00 COT = 05:00 UTC
    const start = new Date(`${dateStr}T05:00:00Z`).getTime();
    const end   = start + (24 * 60 * 60 * 1000) - 1; // 23:59:59 COT
    return { start, end };
  }

  // YYYY-MM-DD del siguiente día UTC respecto a un timestamp
  function utcDateStrOf(ts) {
    const d = new Date(ts);
    return `${d.getUTCFullYear()}-${String(d.getUTCMonth()+1).padStart(2,'0')}-${String(d.getUTCDate()).padStart(2,'0')}`;
  }

  // ── Fetch real API ───────────────────────────────────────
  async function fetchFromAPI(endpoint, params = {}) {
    const url = new URL(`https://${API_HOST}/${endpoint}/`);
    Object.entries(params).forEach(([k, v]) => url.searchParams.set(k, v));

    const res = await fetch(url.toString(), {
      headers: {
        'Authorization': `Token ${API_KEY}`,
        'Content-Type': 'application/json'
      }
    });

    if (!res.ok) throw new Error(`API error ${res.status}`);
    return res.json();
  }

  // ── Mapa de ligas (API + localStorage) ──────────────────
  async function buildLeagueMap() {
    // 1. Intentar cargar desde localStorage primero (instantáneo)
    try {
      const saved = localStorage.getItem('elv_league_map');
      if (saved) {
        const parsed = JSON.parse(saved);
        Object.assign(leagueMap, parsed);
        if (Object.keys(leagueMap).length > 0) return; // ya tenemos datos
      }
    } catch(e) { /* localStorage no disponible en file:// */ }

    // 2. Cargar desde la API con paginación (limit máx = 200)
    try {
      let offset = 0;
      while (true) {
        const data    = await fetchFromAPI('leagues', { limit: 200, is_active: true, offset });
        const results = data?.results || [];
        results.forEach(l => { if (l.id && l.name) leagueMap[l.id] = l.name; });
        if (results.length < 200) break; // última página
        offset += 200;
        if (offset > 2000) break; // seguridad
      }
      console.log(`[LeagueMap] ${Object.keys(leagueMap).length} ligas cargadas desde API`);
      // Guardar en localStorage para próximas cargas
      try { localStorage.setItem('elv_league_map', JSON.stringify(leagueMap)); } catch(e) {}
    } catch(e) {
      console.warn('[LeagueMap] API falló, usando caché local:', e.message);
    }
  }

  // Resuelve puntualmente una liga desconocida por su ID
  async function resolveLeagueName(leagueId) {
    if (leagueMap[leagueId]) return leagueMap[leagueId];
    try {
      const data = await fetchFromAPI(`leagues/${leagueId}`);
      const name = data?.name || data?.results?.[0]?.name || null;
      if (name) {
        leagueMap[leagueId] = name;
        try { localStorage.setItem('elv_league_map', JSON.stringify(leagueMap)); } catch(e) {}
      }
      return name;
    } catch(e) { return null; }
  }

  // ── Normalizar fixture de la API ─────────────────────────
  function normalizeFixture(f) {
    const localDate  = new Date(f.event_date);
    const timeStr    = localDate.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
    const leagueName = leagueMap[f.league_id] || `Liga ${f.league_id}`;

    return {
      id: f.id,
      date: f.event_date,
      rawDate: f.event_date,   // timestamp original para filtros de tiempo
      time: timeStr,
      status: f.status === 'finished' ? 'FT' : (f.status === 'notstarted' ? 'NS' : f.status),
      statusLong: f.status,
      league: {
        id: f.league_id,
        name: leagueName,
        logo: `https://sports.bzzoiro.com/img/league/${f.league_id}/`,
      },
      home: {
        id: f.home_team_id,
        name: f.home_team,
        logo: `https://sports.bzzoiro.com/img/team/${f.home_team_id}/`,
      },
      away: {
        id: f.away_team_id,
        name: f.away_team,
        logo: `https://sports.bzzoiro.com/img/team/${f.away_team_id}/`,
      },
      goals: { home: f.home_score, away: f.away_score },

      // Stats vacías — se llenan con datos reales al hacer clic
      stats: { homeGoalsFor: null, homeGoalsAgainst: null, awayGoalsFor: null, awayGoalsAgainst: null, xgHome: null, xgAway: null },
      odds:  { home: null, draw: null, away: null, over25: null, under25: null, bttsYes: null, isReal: false },
      mlPrediction: null,   // se llena con /prediction/
      form: { home: '', away: '' },
      tablePos: { home: null, away: null },
      h2h: []
    };
  }

  // ── Peticiones Específicas (Fase 2) ──────────────────────
  async function fetchMatchStats(eventId) {
    try {
      const data = await fetchFromAPI(`events/${eventId}/stats`);
      return data && data.stats ? data.stats : null;
    } catch (e) {
      console.warn('No stats for', eventId);
      return null;
    }
  }

  async function fetchMatchOdds(eventId) {
    try {
      const data = await fetchFromAPI(`events/${eventId}/odds`);
      if (!data || !data.odds) return null;
      return {
        home:    data.odds.home_win,
        draw:    data.odds.draw,
        away:    data.odds.away_win,
        over25:  data.odds.over_25_goals,
        under25: data.odds.under_25_goals,
        bttsYes: data.odds.btts_yes,
        bttsNo:  data.odds.btts_no,
        isReal:  true,
      };
    } catch(e) {
      console.warn('No odds for', eventId, e.message);
      return null;
    }
  }

  async function fetchMatchPrediction(eventId) {
    try {
      const data = await fetchFromAPI(`events/${eventId}/prediction`);
      if (!data || !data.markets) return null;
      return {
        probHome:   data.markets.match_result?.prob_home  / 100,
        probDraw:   data.markets.match_result?.prob_draw  / 100,
        probAway:   data.markets.match_result?.prob_away  / 100,
        xgHome:     data.markets.expected_goals?.home,
        xgAway:     data.markets.expected_goals?.away,
        probOver25: data.markets.over_under?.prob_over_25 / 100,
        probBtts:   data.markets.btts?.prob_yes           / 100,
        likelyScore: data.markets.score?.most_likely,      // ej: "2-1"
        confidence:  data.model?.confidence,               // 0-1
        predicted:   data.markets.match_result?.predicted, // "H"|"D"|"A"
        betFavorite: data.recommendations?.bet_favorite,
        over25Rec:   data.recommendations?.over_25,
        bttsRec:     data.recommendations?.btts,
      };
    } catch(e) {
      console.warn('No prediction for', eventId, e.message);
      return null;
    }
  }

  // ── API pública ──────────────────────────────────────────
  async function getMatches(dateOffset = 0) {
    const dateStr  = getDateStr(dateOffset);   // fecha Colombia
    const cacheKey = `matches_bz_${dateStr}`;

    if (CACHE[cacheKey]) return CACHE[cacheKey];

    await buildLeagueMap();

    // Límites exactos del día Colombia en UTC
    // Ej: 11 May COT → 05:00 UTC 11 May a 04:59 UTC 12 May
    const { start: colStart, end: colEnd } = getColombiaDayBounds(dateStr);
    const utcDay2 = utcDateStrOf(colEnd); // puede ser el día siguiente en UTC

    try {
      const PAGE_SIZE = 300;
      let allResults  = [];

      // Consultar los días UTC que abarca el día Colombia
      const utcDays = utcDateStrOf(colStart) === utcDay2
        ? [dateStr]
        : [utcDateStrOf(colStart), utcDay2];

      for (const utcDay of utcDays) {
        let offset = 0;
        while (true) {
          const data    = await fetchFromAPI('events', {
            date_from: utcDay,
            date_to:   utcDay,
            limit:     PAGE_SIZE,
            offset:    offset
          });
          const results = data?.results || [];
          allResults    = allResults.concat(results);
          if (results.length < PAGE_SIZE) break;
          offset += PAGE_SIZE;
          if (offset >= PAGE_SIZE * 5) break;
        }
      }

      // Filtrar SOLO partidos dentro del día Colombia
      const now = new Date();
      const inColombiaDay = allResults.filter(f => {
        const t = new Date(f.event_date).getTime();
        return t >= colStart && t <= colEnd && f.status === 'notstarted' && new Date(f.event_date) > now;
      });

      console.log(`[API] Colombia ${dateStr}: ${inColombiaDay.length} partidos (de ${allResults.length} UTC totales)`);

      if (inColombiaDay.length === 0) {
        console.log(`[API] No hay partidos para ${dateStr} en la API`);
        CACHE[cacheKey] = [];
        return [];
      }

      // Resolver nombres de ligas desconocidas ANTES de normalizar
      const unknownLeagueIds = [...new Set(
        inColombiaDay
          .filter(f => !leagueMap[f.league_id])
          .map(f => f.league_id)
      )];

      if (unknownLeagueIds.length > 0) {
        await Promise.allSettled(
          unknownLeagueIds.map(id => resolveLeagueName(id))
        );
        console.log(`[LeagueMap] ${unknownLeagueIds.length} ligas desconocidas resueltas`);
      }

      const matches = inColombiaDay.map(normalizeFixture);

      CACHE[cacheKey] = matches;
      return matches;
    } catch (e) {
      console.warn('Bzzoiro API falló, no hay datos disponibles:', e.message);
      return []; // En producción, no usar demo
    }
  }

  function generateDemoMatches(dateOffset) {
    const dateStr = getDateStr(dateOffset);
    const leagues = ["Champions League", "Premier League", "La Liga"];
    const teams = ["Real Madrid", "Barcelona", "Arsenal", "Chelsea", "Bayer Leverkusen", "AS Roma"];
    let demos = [];
    for (let i = 0; i < 6; i++) {
      let t1 = teams[i % teams.length];
      let t2 = teams[(i + 1) % teams.length];
      demos.push({
        id: 1000 + i,
        time: "15:00",
        status: "NS",
        statusLong: "Not Started",
        league: { name: leagues[i % leagues.length], logo: '' },
        home: { name: t1, logo: `https://ui-avatars.com/api/?name=${t1.replace(/\s+/g, '+')}&background=random` },
        away: { name: t2, logo: `https://ui-avatars.com/api/?name=${t2.replace(/\s+/g, '+')}&background=random` },
        stats: { homeGoalsFor: 2.1, homeGoalsAgainst: 0.9, awayGoalsFor: 1.5, awayGoalsAgainst: 1.2 },
        odds: { home: 1.8, draw: 3.2, away: 3.5 },
        form: { home: 'WWWDW', away: 'LWWDW' }
      });
    }
    return demos;
  }

  return { getMatches, getDateStr, fetchMatchStats, fetchMatchOdds, fetchMatchPrediction };
})();
