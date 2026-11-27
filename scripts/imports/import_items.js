import {
    resolveAndPrepareItem
} from "../utils/import_utils.js";

export async function importItems(actor, exportedItems) {
    if (!Array.isArray(exportedItems) || !exportedItems.length) {
        console.log(
            "[RolForge] El personaje no tiene items."
        );
        return 0;
    }

    const documents = [];

    for (const exportedItem of exportedItems) {
        try {
            const resolved = await resolveAndPrepareItem({
                entity_type: "item",
                entity_name: exportedItem.name,
                name: exportedItem.name,
                source: exportedItem.source,
                source_id: exportedItem.source_id
            });

            if (!resolved) continue;

            const {
                document,
                itemData
            } = resolved;

            itemData.system ??= {};

            if (
                exportedItem.quantity !== undefined &&
                "quantity" in itemData.system
            ) {
                itemData.system.quantity =
                    Number(exportedItem.quantity);
            }

            if (
                exportedItem.equipped !== undefined &&
                "equipped" in itemData.system
            ) {
                itemData.system.equipped =
                    Boolean(Number(exportedItem.equipped));
            }

            documents.push(itemData);

            console.log(
                `[RolForge] Item encontrado: ${document.name} (${document.type})`
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
        return 0;
    }

    const created =
        await actor.createEmbeddedDocuments("Item", documents);

    console.log(
        `[RolForge] ${created.length} items importados.`
    );

    return created.length;
}
