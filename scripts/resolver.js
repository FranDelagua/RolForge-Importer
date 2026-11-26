/**
 * RolForge - Foundry Resolver
 *
 * Resuelve entidades exportadas por RolForge contra
 * documentos existentes en los compendios de Foundry.
 */

export class RolForgeResolver {

    constructor() {
        this.packs = Array.from(game.packs.values())
            .filter(pack => pack.documentName === "Item");

        this.indexCache = new Map();
    }

    /**
     * Obtiene el índice de un compendio y lo guarda en caché.
     */
    async getPackIndex(pack) {

        if (this.indexCache.has(pack.collection)) {
            return this.indexCache.get(pack.collection);
        }

        const index = await pack.getIndex();

        this.indexCache.set(pack.collection, index);

        return index;
    }

    /**
     * Busca una entidad de RolForge.
     *
     * @param {Object} entity
     * @returns {Object|null}
     */
    async resolve(entity) {

        if (!entity) {
            return null;
        }

        const {
            entity_type,
            entity_name,
            source,
            source_id
        } = entity;

        // Si el JSON no proporciona rules,
        // intentamos inferirlo mediante la fuente.
        const rules = entity.rules ?? this.inferRules(entity);

        console.log(
            `[RolForge] Resolviendo: ${entity_type} | ${entity_name} | ${source} | ${source_id} | rules=${rules}`
        );

        // --------------------------------------------------
        // 1. Resolver por UUID
        // --------------------------------------------------

        if (entity.foundry_uuid) {

            try {

                const document = await fromUuid(entity.foundry_uuid);

                if (document) {

                    console.log(
                        `[RolForge] ✓ UUID encontrado: ${entity.foundry_uuid}`
                    );

                    return document;
                }

            } catch (error) {

                console.warn(
                    `[RolForge] UUID inválido: ${entity.foundry_uuid}`,
                    error
                );
            }
        }

        // --------------------------------------------------
        // 2. Resolver mediante compendios
        // --------------------------------------------------

        const candidates = [];

        for (const pack of this.packs) {

            const index = await this.getPackIndex(pack);

            const matches = index.filter(item => {

                // Tipo
                if (
                    entity_type &&
                    item.type !== this.mapEntityType(entity_type)
                ) {
                    return false;
                }

                // Nombre
                if (
                    entity_name &&
                    item.name?.toLowerCase() !== entity_name.toLowerCase()
                ) {
                    return false;
                }

                return true;
            });

            for (const item of matches) {

                candidates.push({
                    pack,
                    item
                });
            }
        }

        // --------------------------------------------------
        // Sin resultados
        // --------------------------------------------------

        if (!candidates.length) {

            console.warn(
                `[RolForge] ✗ No encontrado: ${entity_name}`
            );

            return null;
        }

        // --------------------------------------------------
        // 3. Puntuar candidatos
        // --------------------------------------------------

        const scored = candidates.map(candidate => {

            const score = this.scoreCandidate(
                candidate.item,
                candidate.pack,
                {
                    ...entity,
                    rules
                }
            );

            return {
                ...candidate,
                score
            };
        });

        scored.sort((a, b) => b.score - a.score);

        const best = scored[0];

        console.log(
            `[RolForge] ✓ ${entity_name} → ${best.pack.collection}`,
            `score=${best.score}`
        );

        // --------------------------------------------------
        // 4. Cargar documento completo
        // --------------------------------------------------

        return await best.pack.getDocument(best.item._id);
    }

    /**
     * Convierte los tipos de RolForge
     * a tipos de Foundry.
     */
    mapEntityType(type) {

        const types = {

            class: "class",
            subclass: "subclass",
            feat: "feat",
            spell: "spell",
            background: "background",

            // Foundry utiliza "race" para el Item
            // que representa una especie.
            species: "race",
            race: "race",

            item: "equipment",
            equipment: "equipment"
        };

        return types[type] ?? type;
    }

    /**
     * Puntúa un candidato.
     *
     * Cuanto mayor sea el resultado,
     * mejor coincidencia.
     */
    scoreCandidate(item, pack, entity) {

        let score = 0;

        const system = item.system ?? {};

        // --------------------------------------------------
        // source_id / identifier
        // --------------------------------------------------

        if (
            entity.source_id &&
            system.identifier === entity.source_id
        ) {
            score += 100;
        }

        // --------------------------------------------------
        // Fuente
        // --------------------------------------------------

        const itemSource = system.source;

        if (itemSource) {

            // Fuente concreta
            if (
                entity.source &&
                this.sourceMatches(
                    entity.source,
                    itemSource
                )
            ) {
                score += 50;
            }

            // Reglas 2014 / 2024
            if (
                entity.rules &&
                itemSource.rules === entity.rules
            ) {
                score += 100;
            }
        }

        // --------------------------------------------------
        // Compendios 2024
        // --------------------------------------------------

        if (
            entity.rules === "2024" &&
            pack.collection.endsWith("24")
        ) {
            score += 50;
        }

        // --------------------------------------------------
        // Compendios 2014
        // --------------------------------------------------

        if (
            entity.rules === "2014" &&
            !pack.collection.endsWith("24")
        ) {
            score += 50;
        }

        return score;
    }

    /**
     * Infiere la edición de reglas a partir
     * de la fuente de RolForge.
     */
    inferRules(entity) {

        const source = String(
            entity.source ?? ""
        ).toUpperCase();

        const legacySources = [
            "PHB",
            "DMG",
            "MM",
            "XGE",
            "TCE",
            "SCAG",
            "VGM",
            "MTOF",
            "BGG"
        ];

        if (legacySources.includes(source)) {
            return "2014";
        }

        return null;
    }

    /**
     * Comprueba si una fuente de RolForge
     * corresponde con una fuente Foundry.
     */
    sourceMatches(rolforgeSource, foundrySource) {

        if (!rolforgeSource || !foundrySource) {
            return false;
        }

        const source = String(
            rolforgeSource
        ).toLowerCase();

        const candidates = [

            foundrySource.book,
            foundrySource.label,
            foundrySource.value,
            foundrySource.slug

        ]
            .filter(Boolean)
            .map(value =>
                String(value).toLowerCase()
            );

        return candidates.some(value => {

            return (
                value === source ||
                value.includes(source) ||
                source.includes(value)
            );

        });
    }
}