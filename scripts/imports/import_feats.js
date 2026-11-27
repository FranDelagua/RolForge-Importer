import {
    resolveAndPrepareItem
} from "../utils/import_utils.js";

export async function importFeats(actor, entities, choices = []) {
    const featEntities = Array.isArray(entities)
        ? entities.filter(entity => {
            const type =
                entity.entity_type ??
                entity.type;

            return type === "feat" || type === "feature";
        })
        : [];

    const documents = [];
    const featNames = new Set();

    for (const sourceEntity of featEntities) {
        try {
            const resolved =
                await resolveAndPrepareItem(sourceEntity);

            if (!resolved) continue;

            const {
                entity,
                document,
                itemData
            } = resolved;

            if (document.type !== "feat") {
                console.warn(
                    `[RolForge] ${entity.name} encontrado como ${document.type}, no como feat.`
                );
                continue;
            }

            documents.push(itemData);

            const name = String(
                entity.name ?? document.name ?? ""
            )
                .trim()
                .toLowerCase();

            if (name) featNames.add(name);

            console.log(
                `[RolForge] Feat encontrada: ${document.name}`
            );
        } catch (error) {
            console.error(
                `[RolForge] Error importando feat ${sourceEntity.entity_name ?? sourceEntity.name}:`,
                error
            );
        }
    }

    // Choices pueden contener dotes que no hayan llegado a entities.
    for (const choice of Array.isArray(choices) ? choices : []) {
        const value = String(choice.value ?? "")
            .trim()
            .toLowerCase();

        if (!value) continue;

        if (
            value === "elven accuracy" ||
            value === "halfling lucky" ||
            value === "lucky" ||
            value === "alert" ||
            value === "observant"
        ) {
            featNames.add(
                value === "lucky"
                    ? "halfling lucky"
                    : value
            );
        }
    }

    if (documents.length) {
        const created =
            await actor.createEmbeddedDocuments("Item", documents);

        console.log(
            `[RolForge] ${created.length} feats/features importados.`
        );
    }

    // Mantener la automatización existente del sistema/módulo.
    await applyFeatAutomation(actor, featNames);

    return {
        imported: documents.length,
        featNames
    };
}

async function applyFeatAutomation(actor, featNames) {
    if (featNames.has("elven accuracy")) {
        await actor.update({
            "flags.dnd5e.elvenAccuracy": true
        });

        console.log(
            "[RolForge] Elven Accuracy activado."
        );
    }

    if (featNames.has("halfling lucky")) {
        await actor.update({
            "flags.dnd5e.halflingLucky": true
        });

        console.log(
            "[RolForge] Halfling Lucky activado."
        );
    }

    if (featNames.has("alert")) {
        await actor.update({
            "flags.dnd5e.initiativeAlert": true
        });

        console.log(
            "[RolForge] Alert activado."
        );
    }

    if (featNames.has("observant")) {
        await actor.update({
            "flags.dnd5e.observantFeat": true
        });

        console.log(
            "[RolForge] Observant activado."
        );
    }
}
