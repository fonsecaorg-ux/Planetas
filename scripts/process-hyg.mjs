#!/usr/bin/env node
/**
 * Pré-processa o catálogo HYG v3 (CSV) → src/data/estrelas.json
 *
 * Uso:
 *   1. Baixe hygdata_v3.csv de:
 *      https://github.com/astronexus/HYG-Database (hyg/v3/hygdata_v3.csv)
 *   2. Coloque o CSV na raiz do projeto ou passe o caminho como argumento:
 *      node scripts/process-hyg.mjs [caminho/hygdata_v3.csv]
 *
 * Filtros aplicados:
 *   - Magnitude aparente ≤ 6.0 (visível a olho nu)
 *   - Exclui o Sol (hip == 0)
 *
 * Saída: src/data/estrelas.json
 *   Campo por estrela: [ra_h, dec_graus, mag, sp_index]
 *   sp_index: 0=OB (azul), 1=A (branco-azulado), 2=FG (branco-amarelado),
 *             3=K (laranja), 4=M (vermelho)
 */

import { createReadStream, writeFileSync } from 'node:fs';
import { createInterface } from 'node:readline';
import { resolve } from 'node:path';

const MAG_MAX = 6.0;
const csvPath = resolve(process.argv[2] ?? 'hygdata_v3.csv');
const outPath = new URL('../src/data/estrelas.json', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');

function spIndex(sp) {
  if (!sp) return 2;
  const c = sp[0];
  if (c === 'O' || c === 'B' || c === 'W') return 0;
  if (c === 'A') return 1;
  if (c === 'F' || c === 'G') return 2;
  if (c === 'K') return 3;
  if (c === 'M' || c === 'L' || c === 'T') return 4;
  return 2;
}

const stars = [];
let header = null;
let count = 0;

const rl = createInterface({ input: createReadStream(csvPath), crlfDelay: Infinity });

rl.on('line', (line) => {
  if (!header) { header = line.split(','); return; }
  const cols = line.split(',');
  const row = {};
  header.forEach((h, i) => { row[h] = cols[i]; });

  if (row.hip === '0' || row.hip === '') return; // exclui Sol

  const mag = parseFloat(row.mag);
  if (isNaN(mag) || mag > MAG_MAX) return;

  const ra = parseFloat(row.ra);
  const dec = parseFloat(row.dec);
  if (isNaN(ra) || isNaN(dec)) return;

  stars.push([
    Math.round(ra * 10000) / 10000,
    Math.round(dec * 10000) / 10000,
    Math.round(mag * 100) / 100,
    spIndex(row.spect),
  ]);
  count++;
});

rl.on('close', () => {
  console.log(`Processadas ${count} estrelas (mag ≤ ${MAG_MAX})`);
  const out = {
    v: 1,
    src: `HYG Database v3 — ${count} estrelas mag≤${MAG_MAX}`,
    note: 'Campos: [ra_horas, dec_graus, mag, sp_idx (0=OB,1=A,2=FG,3=K,4=M)]',
    s: stars,
  };
  writeFileSync(outPath, JSON.stringify(out));
  console.log(`Escrito: ${outPath}`);
});

rl.on('error', (err) => {
  console.error(`Erro ao ler ${csvPath}:`, err.message);
  console.error('Coloque hygdata_v3.csv na raiz do projeto ou passe o caminho como argumento.');
  process.exit(1);
});
