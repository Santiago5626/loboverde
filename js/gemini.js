// ============================================================
// gemini.js — Análisis de Partidos con Gemini AI
// Uso: solo en el dashboard privado
// ============================================================

const GeminiModule = (() => {

  const API_KEY  = 'AIzaSyDw-Ksa0p3KOEVDzgjhvy3e2ZjCWEt4HSQ';
  const API_URL   = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`;
  const aiCache   = {}; // cache por partido para no repetir llamadas

  // ── Construir el prompt con los datos del partido ─────────
  function buildPrompt(match, pred) {
    const { home, away, league, odds, stats } = match;

    const cuotaLocal     = odds?.home ? `${odds.home}` : 'No disponible';
    const cuotaEmpate    = odds?.draw ? `${odds.draw}` : 'No disponible';
    const cuotaVisitante = odds?.away ? `${odds.away}` : 'No disponible';
    const fuenteCuotas   = odds?.isReal ? 'Cuotas reales del mercado' : 'Cuotas estimadas';

    const xgInfo = stats?.xgHome !== null
      ? `Goles Esperados: ${stats.xgHome} (local) / ${stats.xgAway} (visitante)`
      : 'Goles esperados: no disponibles';

    return `
Eres un analista deportivo profesional especializado en fútbol. Analiza este partido y dame tu pronóstico.

PARTIDO: ${home.name} (Local) vs ${away.name} (Visitante)
LIGA: ${league.name}

CUOTAS (${fuenteCuotas}):
- Gana Local (${home.name}): ${cuotaLocal}
- Empate: ${cuotaEmpate}
- Gana Visitante (${away.name}): ${cuotaVisitante}

MODELO MATEMÁTICO (Poisson Dixon-Coles):
- Probabilidad Gana Local: ${(pred.probs.home * 100).toFixed(1)}%
- Probabilidad Empate: ${(pred.probs.draw * 100).toFixed(1)}%
- Probabilidad Gana Visitante: ${(pred.probs.away * 100).toFixed(1)}%
- Probabilidad Ambos Anotan: ${(pred.btts.yes * 100).toFixed(1)}%
- Probabilidad Más de 2.5 Goles: ${(pred.ou.over * 100).toFixed(1)}%
- ${xgInfo}
- Pronóstico del modelo matemático: ${pred.bestPick?.market || 'No determinado'}
- Confianza del modelo: ${pred.confidence}%

Responde ÚNICAMENTE con un JSON con esta estructura exacta (sin markdown, sin texto extra):
{
  "recomendacion": "Gana Local" | "Empate" | "Gana Visitante" | "Más de 2.5 Goles" | "Ambos Anotan",
  "equipo_favorito": "${home.name}" | "${away.name}" | "Ninguno",
  "razon": "Dos frases máximo explicando tu razonamiento como analista.",
  "acuerdo_modelo": true | false,
  "confianza": "Alta" | "Media" | "Baja"
}
    `.trim();
  }

  // ── Llamada a la API con caché por partido ────────────────
  async function analyzeMatch(match, pred) {
    const cacheKey = `ai_${match.id}`;
    if (aiCache[cacheKey]) return aiCache[cacheKey];

    const prompt = buildPrompt(match, pred);

    const body = {
      contents: [{
        parts: [{ text: prompt }]
      }],
      generationConfig: {
        temperature: 0.3,
        maxOutputTokens: 300,
      }
    };

    const res = await fetch(API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });

    if (!res.ok) throw new Error(`Gemini API error: ${res.status}`);

    const data   = await res.json();
    const text   = data.candidates?.[0]?.content?.parts?.[0]?.text || '';
    const clean  = text.replace(/```json|```/g, '').trim();
    const result = JSON.parse(clean);

    aiCache[cacheKey] = result;
    return result;
  }

  return { analyzeMatch };
})();
