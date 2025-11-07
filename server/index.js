// server/index.js
import express from 'express';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { nanoid } from 'nanoid';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(cors());
app.use(express.json());

const dbPath = path.join(__dirname, 'db.json');
const defaultConfigPath = path.join(__dirname, '..', 'configs', 'concesionarias.json');
const webPath = path.join(__dirname, '..', 'web');

function readJSON(p, fallback) {
  try { return JSON.parse(fs.readFileSync(p, 'utf-8')); }
  catch (e) { return fallback; }
}
function writeJSON(p, data) {
  fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf-8');
}

let state = readJSON(dbPath, { opportunities: [], config: null });

// Cargar config por defecto (concesionarias) si no hay una
if (!state.config) {
  state.config = readJSON(defaultConfigPath, null);
  writeJSON(dbPath, state);
}

// API
app.get('/api/health', (req, res) => res.json({ ok: true }));
app.get('/api/config', (req, res) => res.json(state.config || {}));
app.post('/api/config', (req, res) => {
  const cfg = req.body;
  if (!cfg?.stages?.length) return res.status(400).json({ error: 'Config inválida: faltan stages' });
  state.config = cfg;
  writeJSON(dbPath, state);
  res.json({ ok: true, message: 'Config actualizada' });
});
app.get('/api/pipeline', (req, res) => res.json(state.config?.stages || []));
app.get('/api/opportunities', (req, res) => res.json(state.opportunities));
app.post('/api/opportunities', (req, res) => {
  const body = req.body || {};
  const firstStage = state.config?.stages?.[0]?.id || 'contacto';

  const requiredGlobal = (state.config?.fields?.global || []).filter(f => f.required);
  for (const f of requiredGlobal) {
    const v = body[f.key];
    if (v === undefined || v === null || v === '') {
      return res.status(400).json({ error: `Falta campo requerido: ${f.key}` });
    }
  }

  const opp = {
    id: nanoid(8),
    title: body.title || `${body.nombre_cliente || 'Cliente'} — ${body.modelo_interes || 'Modelo'}`,
    stage: body.stage || firstStage,
    created_at: new Date().toISOString(),
    data: body
  };
  state.opportunities.push(opp);
  writeJSON(dbPath, state);
  res.status(201).json(opp);
});
app.patch('/api/opportunities/:id/move', (req, res) => {
  const { id } = req.params;
  const { to_stage } = req.body || {};
  const stagesIds = (state.config?.stages || []).map(s => s.id);
  if (!stagesIds.includes(to_stage)) return res.status(400).json({ error: 'Etapa destino inválida' });

  const idx = state.opportunities.findIndex(o => o.id === id);
  if (idx === -1) return res.status(404).json({ error: 'No encontrada' });

  state.opportunities[idx].stage = to_stage;
  state.opportunities[idx].moved_at = new Date().toISOString();
  writeJSON(dbPath, state);
  res.json(state.opportunities[idx]);
});

// Servir la UI estática
app.use('/', express.static(webPath));

const port = process.env.PORT || 3000;
app.listen(port, () => {
  console.log(`AutoFlow Demo en http://localhost:${port}`);
});
