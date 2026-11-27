import {
    resolveAndPrepareItem
} from "../utils/import_utils.js";

export async function importClass(actor, entities, characterLevel) {
    if (!Array.isArray(entities)) {
        return {
            classImported: false,
            subclassImported: false
        };
    }

    const classEntities = entities.filter(entity => {
        const type =
            entity.entity_type ??
            entity.type;

        return type === "class" || type === "subclass";
    });

    if (!classEntities.length) {
        return {
            classImported: false,
            subclassImported: false
        };
    }

    const documents = [];
    let classImported = false;
    let subclassImported = false;

    for (const sourceEntity of classEntities) {
        try {
            const resolved =
                await resolveAndPrepareItem(sourceEntity);

            if (!resolved) continue;

            const { entity, document, itemData } = resolved;

            if (
                entity.entity_type === "class" &&
                document.type !== "class"
            ) {
                console.warn(
                    `[RolForge] ${entity.name} encontrado como ${document.type}, no como class.`
                );
                continue;
            }

            if (
                entity.entity_type === "subclass" &&
                document.type !== "subclass"
            ) {
                console.warn(
                    `[RolForge] ${entity.name} encontrado como ${document.type}, no como subclass.`
                );
                continue;
            }

            if (
                entity.entity_type === "class" &&
                itemData.system
            ) {
                if ("levels" in itemData.system) {
                    itemData.system.levels = Number(characterLevel);
                }

                classImported = true;
            }

            if (entity.entity_type === "subclass") {
                subclassImported = true;
            }

            documents.push(itemData);

            console.log(
                `[RolForge] Clase/subclase encontrada: ${document.name} (${document.type})`
            );
        } catch (error) {
            console.error(
                `[RolForge] Error importando clase/subclase ${sourceEntity.entity_name ?? sourceEntity.name}:`,
                error
            );
        }
    }

    if (documents.length) {
        const created =
            await actor.createEmbeddedDocuments("Item", documents);

        console.log(
            `[RolForge] ${created.length} clases/subclases importadas.`
        );
    }

    // MUY IMPORTANTE:
    // El proficiency bonus de dnd5e es derivado del nivel del Actor.
    // importBase ya puso system.details.level.
    await actor.update({
        "system.details.level": Number(characterLevel)
    });

    return {
        classImported,
        subclassImported
    };
}
