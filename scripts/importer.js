import { RolForgeResolver } from "./resolver.js";

const MODULE_ID = "rolforge-importer";

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

const LEGACY_SOURCES = new Set([
    "PHB",
    "DMG",
    "MM",
    "XGE",
    "TCE",
    "SCAG",
    "VGM",
    "MTOF",
    "BGG",
    "VRGR",
    "DSOTDQ"
]);

export class RolForgeImporter {

    // =========================================================
    // ABRIR IMPORTADOR
    // =========================================================

    static async open() {

        const input = document.createElement("input");

        input.type = "file";
        input.accept = ".json,application/json";

        input.addEventListener("change", async event => {

            const file = event.target.files?.[0];

            if (!file) {
                return;
            }

            try {

                await this.importFile(file);

            } catch (error) {

                console.error(
                    "[RolForge] Error importando:",
                    error
                );

                ui.notifications.error(
                    `RolForge: ${error.message}`
                );
            }
        });

        input.click();
    }


    // =========================================================
    // LEER ARCHIVO
    // =========================================================

    static async importFile(file) {

        console.log(
            "[RolForge] Archivo seleccionado:",
            file.name
        );


        // -----------------------------------------------------
        // Tamaño
        // -----------------------------------------------------

        if (file.size > 5 * 1024 * 1024) {

            throw new Error(
                "El archivo supera el límite de 5 MB."
            );
        }


        // -----------------------------------------------------
        // JSON
        // -----------------------------------------------------

        const text = await file.text();

        let data;

        try {

            data = JSON.parse(text);

        } catch {

            throw new Error(
                "El archivo no contiene un JSON válido."
            );
        }


        // -----------------------------------------------------
        // Validación
        // -----------------------------------------------------

        this.validate(data);


        console.log(
            "[RolForge] JSON validado:",
            data
        );


        // -----------------------------------------------------
        // Confirmación
        // -----------------------------------------------------

        const confirmed = await Dialog.confirm({

            title: "RolForge Importer",

            content: `
                <p>
                    ¿Quieres importar el personaje
                    <strong>${foundry.utils.escapeHTML(data.character.name)}</strong>?
                </p>

                <hr>

                <p>
                    <strong>Nivel:</strong>
                    ${data.character.level}
                </p>

                <p>
                    <strong>Fuerza:</strong>
                    ${data.character.strength}
                </p>

                <p>
                    <strong>Destreza:</strong>
                    ${data.character.dexterity}
                </p>

                <p>
                    <strong>Constitución:</strong>
                    ${data.character.constitution}
                </p>

                <p>
                    <strong>Inteligencia:</strong>
                    ${data.character.intelligence}
                </p>

                <p>
                    <strong>Sabiduría:</strong>
                    ${data.character.wisdom}
                </p>

                <p>
                    <strong>Carisma:</strong>
                    ${data.character.charisma}
                </p>
            `,

            yes: () => true,

            no: () => false,

            defaultYes: false
        });


        if (!confirmed) {

            console.log(
                "[RolForge] Importación cancelada."
            );

            return null;
        }


        // -----------------------------------------------------
        // Importar
        // -----------------------------------------------------

        const actor =
            await this.importCharacter(data);


        // -----------------------------------------------------
        // Abrir ficha
        // -----------------------------------------------------

        await actor.sheet.render(true);


        ui.notifications.info(
            `RolForge: ${actor.name} importado correctamente.`
        );


        return actor;
    }


    // =========================================================
    // VALIDACIÓN
    // =========================================================

    static validate(data) {

        // -----------------------------------------------------
        // Root
        // -----------------------------------------------------

        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ) {

            throw new Error(
                "La raíz del JSON debe ser un objeto."
            );
        }


        // -----------------------------------------------------
        // Formato
        // -----------------------------------------------------

        if (data.format !== "RolForge-JSON") {

            throw new Error(
                `Formato no reconocido: ${data.format ?? "sin formato"}.`
            );
        }


        // -----------------------------------------------------
        // Version
        // -----------------------------------------------------

        if (!data.version) {

            throw new Error(
                "El JSON no contiene una versión."
            );
        }


