// Mesma lista de cidades conhecidas usada na importação do CSV
// (`lib/server/import/csv-import.ts`). Duplicada aqui (em vez de importada)
// porque a constante original não é exportada — mantém o acoplamento baixo
// entre os dois módulos. Se a lista mudar, atualizar os dois lugares.
export const KNOWN_CITIES = [
  "Amparo",
  "Aracariguama",
  "Araras",
  "Atibaia",
  "Boituva",
  "Bom Jesus Dos Perdoes",
  "Cabreuva",
  "Caieiras",
  "Campinas",
  "Campo Limpo Paulista",
  "Capela Do Alto",
  "Francisco Morato",
  "Franco Da Rocha",
  "Hortolandia",
  "Indaiatuba",
  "Ipero",
  "Itu",
  "Itupeva",
  "Jaguariuna",
  "Jarinu",
  "Jundiai",
  "Leme",
  "Louveira",
  "Mairipora",
  "Nazare Paulista",
  "Pedreira",
  "Piracaia",
  "Piracicaba",
  "Rio Claro",
  "Salto",
  "Santo Antonio De Posse",
  "Serra Negra",
  "Sorocaba",
  "Sumare",
  "Tatui",
  "Valinhos",
  "Varzea Paulista",
  "Vinhedo",
  "Votorantim",
] as const;

export type KnownCity = (typeof KNOWN_CITIES)[number];

const KNOWN_CITIES_LOWER = new Set(KNOWN_CITIES.map((c) => c.toLowerCase()));

// Comparação sem distinguir maiúsculas/minúsculas — exports diferentes já
// vieram com capitalização diferente pra mesma cidade (ex: "Franco da Rocha"
// vs "Franco Da Rocha"); não faz sentido tratar isso como cidade nova.
export function isKnownCity(city: string): city is KnownCity {
  return KNOWN_CITIES_LOWER.has(city.toLowerCase());
}
