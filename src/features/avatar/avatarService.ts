export interface AvatarItem {
  id: string;
  name: string;
  filename: string;
}

/**
 * Riot Data Dragon version used for champion icons.
 * Update this when a new patch drops to pick up new champions.
 */
const DDRAGON_VERSION = '16.18.1';
const DDRAGON_CDN = `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion`;

/**
 * Every champion in League of Legends, keyed by their Data Dragon ID.
 * The `name` is the human-readable display name.
 */
const CHAMPION_DATA: Array<{ id: string; name: string }> = [
  { id: 'Aatrox', name: 'Aatrox' },
  { id: 'Ahri', name: 'Ahri' },
  { id: 'Akali', name: 'Akali' },
  { id: 'Akshan', name: 'Akshan' },
  { id: 'Alistar', name: 'Alistar' },
  { id: 'Ambessa', name: 'Ambessa' },
  { id: 'Amumu', name: 'Amumu' },
  { id: 'Anivia', name: 'Anivia' },
  { id: 'Annie', name: 'Annie' },
  { id: 'Aphelios', name: 'Aphelios' },
  { id: 'Ashe', name: 'Ashe' },
  { id: 'AurelionSol', name: 'Aurelion Sol' },
  { id: 'Aurora', name: 'Aurora' },
  { id: 'Azir', name: 'Azir' },
  { id: 'Bard', name: 'Bard' },
  { id: 'Belveth', name: "Bel'Veth" },
  { id: 'Blitzcrank', name: 'Blitzcrank' },
  { id: 'Brand', name: 'Brand' },
  { id: 'Braum', name: 'Braum' },
  { id: 'Briar', name: 'Briar' },
  { id: 'Caitlyn', name: 'Caitlyn' },
  { id: 'Camille', name: 'Camille' },
  { id: 'Cassiopeia', name: 'Cassiopeia' },
  { id: 'Chogath', name: "Cho'Gath" },
  { id: 'Corki', name: 'Corki' },
  { id: 'Darius', name: 'Darius' },
  { id: 'Diana', name: 'Diana' },
  { id: 'Draven', name: 'Draven' },
  { id: 'DrMundo', name: 'Dr. Mundo' },
  { id: 'Ekko', name: 'Ekko' },
  { id: 'Elise', name: 'Elise' },
  { id: 'Evelynn', name: 'Evelynn' },
  { id: 'Ezreal', name: 'Ezreal' },
  { id: 'Fiddlesticks', name: 'Fiddlesticks' },
  { id: 'Fiora', name: 'Fiora' },
  { id: 'Fizz', name: 'Fizz' },
  { id: 'Galio', name: 'Galio' },
  { id: 'Gangplank', name: 'Gangplank' },
  { id: 'Garen', name: 'Garen' },
  { id: 'Gnar', name: 'Gnar' },
  { id: 'Gragas', name: 'Gragas' },
  { id: 'Graves', name: 'Graves' },
  { id: 'Gwen', name: 'Gwen' },
  { id: 'Hecarim', name: 'Hecarim' },
  { id: 'Heimerdinger', name: 'Heimerdinger' },
  { id: 'Hwei', name: 'Hwei' },
  { id: 'Illaoi', name: 'Illaoi' },
  { id: 'Irelia', name: 'Irelia' },
  { id: 'Ivern', name: 'Ivern' },
  { id: 'Janna', name: 'Janna' },
  { id: 'JarvanIV', name: 'Jarvan IV' },
  { id: 'Jax', name: 'Jax' },
  { id: 'Jayce', name: 'Jayce' },
  { id: 'Jhin', name: 'Jhin' },
  { id: 'Jinx', name: 'Jinx' },
  { id: 'Kaisa', name: "Kai'Sa" },
  { id: 'Kalista', name: 'Kalista' },
  { id: 'Karma', name: 'Karma' },
  { id: 'Karthus', name: 'Karthus' },
  { id: 'Kassadin', name: 'Kassadin' },
  { id: 'Katarina', name: 'Katarina' },
  { id: 'Kayle', name: 'Kayle' },
  { id: 'Kayn', name: 'Kayn' },
  { id: 'Kennen', name: 'Kennen' },
  { id: 'Khazix', name: "Kha'Zix" },
  { id: 'Kindred', name: 'Kindred' },
  { id: 'Kled', name: 'Kled' },
  { id: 'KogMaw', name: "Kog'Maw" },
  { id: 'KSante', name: "K'Sante" },
  { id: 'Leblanc', name: 'LeBlanc' },
  { id: 'LeeSin', name: 'Lee Sin' },
  { id: 'Leona', name: 'Leona' },
  { id: 'Lillia', name: 'Lillia' },
  { id: 'Lissandra', name: 'Lissandra' },
  { id: 'Locke', name: 'Locke' },
  { id: 'Lucian', name: 'Lucian' },
  { id: 'Lulu', name: 'Lulu' },
  { id: 'Lux', name: 'Lux' },
  { id: 'Malphite', name: 'Malphite' },
  { id: 'Malzahar', name: 'Malzahar' },
  { id: 'Maokai', name: 'Maokai' },
  { id: 'MasterYi', name: 'Master Yi' },
  { id: 'Mel', name: 'Mel' },
  { id: 'Milio', name: 'Milio' },
  { id: 'MissFortune', name: 'Miss Fortune' },
  { id: 'MonkeyKing', name: 'Wukong' },
  { id: 'Mordekaiser', name: 'Mordekaiser' },
  { id: 'Morgana', name: 'Morgana' },
  { id: 'Naafiri', name: 'Naafiri' },
  { id: 'Nami', name: 'Nami' },
  { id: 'Nasus', name: 'Nasus' },
  { id: 'Nautilus', name: 'Nautilus' },
  { id: 'Neeko', name: 'Neeko' },
  { id: 'Nidalee', name: 'Nidalee' },
  { id: 'Nilah', name: 'Nilah' },
  { id: 'Nocturne', name: 'Nocturne' },
  { id: 'Nunu', name: 'Nunu & Willump' },
  { id: 'Olaf', name: 'Olaf' },
  { id: 'Orianna', name: 'Orianna' },
  { id: 'Ornn', name: 'Ornn' },
  { id: 'Pantheon', name: 'Pantheon' },
  { id: 'Poppy', name: 'Poppy' },
  { id: 'Pyke', name: 'Pyke' },
  { id: 'Qiyana', name: 'Qiyana' },
  { id: 'Quinn', name: 'Quinn' },
  { id: 'Rakan', name: 'Rakan' },
  { id: 'Rammus', name: 'Rammus' },
  { id: 'RekSai', name: "Rek'Sai" },
  { id: 'Rell', name: 'Rell' },
  { id: 'Renata', name: 'Renata Glasc' },
  { id: 'Renekton', name: 'Renekton' },
  { id: 'Rengar', name: 'Rengar' },
  { id: 'Riven', name: 'Riven' },
  { id: 'Rumble', name: 'Rumble' },
  { id: 'Ryze', name: 'Ryze' },
  { id: 'Samira', name: 'Samira' },
  { id: 'Sejuani', name: 'Sejuani' },
  { id: 'Senna', name: 'Senna' },
  { id: 'Seraphine', name: 'Seraphine' },
  { id: 'Sett', name: 'Sett' },
  { id: 'Shaco', name: 'Shaco' },
  { id: 'Shen', name: 'Shen' },
  { id: 'Shyvana', name: 'Shyvana' },
  { id: 'Singed', name: 'Singed' },
  { id: 'Sion', name: 'Sion' },
  { id: 'Sivir', name: 'Sivir' },
  { id: 'Skarner', name: 'Skarner' },
  { id: 'Smolder', name: 'Smolder' },
  { id: 'Sona', name: 'Sona' },
  { id: 'Soraka', name: 'Soraka' },
  { id: 'Swain', name: 'Swain' },
  { id: 'Sylas', name: 'Sylas' },
  { id: 'Syndra', name: 'Syndra' },
  { id: 'TahmKench', name: 'Tahm Kench' },
  { id: 'Taliyah', name: 'Taliyah' },
  { id: 'Talon', name: 'Talon' },
  { id: 'Taric', name: 'Taric' },
  { id: 'Teemo', name: 'Teemo' },
  { id: 'Thresh', name: 'Thresh' },
  { id: 'Tristana', name: 'Tristana' },
  { id: 'Trundle', name: 'Trundle' },
  { id: 'Tryndamere', name: 'Tryndamere' },
  { id: 'TwistedFate', name: 'Twisted Fate' },
  { id: 'Twitch', name: 'Twitch' },
  { id: 'Udyr', name: 'Udyr' },
  { id: 'Urgot', name: 'Urgot' },
  { id: 'Varus', name: 'Varus' },
  { id: 'Vayne', name: 'Vayne' },
  { id: 'Veigar', name: 'Veigar' },
  { id: 'Velkoz', name: "Vel'Koz" },
  { id: 'Vex', name: 'Vex' },
  { id: 'Vi', name: 'Vi' },
  { id: 'Viego', name: 'Viego' },
  { id: 'Viktor', name: 'Viktor' },
  { id: 'Vladimir', name: 'Vladimir' },
  { id: 'Volibear', name: 'Volibear' },
  { id: 'Warwick', name: 'Warwick' },
  { id: 'Xayah', name: 'Xayah' },
  { id: 'Xerath', name: 'Xerath' },
  { id: 'XinZhao', name: 'Xin Zhao' },
  { id: 'Yasuo', name: 'Yasuo' },
  { id: 'Yone', name: 'Yone' },
  { id: 'Yorick', name: 'Yorick' },
  { id: 'Yunara', name: 'Yunara' },
  { id: 'Yuumi', name: 'Yuumi' },
  { id: 'Zaahen', name: 'Zaahen' },
  { id: 'Zac', name: 'Zac' },
  { id: 'Zed', name: 'Zed' },
  { id: 'Zeri', name: 'Zeri' },
  { id: 'Ziggs', name: 'Ziggs' },
  { id: 'Zilean', name: 'Zilean' },
  { id: 'Zoe', name: 'Zoe' },
  { id: 'Zyra', name: 'Zyra' },
];

