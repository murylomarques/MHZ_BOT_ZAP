import crypto from "node:crypto";
import { prisma } from "../db/prisma";

// Provider abstrato de geocodificação (seção 14 do spec / ARCHITECTURE.md).
// Implementação inicial: Nominatim (OpenStreetMap), gratuito, sem chave de API.
// Trocar de provider no futuro (ex.: Google Geocoding) implica apenas escrever
// uma nova classe que satisfaça `GeocodingProvider` — nada mais no resto do
// sistema depende da implementação concreta.

export type GeocodeResult = { lat: number; lng: number };

export interface GeocodingProvider {
  geocode(address: string): Promise<GeocodeResult | null>;
}

const PROVIDER_NAME = "nominatim";
const USER_AGENT = "MHZRetira/1.0 (contato: operacoes@mhztelecom.com.br)";
const MIN_INTERVAL_MS = 1000; // Nominatim: no máximo 1 requisição/segundo.

// A base de importação traz o endereço abreviado (ex: "Av. S. Paulo",
// "R. Fulano", CEP com ponto "12.943-000") — nesse formato o Nominatim quase
// nunca acha resultado. Expandindo pra forma por extenso ("Avenida São
// Paulo", "Rua Fulano", CEP sem ponto) a taxa de acerto sobe de ~0% pra
// praticamente 100% nos testes feitos com a base real.
function expandAddressAbbreviations(address: string): string {
  let result = address.trim();
  result = result.replace(/(\d{2})\.(\d{3}-\d{3})/, "$1$2");
  result = result.replace(/^Av\.?\s+/i, "Avenida ");
  result = result.replace(/^R\.?\s+/i, "Rua ");
  result = result.replace(/^Al\.?\s+/i, "Alameda ");
  result = result.replace(/^Tv\.?\s+/i, "Travessa ");
  result = result.replace(/^Pça\.?\s+/i, "Praça ");
  result = result.replace(/^Estr\.?\s+/i, "Estrada ");
  result = result.replace(/^Jd\.?\s+/i, "Jardim ");
  result = result.replace(/^Pq\.?\s+/i, "Parque ");
  result = result.replace(/\bS\.\s*/g, "São ");
  return result;
}

function normalizeAddress(address: string): string {
  return expandAddressAbbreviations(address).toLowerCase().replace(/\s+/g, " ");
}

function hashAddress(normalized: string): string {
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

// Fila simples em módulo para respeitar o rate limit de 1 req/s do Nominatim.
// Não é uma fila persistente/distribuída — suficiente para o uso manual e
// esporádico previsto nesta fase (botão "rodar geocodificação", até 50 por vez).
let lastRequestAt = 0;

async function waitForRateLimit(): Promise<void> {
  const now = Date.now();
  const elapsed = now - lastRequestAt;
  if (elapsed < MIN_INTERVAL_MS) {
    await new Promise((resolve) => setTimeout(resolve, MIN_INTERVAL_MS - elapsed));
  }
  lastRequestAt = Date.now();
}

// Extrai um fallback "cidade, estado, país" a partir do endereço completo
// (formato "RUA, NUMERO, CIDADE, UF, CEP, Brasil") — usado quando o endereço
// exato não é encontrado (rua não mapeada no OpenStreetMap, comum em cidades
// com pouca cobertura). Melhor ter um ponto aproximado no centro da cidade do
// que nenhum ponto.
function cityLevelFallback(address: string): string | null {
  const parts = address.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length < 4) return null;
  const city = parts[parts.length - 4];
  const state = parts[parts.length - 3];
  const country = parts[parts.length - 1];
  return `${city}, ${state}, ${country}`;
}

async function queryNominatim(query: string): Promise<GeocodeResult | null> {
  await waitForRateLimit();
  const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(query)}`;

  let data: unknown;
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": USER_AGENT, Accept: "application/json" },
    });
    if (!res.ok) return null;
    data = await res.json();
  } catch {
    return null;
  }

  if (!Array.isArray(data) || data.length === 0) return null;
  const first = data[0] as { lat?: string; lon?: string };
  const lat = Number(first.lat);
  const lng = Number(first.lon);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

export class NominatimGeocodingProvider implements GeocodingProvider {
  async geocode(address: string): Promise<GeocodeResult | null> {
    const normalized = normalizeAddress(address);
    if (!normalized) return null;
    const addressHash = hashAddress(normalized);

    const cached = await prisma.geocodeCache.findUnique({ where: { addressHash } });
    if (cached) {
      return { lat: cached.latitude, lng: cached.longitude };
    }

    let result = await queryNominatim(expandAddressAbbreviations(address));

    if (!result) {
      const fallbackQuery = cityLevelFallback(address);
      if (fallbackQuery) {
        result = await queryNominatim(fallbackQuery);
      }
    }

    if (!result) return null;

    await prisma.geocodeCache.upsert({
      where: { addressHash },
      create: { addressHash, address: normalized, latitude: result.lat, longitude: result.lng, provider: PROVIDER_NAME },
      update: { latitude: result.lat, longitude: result.lng, provider: PROVIDER_NAME },
    });

    return result;
  }
}

export const geocodingProvider: GeocodingProvider = new NominatimGeocodingProvider();
