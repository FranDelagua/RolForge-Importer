import { RolForgeImporter } from "./importer.js";

Hooks.once("ready", () => {

    console.log("RolForge Importer | Loaded");

    game.rolforge = {
        importer: RolForgeImporter
    };

});