/** Default champion shown when no avatar is set. */
const DEFAULT_CHAMPION_ID = 'Teemo';

export const AVATAR_ITEMS: AvatarItem[] = CHAMPION_DATA.map((c) => ({
  id: c.id.toLowerCase(),
  name: c.name,
  filename: `${c.id}.png`,
}));

/**
 * Hosts whose URLs are known not to resolve any more, so a stored photo_url
 * holding one has to be replaced rather than rendered. DiceBear was the
 * leaderboard's placeholder before the migration, and avatars briefly lived in
 * a Supabase storage bucket that no longer exists - nothing in the app uploads
 * to one. Everything else is passed through, so a player keeps the picture they
 * actually have.
 */
const DEAD_AVATAR_HOSTS = ['api.dicebear.com', '.supabase.co/storage/'];

/** The path segment every Data Dragon champion icon URL carries. */
const DDRAGON_CHAMPION_PATH = '/img/champion/';

/** The champion id in a ddragon icon URL, whatever patch it names. */
const ddragonIdOf = (value: string): string | null => {
  if (!value.includes('ddragon.leagueoflegends.com')) return null;
  const at = value.indexOf(DDRAGON_CHAMPION_PATH);
  if (at === -1) return null;
  const rest = value.slice(at + DDRAGON_CHAMPION_PATH.length);
  const dot = rest.lastIndexOf('.');
  return (dot > 0 ? rest.slice(0, dot) : rest) || null;
};

