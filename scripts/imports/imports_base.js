import { mapSize } from "../utils/import_utils.js";

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


/**
 * Importa los datos básicos del personaje.
 */
export async function importBase(
    actor,
    data
) {

    const c = data.character;

    // =========================================================
    // CARACTERÍSTICAS
    // =========================================================

    const updates = {};

    for (
        const [jsonKey, foundryKey]
        of Object.entries(ABILITIES)
    ) {

        updates[
            `system.abilities.${foundryKey}.value`
        ] = c[jsonKey];
    }

    // =========================================================
    // HP
    // =========================================================

    updates["system.attributes.hp.value"] =
        c.hp ?? c.max_hp;

    updates["system.attributes.hp.max"] =
        c.max_hp;

    updates["system.attributes.hp.temp"] =
        c.temporary_hp ?? 0;

    // =========================================================
    // XP
    // =========================================================

    if (c.experience !== undefined) {

        updates[
            "system.details.xp.value"
        ] = c.experience;
    }

    await actor.update(updates);

    console.log(
        "[RolForge] Atributos, HP y XP aplicados."
    );

    // =========================================================
    // ESPECIE
    // =========================================================

    await importSpecies(
        actor,
        data.additional_data
    );

    // =========================================================
    // SKILLS
    // =========================================================

    await importSkills(
        actor,
        data.skills
    );

    // =========================================================
    // SALVACIONES
    // =========================================================

    await importSavingThrows(
        actor,
        data.proficiencies
    );
}


/**
 * Importa especie/raza.
 */
async function importSpecies(
    actor,
    additionalData
) {

    const species =
        additionalData?.especie;

    if (!species) {
        return;
    }

    const updates = {};

    // ---------------------------------------------------------
    // Velocidad
    // ---------------------------------------------------------

    if (species.speed !== undefined) {

        updates[
            "system.attributes.movement.walk"
        ] = Number(species.speed);
    }

    // ---------------------------------------------------------
    // Tamaño
    // ---------------------------------------------------------

    if (species.size !== undefined) {

        updates[
            "system.traits.size"
        ] = mapSize(
            species.size
        );
    }

    if (Object.keys(updates).length) {
        await actor.update(updates);
    }
}


/**
 * Importa competencias de skills.
 */
async function importSkills(
    actor,
    skills
) {

    if (!Array.isArray(skills)) {
        return;
    }

    const updates = {};

    for (const skill of skills) {

        const code =
            SKILL_CODES[skill.skill];

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

        if (
            Number(skill.expertise) > 0
        ) {

            proficiency = 2;

        } else if (
            Number(skill.proficient) > 0
        ) {

            proficiency = 1;
        }

        updates[
            `system.skills.${code}.value`
        ] = proficiency;
    }

    if (Object.keys(updates).length) {
        await actor.update(updates);
    }
}


/**
 * Importa salvaciones.
 */
async function importSavingThrows(
    actor,
    proficiencies
) {

    if (!Array.isArray(proficiencies)) {
        return;
    }

    const updates = {};

    const validAbilities = [
        "str",
        "dex",
        "con",
        "int",
        "wis",
        "cha"
    ];

    for (const entry of proficiencies) {

        if (
            entry.proficiency_type !==
            "saving_throw"
        ) {
            continue;
        }

        const ability =
            entry.name
                ?.trim()
                .toLowerCase();

        if (!validAbilities.includes(ability)) {

            console.warn(
                `[RolForge] Salvación desconocida: ${entry.name}`
            );

            continue;
        }

        updates[
            `system.abilities.${ability}.proficient`
        ] = 1;
    }

    if (Object.keys(updates).length) {
        await actor.update(updates);
    }
}