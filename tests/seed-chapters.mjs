// Seeds N chapter plans (5 story + 5 combat nodes each) and marks all but the last as cleared.
const PKG = "gacha-forge";
export default async function (b, N = Number(process.env.CHAPTERS || 25)) {
  const now = new Date().toISOString();
  for (let c = 1; c <= N; c++) {
    await b.store.create({ id: `${b.runId}:chapter:${c}`, packageId: PKG, kind: "chapter-plan", name: `ch${c}`, description: "",
      data: { title: `${c}장 테스트 챕터`, premise: `전제 ${c}`, hook: `훅 ${c}`, storyNodes: Array.from({ length: 5 }, (_, i) => ({ title: `장면 ${i + 1}`, goal: "목표", guide: "" })) }, createdAt: now, updatedAt: now });
  }
  const s = await b.store.getById(PKG, `${b.runId}:session`);
  const progress = { ...(s.data.progress || {}) };
  for (let c = 1; c < N; c++) progress[String(c)] = { normal: 10 };
  progress[String(N)] = { normal: Number(process.env.LASTNORMAL ?? 3) };
  await seedBeats(b, N);
  await b.store.update({ id: s.id, packageId: PKG, expectedRevision: s.revision, name: s.name, description: "", data: { ...s.data, progress, prologueDone: true }, updatedAt: now });
}
export async function seedBeats(b, chapter, count = 5) {
  const now = new Date().toISOString();
  for (let i = 0; i < count; i++) {
    const segments = Array.from({ length: 6 }, (_, k) => (k % 2 ? { speaker: "아린", text: `장면 ${i + 1}의 대사 ${k + 1}입니다.` } : { speaker: "", text: `장면 ${i + 1}의 서술 ${k + 1}. 바람이 분다.`, place: "광장" }));
    await b.store.create({ id: `${b.runId}:beat:${chapter}:${i}`, packageId: "gacha-forge", kind: "beat", name: "beat", description: "", data: { segments, places: [{ name: "광장", tags: "" }] }, createdAt: now, updatedAt: now });
  }
}
