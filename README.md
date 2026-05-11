# 🐺 El Lobo Verde — Smart Sports Analytics

> Plataforma inteligente de análisis deportivo orientada a pronósticos avanzados, detección de valor (+EV), combinadas automáticas y gestión profesional de bankroll.

![Logo](assets/logo.png)

---

# 🚀 Visión del Proyecto

**El Lobo Verde** nace como una plataforma moderna para analistas deportivos y apostadores estratégicos que buscan tomar decisiones basadas en:

- estadística avanzada
- probabilidades reales
- inteligencia matemática
- detección de valor
- automatización de análisis
- gestión inteligente del riesgo

La plataforma combina:
- análisis estadístico
- modelos probabilísticos
- heurísticas deportivas
- algoritmos de valor esperado (+EV)
- estrategias de bankroll
- generación automática de combinadas

---

# ✨ Características Principales

## ⚡ Datos Deportivos en Tiempo Real

Integración con la API v2 de BSD Sports (`sports.bzzoiro.com`) para consultar:

- Partidos de hoy y mañana
- Cuotas actualizadas
- Estadísticas recientes
- Historial H2H
- Información de ligas
- Rendimiento local/visitante
- Más de 30 ligas internacionales

---

## 🧠 Motor Predictivo Inteligente (`predictor.js`)

Sistema matemático diseñado para generar pronósticos automáticos utilizando múltiples variables.

### Variables Analizadas

- Forma reciente
- Historial entre equipos (H2H)
- Promedio de goles
- Ventaja de localía
- Tendencia Over/Under
- Ambos anotan (BTTS)
- Momentum ofensivo
- Consistencia defensiva

### Mercados Calculados

- 1X2
- Over/Under 2.5
- BTTS
- Doble oportunidad
- Over asiáticos
- Picks conservadores

### Modelos Implementados

- Distribución de Poisson
- Probabilidad implícita
- Value Betting (+EV)
- Kelly Criterion
- Sistema de scoring dinámico

---

## 💰 Detección de Valor (+EV)

El sistema compara:
- probabilidad calculada
vs
- probabilidad implícita de la cuota

Detectando automáticamente:
- apuestas con valor positivo
- cuotas infladas
- oportunidades rentables a largo plazo

---

## 🎯 Generador de Combinadas Inteligentes (`combinada.js`)

Motor automatizado para construir parlays optimizados.

### Características

- Evita correlación negativa
- Balancea riesgo/beneficio
- Prioriza estabilidad estadística
- Calcula stake recomendado

### Modos Disponibles

| Modo | Estrategia |
|---|---|
| 🟢 Conservadora | Protección de bankroll |
| 🟡 Balanceada | Riesgo medio |
| 🔴 Jackpot | Alta cuota / alto riesgo |

---

## 📊 Sistema de Confianza IA

Cada pronóstico incluye:

- porcentaje de confianza
- nivel de riesgo
- explicación automática
- métricas utilizadas
- detección de valor

Ejemplo:

```text
Over 2.5 Goals — 82% Confidence

✔ Ambos equipos promedian +2.8 goles
✔ 7/10 partidos recientes fueron Over
✔ BTTS alto
✔ Mercado bajando cuota
```

---

# 🎨 Diseño UI/UX Premium

## Estilo Visual

- Dark Mode inmersivo
- Verde Neón corporativo
- Glassmorphism
- Tarjetas dinámicas
- Indicadores visuales
- Responsive Design

## Inspiraciones

- Flashscore
- Sofascore
- OddsPortal
- Bet365
- OneFootball

---

# 🏗️ Arquitectura del Proyecto

El proyecto está construido completamente en:

- Vanilla HTML
- Vanilla CSS
- Vanilla JavaScript

Sin frameworks pesados para garantizar:
- máxima velocidad
- menor consumo
- facilidad de despliegue
- simplicidad de mantenimiento

---

# 📁 Estructura del Proyecto

```text
pronosticos/
│
├── index.html
├── README.md
├── image.png
│
├── assets/
│   └── logo.png
│
├── css/
│   └── style.css
│
└── js/
    ├── matches.js
    ├── predictor.js
    ├── combinada.js
    └── app.js
```

---

# ⚙️ Tecnologías Utilizadas

| Tecnología | Uso |
|---|---|
| HTML5 | Estructura |
| CSS3 | Diseño UI/UX |
| JavaScript ES6 | Lógica principal |
| BSD Sports API | Datos deportivos |
| Poisson Model | Predicción de goles |
| Kelly Criterion | Gestión de bankroll |

---

# ⚙️ Configuración y Uso

## 1️⃣ Clonar proyecto

```bash
git clone https://github.com/usuario/el-lobo-verde.git
```

---

## 2️⃣ Abrir aplicación

Al ser completamente frontend:

```text
Abrir index.html
```

No requiere:
- Node.js
- NPM
- Backend
- Build tools

---

## 3️⃣ Configurar API

Editar:

```text
js/matches.js
```

Agregar token BSD Sports API.

---

# 🧠 Flujo de Uso Recomendado

## Paso 1

Abrir pestaña:
- Partidos de Hoy
- Partidos de Mañana

---

## Paso 2

Seleccionar un encuentro.

El sistema generará automáticamente:
- pronóstico principal
- nivel de confianza
- value bet
- análisis estadístico

---

## Paso 3

Validar:
- barras de confianza
- indicadores EV+
- tendencias ofensivas

---

## Paso 4

Ir a:
## 🎯 Combinada Inteligente

Y dejar que el algoritmo genere:
- parlays optimizados
- stake recomendado
- nivel de riesgo

---

# 📈 Funcionalidades Futuras

## 🔥 Roadmap

### Fase 1
- Pronósticos automáticos
- EV+
- Combinadas

### Fase 2
- Live Scores
- Alertas inteligentes
- Odds movement

### Fase 3
- IA avanzada
- Machine Learning
- Predicción en vivo

### Fase 4
- WhatsApp Bot
- WhatsApp Alerts
- Panel Premium
- Dashboard administrativo

---

# 🤖 Mejoras Planeadas

- Integración con IA predictiva
- Modelos XGBoost
- Detección de trampas de mercado
- Predicciones live
- Heatmaps
- Estadísticas avanzadas
- Sistema ELO
- xG y xGA
- Integración multi-bookmaker
- Value scanner global

---

# 📱 Ideas Premium

## Sistema VIP

- Picks exclusivos
- Alertas privadas
- Combinadas premium
- Estadísticas avanzadas

## Monetización

- Suscripción mensual
- Grupo VIP de WhatsApp
- Membresías
- Afiliación bookmakers

---

# 🛡️ Filosofía del Proyecto

El objetivo NO es vender “apuestas seguras”.

El enfoque es:
- análisis matemático
- gestión responsable
- valor esperado positivo
- disciplina estadística
- decisiones fundamentadas

---

# 📄 Licencia

Proyecto desarrollado por:

## 🐺 El Lobo Verde

Todos los derechos reservados.