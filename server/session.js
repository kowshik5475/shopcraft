/**
 * Atomically consumes exactly one live refresh credential and replaces it.
 * A conditional deleteMany is a compare-and-swap: concurrent requests with
 * the same refresh token can have only one winner.
 */
export async function rotateRefreshRecord(tx, {
  tokenHash,
  userId,
  now,
  nextTokenHash,
  expiresAt,
}) {
  const consumed = await tx.refreshToken.deleteMany({
    where: { tokenHash, userId, expiresAt: { gt: now } },
  });
  if (consumed.count !== 1) return null;

  const user = await tx.user.findUnique({ where: { id: userId } });
  if (!user) return null;

  await tx.refreshToken.create({
    data: { userId, tokenHash: nextTokenHash, expiresAt },
  });
  return user;
}
