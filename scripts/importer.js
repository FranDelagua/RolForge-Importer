import { importBase } from "./imports/import_base.js";
import { importClass } from "./imports/import_class.js";
import { importFeats } from "./imports/import_feats.js";
import { importSpells } from "./imports/import_spells.js";
import { importItems } from "./imports/import_items.js";
import { MODULE_ID } from "./utils/import_utils.js";

const ABILITIES = {
    strength: "str",
    dexterity: "dex",
    constitution: "con",
    intelligence: "int",
    wisdom: "wis",
    charisma: "cha"
};

export class RolForgeImporter {

    static async open() {
        const input = document.createElement("input");

        input.type = "file";
        input.accept = ".json,application/json";

        input.addEventListener("change", async event => {
            const file = event.target.files?.[0];

            if (!file) return;

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

    static async importFile(file) {
        console.log(
            "[RolForge] Archivo seleccionado:",
            file.name
        );

        if (file.size > 5 * 1024 * 1024) {
            throw new Error(
                "El archivo supera el límite de 5 MB."
            );
        }

        const text = await file.text();

        let data;

        try {
            data = JSON.parse(text);
        } catch {
            throw new Error(
                "El archivo no contiene un JSON válido."
            );
        }

        this.validate(data);

        console.log(
            "[RolForge] JSON validado:",
            data
        );

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
                    <strong>Formato:</strong>
                    ${foundry.utils.escapeHTML(data.format)}
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

        const actor = await this.importCharacter(data);

        await actor.sheet.render(true);

        ui.notifications.info(
            `RolForge: ${actor.name} importado correctamente.`
        );

        return actor;
    }

    static validate(data) {
        if (
            !data ||
            typeof data !== "object" ||
            Array.isArray(data)
        ) {
            throw new Error(
                "La raíz del JSON debe ser un objeto."
            );
        }

        if (data.format !== "RolForge-JSON") {
            throw new Error(
                `Formato no reconocido: ${data.format ?? "sin formato"}.`
            );
        }

        if (!data.version) {
            throw new Error(
                "El JSON no contiene una versión."
            );
        }

        if (data.target !== "foundry-vtt") {
            throw new Error(
                `Target no compatible: ${data.target ?? "sin target"}.`
            );
        }

        const c = data.character;

        if (!c || typeof c !== "object") {
            throw new Error(
                "El JSON no contiene los datos del personaje."
            );
        }

        if (
            typeof c.name !== "string" ||
            !c.name.trim()
        ) {
            throw new Error(
                "El personaje debe tener un nombre."
            );
        }

        if (
            !Number.isInteger(c.level) ||
            c.level < 1 ||
            c.level > 20
        ) {
            throw new Error(
                `Nivel inválido: ${c.level}. Debe estar entre 1 y 20.`
            );
        }

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

        if (
            typeof c.max_hp !== "number" ||
            Number.isNaN(c.max_hp) ||
            c.max_hp < 1
        ) {
            throw new Error(
                `HP máximo inválido: ${c.max_hp}.`
            );
        }

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

    static async importCharacter(data) {
        const c = data.character;

        if (!game.user.can("ACTOR_CREATE")) {
            throw new Error(
                "No tienes permisos para crear Actores en este mundo."
            );
        }

        if (game.system.id !== "dnd5e") {
            throw new Error(
                "RolForge Importer requiere el sistema dnd5e."
            );
        }

        console.log(
            `[RolForge] Creando Actor: ${c.name}`
        );

        const actor = await Actor.create({
            name: c.name.trim(),
            type: "character",
            flags: {
                [MODULE_ID]: {
                    imported: true,
                    version: data.version,
                    format: data.format,
                    importedAt: new Date().toISOString(),
                    originalData: data
                }
            }
        });

        if (!actor) {
            throw new Error(
                "Foundry no pudo crear el Actor."
            );
        }

        // =====================================================
        // BASE
        // =====================================================

        await importBase(actor, data);

        // =====================================================
        // CLASE / SUBCLASE
        // =====================================================

        const classResult = await importClass(
            actor,
            data.entities ?? [],
            c.level
        );

        // =====================================================
        // FEATS / FEATURES
        // =====================================================

        await importFeats(
            actor,
            data.entities ?? [],
            data.choices ?? []
        );

        // =====================================================
        // HECHIZOS
        // =====================================================

        await importSpells(
            actor,
            data.spells ?? []
        );

        // =====================================================
        // EQUIPO
        // =====================================================

        await importItems(
            actor,
            data.items ?? []
        );

        if (!classResult.classImported) {
            console.warn(
                "[RolForge] No se pudo resolver la clase del personaje."
            );
        }

        console.log(
            `[RolForge] Importación terminada: ${actor.name}`
        );

        console.log(
            `[RolForge] Resultado clase:`,
            classResult
        );

        return actor;
    }
}