/**
 * The champion a stored value names, or null when it names something that is
 * not one of ours.
 *
 * A ddragon URL counts however old the patch baked into it: the icon is still
 * a champion, so the id comes back out and callers rebuild the URL on the
 * current patch. That is what stops an avatar freezing on the patch it was
 * picked under - the value in the database never has to be rewritten.
 */
export const getChampionId = (value?: string | null): string | null => {
  if (!value) return null;

  let clean = value;

  if (value.startsWith('http://') || value.startsWith('https://')) {
    const id = ddragonIdOf(value);
    if (!id) return null;
    clean = id;
  } else {
    // Legacy path prefixes: "/Avatar/Foo.gif", "Avatar/Foo.gif".
    if (clean.startsWith('/')) clean = clean.slice(1);
    if (clean.toLowerCase().startsWith('avatar/')) clean = clean.slice('avatar/'.length);
  }

  // Both the old .gif and the new .png.
  const dot = clean.lastIndexOf('.');
  if (dot > 0 && ['.gif', '.png'].includes(clean.slice(dot).toLowerCase())) {
    clean = clean.slice(0, dot);
  }

  const match = CHAMPION_DATA.find((c) => c.id.toLowerCase() === clean.toLowerCase());
  return match ? match.id : null;
};

/**
 * Resolve whatever is stored as a player's avatar into something renderable.
 * Accepts a champion ID ("Ahri"), a filename ("Ahri.png"), a legacy
 * Ragnarok-style path, or a full URL.
 */
export const getAvatarPublicUrl = (filenameOrUrl?: string | null): string => {
  // One of ours: always rebuilt on the current patch, whatever was stored.
  const champion = getChampionId(filenameOrUrl);
  if (champion) {
    return `${DDRAGON_CDN}/${champion}.png`;
  }

  // A ddragon icon for an id the table does not list - most likely a champion
  // newer than the table. Passing it through would keep it on the patch it was
  // saved under, so it is rebuilt on the current one too; if the id no longer
  // exists, every avatar image falls back to the default in its onError.
  const unlistedId = filenameOrUrl ? ddragonIdOf(filenameOrUrl) : null;
  if (unlistedId) {
    return `${DDRAGON_CDN}/${unlistedId}.png`;
  }

  // Somebody else's picture - most often the Google photo Supabase seeds from
  // user_metadata. It passes through, unless its host is one that no longer
  // resolves and would render as a broken image.
  if (
    filenameOrUrl &&
    (filenameOrUrl.startsWith('http://') || filenameOrUrl.startsWith('https://')) &&
    !DEAD_AVATAR_HOSTS.some((host) => filenameOrUrl.includes(host))
  ) {
    return filenameOrUrl;
  }

  return `${DDRAGON_CDN}/${DEFAULT_CHAMPION_ID}.png`;
};
