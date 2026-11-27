import {
    MODULE_ID,
    mapSize,
    resolveAndPrepareItem
} from "../utils/import_utils.js";

const ABILITIES = {
    strength: "str",
    dexterity: "dex",
    constitution: "con",
    intelligence: "int",
    wisdom: "wis",
    charisma: "cha"
};

const SKILL_CODES = {
    "Acrobatics": "acr",
    "Animal Handling": "ani",
    "Arcana": "arc",
    "Athletics": "ath",
    "Deception": "dec",
    "History": "his",
    "Insight": "ins",
    "Intimidation": "itm",
    "Investigation": "inv",
    "Medicine": "med",
    "Nature": "nat",
    "Perception": "prc",
    "Performance": "prf",
    "Persuasion": "per",
    "Religion": "rel",
    "Sleight of Hand": "slt",
    "Stealth": "ste",
    "Survival": "sur"
};

const ABILITY_CODES = new Set([
    "str", "dex", "con", "int", "wis", "cha"
]);

export async function importBase(actor, data) {
    const c = data.character;
    const updates = {};

    // Nivel del Actor: esto hace que dnd5e calcule el proficiency bonus correcto.
    updates["system.details.level"] = Number(c.level);

    for (const [jsonKey, foundryKey] of Object.entries(ABILITIES)) {
        if (typeof c[jsonKey] === "number") {
            updates[`system.abilities.${foundryKey}.value`] = c[jsonKey];
        }
    }

    updates["system.attributes.hp.value"] = c.hp ?? c.max_hp;
    updates["system.attributes.hp.max"] = c.max_hp;
    updates["system.attributes.hp.temp"] = c.temporary_hp ?? 0;

    if (c.experience !== undefined) {
        updates["system.details.xp.value"] = c.experience;
    }

    if (c.alignment !== undefined) {
        updates["system.details.alignment"] = c.alignment;
    }

    if (c.inspiration !== undefined) {
        updates["system.attributes.inspiration"] = Boolean(c.inspiration);
    }

    const species = data.additional_data?.especie;

    if (species?.speed !== undefined) {
        const speed = Number(species.speed);

        if (Number.isFinite(speed)) {
            updates["system.attributes.movement.walk"] = speed;
        }
    }

    if (species?.size !== undefined) {
        updates["system.traits.size"] = mapSize(species.size);
    }

    if (species?.darkvision !== undefined) {
        const darkvision = Number(species.darkvision);

        if (Number.isFinite(darkvision)) {
            // dnd5e actual.
            updates["system.attributes.senses.darkvision"] = darkvision;
        }
    }

    await actor.update(updates);

    await importSkills(actor, data.skills);
    await importProficiencies(actor, data.proficiencies);

    // Raza/especie y background son Items, no solo datos del Actor.
    const entities = Array.isArray(data.entities)
        ? data.entities
        : [];

    const baseEntities = entities.filter(entity => {
        const type =
            entity.entity_type ??
            entity.type;

        return [
            "species",
            "race",
            "background"
        ].includes(type);
    });

    const imported = await importBaseEntities(actor, baseEntities);

    console.log(
        `[RolForge] Base importada. Raza/background: ${imported.length}`
    );
}

async function importBaseEntities(actor, entities) {
    if (!entities.length) return [];

    const documents = [];

    for (const sourceEntity of entities) {
        try {
            const resolved = await resolveAndPrepareItem(sourceEntity);

            if (!resolved) continue;

            const { entity, document, itemData } = resolved;

            // Especie de RolForge -> race de dnd5e.
            if (
                (entity.entity_type === "species" ||
                    entity.entity_type === "race") &&
                document.type !== "race"
            ) {
                console.warn(
                    `[RolForge] ${entity.name} fue encontrado pero no es type race: ${document.type}`
                );
                continue;
            }

            // Background -> background.
            if (
                entity.entity_type === "background" &&
                document.type !== "background"
            ) {
                console.warn(
                    `[RolForge] ${entity.name} fue encontrado pero no es type background: ${document.type}`
                );
                continue;
            }

            documents.push(itemData);

            console.log(
                `[RolForge] Base encontrada: ${document.name} (${document.type})`
            );
        } catch (error) {
            console.error(
                `[RolForge] Error importando base ${sourceEntity.entity_name ?? sourceEntity.name}:`,
                error
            );
        }
    }

    if (!documents.length) return [];

    return actor.createEmbeddedDocuments("Item", documents);
}

async function importSkills(actor, skills) {
    if (!Array.isArray(skills)) return;

    const updates = {};

    for (const skill of skills) {
        const code = SKILL_CODES[skill.skill];

        if (!code) {
            console.warn(
                `[RolForge] Skill no reconocida: ${skill.skill}`
            );
            continue;
        }

        if (!actor.system.skills[code]) {
            console.warn(
                `[RolForge] Foundry no contiene la skill ${code}.`
            );
            continue;
        }

        let proficiency = 0;

        if (Number(skill.expertise) > 0) {
            proficiency = 2;
        } else if (Number(skill.proficient) > 0) {
            proficiency = 1;
        }

        updates[`system.skills.${code}.value`] = proficiency;
    }

    if (Object.keys(updates).length) {
        await actor.update(updates);
    }
}

async function importProficiencies(actor, proficiencies) {
    if (!Array.isArray(proficiencies)) return;

    const updates = {};
    const customLanguages = [];
    const customTools = [];
    const customWeapons = [];
    const customArmor = [];

    for (const entry of proficiencies) {
        const type = String(entry.proficiency_type ?? "")
            .trim()
            .toLowerCase();

        const name = String(entry.name ?? "").trim();

        if (!name) continue;

        // Salvaciones.
        if (type === "saving_throw") {
            const ability = name.toLowerCase();

            if (ABILITY_CODES.has(ability)) {
                updates[
                    `system.abilities.${ability}.proficient`
                ] = 1;
            }

            continue;
        }

        if (type === "language") {
            customLanguages.push(name);
            continue;
        }

        if (type === "tool") {
            customTools.push(name);
            continue;
        }

        if (type === "weapon") {
            customWeapons.push(name);
            continue;
        }

        if (type === "armor") {
            customArmor.push(name);
        }
    }

    // Guardamos los valores legibles en .custom para no perder ninguna
    // competencia aunque el nombre no exista como clave interna del sistema.
    appendCustomTrait(
        actor,
        updates,
        "system.traits.languages.custom",
        customLanguages
    );

    appendCustomTrait(
        actor,
        updates,
        "system.traits.toolProf.custom",
        customTools
    );

    appendCustomTrait(
        actor,
        updates,
        "system.traits.weaponProf.custom",
        customWeapons
    );

    appendCustomTrait(
        actor,
        updates,
        "system.traits.armorProf.custom",
        customArmor
    );

    if (Object.keys(updates).length) {
        await actor.update(updates);
    }
}

function appendCustomTrait(actor, updates, path, values) {
    if (!values.length) return;

    const oldValue =
        foundry.utils.getProperty(actor, path) ?? "";

    const oldParts = String(oldValue)
        .split(",")
        .map(v => v.trim())
        .filter(Boolean);

    const merged = [
        ...new Set([
            ...oldParts,
            ...values
        ])
    ];

    updates[path] = merged.join(", ");
}
