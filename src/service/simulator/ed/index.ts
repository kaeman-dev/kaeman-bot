import type { Context } from "koishi";
import { Schema } from "koishi";
import type { Config } from "#index.js";
import { InputError } from "#error/handle.js";
import { center, compact, rollWeighted } from "#utils/index.js";
import { getPrices } from "#service/prices/index.js";
import type { SimResult } from "#service/simulator/index.js";
import edLoot from "#assets/ender-dragon-loot.json";
import example from "#assets/ender-dragon-example.json";

const stat = Schema.number().min(0).max(Number.MAX_VALUE).required();
const requestSchema = Schema.object({
  dragon_type: Schema.string().default("random"),
  players: Schema.array(
    Schema.object({
      placement: Schema.number().min(1).step(1).required(),
      summoning_eyes_placed: Schema.number().min(0).max(8).step(1).required(),
      damage_dealt: stat,
      magic_find: stat,
      pet_luck: stat,
    }),
  )
    .min(1)
    .required(),
});
type EDRequest = ReturnType<typeof requestSchema>;
type SimPlayer = EDRequest["players"][number] & {
  rewards: Map<Item, number>;
  quality: number;
};

const bonuses: Record<string, typeof edLoot.bonuses.default> = edLoot.bonuses;
const { dragonWeights, quality, presentation } = edLoot;

type Item = Pick<(typeof edLoot.items)[number], "id" | "name">;