        // -----------------------------------------------------
        // Target
        // -----------------------------------------------------

        if (data.target !== "foundry-vtt") {

            throw new Error(
                `Target no compatible: ${data.target ?? "sin target"}.`
            );
        }


        // -----------------------------------------------------
        // Character
        // -----------------------------------------------------

        const c = data.character;

        if (
            !c ||
            typeof c !== "object"
        ) {

            throw new Error(
                "El JSON no contiene los datos del personaje."
            );
        }


        // -----------------------------------------------------
        // Nombre
        // -----------------------------------------------------

        if (
            typeof c.name !== "string" ||
            !c.name.trim()
        ) {

            throw new Error(
                "El personaje debe tener un nombre."
            );
        }


        // -----------------------------------------------------
        // Nivel
        // -----------------------------------------------------

        if (
            !Number.isInteger(c.level) ||
            c.level < 1 ||
            c.level > 20
        ) {

            throw new Error(
                `Nivel inválido: ${c.level}. Debe estar entre 1 y 20.`
            );
        }


        // -----------------------------------------------------
        // Características
        // -----------------------------------------------------

        for (const key of Object.keys(ABILITIES)) {

            const value = c[key];

            if (
                typeof value !== "number" ||
                Number.isNaN(value) ||
                value < 1 ||
                value > 30
            ) {

                throw new Error(
                    `Atributo '${key}' inválido: ${value}.`
                );
            }
        }


        // -----------------------------------------------------
        // HP máximo
        // -----------------------------------------------------

        if (
            typeof c.max_hp !== "number" ||
            Number.isNaN(c.max_hp) ||
            c.max_hp < 1
        ) {

            throw new Error(
                `HP máximo inválido: ${c.max_hp}.`
            );
        }


        // -----------------------------------------------------
        // HP actual
        // -----------------------------------------------------

        if (
            c.hp !== undefined &&
            (
                typeof c.hp !== "number" ||
                Number.isNaN(c.hp)
            )
        ) {

            throw new Error(
                `HP actual inválido: ${c.hp}.`
            );
        }


        // -----------------------------------------------------
        // HP temporal
        // -----------------------------------------------------

        if (
            c.temporary_hp !== undefined &&
            (
                typeof c.temporary_hp !== "number" ||
                Number.isNaN(c.temporary_hp)
            )
        ) {

            throw new Error(
                `HP temporal inválido: ${c.temporary_hp}.`
            );
        }


        // -----------------------------------------------------
        // Arrays
        // -----------------------------------------------------

        const arrayFields = [
            "entities",
            "choices",
            "skills",
            "proficiencies",
            "spells",
            "items"
        ];

        for (const field of arrayFields) {

            if (
                data[field] !== undefined &&
                !Array.isArray(data[field])
            ) {

                throw new Error(
                    `${field} debe ser un array.`
                );
            }
        }


