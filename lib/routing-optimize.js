// Porta CommonJS de lib/server/routing/optimize.ts (mesmos algoritmos,
// duplicado aqui porque lib/motoboy-routing.js é CommonJS fora do build do
// Next e não importa módulos TS de app/ diretamente). Manter as duas cópias
// em sincronia se o algoritmo mudar.
const EARTH_RADIUS_KM = 6371;

function haversineKm(a, b) {
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

function nearestNeighborOrder(points) {
  if (points.length === 0) return [];
  const visited = new Array(points.length).fill(false);
  const order = [0];
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

function totalDistance(order, points) {
  let total = 0;
  for (let i = 0; i < order.length - 1; i++) {
    total += haversineKm(points[order[i]], points[order[i + 1]]);
  }
  return total;
}

function twoOptImprove(order, points, maxIterations = 200) {
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
        const candidate = [...best.slice(0, i), ...best.slice(i, j + 1).reverse(), ...best.slice(j + 1)];
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

function cumulativeDistances(order, points) {
  const result = [];
  let cumulative = 0;
  for (let i = 0; i < order.length; i++) {
    if (i > 0) {
      cumulative += haversineKm(points[order[i - 1]], points[order[i]]);
    }
    result.push(cumulative);
  }
  return result;
}

module.exports = { haversineKm, nearestNeighborOrder, twoOptImprove, cumulativeDistances };
