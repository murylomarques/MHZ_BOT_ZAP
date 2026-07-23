import { prisma } from "@/lib/server/db/prisma";
import { transitionCase, InvalidTransitionError } from "@/lib/server/status/transitions";

/**
 * MOCK — não existe documentação nem credencial de uma integração externa
 * real de baixa de equipamento no sistema da operadora/ERP ainda (mesmo caso
 * do `MatrixDesktopProvider`, ver seção 26 do spec: "quando alguma integração
 * externa ainda não possuir documentação ou credencial, crie: interface do
 * provider, implementação mock"). Como aqui é uma única chamada simples (não
 * um conjunto de métodos como o MessagingProvider), não criamos uma
 * abstração de "provider" inteira — só esta função, isolada, para ser trocada
 * pela chamada HTTP real quando a integração existir.
 *
 * Quando a integração real existir: substituir o corpo desta função pela
 * chamada HTTP ao sistema externo de baixa, propagando erros (a chamada
 * deve rejeitar/retornar success:false em caso de falha, para o fluxo de
 * `processClosure` registrar ERRO_BAIXA corretamente).
 */
async function mockExternalClosureCall(
  closureCode: string | null
): Promise<{ success: boolean; code: string | null }> {
  return { success: true, code: closureCode };
}

export type ProcessClosureResult = {
  ok: boolean;
  closureId: string;
  error?: string;
};

// Executa a baixa de um SystemClosure: marca PROCESSANDO, chama o mock
// externo, e conforme o resultado transiciona o CaseRecord
// AGUARDANDO_BAIXA|ERRO_BAIXA -> BAIXA_PROCESSANDO -> BAIXA_REALIZADA -> FINALIZADO
// (sucesso) ou -> ERRO_BAIXA (falha), gravando um ClosureAttempt a cada tentativa.
// Compartilhado entre a rota individual (PATCH /api/closures/[id]) e a rota em
// massa (POST /api/closures/bulk).
export async function processClosure(params: {
  closureId: string;
  closureCode?: string;
  observation?: string;
  userId: string;
}): Promise<ProcessClosureResult> {
  const closure = await prisma.systemClosure.findUnique({
    where: { id: params.closureId },
    include: { pickup: { include: { caseRecord: true } } },
  });
  if (!closure) {
    return { ok: false, closureId: params.closureId, error: "Baixa não encontrada." };
  }
  if (closure.status === "REALIZADA") {
    return { ok: false, closureId: params.closureId, error: "Baixa já realizada anteriormente." };
  }

  const caseId = closure.pickup.caseId;
  const closureCode = params.closureCode ?? closure.closureCode ?? null;

  await prisma.systemClosure.update({
    where: { id: closure.id },
    data: { status: "PROCESSANDO", closureCode },
  });

  try {
    await transitionCase({
      caseId,
      to: "BAIXA_PROCESSANDO",
      origin: "GESTOR",
      reason: "Baixa iniciada",
      changedByUserId: params.userId,
    });
  } catch (err) {
    if (!(err instanceof InvalidTransitionError)) throw err;
    // Caso já esteja em BAIXA_PROCESSANDO (ex.: reprocessamento concorrente),
    // seguimos em frente — o estado da baixa em si é a fonte de verdade aqui.
  }

  let result: { success: boolean; code: string | null };
  try {
    result = await mockExternalClosureCall(closureCode);
  } catch (err) {
    result = { success: false, code: closureCode };
    await prisma.$transaction([
      prisma.systemClosure.update({
        where: { id: closure.id },
        data: {
          status: "ERRO",
          attempts: { increment: 1 },
          lastError: err instanceof Error ? err.message : "Falha na chamada externa",
        },
      }),
      prisma.closureAttempt.create({
        data: { closureId: closure.id, success: false, response: { error: String(err) } },
      }),
    ]);
    try {
      await transitionCase({
        caseId,
        to: "ERRO_BAIXA",
        origin: "GESTOR",
        reason: "Falha na baixa externa",
        note: params.observation,
        changedByUserId: params.userId,
      });
    } catch (transErr) {
      if (!(transErr instanceof InvalidTransitionError)) throw transErr;
    }
    return { ok: false, closureId: params.closureId, error: "Falha na chamada externa de baixa." };
  }

  if (!result.success) {
    await prisma.$transaction([
      prisma.systemClosure.update({
        where: { id: closure.id },
        data: { status: "ERRO", attempts: { increment: 1 }, lastError: "Retorno de falha da integração externa" },
      }),
      prisma.closureAttempt.create({
        data: { closureId: closure.id, success: false, response: result },
      }),
    ]);
    try {
      await transitionCase({
        caseId,
        to: "ERRO_BAIXA",
        origin: "GESTOR",
        reason: "Falha na baixa externa",
        note: params.observation,
        changedByUserId: params.userId,
      });
    } catch (err) {
      if (!(err instanceof InvalidTransitionError)) throw err;
    }
    return { ok: false, closureId: params.closureId, error: "Integração externa retornou falha." };
  }

  await prisma.$transaction([
    prisma.systemClosure.update({
      where: { id: closure.id },
      data: {
        status: "REALIZADA",
        performedAt: new Date(),
        performedByUserId: params.userId,
        externalResponse: result,
        attempts: { increment: 1 },
        lastError: null,
      },
    }),
    prisma.closureAttempt.create({
      data: { closureId: closure.id, success: true, response: result },
    }),
  ]);

  try {
    await transitionCase({
      caseId,
      to: "BAIXA_REALIZADA",
      origin: "GESTOR",
      reason: "Baixa realizada com sucesso",
      note: params.observation,
      changedByUserId: params.userId,
    });
    await transitionCase({
      caseId,
      to: "FINALIZADO",
      origin: "GESTOR",
      reason: "Caso finalizado após baixa",
      changedByUserId: params.userId,
    });
  } catch (err) {
    if (!(err instanceof InvalidTransitionError)) throw err;
  }

  return { ok: true, closureId: params.closureId };
}
