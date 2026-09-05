/**
 * Which of §5.8's five label families gives way when the overlay crowds. The band names hold the
 * scene together and the sequence's words name the columns everything else hangs off, so they go
 * first; the vocabulary words go last because they are the most numerous, and where they pile up
 * — the `collapsed` embedding, whose whole point is that the words sit on top of each other —
 * dropping most of the cluster says what the state is rather than hiding it.
 */

/** Keyed by the prefix of a label id, `band:embed` and the rest. Lower is placed first. */
const FAMILY_RANK: Readonly<Record<string, number>> = {
  band: 0,
  word: 1,
  step: 2,
  bar: 3,
  vocab: 4,
};

/** The rank of one label id. Throws for an id from no known family rather than guessing. */
export function labelRank(id: string): number {
  const colon = id.indexOf(":");
  const rank = colon < 0 ? undefined : FAMILY_RANK[id.slice(0, colon)];
  if (rank === undefined) throw new Error(`gpt labels: no rank for the label id "${id}"`);
  return rank;
}
