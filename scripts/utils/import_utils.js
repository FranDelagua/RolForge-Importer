import { RolForgeResolver } from "../resolver.js";

export const MODULE_ID = "rolforge-importer";

const LEGACY_SOURCES = new Set([
    "PHB", "DMG", "MM", "XGE", "TCE", "SCAG",
    "VGM", "MTOF", "BGG", "VRGR", "DSOTDQ"
]);

export function inferRules(source) {
    const normalized = String(source ?? "").toUpperCase();

    if (normalized === "XPHB") return "2024";
    if (LEGACY_SOURCES.has(normalized)) return "2014";

    return null;
}

export function mapSize(size) {
    const sizes = {
        T: "tiny",
        S: "sm",
        M: "med",
        L: "lg",
        H: "huge",
        G: "grg"
    };

    return sizes[String(size ?? "").toUpperCase()] ?? "med";
}

export function normalizeEntity(sourceEntity = {}) {
    const rawType =
        sourceEntity.entity_type ??
        sourceEntity.type ??
        "item";

    let entityType = rawType;

    // RolForge usa "feature", dnd5e usa Item type "feat".
    if (rawType === "feature") entityType = "feat";

    const name =
        sourceEntity.entity_name ??
        sourceEntity.name ??
        "";

    return {
        ...sourceEntity,
        entity_type: entityType,
        name,
        entity_name: name,
        source: sourceEntity.source ?? null,
        source_id: sourceEntity.source_id ?? null,
        rules: sourceEntity.rules ?? inferRules(sourceEntity.source)
    };
}

export function applyRolForgeFlags(itemData, document, entity) {
    itemData.flags ??= {};
    itemData.flags[MODULE_ID] ??= {};

    itemData.flags[MODULE_ID].sourceUuid = document.uuid;
    itemData.flags[MODULE_ID].sourceId = entity.source_id ?? null;
    itemData.flags[MODULE_ID].entityType = entity.entity_type;

    return itemData;
}

/**
 * Convierte el tipo conceptual de RolForge al tipo real de Item dnd5e.
 */
export function expectedFoundryTypes(entityType) {
    switch (entityType) {
        case "species":
        case "race":
            return ["race"];

        case "background":
            return ["background"];

        case "class":
            return ["class"];

        case "subclass":
            return ["subclass"];

        case "feat":
        case "feature":
            return ["feat"];

        case "spell":
            return ["spell"];

        case "item":
            return [
                "weapon",
                "equipment",
                "consumable",
                "loot",
                "tool",
                "container"
            ];

        default:
            return [];
    }
}

/**
 * Resolución híbrida:
 * 1. Resolver existente.
 * 2. Búsqueda directa en todos los compendios de Items.
 */
export async function resolveEntity(entity) {
    const resolver = new RolForgeResolver();

    let document = null;

    try {
        document = await resolver.resolve(entity);
    } catch (error) {
        console.warn(
            `[RolForge] Resolver falló para ${entity.name}:`,
            error
        );
    }

    if (document) return document;

    return findDocumentDirect(entity);
}

export async function findDocumentDirect(entity) {
    const targetName = String(entity.name ?? "")
        .trim()
        .toLowerCase();

    if (!targetName) return null;

    const preferredRules =
        entity.rules ?? inferRules(entity.source);

    const expectedTypes = expectedFoundryTypes(entity.entity_type);
    const candidates = [];

    for (const pack of game.packs) {
        if (pack.documentName !== "Item") continue;

        try {
            const index = await pack.getIndex({
                fields: ["name", "type"]
            });

            for (const entry of index) {
                if (
                    String(entry.name ?? "")
                        .trim()
                        .toLowerCase() !== targetName
                ) {
                    continue;
                }

                candidates.push({ pack, entry });
            }
        } catch (error) {
            console.warn(
                `[RolForge] No se pudo indexar ${pack.collection}:`,
                error
            );
        }
    }

    if (!candidates.length) return null;

    const scored = [];

    for (const candidate of candidates) {
        try {
            const document = await candidate.pack.getDocument(
                candidate.entry._id
            );

            if (!document) continue;

            let score = 0;
            const collection =
                String(candidate.pack.collection ?? "").toLowerCase();

            // Tipo exacto: prioridad máxima.
            if (expectedTypes.includes(document.type)) {
                score += 1000;
            } else {
                score -= 500;
            }

            // Reglas 2024 / 2014.
            if (
                preferredRules === "2024" &&
                collection.endsWith("24")
            ) {
                score += 200;
            }

            if (
                preferredRules === "2014" &&
                !collection.endsWith("24")
            ) {
                score += 200;
            }

            // Si no conocemos ruleset, no penalizamos.
            scored.push({ document, score });
        } catch (error) {
            console.warn(
                `[RolForge] No se pudo cargar ${candidate.entry.name}:`,
                error
            );
        }
    }

    scored.sort((a, b) => b.score - a.score);

    return scored[0]?.document ?? null;
}

export async function resolveAndPrepareItem(sourceEntity) {
    const entity = normalizeEntity(sourceEntity);
    const document = await resolveEntity(entity);

    if (!document) {
        console.warn(
            `[RolForge] No encontrada: ${entity.name} (${entity.entity_type}, ${entity.source ?? "sin source"})`
        );
        return null;
    }

    const itemData = document.toObject();
    delete itemData._id;

    applyRolForgeFlags(itemData, document, entity);

    return {
        entity,
        document,
        itemData
    };
}