        return true;
    }


    // =========================================================
    // IMPORTAR PERSONAJE
    // =========================================================

    static async importCharacter(data) {

        const c = data.character;


        // -----------------------------------------------------
        // Permisos
        // -----------------------------------------------------

        if (!game.user.can("ACTOR_CREATE")) {

            throw new Error(
                "No tienes permisos para crear Actores en este mundo."
            );
        }


        // -----------------------------------------------------
        // Sistema
        // -----------------------------------------------------

        if (game.system.id !== "dnd5e") {

            throw new Error(
                "RolForge Importer requiere el sistema dnd5e."
            );
        }


        console.log(
            `[RolForge] Creando Actor: ${c.name}`
        );


        // -----------------------------------------------------
        // Actor
        // -----------------------------------------------------

        const actor = await Actor.create({

            name: c.name.trim(),

            type: "character",

            flags: {

                [MODULE_ID]: {

                    imported: true,

                    version: data.version,

                    format: data.format,

                    importedAt:
                        new Date().toISOString(),

                    originalData: data
                }
            }
        });


        if (!actor) {

            throw new Error(
                "Foundry no pudo crear el Actor."
            );
        }


        // -----------------------------------------------------
        // Características
        // -----------------------------------------------------

        const updates = {};


        for (
            const [jsonKey, foundryKey]
            of Object.entries(ABILITIES)
        ) {

            updates[
                `system.abilities.${foundryKey}.value`
            ] = c[jsonKey];
        }


        // -----------------------------------------------------
        // HP
        // -----------------------------------------------------

        updates["system.attributes.hp.value"] =
            c.hp ?? c.max_hp;

        updates["system.attributes.hp.max"] =
            c.max_hp;

        updates["system.attributes.hp.temp"] =
            c.temporary_hp ?? 0;


        // -----------------------------------------------------
        // XP
        // -----------------------------------------------------

        if (c.experience !== undefined) {

            updates[
                "system.details.xp.value"
            ] = c.experience;
        }


        // -----------------------------------------------------
        // Aplicar
        // -----------------------------------------------------

        await actor.update(updates);


        console.log(
            "[RolForge] Atributos y HP aplicados."
        );


        // -----------------------------------------------------
        // Especie
        // -----------------------------------------------------

        await this.applySpeciesData(
            actor,
            data.additional_data
        );


        // -----------------------------------------------------
        // Skills
        // -----------------------------------------------------

        await this.applySkills(
            actor,
            data.skills
        );


        // -----------------------------------------------------
        // Salvaciones
        // -----------------------------------------------------

        await this.applySavingThrows(
            actor,
            data.proficiencies
        );


        // -----------------------------------------------------
        // Entidades
        // -----------------------------------------------------

        const entityResults =
            await this.importEntities(
                actor,
                data.entities ?? [],
                c.level
            );


        // -----------------------------------------------------
        // Spells
        // -----------------------------------------------------

        await this.importSpells(
            actor,
            data.spells ?? []
        );


        // -----------------------------------------------------
        // Items
        // -----------------------------------------------------

        await this.importItems(
            actor,
            data.items ?? []
        );


        // -----------------------------------------------------
        // Automatizaciones de feats
        // -----------------------------------------------------

        await this.applyFeatAutomation(
            actor,
            data.entities ?? [],
            data.choices ?? []
        );


        if (!entityResults.classImported) {

            console.warn(
                "[RolForge] No se pudo resolver la clase del personaje."
            );
        }


        console.log(
            `[RolForge] Importación terminada: ${actor.name}`
        );


        return actor;
    }


    // =========================================================
    // ESPECIE
    // =========================================================

    static async applySpeciesData(
        actor,
        additionalData
    ) {

        const species =
            additionalData?.especie;

        if (!species) {
            return;
        }


        const updates = {};


        // -----------------------------------------------------
        // Velocidad
        // -----------------------------------------------------

        if (species.speed !== undefined) {

            updates[
                "system.attributes.movement.walk"
            ] = Number(species.speed);
        }


        // -----------------------------------------------------
        // Tamaño
        // -----------------------------------------------------

        if (species.size !== undefined) {

            updates[
                "system.traits.size"
            ] = this.mapSize(
                species.size
            );
        }


        if (Object.keys(updates).length) {

            await actor.update(updates);
        }
    }


    // =========================================================
    // SKILLS
    // =========================================================

    static async applySkills(
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


    // =========================================================
    // SALVACIONES
    // =========================================================

    static async applySavingThrows(
        actor,
        proficiencies
    ) {

        if (!Array.isArray(proficiencies)) {
            return;
        }


        const updates = {};


        for (const entry of proficiencies) {

            if (
                entry.proficiency_type !==
                "saving_throw"
            ) {

                continue;
            }


            const ability =
                entry.name?.trim().toLowerCase();


            const valid = [
                "str",
                "dex",
                "con",
                "int",
                "wis",
                "cha"
            ];


            if (!valid.includes(ability)) {

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


    // =========================================================
    // IMPORTAR ENTIDADES
    // =========================================================

    static async importEntities(
        actor,
        entities,
        characterLevel
    ) {

        const resolver =
            new RolForgeResolver();


        const documents = [];

        let classImported = false;


        for (const sourceEntity of entities) {

            const entity =
                this.normalizeEntity(
                    sourceEntity
                );


            try {

                console.log(
                    "[RolForge] Resolviendo entidad:",
                    entity.name,
                    entity.entity_type,
                    entity.source
                );


                let document =
                    await resolver.resolve(entity);


                // -------------------------------------------------
                // Fallback
                // -------------------------------------------------

                if (!document) {

                    document =
                        await this.findDocumentDirect(
                            entity
                        );
                }


                if (!document) {

                    console.warn(
                        `[RolForge] No encontrada: ${entity.name} (${entity.source ?? "sin source"})`
                    );

                    continue;
                }


                // -------------------------------------------------
                // Copiar DOCUMENTO COMPLETO
                //
                // Esto conserva:
                // - system
                // - activities
                // - effects
                // - description
                // - advancement data
                // - configuración dnd5e
                // -------------------------------------------------

                const itemData =
                    document.toObject();


                delete itemData._id;


                // -------------------------------------------------
                // Flags RolForge
                // -------------------------------------------------

                itemData.flags ??= {};

                itemData.flags[MODULE_ID] ??= {};


                itemData.flags[MODULE_ID].sourceUuid =
                    document.uuid;


                itemData.flags[MODULE_ID].sourceId =
                    entity.source_id ?? null;


                itemData.flags[MODULE_ID].entityType =
                    entity.entity_type;


                // -------------------------------------------------
                // Clase
                // -------------------------------------------------

                if (
                    entity.entity_type === "class" &&
                    itemData.type === "class"
                ) {

                    if (
                        itemData.system &&
                        "levels" in itemData.system
                    ) {

                        itemData.system.levels =
                            characterLevel;
                    }


                    classImported = true;
                }


                documents.push(itemData);


                console.log(
                    "[RolForge] Encontrada:",
                    document.name,
                    document.type
                );


            } catch (error) {

                console.error(
                    `[RolForge] Error resolviendo ${entity.name}:`,
                    error
                );
            }
        }


        // -----------------------------------------------------
        // Crear Items
        // -----------------------------------------------------

        if (!documents.length) {

            return {
                classImported
            };
        }


        const created =
            await actor.createEmbeddedDocuments(
                "Item",
                documents
            );


        console.log(
            `[RolForge] ${created.length} entidades embebidas.`
        );


        return {
            classImported
        };
    }


    // =========================================================
    // IMPORTAR HECHIZOS
    // =========================================================

    static async importSpells(
        actor,
        spells
    ) {

        if (
            !Array.isArray(spells) ||
            !spells.length
        ) {

            console.log(
                "[RolForge] No hay hechizos para importar."
            );

            return;
        }


        const resolver =
            new RolForgeResolver();


        const documents = [];


        for (const exportedSpell of spells) {

            const entity = {

                entity_type: "spell",

                name: exportedSpell.name,

                entity_name: exportedSpell.name,

                source: exportedSpell.source,

                source_id: exportedSpell.source_id,

                rules:
                    this.inferRules(
                        exportedSpell.source
                    )
            };


            try {

                console.log(
                    "[RolForge] Resolviendo hechizo:",
                    exportedSpell.name,
                    exportedSpell.source
                );


                let spell =
                    await resolver.resolve(entity);


                // -------------------------------------------------
                // Fallback
                // -------------------------------------------------

                if (!spell) {

                    spell =
                        await this.findDocumentDirect(
                            entity
                        );
                }


                if (!spell) {

                    console.warn(
                        `[RolForge] Hechizo no encontrado: ${exportedSpell.name} (${exportedSpell.source ?? "sin source"})`
                    );

                    continue;
                }


                // -------------------------------------------------
                // COPIAR DOCUMENTO COMPLETO
                //
                // No reconstruimos el spell.
                //
                // Así conservamos:
                // - Activities
                // - Damage
                // - Attack
                // - Save
                // - Cast
                // - Scaling
                // - Range
                // - Targets
                // - Effects
                // - Concentration
                // - descripción
                // -------------------------------------------------

                const itemData =
                    spell.toObject();


                delete itemData._id;


                // -------------------------------------------------
                // Flags RolForge
                // -------------------------------------------------

                itemData.flags ??= {};

                itemData.flags[MODULE_ID] ??= {};


                itemData.flags[MODULE_ID].sourceUuid =
                    spell.uuid;


                itemData.flags[MODULE_ID].sourceId =
                    exportedSpell.source_id ?? null;


                itemData.flags[MODULE_ID].entityType =
                    "spell";


                // -------------------------------------------------
                // Preparación
                // -------------------------------------------------
                //
                // NO reconstruimos preparation.
                //
                // Dejamos la configuración oficial
                // del hechizo del compendio.
                //
                // Esto evita romper el modelo de dnd5e.
                // -------------------------------------------------

                documents.push(itemData);


                console.log(
                    "[RolForge] Hechizo encontrado:",
                    spell.name,
                    spell.uuid
                );


            } catch (error) {

                console.error(
                    `[RolForge] Error importando hechizo ${exportedSpell.name}:`,
                    error
                );
            }
        }


        if (!documents.length) {

            console.warn(
                "[RolForge] No se pudo importar ningún hechizo."
            );

            return;
        }


        const created =
            await actor.createEmbeddedDocuments(
                "Item",
                documents
            );


        console.log(
            `[RolForge] ${created.length} hechizos importados correctamente.`
        );
    }


    // =========================================================
    // IMPORTAR ITEMS
    // =========================================================

    static async importItems(
        actor,
        exportedItems
    ) {

        if (
            !Array.isArray(exportedItems) ||
            !exportedItems.length
        ) {

            console.log(
                "[RolForge] El personaje no tiene items."
            );

            return;
        }


        const resolver =
            new RolForgeResolver();


        const documents = [];


        for (
            const exportedItem
            of exportedItems
        ) {

            const entity = {

                entity_type: "item",

                name: exportedItem.name,

                entity_name: exportedItem.name,

                source: exportedItem.source,

                source_id: exportedItem.source_id,

                rules:
                    this.inferRules(
                        exportedItem.source
                    )
            };


            try {

                let document =
                    await resolver.resolve(entity);


                if (!document) {

                    document =
                        await this.findDocumentDirect(
                            entity
                        );
                }


                if (!document) {

                    console.warn(
                        `[RolForge] Item no encontrado: ${exportedItem.name} (${exportedItem.source ?? "sin source"})`
                    );

                    continue;
                }


                const itemData =
                    document.toObject();


                delete itemData._id;


                // -------------------------------------------------
                // Flags
                // -------------------------------------------------

                itemData.flags ??= {};

                itemData.flags[MODULE_ID] ??= {};


                itemData.flags[MODULE_ID].sourceUuid =
                    document.uuid;


                itemData.flags[MODULE_ID].sourceId =
                    exportedItem.source_id ?? null;


                itemData.flags[MODULE_ID].entityType =
                    "item";


                // -------------------------------------------------
                // Cantidad
                // -------------------------------------------------

                itemData.system ??= {};


                if (
                    exportedItem.quantity !==
                    undefined &&
                    "quantity" in itemData.system
                ) {

                    itemData.system.quantity =
                        Number(
                            exportedItem.quantity
                        );
                }


                // -------------------------------------------------
                // Equipado
                // -------------------------------------------------

                if (
                    exportedItem.equipped !==
                    undefined &&
                    "equipped" in itemData.system
                ) {

                    itemData.system.equipped =
                        Boolean(
                            Number(
                                exportedItem.equipped
                            )
                        );
                }


                documents.push(
                    itemData
                );


                console.log(
                    "[RolForge] Item encontrado:",
                    document.name,
                    document.type
                );


            } catch (error) {

                console.error(
                    `[RolForge] Error importando item ${exportedItem.name}:`,
                    error
                );
            }
        }


        if (!documents.length) {

            console.warn(
                "[RolForge] No se pudo resolver ningún item."
            );

            return;
        }


        const created =
            await actor.createEmbeddedDocuments(
                "Item",
                documents
            );


        console.log(
            `[RolForge] ${created.length} items importados.`
        );
    }


    // =========================================================
    // AUTOMATIZACIÓN DE FEATS
    // =========================================================

    static async applyFeatAutomation(
        actor,
        entities,
        choices
    ) {

        const featNames =
            new Set();


        // -----------------------------------------------------
        // Feats de entities
        // -----------------------------------------------------

        for (const entity of entities) {

            const type =
                entity.entity_type ??
                entity.type;


            if (
                type !== "feat"
            ) {

                continue;
            }


            const name =
                entity.entity_name ??
                entity.name;


            if (name) {

                featNames.add(
                    name
                        .trim()
                        .toLowerCase()
                );
            }
        }


        // -----------------------------------------------------
        // Feats encontrados en choices
        // -----------------------------------------------------

        for (const choice of choices) {

            const value =
                String(
                    choice.value ?? ""
                )
                    .trim()
                    .toLowerCase();


            const valueSourceId =
                String(
                    choice.value_source_id ?? ""
                )
                    .trim()
                    .toLowerCase();


            const valueSource =
                String(
                    choice.value_source ?? ""
                )
                    .trim()
                    .toLowerCase();


            // -------------------------------------------------
            // Elven Accuracy
            // -------------------------------------------------

            if (
                value === "elven accuracy" ||
                valueSourceId.startsWith(
                    "elven accuracy|"
                ) ||
                valueSource === "elven accuracy"
            ) {

                featNames.add(
                    "elven accuracy"
                );
            }


            // -------------------------------------------------
            // Halfling Lucky
            // -------------------------------------------------

            if (
                value === "halfling lucky" ||
                value === "lucky"
            ) {

                featNames.add(
                    "halfling lucky"
                );
            }


            // -------------------------------------------------
            // Alert
            // -------------------------------------------------

            if (
                value === "alert"
            ) {

                featNames.add(
                    "alert"
                );
            }


            // -------------------------------------------------
            // Observant
            // -------------------------------------------------

            if (
                value === "observant"
            ) {

                featNames.add(
                    "observant"
                );
            }
        }


        // =====================================================
        // ELVEN ACCURACY
        // =====================================================

        if (
            featNames.has(
                "elven accuracy"
            )
        ) {

            await actor.update({

                "flags.dnd5e.elvenAccuracy":
                    true
            });


            console.log(
                "[RolForge] Elven Accuracy activado."
            );
        }


        // =====================================================
        // HALFLING LUCKY
        // =====================================================

        if (
            featNames.has(
                "halfling lucky"
            )
        ) {

            await actor.update({

                "flags.dnd5e.halflingLucky":
                    true
            });


            console.log(
                "[RolForge] Halfling Lucky activado."
            );
        }


        // =====================================================
        // ALERT
        // =====================================================

        if (
            featNames.has(
                "alert"
            )
        ) {

            await actor.update({

                "flags.dnd5e.initiativeAlert":
                    true
            });


            console.log(
                "[RolForge] Alert activado."
            );
        }


        // =====================================================
        // OBSERVANT
        // =====================================================

        if (
            featNames.has(
                "observant"
            )
        ) {

            await actor.update({

                "flags.dnd5e.observantFeat":
                    true
            });


            console.log(
                "[RolForge] Observant activado."
            );
        }
    }


    // =========================================================
    // NORMALIZAR ENTIDAD
    // =========================================================

    static normalizeEntity(
        sourceEntity
    ) {

        const rawType =
            sourceEntity.entity_type ??
            sourceEntity.type ??
            "item";


        let entityType = rawType;


        // feature de RolForge
        // -> feat de Foundry/dnd5e

        if (
            rawType === "feature"
        ) {

            entityType = "feat";
        }


        const name =
            sourceEntity.entity_name ??
            sourceEntity.name ??
            "";


        return {

            ...sourceEntity,

            entity_type:
                entityType,

            name,

            entity_name:
                name,

            source:
                sourceEntity.source ??
                null,

            source_id:
                sourceEntity.source_id ??
                null,

            rules:
                sourceEntity.rules ??
                this.inferRules(
                    sourceEntity.source
                )
        };
    }


    // =========================================================
    // BÚSQUEDA DIRECTA EN COMPENDIOS
    // =========================================================

    static async findDocumentDirect(
        entity
    ) {

        const targetName =
            entity.name
                ?.trim()
                .toLowerCase();


        if (!targetName) {
            return null;
        }


        const preferredRules =
            entity.rules ??
            this.inferRules(
                entity.source
            );


        const candidates = [];


        // -----------------------------------------------------
        // Buscar
        // -----------------------------------------------------

        for (
            const pack
            of game.packs
        ) {

            if (
                pack.documentName !==
                "Item"
            ) {

                continue;
            }


            try {

                const index =
                    await pack.getIndex({
                        fields: [
                            "name",
                            "type"
                        ]
                    });


                for (
                    const entry
                    of index
                ) {

                    if (
                        entry.name
                            ?.trim()
                            .toLowerCase() !==
                        targetName
                    ) {

                        continue;
                    }


                    candidates.push({

                        pack,

                        entry
                    });
                }


            } catch (error) {

                console.warn(
                    `[RolForge] No se pudo indexar ${pack.collection}:`,
                    error
                );
            }
        }


        if (!candidates.length) {

            return null;
        }


        const scored = [];


        // -----------------------------------------------------
        // Puntuar
        // -----------------------------------------------------

        for (
            const candidate
            of candidates
        ) {

            try {

                const document =
                    await candidate.pack.getDocument(
                        candidate.entry._id
                    );


                if (!document) {
                    continue;
                }


                let score = 0;


                const collection =
                    candidate.pack.collection
                        ?.toLowerCase() ??
                    "";


                // -------------------------------------------------
                // Reglas
                // -------------------------------------------------

                if (
                    preferredRules === "2024" &&
                    collection.endsWith("24")
                ) {

                    score += 100;
                }


                if (
                    preferredRules === "2014" &&
                    !collection.endsWith("24")
                ) {

                    score += 100;
                }


                // -------------------------------------------------
                // Tipos
                // -------------------------------------------------

                const type =
                    document.type;


                if (
                    entity.entity_type === "class" &&
                    type === "class"
                ) {

                    score += 80;
                }


                if (
                    entity.entity_type === "background" &&
                    type === "background"
                ) {

                    score += 80;
                }


                if (
                    (
                        entity.entity_type === "race" ||
                        entity.entity_type === "species"
                    ) &&
                    type === "race"
                ) {

                    score += 80;
                }


                if (
                    entity.entity_type === "feat" &&
                    type === "feat"
                ) {

                    score += 80;
                }


                if (
                    entity.entity_type === "spell" &&
                    type === "spell"
                ) {

                    score += 80;
                }


                if (
                    entity.entity_type === "item" &&
                    [
                        "weapon",
                        "equipment",
                        "consumable",
                        "loot",
                        "tool"
                    ].includes(type)
                ) {

                    score += 50;
                }


                scored.push({

                    document,

                    score
                });


            } catch (error) {

                console.warn(
                    `[RolForge] No se pudo cargar ${candidate.entry.name}:`,
                    error
                );
            }
        }


        // -----------------------------------------------------
        // Mejor candidato
        // -----------------------------------------------------

        scored.sort(
            (a, b) =>
                b.score - a.score
        );


        return (
            scored[0]?.document ??
            null
        );
    }


    // =========================================================
    // INFERIR RULESET
    // =========================================================

    static inferRules(
        source
    ) {

        const normalized =
            String(
                source ?? ""
            ).toUpperCase();


        // -----------------------------------------------------
        // 2024
        // -----------------------------------------------------

        if (
            normalized === "XPHB"
        ) {

            return "2024";
        }


        // -----------------------------------------------------
        // 2014
        // -----------------------------------------------------

        if (
            LEGACY_SOURCES.has(
                normalized
            )
        ) {

            return "2014";
        }


        return null;
    }


    // =========================================================
    // TAMAÑO
    // =========================================================

    static mapSize(
        size
    ) {

        const sizes = {

            T: "tiny",

            S: "sm",

            M: "med",

            L: "lg",

            H: "huge",

            G: "grg"
        };


        return (
            sizes[
                String(size)
                    .toUpperCase()
            ] ??
            "med"
        );
    }
}