export const simulateEd = async (
  ctx: Context,
  config: Config,
  args: string,
): Promise<SimResult> => {
  const logger = ctx.logger("kaeman");
  let request: EDRequest;
  if (args) {
    try {
      request = requestSchema(JSON.parse(args));
    } catch {
      throw new InputError("Invalid arguments; send /ed help for examples");
    }
  } else {
    request = {
      dragon_type: "random",
      players: edLoot.defaultPlayers.map((player) => {
        const [damageMin, damageMax] = player.damage_dealt as [number, number];
        const [findMin, findMax] = player.magic_find as [number, number];
        const [luckMin, luckMax] = player.pet_luck as [number, number];
        return {
          ...player,
          damage_dealt: damageMin + Math.floor(Math.random() * (damageMax - damageMin + 1)),
          magic_find: findMin + Math.floor(Math.random() * (findMax - findMin + 1)),
          pet_luck: luckMin + Math.floor(Math.random() * (luckMax - luckMin + 1)),
        };
      }),
    };
  }

  let dragon = request.dragon_type.toLowerCase() || "random";
  if (dragon !== "random" && !Object.hasOwn(dragonWeights, dragon))
    throw new InputError("Unknown dragon type");
  if (dragon === "random") {
    dragon = rollWeighted(Object.entries(dragonWeights), ([, weight]) => weight)[0];
  }
  logger.debug("ed dragon=%s players=%d", dragon, request.players.length);

  const ranked = [...request.players].sort((a, b) => b.damage_dealt - a.damage_dealt);
  const firstPlayer = ranked[0]!;
  const [runeMin, runeMax] = presentation.runecraftingExperience as [number, number];

  let text =
    center("&a&l------------------------------\n", 65) +
    center(`&6&l${dragon.toUpperCase()} DRAGON DOWN!\n`, 75) +
    "\n\n" +
    ranked
      .slice(0, presentation.damagerLabels.length)
      .map((player, i) =>
        center(
          `${presentation.damagerLabels[i]} &7&l- &e${new Intl.NumberFormat("en-US").format(player.damage_dealt)}\n`,
          75,
        ),
      )
      .join("") +
    "\n\n" +
    center(
      `&eYour Damage: &a${new Intl.NumberFormat("en-US").format(firstPlayer.damage_dealt)} &7(Position #1)\n`,
      75,
    ) +
    center(
      `&eRunecrafting Experience: &d${runeMin + Math.floor(Math.random() * (runeMax - runeMin + 1))}\n`,
      75,
    ) +
    "\n\n" +
    center("&a&l------------------------------\n", 65);

  const prices = await getPrices(ctx, config);
  if (!prices) throw new Error("Failed to fetch price data");

  let profit = -(firstPlayer.summoning_eyes_placed * (prices[edLoot.costItem] ?? 0));

  const bonus =
    (Object.hasOwn(bonuses, dragon) ? bonuses[dragon] : undefined) ?? edLoot.bonuses.default;
  const items = edLoot.items
    .filter(
      (item) =>
        (!item.dragons || item.dragons.includes(dragon)) && !item.excludeDragons?.includes(dragon),
    )
    .map(({ dragons, excludeDragons, ...item }) => ({
      ...item,
      id: item.id.replaceAll("{dragon}", dragon.toUpperCase()),
      name: item.name.replaceAll("{display}", dragon.charAt(0).toUpperCase() + dragon.slice(1)),
    }));

  const players: SimPlayer[] = request.players.map((player) => ({
    ...player,
    rewards: new Map(),
    quality:
      ((edLoot.placementTable as [number, number, number][]).find(
        ([start, end]) => player.placement >= start && player.placement <= end,
      )?.[2] ?? 0) +
      (player.damage_dealt > quality.damageThreshold
        ? quality.damageBonus
        : quality.minimumDamageBonus) +
      (quality.perEye * player.summoning_eyes_placed +
        (quality.relativeDamage * player.damage_dealt) / (firstPlayer.damage_dealt || 1)),
  }));

  const qualityOf = (item: Item) =>
    item.id === edLoot.dye.id
      ? 500
      : item.id === edLoot.essence.id
        ? 10
        : (items.find((entry) => entry.id === item.id)?.quality ?? 0);

  const byQuality = [...players].sort((a, b) => b.quality - a.quality);
  for (const item of items.filter((item) => item.major)) {
    const eligible = byQuality.filter((p) => p.quality >= item.quality && !p.rewards.has(item));
    const winners = eligible.filter(
      (p) =>
        Math.random() <
        (item.perEye ? item.baseChance * p.summoning_eyes_placed : item.baseChance) *
          (item.petLuck ? 1 + (p.magic_find + p.pet_luck) / 100 : 1 + p.magic_find / 100),
    );

    const chosen = winners[Math.floor(Math.random() * winners.length)];
    if (chosen) {
      chosen.rewards.set(item, (chosen.rewards.get(item) ?? 0) + 1);
      chosen.quality -= item.quality;
    }
  }

  for (const player of players) {
    let remaining = player.quality;
    for (const item of items.filter((item) => !item.major).sort((a, b) => b.quality - a.quality)) {
      while (remaining >= item.quality) {
        player.rewards.set(item, (player.rewards.get(item) ?? 0) + 1);
        remaining -= item.quality;
      }
    }
    player.quality = remaining;
  }

  for (const player of players) {
    if (Math.random() < bonus.dyeChance) player.rewards.set(edLoot.dye, 1);
    for (let i = 0; i < bonus.essenceQuantity; i++)
      player.rewards.set(edLoot.essence, (player.rewards.get(edLoot.essence) ?? 0) + 1);
    player.rewards = new Map(
      [...player.rewards.entries()].sort(([a], [b]) => qualityOf(b) - qualityOf(a)),
    );
  }

  if (
    players.some((player) => [...player.rewards.keys()].some((item) => item.id === edLoot.dye.id))
  )
    logger.info("rare drop: Pearlescent Dye (ed)");
  [...players]
    .sort((a, b) => b.damage_dealt - a.damage_dealt)
    .slice(0, presentation.playerLabels.length)
    .forEach((player, i) => {
      const first = [...player.rewards.entries()][0];
      if (!first) return;
      const [item, count] = first;
      if (i === 0) profit += (prices[item.id] ?? 0) * count;
      text += `${presentation.playerLabels[i]} &ehas Obtained &6${item.name}${count > 1 ? ` &7x${count}` : ""}\n`;
    });
  text += `&e[ATRI-BOT] Profit for &f${dragon.charAt(0).toUpperCase() + dragon.slice(1)} Dragon: ${profit <= 0 ? "&c" : "&6"}${compact.format(profit)}`;

  return { type: "dragon.png", profit, text };
};
