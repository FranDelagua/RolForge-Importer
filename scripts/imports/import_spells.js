import {
    resolveAndPrepareItem
} from "../utils/import_utils.js";

export async function importSpells(actor, spells) {
    if (!Array.isArray(spells) || !spells.length) {
        console.log(
            "[RolForge] No hay hechizos para importar."
        );
        return 0;
    }

    const documents = [];

    for (const exportedSpell of spells) {
        try {
            const resolved = await resolveAndPrepareItem({
                entity_type: "spell",
                entity_name: exportedSpell.name,
                name: exportedSpell.name,
                source: exportedSpell.source,
                source_id: exportedSpell.source_id
            });

            if (!resolved) continue;

            const {
                document,
                itemData
            } = resolved;

            if (document.type !== "spell") {
                console.warn(
                    `[RolForge] ${exportedSpell.name} encontrado como ${document.type}, no como spell.`
                );
                continue;
            }

            documents.push(itemData);

            console.log(
                `[RolForge] Hechizo encontrado: ${document.name}`
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
        return 0;
    }

    const created =
        await actor.createEmbeddedDocuments("Item", documents);

    console.log(
        `[RolForge] ${created.length} hechizos importados correctamente.`
    );

    return created.length;
}
