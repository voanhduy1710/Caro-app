export interface AvatarItem {
  id: string;
  name: string;
  filename: string;
}

export const AVATAR_BUCKET_NAME = 'avatar';

export const RAW_AVATAR_FILES: string[] = [
  'Agni L.gif',
  'Agni M.gif',
  'Agni S.gif',
  'Alicel.gif',
  'Aliot.gif',
  'Aliza.gif',
  'Amon Ra.gif',
  'Angry penguin.gif',
  'Aqua L.gif',
  'Aqua M.gif',
  'Aqua S.gif',
  'Aqua XL.gif',
  'Atroce.gif',
  'Baby Wolf.gif',
  'Bacsojin.gif',
  'Banshee.gif',
  'Baphomet Jr.gif',
  'Baphomet.gif',
  'Bday poring.gif',
  'Blue pixy poring.gif',
  'Bluewolf.gif',
  'Bombring.gif',
  'Bongun.gif',
  'Caramel.gif',
  'Carat.gif',
  'Cat O Nine Tails.gif',
  'Cat sailor.gif',
  'Cenere.gif',
  'Chung E.gif',
  'Coco.gif',
  'Condor.gif',
  'Dame of Sentinel.gif',
  'Deviruchi.gif',
  'Dolor.gif',
  'Domovoi.gif',
  'ESL.gif',
  'Eddga.gif',
  'Eggring.gif',
  'Evil Nymph.gif',
  'Fabre.gif',
  'Firefox.gif',
  'Fur seal.gif',
  'Garling.gif',
  'Garm baby.gif',
  'Garm.gif',
  'Geffen mage.gif',
  'Gemini.gif',
  'Ghostring.gif',
  'Gloom.gif',
  'Green Ferus.gif',
  'Harpy.gif',
  'Hydra.gif',
  'Ifrit.gif',
  'Iguana.gif',
  'Imp.gif',
  'Incantation Samurai.gif',
  'Incubus.gif',
  'Injustice.gif',
  'Isis.gif',
  'Jejering.gif',
  'Kafra 1.gif',
  'Kafra 2.gif',
  'King Poring.gif',
  'Kraken leg.gif',
  'Lady Solace.gif',
  'Lady Tanee.gif',
  'Lion.gif',
  'Loli Ruri.gif',
  'Lord of Death.gif',
  'Lunatic.gif',
  'Martin.gif',
  'Mavka.gif',
  'Maya purple.gif',
  'Medusa.gif',
  'Mer.gif',
  'Mimic.gif',
  'Minorous.gif',
  'Mistress of Shelter.gif',
  'Misty.gif',
  'Miyabi Doll.gif',
  'Monk female.gif',
  'Monk male.gif',
  'Moonlight Flower.gif',
  'Nekoring.gif',
  'Nightmare.gif',
  'Ninja female.gif',
  'Ninja male.gif',
  'Owl Duke.gif',
  'P Echidna.gif',
  'P Hera.gif',
  'P Lilith.gif',
  'P Siren.gif',
  'Phen.gif',
  'Piamette.gif',
  'Picky egg.gif',
  'Picky.gif',
  'Pinguicula.gif',
  'Pitman.gif',
  'Pixy poring.gif',
  'Poison spore.gif',
  'Pope merc.gif',
  'Pope.gif',
  'Poporing.gif',
  'Pouring.gif',
  'Question octopus.gif',
  'Red Eruma.gif',
  'Red Ferus.gif',
  'Requiem.gif',
  'Ricecake.gif',
  'Roda Frog.gif',
  'Rotar Zairo.gif',
  'Roween.gif',
  'Siroma.gif',
  'Skeleton prisoner.gif',
  'Spore.gif',
  'Sting.gif',
  'Succubus.gif',
  'Tarou.gif',
  'Tera S.gif',
  'Valkyrie.gif',
  'Ventus L.gif',
  'Ventus M.gif',
  'Ventus S.gif',
  'Ventus XL.gif',
  'Watermelonring.gif',
  'Wicked Nymph.gif',
  'Wild rider.gif',
  'Wizard female.gif',
  'Wizard male.gif',
  'Zealotus.gif',
  'Zerom.gif',
  'Zipper Bear.gif',
  'Zombie prisoner.gif',
];

export const AVATAR_ITEMS: AvatarItem[] = RAW_AVATAR_FILES.map((filename) => {
  const name = filename.replace(/\.gif$/i, '');
  const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_');
  return { id, name, filename };
});

export const getAvatarPublicUrl = (filenameOrUrl?: string | null): string => {
  if (!filenameOrUrl || filenameOrUrl.includes('dicebear.com')) {
    return '/Avatar/Zerom.gif';
  }
  if (filenameOrUrl.startsWith('http://') || filenameOrUrl.startsWith('https://')) {
    if (filenameOrUrl.includes('/storage/v1/object/public/avatar/')) {
      const parts = filenameOrUrl.split('/storage/v1/object/public/avatar/');
      const filename = decodeURIComponent(parts[1] || '');
      return `/Avatar/${encodeURIComponent(filename)}`;
    }
    return filenameOrUrl;
  }
  let clean = filenameOrUrl.replace(/^\/?Avatar\//i, '');
  if (!clean.endsWith('.gif') && !clean.includes('.')) {
    clean = `${clean}.gif`;
  }
  return `/Avatar/${encodeURIComponent(clean)}`;
};

export const getAvatarLocalUrl = (filenameOrUrl?: string | null): string => {
  return getAvatarPublicUrl(filenameOrUrl);
};
