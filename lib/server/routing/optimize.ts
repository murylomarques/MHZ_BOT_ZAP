// Algoritmos de roteirização (seção 14 do spec): distância Haversine, vizinho
// mais próximo (nearest neighbor) para uma ordem inicial razoável, e uma
// melhoria local via 2-opt (limitada a um número máximo de iterações para
// manter o tempo de resposta previsível — não é necessário ser ótimo, apenas
// bom o suficiente para rotas de algumas dezenas de paradas).

export type GeoPoint = { lat: number; lng: number };

const EARTH_RADIUS_KM = 6371;

export function haversineKm(a: GeoPoint, b: GeoPoint): number {
  const dLat = ((b.lat - a.lat) * Math.PI) / 180;
  const dLng = ((b.lng - a.lng) * Math.PI) / 180;
  const lat1 = (a.lat * Math.PI) / 180;
  const lat2 = (b.lat * Math.PI) / 180;

  const sinDLat = Math.sin(dLat / 2);
  const sinDLng = Math.sin(dLng / 2);

  const h = sinDLat * sinDLat + Math.cos(lat1) * Math.cos(lat2) * sinDLng * sinDLng;
  const c = 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  return EARTH_RADIUS_KM * c;
}

// Retorna a ordem dos índices de `points` (0-based) partindo sempre do índice 0
// (ponto inicial/base) e visitando o ponto não-visitado mais próximo a cada passo.
export function nearestNeighborOrder(points: GeoPoint[]): number[] {
  if (points.length === 0) return [];
  const visited = new Array(points.length).fill(false);
  const order: number[] = [0];
  visited[0] = true;

  for (let step = 1; step < points.length; step++) {
    const last = points[order[order.length - 1]];
    let bestIdx = -1;
    let bestDist = Infinity;
    for (let i = 0; i < points.length; i++) {
      if (visited[i]) continue;
      const d = haversineKm(last, points[i]);
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }
    if (bestIdx === -1) break;
    visited[bestIdx] = true;
    order.push(bestIdx);
  }

  return order;
}

function totalDistance(order: number[], points: GeoPoint[]): number {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) {
    total += haversineKm(points[order[i]], points[order[i + 1]]);
  }
  return total;
}

// Melhoria 2-opt clássica: tenta inverter segmentos da rota e mantém a
// inversão se reduzir a distância total. Limitado a `maxIterations` passagens
// completas para não crescer sem controle em rotas maiores — para o tamanho
// típico (algumas dezenas de paradas) converge bem antes disso.
export function twoOptImprove(order: number[], points: GeoPoint[], maxIterations = 200): number[] {
  if (order.length < 4) return order;

  let best = [...order];
  let bestDistance = totalDistance(best, points);
  let improved = true;
  let iterations = 0;

  while (improved && iterations < maxIterations) {
    improved = false;
    iterations++;
    for (let i = 1; i < best.length - 2; i++) {
      for (let j = i + 1; j < best.length - 1; j++) {
        const candidate = [
          ...best.slice(0, i),
          ...best.slice(i, j + 1).reverse(),
          ...best.slice(j + 1),
        ];
        const candidateDistance = totalDistance(candidate, points);
        if (candidateDistance < bestDistance - 1e-9) {
          best = candidate;
          bestDistance = candidateDistance;
          improved = true;
        }
      }
    }
  }

  return best;
}

// Distância acumulada (km) entre paradas consecutivas na ordem final, uma
// entrada por parada (a primeira parada tem distância 0 desde o ponto anterior
// que é ela mesma / ponto de partida).
export function cumulativeDistances(order: number[], points: GeoPoint[]): number[] {
  const result: number[] = [];
  let cumulative = 0;
  for (let i = 0; i < order.length; i++) {
    if (i > 0) {
      cumulative += haversineKm(points[order[i - 1]], points[order[i]]);
    }
    result.push(cumulative);
  }
  return result;
}
