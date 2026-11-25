/** Pays d'un numéro international (d'après son indicatif). Liste des indicatifs les plus courants. */
const PREFIXES: [string, string][] = [
  ["33", "FR"], ["32", "BE"], ["41", "CH"], ["352", "LU"], ["377", "MC"], ["44", "GB"], ["49", "DE"],
  ["34", "ES"], ["39", "IT"], ["351", "PT"], ["31", "NL"], ["43", "AT"], ["48", "PL"], ["40", "RO"],
  ["30", "GR"], ["90", "TR"], ["7", "RU"], ["1", "US"], ["52", "MX"], ["55", "BR"], ["54", "AR"],
  ["212", "MA"], ["213", "DZ"], ["216", "TN"], ["20", "EG"], ["221", "SN"], ["223", "ML"], ["224", "GN"],
  ["225", "CI"], ["226", "BF"], ["227", "NE"], ["228", "TG"], ["229", "BJ"], ["230", "MU"], ["235", "TD"],
  ["236", "CF"], ["237", "CM"], ["240", "GQ"], ["241", "GA"], ["242", "CG"], ["243", "CD"], ["250", "RW"],
  ["257", "BI"], ["261", "MG"], ["262", "RE"], ["269", "KM"], ["27", "ZA"], ["234", "NG"], ["233", "GH"],
  ["254", "KE"], ["509", "HT"], ["590", "GP"], ["594", "GF"], ["596", "MQ"], ["687", "NC"], ["689", "PF"],
  ["971", "AE"], ["966", "SA"], ["974", "QA"], ["961", "LB"], ["972", "IL"], ["91", "IN"], ["86", "CN"],
  ["81", "JP"], ["82", "KR"], ["61", "AU"], ["64", "NZ"],
].sort((a, b) => b[0].length - a[0].length) as [string, string][];

export function countryOf(phone: string | null): { code: string; name: string } | null {
  if (!phone) return null;
  const hit = PREFIXES.find(([prefix]) => phone.startsWith(prefix));
  if (!hit) return null;
  const name = new Intl.DisplayNames("fr", { type: "region" }).of(hit[1]) ?? hit[1];
  return { code: hit[1], name };
}
